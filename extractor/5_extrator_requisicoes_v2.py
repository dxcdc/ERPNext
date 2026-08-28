#!/usr/bin/env python
"""Importa pedidos ONGSYS finalizados com janela rápida e auditoria diária."""

import argparse
import csv
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from common import Common, is_product_order


COMPANY_NAME = "CDC"
FINAL_STATUS = "Ordem finalizada"
STATE_DOCTYPE = "CDC ONGSYS Sync State"
FAST_WINDOW_PAGES = 3
FULL_IMPORT_INTERVAL_HOURS = 24
ORDER_MAX_AGE_DAYS = 30


def parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.replace(tzinfo=None)


def require_response(response, operation: str, accepted=(200,)):
    if response.status_code not in accepted:
        detail = (response.text or "")[:300]
        raise RuntimeError(f"{operation}: HTTP {response.status_code} {detail}")
    return response


def fetch_page(api: Common, page: int) -> Optional[List[Dict[str, Any]]]:
    response = api.ongsys_request("GET", "pedidos", page_number=page, timeout=90)
    if response.status_code == 422:
        return None
    require_response(response, f"Consulta ONGSYS página {page}")
    return response.json().get("data") or None


def fetch_order(api: Common, order_id: int) -> Dict[str, Any]:
    response = api.ongsys_request("GET", "pedidos", order_number=order_id, timeout=120)
    require_response(response, f"Consulta ONGSYS do pedido {order_id}")
    rows = response.json().get("data") or []
    order = next((row for row in rows if str(row.get("idPedido")) == str(order_id)), None)
    if not order:
        raise RuntimeError(f"Pedido {order_id} não retornado pelo ONGSYS")
    return order


def discover_last_page(api: Common, hint: int = 0) -> int:
    if hint > 0:
        page = hint
        while page > 1 and fetch_page(api, page) is None:
            page -= 1
        while fetch_page(api, page + 1) is not None:
            page += 1
        return page
    low, high = 1, 2
    if fetch_page(api, low) is None:
        return 0
    while fetch_page(api, high) is not None:
        low, high = high, high * 2
    while low + 1 < high:
        middle = (low + high) // 2
        if fetch_page(api, middle) is None:
            high = middle
        else:
            low = middle
    return low


def fetch_pages(api: Common, pages: List[int]) -> List[Dict[str, Any]]:
    orders: Dict[str, Dict[str, Any]] = {}
    for page in pages:
        records = fetch_page(api, page)
        if records is None:
            raise RuntimeError(f"Página esperada {page} não retornada pelo ONGSYS")
        for order in records:
            order_id = order.get("idPedido")
            if order_id is not None:
                orders[str(order_id)] = order
    return list(orders.values())


def get_state(api: Common):
    encoded = quote(STATE_DOCTYPE, safe="")
    resource = f"{encoded}/{encoded}"
    response = require_response(api.erp_request("GET", resource), "Consulta do checkpoint")
    return response.json().get("data", {}), resource


def should_run_full(state: Dict[str, Any], force_full: bool) -> bool:
    if force_full:
        return True
    last_full = parse_datetime(state.get("last_import_full_at"))
    return not last_full or datetime.now() - last_full >= timedelta(hours=FULL_IMPORT_INTERVAL_HOURS)


def load_warehouse_map(api: Optional[Common] = None) -> Dict[str, str]:
    mapping_path = Path(__file__).with_name("centro_de_custo_armazen.csv")
    with mapping_path.open(encoding="latin-1", newline="") as stream:
        rows = csv.DictReader(stream, delimiter=";")
        mappings = {
            str(row["centro_custo"]).strip(): str(row["armazem"]).strip()
            for row in rows
        }
    if api:
        response = api.erp_request("GET", "api/method/cdc_theme.api.get_ongsys_warehouse_mappings_for_extractor")
        if response.status_code == 200:
            for row in response.json().get("message") or []:
                code = str(row.get("cost_center_code") or "").strip()
                if row.get("status") == "Ativo" and row.get("warehouse"):
                    mappings[code] = str(row["warehouse"]).removesuffix(" - C")
                elif row.get("status") == "Bloqueado":
                    mappings.pop(code, None)
    return mappings


def ensure_fiscal_year(api: Common) -> None:
    year = datetime.now().year
    response = require_response(api.erp_request("GET", "Fiscal Year"), "Consulta do ano fiscal")
    if any(str(row.get("name")) == str(year) for row in response.json().get("data", [])):
        return
    payload = {
        "year": year,
        "year_start_date": f"{year}-01-01",
        "year_end_date": f"{year}-12-31",
        "disabled": 0,
        "companies": [{"company": COMPANY_NAME}],
    }
    require_response(api.erp_request("POST", "Fiscal Year", payload=payload), "Criação do ano fiscal", (200, 201))


def latest_log_date(order: Dict[str, Any]):
    dates = [log.get("data") for log in order.get("logs", []) if log.get("data")]
    return max(dates) if dates else order.get("dataPedido")


def build_items(order: Dict[str, Any], warehouses: Dict[str, str]) -> List[Dict[str, Any]]:
    items = []
    unmapped = []
    for item in order.get("itensPedido") or []:
        try:
            quantity = float(item.get("quantidade") or 0)
        except (TypeError, ValueError):
            quantity = 0
        if quantity < 0.01:
            continue
        cost_center = str(item.get("centroCusto") or "").strip()
        warehouse = warehouses.get(cost_center)
        if not warehouse:
            unmapped.append(cost_center or "sem centro de custo")
            continue
        items.append({
            "item_code": str(item.get("idProduto")),
            "qty": quantity,
            "t_warehouse": f"{warehouse} - C",
        })
    if unmapped:
        raise ValueError("centros de custo não mapeados: " + ", ".join(sorted(set(unmapped))))
    if not items:
        raise ValueError("nenhum item válido para lançamento")
    return items


def order_exists(api: Common, order_id: str) -> bool:
    filters = f'[["idpedido_ongsys","=","{order_id}"]]'
    response = require_response(
        api.erp_request("GET", "Stock Entry", params={"filters": filters, "limit_page_length": 1}),
        f"Verificação de duplicidade do pedido {order_id}",
    )
    return bool(response.json().get("data"))


def import_orders(api: Common, orders: List[Dict[str, Any]], warehouses: Dict[str, str]):
    cutoff = datetime.now() - timedelta(days=ORDER_MAX_AGE_DAYS)
    eligible = []
    for order in orders:
        order_date = parse_datetime(order.get("dataPedido"))
        if (
            is_product_order(order.get("tipoPedido"))
            and order.get("statusPedido") == FINAL_STATUS
            and order_date
            and order_date >= cutoff
        ):
            eligible.append(order)

    created = skipped = 0
    errors = []
    for order in eligible:
        order_id = str(order.get("idPedido"))
        try:
            if order_exists(api, order_id):
                skipped += 1
                continue
            payload = {
                "doctype": "Stock Entry",
                "stock_entry_type": "Entrada de Material",
                "posting_date": latest_log_date(order),
                "set_posting_time": 1,
                "docstatus": 1,
                "idpedido_ongsys": order_id,
                "titulo_ongsys": order.get("titulo"),
                "company": COMPANY_NAME,
                "items": build_items(order, warehouses),
            }
            response = api.erp_request("POST", "Stock Entry", payload=payload)
            if response.status_code not in (200, 201):
                # Uma execução concorrente pode ter criado o pedido após a consulta.
                if order_exists(api, order_id):
                    skipped += 1
                    continue
                require_response(response, f"Criação do pedido {order_id}", (200, 201))
            created += 1
        except Exception as exc:
            errors.append(f"pedido {order_id}: {exc}")
    if errors:
        raise RuntimeError(f"{len(errors)} pedido(s) não importado(s): " + " | ".join(errors[:10]))
    return created, skipped, len(eligible)


def preflight_orders(api: Common, orders: List[Dict[str, Any]], warehouses: Dict[str, str]):
    """Valida destino e duplicidade sem criar movimentações."""
    results = []
    for order in orders:
        order_id = str(order.get("idPedido"))
        result = {
            "order_id": order_id,
            "title": order.get("titulo"),
            "status": order.get("statusPedido"),
            "type": order.get("tipoPedido"),
            "eligible": bool(
                is_product_order(order.get("tipoPedido"))
                and order.get("statusPedido") == FINAL_STATUS
            ),
            "already_imported": order_exists(api, order_id),
        }
        try:
            items = build_items(order, warehouses)
            result.update({
                "warehouses": sorted({item["t_warehouse"] for item in items}),
                "items_count": len(items),
                "total_quantity": sum(float(item["qty"]) for item in items),
                "valid": True,
            })
        except Exception as exc:
            result.update({"valid": False, "error": str(exc)})
        results.append(result)
    return results


def main(force_full: bool = False, dry_run: bool = False, order_id: Optional[int] = None) -> None:
    api = Common()
    warehouses = load_warehouse_map(api)
    if order_id is not None:
        orders = [fetch_order(api, order_id)]
        checks = preflight_orders(api, orders, warehouses)
        print(json.dumps({"mode": "dry-run" if dry_run else "controlled", "checks": checks}, ensure_ascii=False))
        if dry_run:
            return
        if not checks[0]["valid"] or not checks[0]["eligible"]:
            raise RuntimeError("Pedido controlado não passou na pré-validação")
        ensure_fiscal_year(api)
        created, skipped, eligible = import_orders(api, orders, warehouses)
        print(f"Importação controlada: {eligible} elegível, {created} criado e {skipped} existente")
        return
    state, state_resource = get_state(api)
    last_page = discover_last_page(api, int(state.get("last_page") or 0))
    if not last_page:
        raise RuntimeError("ONGSYS não retornou páginas de pedidos")
    full = should_run_full(state, force_full)
    pages = list(range(1, last_page + 1)) if full else list(
        range(max(1, last_page - FAST_WINDOW_PAGES + 1), last_page + 1)
    )
    orders = fetch_pages(api, pages)
    if dry_run:
        print(json.dumps({"mode": "dry-run", "checks": preflight_orders(api, orders, warehouses)}, ensure_ascii=False))
        return
    ensure_fiscal_year(api)
    created, skipped, eligible = import_orders(api, orders, warehouses)
    now = datetime.now().isoformat(timespec="seconds")
    payload = {
        "last_page": last_page,
        "last_import_fast_at": now,
        "last_import_mode": "Completa" if full else "Rápida",
        "last_import_pages": len(pages),
        "last_success_at": now,
    }
    if full:
        payload["last_import_full_at"] = now
    require_response(api.erp_request("PUT", state_resource, payload=payload), "Atualização do checkpoint", (200, 201))
    print(
        f"Importação {'completa' if full else 'rápida'}: páginas {pages[0]}–{pages[-1]}, "
        f"{eligible} finalizados elegíveis, {created} criados e {skipped} já existentes"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="Força auditoria de todas as páginas")
    parser.add_argument("--dry-run", action="store_true", help="Valida sem criar movimentações")
    parser.add_argument("--order-id", type=int, help="Consulta ou processa somente um pedido")
    arguments, _ = parser.parse_known_args()
    main(force_full=arguments.full, dry_run=arguments.dry_run, order_id=arguments.order_id)

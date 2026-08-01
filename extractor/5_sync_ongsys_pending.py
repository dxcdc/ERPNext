#!/usr/bin/env python
"""Sincroniza pendências ONGSYS em janela rápida e auditoria completa diária."""

import argparse
import hashlib
import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

from common import Common


PENDING_DOCTYPE = "CDC ONGSYS Pending Order"
STATE_DOCTYPE = "CDC ONGSYS Sync State"
FINAL_STATUS = "Ordem finalizada"
FAST_WINDOW_PAGES = 3
FULL_SYNC_INTERVAL_HOURS = 24


def page_signature(records: List[Dict[str, Any]]) -> str:
    return hashlib.sha256(
        json.dumps(records, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()


def fetch_page(api: Common, page: int) -> Optional[List[Dict[str, Any]]]:
    response = api.ongsys_request("GET", "pedidos", page_number=page, timeout=90)
    if response.status_code == 422:
        return None
    if response.status_code != 200:
        raise RuntimeError(f"ONGSYS indisponível na página {page}: HTTP {response.status_code}")
    records = response.json().get("data", [])
    return records or None


def discover_last_page(api: Common, hint: int = 0) -> int:
    """Descobre o fim com poucas consultas e reutiliza o checkpoint nas próximas execuções."""
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
        low = high
        high *= 2
    while low + 1 < high:
        middle = (low + high) // 2
        if fetch_page(api, middle) is None:
            high = middle
        else:
            low = middle
    return low


def fetch_window(api: Common, pages: List[int]) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    seen_pages = {}
    seen_order_ids = set()
    for page in pages:
        page_records = fetch_page(api, page)
        if page_records is None:
            raise RuntimeError(f"Página esperada {page} não foi retornada pelo ONGSYS")
        signature = page_signature(page_records)
        if signature in seen_pages:
            raise RuntimeError(
                f"ONGSYS repetiu a página {page} (igual à {seen_pages[signature]}); nenhuma alteração foi salva"
            )
        seen_pages[signature] = page
        for order in page_records:
            order_id = order.get("idPedido")
            if order_id is not None:
                key = str(order_id)
                if key in seen_order_ids:
                    continue
                seen_order_ids.add(key)
            records.append(order)
    return records


def get_state(api: Common) -> Tuple[Dict[str, Any], str]:
    encoded_doctype = quote(STATE_DOCTYPE, safe="")
    resource = f"{encoded_doctype}/{encoded_doctype}"
    response = api.erp_request("GET", resource)
    if response.status_code != 200:
        raise RuntimeError(f"Falha ao consultar checkpoint ONGSYS: HTTP {response.status_code}")
    return response.json().get("data", {}), resource


def parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def should_run_full(state: Dict[str, Any], force_full: bool) -> bool:
    if force_full:
        return True
    last_full = parse_datetime(state.get("last_full_sync_at"))
    if last_full:
        return datetime.now() - last_full >= timedelta(hours=FULL_SYNC_INTERVAL_HOURS)
    last_fast = parse_datetime(state.get("last_fast_sync_at"))
    return bool(last_fast and datetime.now() - last_fast >= timedelta(hours=FULL_SYNC_INTERVAL_HOURS))


def is_cancelled(status: str) -> bool:
    return "cancel" in (status or "").casefold()


def latest_log_date(order: Dict[str, Any]):
    dates = [log.get("data") for log in order.get("logs", []) if log.get("data")]
    return max(dates) if dates else order.get("dataPedido")


def pending_payload(order: Dict[str, Any], synced_at: str) -> Dict[str, Any]:
    items = order.get("itensPedido") or []
    cost_centers = sorted({str(item.get("centroCusto")).strip() for item in items if item.get("centroCusto")})
    quantity = 0.0
    for item in items:
        try:
            quantity += float(item.get("quantidade") or 0)
        except (TypeError, ValueError):
            continue
    return {
        "ongsys_order_id": str(order.get("idPedido")),
        "title": order.get("titulo") or f"Pedido {order.get('idPedido')}",
        "status": order.get("statusPedido") or "Sem estado",
        "order_type": order.get("tipoPedido") or "Produto",
        "order_date": order.get("dataPedido"),
        "last_status_at": latest_log_date(order),
        "items_count": len(items),
        "total_quantity": quantity,
        "cost_centers": ", ".join(cost_centers),
        "active": 1,
        "last_synced_at": synced_at,
    }


def save_pending_orders(api: Common, orders: List[Dict[str, Any]], full_sync: bool, synced_at: str) -> int:
    product_orders = [order for order in orders if order.get("tipoPedido") == "Produto"]
    pending = {
        str(order.get("idPedido")): order
        for order in product_orders
        if order.get("idPedido") is not None
        and order.get("statusPedido") != FINAL_STATUS
        and not is_cancelled(order.get("statusPedido") or "")
    }
    resource = quote(PENDING_DOCTYPE, safe="")
    response = api.erp_request(
        "GET", resource,
        params={"fields": '["name","ongsys_order_id"]', "limit_page_length": 10000},
    )
    if response.status_code != 200:
        raise RuntimeError(f"Falha ao consultar pendências no NextERP: HTTP {response.status_code}")
    existing = {str(row["ongsys_order_id"]): row["name"] for row in response.json().get("data", [])}

    for order_id, order in pending.items():
        payload = pending_payload(order, synced_at)
        method = "PUT" if order_id in existing else "POST"
        path = f"{resource}/{quote(existing[order_id], safe='')}" if order_id in existing else resource
        result = api.erp_request(method, path, payload=payload)
        if result.status_code not in (200, 201):
            raise RuntimeError(f"Falha ao salvar pedido {order_id}: HTTP {result.status_code}")

    seen_status = {
        str(order.get("idPedido")): order.get("statusPedido") or "Sem estado"
        for order in product_orders if order.get("idPedido") is not None
    }
    for order_id, document_name in existing.items():
        should_close = order_id in seen_status and order_id not in pending
        if full_sync and order_id not in seen_status:
            should_close = True
        if not should_close:
            continue
        result = api.erp_request(
            "PUT", f"{resource}/{quote(document_name, safe='')}",
            payload={
                "active": 0,
                "status": seen_status.get(order_id) or "Não retornado pelo ONGSYS",
                "last_synced_at": synced_at,
            },
        )
        if result.status_code not in (200, 201):
            raise RuntimeError(f"Falha ao encerrar pendência {order_id}: HTTP {result.status_code}")
    return len(pending)


def sync_pending_orders(force_full: bool = False) -> None:
    api = Common()
    state, state_resource = get_state(api)
    last_page = discover_last_page(api, int(state.get("last_page") or 0))
    if last_page == 0:
        raise RuntimeError("ONGSYS não retornou páginas de pedidos")

    full_sync = should_run_full(state, force_full)
    pages = list(range(1, last_page + 1)) if full_sync else list(
        range(max(1, last_page - FAST_WINDOW_PAGES + 1), last_page + 1)
    )
    orders = fetch_window(api, pages)
    synced_at = datetime.now().isoformat(timespec="seconds")
    pending_count = save_pending_orders(api, orders, full_sync, synced_at)

    state_payload = {
        "last_page": last_page,
        "last_fast_sync_at": synced_at,
        "last_success_at": synced_at,
        "last_mode": "Completa" if full_sync else "Rápida",
        "pages_fetched": len(pages),
    }
    if full_sync:
        state_payload["last_full_sync_at"] = synced_at
    result = api.erp_request("PUT", state_resource, payload=state_payload)
    if result.status_code not in (200, 201):
        raise RuntimeError(f"Pendências salvas, mas checkpoint falhou: HTTP {result.status_code}")
    print(
        f"Sincronização {'completa' if full_sync else 'rápida'}: páginas {pages[0]}–{pages[-1]}, "
        f"{len(orders)} pedidos únicos lidos e {pending_count} pendentes na janela"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="Força auditoria de todas as páginas")
    args, _ = parser.parse_known_args()
    sync_pending_orders(force_full=args.full)

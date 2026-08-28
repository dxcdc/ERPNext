#!/usr/bin/env python
"""Descobre evidências de mapeamento no ONGSYS sem criar ou alterar estoque."""

import argparse
import json
from typing import Any, Dict, List, Optional

from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from common import Common, is_product_order


FINAL_STATUS = "Ordem finalizada"
MAX_PAGES = 60


def require(response, operation: str):
    if response.status_code != 200:
        raise RuntimeError(f"{operation}: HTTP {response.status_code} {(response.text or '')[:240]}")
    return response


def erp_method(api: Common, method: str, payload: Optional[Dict[str, Any]] = None):
    response = api.erp_request("POST" if payload is not None else "GET", f"api/method/cdc_theme.api.{method}", payload=payload)
    return require(response, method).json().get("message") or {}


def fetch_page(api: Common, page: int) -> Optional[List[Dict[str, Any]]]:
    response = api.ongsys_request("GET", "pedidos", page_number=page, timeout=15)
    if response.status_code == 422:
        return None
    require(response, f"Consulta ONGSYS página {page}")
    return response.json().get("data") or None


def finding(order: Dict[str, Any], code: str) -> Dict[str, Any]:
    return {
        "cost_center_code": code,
        "order_id": str(order.get("idPedido")),
        "title": order.get("titulo") or f"Pedido {order.get('idPedido')}",
        "description": order.get("titulo") or "Centro descoberto no ONGSYS",
    }


def discover(api: Common, max_pages: int = MAX_PAGES):
    findings: Dict[str, Dict[str, Any]] = {}
    orders_seen = pages_seen = 0
    page_errors = []
    consecutive_errors = 0
    for page in range(1, max_pages + 1):
        try:
            orders = fetch_page(api, page)
        except Exception as exc:
            page_errors.append(f"página {page}: {exc}")
            consecutive_errors += 1
            if consecutive_errors >= 3:
                break
            continue
        if orders is None:
            break
        consecutive_errors = 0
        pages_seen += 1
        orders_seen += len(orders)
        for order in orders:
            if order.get("statusPedido") != FINAL_STATUS or not is_product_order(order.get("tipoPedido")):
                continue
            for item in order.get("itensPedido") or []:
                code = str(item.get("centroCusto") or "").strip()
                if code:
                    findings[code] = finding(order, code)
    if not pages_seen:
        raise RuntimeError("ONGSYS não retornou nenhuma página utilizável")
    return list(findings.values()), {
        "pages": pages_seen, "orders": orders_seen,
        "page_errors": page_errors, "last_page_attempted": page,
    }


def main(force: bool = False, max_pages: int = MAX_PAGES):
    api = Common()
    discovery_retry = Retry(
        total=0, connect=0, read=0, status=0, backoff_factor=0,
        status_forcelist=(429, 500, 502, 503, 504, 520, 522, 524),
        allowed_methods=frozenset({"GET"}), raise_on_status=False,
    )
    api._ongsys_session.mount("https://", HTTPAdapter(max_retries=discovery_retry))
    api._ongsys_session.mount("http://", HTTPAdapter(max_retries=discovery_retry))
    request = erp_method(api, "get_ongsys_mapping_discovery_request")
    if not force and not request.get("requested"):
        print(json.dumps({"mode": "read-only", "status": "idle", "message": "Nenhuma descoberta solicitada."}, ensure_ascii=False))
        return
    started = erp_method(api, "start_ongsys_mapping_discovery", {})
    if not force and not started.get("ok"):
        print(json.dumps({"mode": "read-only", "status": "idle", "message": started.get("message")}, ensure_ascii=False))
        return
    try:
        findings, stats = discover(api, max_pages=max_pages)
        result = erp_method(api, "record_ongsys_mapping_discovery", {
            "findings": json.dumps(findings, ensure_ascii=False),
            "stats": json.dumps(stats),
        })
        print(json.dumps({"mode": "read-only", "status": "completed", "stats": stats, "result": result}, ensure_ascii=False))
    except Exception as exc:
        try:
            erp_method(api, "record_ongsys_mapping_discovery", {"error": str(exc)[:1000]})
        finally:
            raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Executa mesmo sem solicitação administrativa")
    parser.add_argument("--max-pages", type=int, default=MAX_PAGES, help="Limite de páginas recentes por execução")
    args, _ = parser.parse_known_args()
    main(force=args.force, max_pages=max(1, min(args.max_pages, MAX_PAGES)))

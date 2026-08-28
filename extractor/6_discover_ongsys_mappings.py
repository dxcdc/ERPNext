#!/usr/bin/env python
"""Descobre evidências de mapeamento no ONGSYS sem criar ou alterar estoque."""

import argparse
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from common import Common, is_product_order


FINAL_STATUS = "Ordem finalizada"
MAX_PAGES = 60
DIRECT_LOOKBACK = 300
DIRECT_LOOKAHEAD = 300
DIRECT_WORKERS = 4
_thread_local = threading.local()


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
        "status": order.get("statusPedido"),
        "order_type": order.get("tipoPedido"),
    }


def discover(api: Common, max_pages: int = MAX_PAGES, requested_codes=None):
    requested_codes = set(requested_codes or [])
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
            if pages_seen == 0 or consecutive_errors >= 3:
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
                if code and (not requested_codes or code in requested_codes):
                    findings[code] = finding(order, code)
        if requested_codes and requested_codes.issubset(findings):
            break
    return list(findings.values()), {
        "pages": pages_seen, "orders": orders_seen,
        "page_errors": page_errors, "last_page_attempted": page,
    }


def _direct_api() -> Common:
    api = getattr(_thread_local, "api", None)
    if api is None:
        api = Common()
        no_retry = Retry(total=0, connect=0, read=0, status=0, backoff_factor=0, raise_on_status=False)
        api._ongsys_session.mount("https://", HTTPAdapter(max_retries=no_retry))
        api._ongsys_session.mount("http://", HTTPAdapter(max_retries=no_retry))
        _thread_local.api = api
    return api


def fetch_order_direct(order_id: int) -> Optional[Dict[str, Any]]:
    response = _direct_api().ongsys_request(
        "GET", "pedidos", page_number=1, order_number=order_id, timeout=6,
    )
    if response.status_code != 200:
        return None
    return next((row for row in (response.json().get("data") or []) if str(row.get("idPedido")) == str(order_id)), None)


def direct_discovery(context: Dict[str, Any]):
    targets = {str(row.get("cost_center_code")) for row in context.get("mappings") or []}
    candidate_ids = {int(row["candidate_order_id"]) for row in context.get("mappings") or [] if row.get("candidate_order_id")}
    maximum = int(context.get("max_imported_order_id") or 0)
    if maximum:
        candidate_ids.update(range(max(1, maximum - DIRECT_LOOKBACK), maximum + DIRECT_LOOKAHEAD + 1))
    findings: Dict[str, Dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=DIRECT_WORKERS) as pool:
        for order in pool.map(fetch_order_direct, sorted(candidate_ids)):
            if not order or not is_product_order(order.get("tipoPedido")) or "cancel" in str(order.get("statusPedido") or "").casefold():
                continue
            for item in order.get("itensPedido") or []:
                code = str(item.get("centroCusto") or "").strip()
                if code in targets:
                    findings[code] = finding(order, code)
    return findings, {"direct_orders_tested": len(candidate_ids), "direct_matches": len(findings)}


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
        context = erp_method(api, "get_ongsys_mapping_discovery_context")
        direct_findings, direct_stats = direct_discovery(context)
        targets = set(context.get("requested_codes") or [row.get("cost_center_code") for row in context.get("mappings") or []])
        remaining = targets - set(direct_findings)
        page_findings, stats = ([], {"pages": 0, "orders": 0, "page_errors": []})
        if remaining:
            page_findings, stats = discover(api, max_pages=max_pages, requested_codes=remaining)
        combined = dict(direct_findings)
        combined.update({row["cost_center_code"]: row for row in page_findings})
        findings = list(combined.values())
        stats.update(direct_stats)
        stats["strategy"] = "direct-and-pagination" if remaining else "direct"
        stats["attempted_codes"] = sorted(code for code in targets if code)
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

#!/usr/bin/env python
"""Read-only comparison: no pending records, states or stock entries are written."""
import json
from decimal import Decimal, InvalidOperation
from urllib.parse import quote

from common import Common, is_product_order, normalize_order_type
from core_orders import CoreOrdersClient, CoreOrdersError


def read_existing(api):
    rows, seen = [], set()
    for offset in range(0, 100000, 250):
        response = api.erp_request("GET", quote("CDC ONGSYS Pending Order", safe=""), params={
            "fields": json.dumps(["ongsys_order_id", "status", "active", "items_count", "total_quantity", "cost_centers"]),
            "limit_start": offset, "limit_page_length": 250, "order_by": "name asc",
        })
        if response.status_code != 200:
            raise CoreOrdersError(f"NextERP HTTP {response.status_code}; comparison aborted.")
        page = response.json().get("data")
        if not isinstance(page, list):
            raise CoreOrdersError("Invalid NextERP pending list.")
        for row in page:
            key = str(row["ongsys_order_id"])
            if key in seen:
                raise CoreOrdersError("NextERP pagination repeated an order.")
            seen.add(key)
        rows.extend(page)
        if len(page) < 250:
            return rows
    raise CoreOrdersError("NextERP comparison page budget reached.")


def summarize(snapshot, existing):
    products = {str(row["idPedido"]): row for row in snapshot["data"] if is_product_order(row["tipoPedido"])}
    pending = {key: row for key, row in products.items()
               if normalize_order_type(row["statusPedido"]) != "ordem finalizada"
               and "cancel" not in row["statusPedido"].casefold()}
    active = {str(row["ongsys_order_id"]): row for row in existing if row.get("active")}
    changed = 0
    for key in pending.keys() & active.keys():
        source, target = pending[key], active[key]
        items = source["itensPedido"]
        try:
            quantity = sum((Decimal(str(item.get("quantidade") or 0)) for item in items), Decimal(0))
            target_quantity = Decimal(str(target.get("total_quantity") or 0))
            if not quantity.is_finite() or not target_quantity.is_finite():
                raise InvalidOperation
        except (InvalidOperation, TypeError):
            raise CoreOrdersError("Invalid quantity; comparison aborted.") from None
        centers = {str(item["centroCusto"]).strip() for item in items if item.get("centroCusto")}
        target_centers = {value.strip() for value in (target.get("cost_centers") or "").split(",") if value.strip()}
        changed += bool(source["statusPedido"] != target["status"] or len(items) != target["items_count"]
                        or quantity != target_quantity or centers != target_centers)
    return {
        "mode": "read_only_comparison", "snapshot": snapshot["snapshot"],
        "observed_through": snapshot["observed_through"], "collection_state": snapshot["collection_state"],
        "core_total_orders": snapshot["total"], "core_pending_orders": len(pending),
        "nexterp_active_pending": len(active), "new_or_reopened": len(pending.keys() - active.keys()),
        "explicitly_closed": len((active.keys() & products.keys()) - pending.keys()),
        "absent_from_core_unresolved": len(active.keys() - products.keys()),
        "changed_status_items_quantity_or_centers": changed,
    }


def main():
    snapshot = CoreOrdersClient().fetch_snapshot()
    api = Common(require_ongsys=False)
    if not api.ERP_URL or not api.API_KEY or not api.API_SECRET:
        raise CoreOrdersError("NextERP credential not configured.")
    print(json.dumps(summarize(snapshot, read_existing(api)), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except CoreOrdersError as exc:
        raise SystemExit(str(exc)) from None

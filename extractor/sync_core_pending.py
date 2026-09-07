#!/usr/bin/env python
"""Replace pending data only after reading a complete, stable Core snapshot."""
from urllib.parse import quote

from common import Common
from core_orders import CoreOrdersClient, CoreOrdersError


def sync_core_pending():
    api = Common(require_ongsys=False)
    state_type = quote("CDC ONGSYS Sync State", safe="")
    response = api.erp_request("GET", f"{state_type}/{state_type}")
    if response.status_code != 200:
        raise CoreOrdersError(f"NextERP state HTTP {response.status_code}")
    known = response.json().get("data", {}).get("core_snapshot")
    snapshot = CoreOrdersClient().fetch_snapshot(known_snapshot=known)
    if snapshot["not_modified"]:
        print("Core: versão já aplicada; nenhuma gravação necessária.")
        return
    response = api.erp_request("POST", "api/method/cdc_theme.core_pending.apply_snapshot",
                               payload={"snapshot": snapshot}, timeout=180)
    if response.status_code != 200:
        raise CoreOrdersError(f"NextERP apply HTTP {response.status_code}; confirmar estado antes de repetir.")
    result = response.json().get("message", {})
    if result.get("status") not in {"applied", "already_applied"} or result.get("snapshot") != snapshot["snapshot"]:
        raise CoreOrdersError("NextERP returned an invalid application receipt.")
    print(f"Core: {result['status']}; pedidos atualizados: {result.get('updated', 0)}.")


if __name__ == "__main__":
    try:
        sync_core_pending()
    except CoreOrdersError as exc:
        raise SystemExit(str(exc)) from None

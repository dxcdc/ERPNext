"""Atomic application of a complete Core snapshot to the pending-order read model."""
from datetime import datetime
from decimal import Decimal, InvalidOperation
import unicodedata
from uuid import UUID
from zoneinfo import ZoneInfo

import frappe
from frappe.utils import get_system_timezone


def _normalized(value):
    return " ".join(unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower().split())


def _date(value):
    if not value:
        return None
    try:
        result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        result = None
        for pattern in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y"):
            try:
                result = datetime.strptime(str(value), pattern)
                break
            except ValueError:
                pass
        if result is None:
            frappe.throw("Data inválida no pedido fornecido pelo Core.")
    if result.tzinfo:
        result = result.astimezone(ZoneInfo(get_system_timezone())).replace(tzinfo=None)
    return result


def _payload(order, observed):
    status = order.get("statusPedido")
    kind = order.get("tipoPedido")
    items = order.get("itensPedido")
    if not isinstance(status, str) or not status.strip() or not isinstance(kind, str) or not kind.strip():
        frappe.throw("Estado ou tipo ausente no pedido do Core.")
    if not isinstance(items, list) or any(not isinstance(row, dict) for row in items):
        frappe.throw("Itens inválidos no pedido do Core.")
    if _normalized(kind) not in {"produto", "pedido de produto"}:
        return None
    quantity = Decimal(0)
    try:
        for item in items:
            raw = str(item["quantidade"])
            value = Decimal(raw.replace(".", "").replace(",", ".") if "," in raw else raw)
            if not value.is_finite():
                raise InvalidOperation
            quantity += value
    except (InvalidOperation, KeyError, TypeError):
        frappe.throw("Quantidade inválida no pedido do Core.")
    dates = [_date(row.get("data")) for row in order.get("logs", [])]
    return {
        "ongsys_order_id": str(order["idPedido"]), "title": order.get("titulo") or f"Pedido {order['idPedido']}",
        "status": status, "order_type": kind, "order_date": _date(order.get("dataPedido")),
        "last_status_at": max((date for date in dates if date), default=_date(order.get("dataPedido"))),
        "items_count": len(items), "total_quantity": float(quantity),
        "cost_centers": ", ".join(sorted({str(row["centroCusto"]).strip() for row in items if row.get("centroCusto")})),
        "active": int(_normalized(status) != "ordem finalizada" and "cancel" not in _normalized(status)),
        "last_synced_at": observed,
    }


@frappe.whitelist(methods=["POST"])
def apply_snapshot(snapshot):
    frappe.only_for("System Manager")
    if not frappe.conf.get("core_ongsys_pending_enabled"):
        frappe.throw("Consumo de pendências do Core não habilitado neste site.", frappe.PermissionError)
    data = frappe.parse_json(snapshot) if isinstance(snapshot, str) else snapshot
    if not isinstance(data, dict) or data.get("complete") is not True or data.get("not_modified"):
        frappe.throw("A aplicação exige uma coleta completa do Core.")
    try:
        snapshot_id = str(UUID(data["snapshot"]))
        rows = data["data"]
        if not isinstance(rows, list) or not rows or type(data["total"]) is not int or len(rows) != data["total"]:
            raise ValueError
        observed_raw = datetime.fromisoformat(data["observed_through"].replace("Z", "+00:00"))
        if observed_raw.tzinfo is None:
            raise ValueError
        ids = [str(row["idPedido"]) for row in rows]
        if any(not key or len(key)>64 for key in ids) or len(set(ids)) != len(ids):
            raise ValueError
    except (KeyError, TypeError, ValueError):
        frappe.throw("Contrato de pedidos inválido ou incompleto.")
    observed = _date(data["observed_through"])
    payloads = [payload for row in rows if (payload := _payload(row, observed)) is not None]
    lock_name = "core_pending:" + frappe.local.site
    acquired = frappe.db.sql("SELECT GET_LOCK(%s, 0)", (lock_name,))[0][0]
    if not acquired:
        frappe.throw("Outra aplicação de pendências do Core está em andamento.")
    frappe.db.savepoint("core_pending_apply")
    try:
        state = frappe.get_single("CDC ONGSYS Sync State")
        if state.core_snapshot == snapshot_id:
            return {"status": "already_applied", "snapshot": snapshot_id}
        if state.core_observed_at and _date(state.core_observed_at) >= observed:
            frappe.throw("Coleta anterior à versão já aplicada; nenhuma alteração realizada.")
        touched = 0
        for payload in payloads:
            name = frappe.db.get_value("CDC ONGSYS Pending Order", {"ongsys_order_id": payload["ongsys_order_id"]}, "name")
            if not name and not payload["active"]:
                continue
            doc = frappe.get_doc("CDC ONGSYS Pending Order", name) if name else frappe.new_doc("CDC ONGSYS Pending Order")
            doc.update(payload)
            doc.save()
            touched += 1
        # Absence never means cancellation. Commit state and all updates in the same transaction.
        state.core_snapshot = snapshot_id
        state.core_observed_at = observed
        state.core_applied_at = frappe.utils.now_datetime()
        state.last_success_at = observed
        state.save()
        frappe.db.commit()
        return {"status": "applied", "snapshot": snapshot_id, "updated": touched}
    except Exception:
        frappe.db.rollback(save_point="core_pending_apply")
        raise
    finally:
        frappe.db.sql("SELECT RELEASE_LOCK(%s)", (lock_name,))

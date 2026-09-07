import unittest
from unittest.mock import patch
from uuid import uuid4

import frappe
from cdc_theme.core_pending import apply_snapshot


class CorePendingDatabaseTests(unittest.TestCase):
    def setUp(self):
        if frappe.local.site != "core-m2m-test.local":
            self.skipTest("Somente no site descartável core-m2m-test.local")
        frappe.set_user("Administrator")
        frappe.conf.core_ongsys_pending_enabled = 1
        frappe.db.delete("CDC ONGSYS Pending Order")
        state = frappe.get_single("CDC ONGSYS Sync State")
        for field in ("core_snapshot", "core_observed_at", "core_applied_at"):
            state.set(field, None)
        state.save()
        frappe.db.commit()

    def snapshot(self, rows, day=7):
        return {"snapshot": str(uuid4()), "complete": True, "total": len(rows),
                "observed_through": f"2026-09-{day:02d}T12:00:00+00:00", "data": rows}

    def order(self, number, status="Ordem gerada"):
        return {"idPedido": str(number), "tipoPedido": "Produto", "statusPedido": status,
                "dataPedido": "2026-09-07", "itensPedido": [{"quantidade": "2", "centroCusto": "test"}], "logs": []}

    def test_closure_absence_and_idempotency(self):
        first = self.snapshot([self.order(1), self.order(2)])
        self.assertEqual(apply_snapshot(first)["updated"], 2)
        self.assertEqual(apply_snapshot(first)["status"], "already_applied")
        apply_snapshot(self.snapshot([self.order(1, "Ordem finalizada")], day=8))
        self.assertEqual(frappe.db.get_value("CDC ONGSYS Pending Order", "1", "active"), 0)
        self.assertEqual(frappe.db.get_value("CDC ONGSYS Pending Order", "2", "active"), 1)

    def test_mid_write_failure_rolls_back_every_order_and_checkpoint(self):
        original = frappe.new_doc
        def fail_second(doctype, **kwargs):
            if frappe.db.exists("CDC ONGSYS Pending Order", "1"):
                raise RuntimeError("injected failure")
            return original(doctype, **kwargs)
        with patch("cdc_theme.core_pending.frappe.new_doc", side_effect=fail_second):
            with self.assertRaises(RuntimeError):
                apply_snapshot(self.snapshot([self.order(1), self.order(2)]))
        self.assertEqual(frappe.db.count("CDC ONGSYS Pending Order"), 0)
        self.assertFalse(frappe.get_single("CDC ONGSYS Sync State").core_snapshot)

    def test_old_incomplete_and_disabled_requests_preserve_data(self):
        original = self.snapshot([self.order(1)], day=8)
        apply_snapshot(original)
        for payload in [self.snapshot([self.order(2)]), {**self.snapshot([self.order(3)], day=9), "total": 2}]:
            with self.assertRaises(frappe.ValidationError):
                apply_snapshot(payload)
        frappe.conf.core_ongsys_pending_enabled = 0
        with self.assertRaises(frappe.PermissionError):
            apply_snapshot(self.snapshot([self.order(4)], day=9))
        self.assertEqual(frappe.db.count("CDC ONGSYS Pending Order"), 1)

    def test_non_admin_cannot_write(self):
        frappe.set_user("Guest")
        with self.assertRaises(frappe.PermissionError):
            apply_snapshot(self.snapshot([self.order(1)]))

    def test_pending_sync_preserves_stock_import_checkpoint(self):
        state = frappe.get_single("CDC ONGSYS Sync State")
        state.last_success_at = "2026-09-01 08:00:00"
        state.save()
        frappe.db.commit()
        apply_snapshot(self.snapshot([self.order(1)]))
        state.reload()
        self.assertEqual(str(state.last_success_at), "2026-09-01 08:00:00")

import unittest
from unittest.mock import patch
from uuid import uuid4

import frappe
from cdc_theme.api import get_ongsys_pending_orders
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

    def order(self, number, status="Ordem gerada", stage=None, cost_center="test"):
        if stage is None:
            stage = 6 if status == "Ordem finalizada" else 5
        return {"idPedido": str(number), "tipoPedido": "Produto", "statusPedido": status,
                "dataPedido": "2026-09-07", "etapaAtual": stage,
                "etapaAtualizadaEm": frappe.utils.now_datetime().isoformat(),
                "itensPedido": [{"quantidade": "2", "centroCusto": cost_center}], "logs": []}

    def test_closure_absence_and_idempotency(self):
        first = self.snapshot([self.order(1), self.order(2)])
        self.assertEqual(apply_snapshot(first)["updated"], 2)
        self.assertEqual(apply_snapshot(first)["status"], "already_applied")
        apply_snapshot(self.snapshot([self.order(1, "Ordem finalizada")], day=8))
        self.assertEqual(frappe.db.get_value("CDC ONGSYS Pending Order", "1", "active"), 0)
        self.assertEqual(frappe.db.get_value("CDC ONGSYS Pending Order", "2", "active"), 1)

    def test_finalized_order_is_persisted_for_scoped_stage_six_counts(self):
        result = apply_snapshot(self.snapshot([self.order(1, "Ordem finalizada")]))
        self.assertEqual(result["updated"], 1)
        row = frappe.db.get_value(
            "CDC ONGSYS Pending Order", "1", ["active", "current_stage"], as_dict=True,
        )
        self.assertEqual(row.active, 0)
        self.assertEqual(row.current_stage, 6)

    def test_same_snapshot_backfills_rows_missing_stage_data(self):
        snapshot = self.snapshot([self.order(1), self.order(2, "Ordem finalizada")])
        apply_snapshot(snapshot)
        frappe.db.set_value("CDC ONGSYS Pending Order", "1", "current_stage", 0)
        frappe.delete_doc("CDC ONGSYS Pending Order", "2")
        result = apply_snapshot(snapshot)
        self.assertEqual(result["updated"], 2)
        self.assertEqual(frappe.db.count("CDC ONGSYS Pending Order"), 2)
        self.assertEqual(frappe.db.get_value("CDC ONGSYS Pending Order", "1", "current_stage"), 5)

    def test_stage_counts_are_calculated_after_user_warehouse_scope(self):
        snapshot = self.snapshot([
            self.order(1, stage=4, cost_center="3.01.100.001"),
            self.order(2, stage=5, cost_center="3.01.100.001"),
            self.order(3, "Ordem finalizada", stage=6, cost_center="3.01.100.001"),
            self.order(4, stage=2, cost_center="3.02.100.001"),
        ])
        apply_snapshot(snapshot)
        with patch("cdc_theme.api._require_common_cdc_access"), \
             patch("cdc_theme.api._has_unrestricted_cdc_scope", return_value=False), \
             patch("cdc_theme.api._permitted_leaf_warehouses", return_value={"CAB ATITUDE - ANT - C"}), \
             patch("cdc_theme.api._normalize_dashboard_filters", return_value=("All", "All", [])):
            pending = get_ongsys_pending_orders(selected_stage="All")
            completed = get_ongsys_pending_orders(selected_stage="6")
        counts = {row["stage"]: row["count"] for row in pending["summary"]["stages"]}
        self.assertEqual(counts, {1: 0, 2: 0, 3: 0, 4: 1, 5: 1, 6: 1})
        self.assertEqual({row.ongsys_order_id for row in pending["orders"]}, {"1", "2"})
        self.assertEqual([row.ongsys_order_id for row in completed["orders"]], ["3"])

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

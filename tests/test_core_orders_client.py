import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "extractor"))
from core_orders import CoreOrdersClient, CoreOrdersError
from compare_core_pending import summarize, read_existing


def order(number, status="Ordem gerada"):
    return {"idPedido": str(number), "statusPedido": status, "tipoPedido": "Produto", "itensPedido": []}


def page(rows, *, snapshot="version-1", total=2, cursor=None):
    return {"status": "success", "contract_version": "v1", "dataset": "ongsys.orders", "snapshot": snapshot,
            "complete": True, "not_modified": False,
            "meta": {"ultima_sincronizacao": "2026-09-07T12:00:00+00:00", "estado_coleta": "ready", "coleta_completa": True},
            "paginacao": {"total_registros": total, "pagina_atual": 1 if cursor or total==1 or not rows else 2, "tem_proxima": bool(cursor)},
            "dados": rows, "data": rows}


class CoreOrdersClientTests(unittest.TestCase):
    def client(self, *pages):
        session = Mock()
        session.get.side_effect = [Mock(status_code=200, json=Mock(return_value=p)) for p in pages]
        return CoreOrdersClient("https://core.example", "test-" + "x"*40, session=session)

    def test_reads_complete_snapshot_without_mutations(self):
        client = self.client(page([order(1)], cursor="next"), page([order(2)]))
        self.assertEqual(len(client.fetch_snapshot()["data"]), 2)
        self.assertEqual(client.session.get.call_args.args[0], "https://core.example/api/v1/ongsys/pedidos/feed/")
        self.assertEqual(client.session.get.call_args.kwargs["params"]["page"], 2)
        self.assertFalse(client.session.get.call_args.kwargs["allow_redirects"])
        client.session.post.assert_not_called()

    def test_version_change_duplicate_and_short_snapshot_are_rejected(self):
        for last in [page([order(2)], snapshot="changed"), page([order(1)]), page([order(2)], total=3)]:
            client = self.client(page([order(1)], cursor="next"), last)
            with self.assertRaises(CoreOrdersError):
                client.fetch_snapshot()

    def test_failure_on_second_page_returns_no_partial_snapshot(self):
        client = self.client(page([order(1)], cursor="next"))
        client.session.get.side_effect = [Mock(status_code=200, json=Mock(return_value=page([order(1)], cursor="next"))), requests.Timeout("secret-value")]
        with self.assertRaises(CoreOrdersError) as error:
            client.fetch_snapshot()
        self.assertNotIn("secret-value", str(error.exception))

    def test_known_version_skips_payload(self):
        payload = {**page([]), "not_modified": True}
        self.assertTrue(self.client(payload).fetch_snapshot(known_snapshot="version-1")["not_modified"])
        with self.assertRaises(CoreOrdersError):
            self.client(payload).fetch_snapshot()

    def test_https_and_dedicated_key_required(self):
        for url in ["http://core.example", "https://user:password@core.example", "https://core.example?key=x"]:
            with self.assertRaises(CoreOrdersError):
                CoreOrdersClient(url, "x"*40)

    def test_comparison_distinguishes_explicit_closure_from_missing_order(self):
        snapshot = {"snapshot":"v1", "total":3, "observed_through":"2026-09-07T12:00:00+00:00", "collection_state":"ready", "data":[order(1), order(2, " ORDEM FINALIZADA "), order(3, "Cancelado")]}
        existing = [{"ongsys_order_id": str(i), "active": 1, "status": "Ordem gerada", "items_count": 0, "total_quantity": 0} for i in [2, 3, 4]]
        report = summarize(snapshot, existing)
        self.assertEqual(report["explicitly_closed"], 2)
        self.assertEqual(report["absent_from_core_unresolved"], 1)
        self.assertEqual(report["new_or_reopened"], 1)

    def test_existing_pending_pagination_is_read_only(self):
        api = Mock()
        api.erp_request.return_value = Mock(status_code=200, json=Mock(return_value={"data": []}))
        self.assertEqual(read_existing(api), [])
        self.assertEqual(api.erp_request.call_args.args[0], "GET")


if __name__ == "__main__":
    unittest.main()

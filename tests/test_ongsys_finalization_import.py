import importlib.util
import json
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXTRACTOR = ROOT / "extractor"
sys.path.insert(0, str(EXTRACTOR))
SPEC = importlib.util.spec_from_file_location(
    "cdc_ongsys_importer", EXTRACTOR / "5_extrator_requisicoes_v2.py"
)
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


class FakeResponse:
    status_code = 200

    def __init__(self, rows):
        self.rows = rows

    def json(self):
        return {"message": self.rows}


class FakeMappingApi:
    def __init__(self, rows):
        self.rows = rows

    def erp_request(self, *_args, **_kwargs):
        return FakeResponse(self.rows)


class OngsysFinalizationImportTest(unittest.TestCase):
    def test_recent_finalization_makes_old_order_batch_eligible(self):
        finalized_at = datetime.now() - timedelta(days=2)
        order = {
            "tipoPedido": "Pedido de Produto",
            "statusPedido": "  ORDEM FINALIZADA ",
            "dataPedido": "2026-06-29T08:00:00",
            "logs": [{"data": finalized_at.isoformat()}],
        }
        self.assertTrue(
            IMPORTER.is_batch_eligible(order, datetime.now() - timedelta(days=30))
        )
        self.assertEqual(IMPORTER.finalization_datetime(order), finalized_at)

    def test_original_order_date_does_not_replace_finalization_date(self):
        order = {
            "tipoPedido": "Produto",
            "statusPedido": "Ordem finalizada",
            "dataPedido": "2026-08-27T10:00:00",
            "logs": [
                {"data": "2026-08-24T09:00:00"},
                {"data": "2026-08-27T16:30:00"},
            ],
        }
        self.assertEqual(
            IMPORTER.latest_log_date(order), "2026-08-27 16:30:00"
        )

    def test_non_finalized_order_is_never_eligible(self):
        order = {
            "tipoPedido": "Produto",
            "statusPedido": "Ordem gerada",
            "dataPedido": datetime.now().isoformat(),
            "logs": [{"data": datetime.now().isoformat()}],
        }
        self.assertIsNone(IMPORTER.finalization_datetime(order))
        self.assertFalse(
            IMPORTER.is_batch_eligible(order, datetime.now() - timedelta(days=30))
        )

    def test_automatic_and_manual_active_mappings_override_legacy_csv(self):
        rows = [
            {
                "cost_center_code": "2.18.01.001",
                "warehouse": "TRANSFORMACAO DIGITAL - C",
                "status": "Ativo automático",
                "enabled": 1,
                "warehouse_status": "Ativo",
            },
            {
                "cost_center_code": "2.17.01.001",
                "warehouse": "CAIS OLINDA - C",
                "status": "Ativo manual",
                "enabled": 1,
                "warehouse_status": "Ativo",
            },
        ]
        mappings = IMPORTER.load_warehouse_map(FakeMappingApi(rows))
        self.assertEqual(mappings["2.18.01.001"], "TRANSFORMACAO DIGITAL")
        self.assertEqual(mappings["2.17.01.001"], "CAIS OLINDA")

    def test_disabled_or_invalid_warehouse_does_not_override_csv(self):
        rows = [{
            "cost_center_code": "2.18.01.001",
            "warehouse": "DESTINO INDEVIDO - C",
            "status": "Ativo automático",
            "enabled": 0,
            "warehouse_status": "Ativo",
        }]
        mappings = IMPORTER.load_warehouse_map(FakeMappingApi(rows))
        self.assertEqual(mappings["2.18.01.001"], "TRANSFORMACAO DIGITAL")


if __name__ == "__main__":
    unittest.main()

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "extractor"))

from common import is_product_order, normalize_order_type  # noqa: E402


class OrderTypeNormalizationTest(unittest.TestCase):
    def test_accepts_known_product_variants(self):
        for value in ("Produto", "Pedido de Produto", " pedido  de produto "):
            with self.subTest(value=value):
                self.assertTrue(is_product_order(value))

    def test_rejects_non_product_orders(self):
        for value in (None, "", "Serviço", "Pedido de Serviço"):
            with self.subTest(value=value):
                self.assertFalse(is_product_order(value))

    def test_normalization_is_case_and_accent_insensitive(self):
        self.assertEqual(normalize_order_type("  PEDÍDO de PRODUTO "), "pedido de produto")


if __name__ == "__main__":
    unittest.main()

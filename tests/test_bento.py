import os
import sys
import unittest

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from fastapi.testclient import TestClient
from backend.main import app
from backend.bento_service import BentoService
from backend.trade_manager import TradeManager


class TestBentoService(unittest.TestCase):
    def setUp(self):
        self.trade_mgr = TradeManager()
        self.service = BentoService(self.trade_mgr)
        self.client = TestClient(app)

    def test_bento_service_data_structure(self):
        data = self.service.get_real_bento_data(force_refresh=True)
        self.assertIn("summary", data)
        self.assertIn("history", data)
        self.assertIn("payments", data)
        self.assertIn("goals", data)
        self.assertIn("cashflow", data)
        self.assertIn("crypto", data)
        self.assertIn("stocks", data)

        # Net worth summary
        summary = data["summary"]
        self.assertGreater(summary["total_net_worth_usd"], 0)
        self.assertAlmostEqual(
            summary["total_net_worth_usd"],
            round(summary["total_fiat_usd"] + summary["total_stocks_usd"] + summary["total_crypto_usd"], 2),
            places=2
        )

        # 36 months history
        self.assertEqual(len(data["history"]), 36)
        latest_hist = data["history"][-1]
        self.assertEqual(latest_hist["fiat"], summary["total_fiat_usd"])
        self.assertEqual(latest_hist["stocks"], summary["total_stocks_usd"])
        self.assertEqual(latest_hist["crypto"], summary["total_crypto_usd"])

        # Crypto cards
        self.assertGreater(len(data["crypto"]), 0)
        for card in data["crypto"]:
            self.assertIn("name", card)
            self.assertIn("symbol", card)
            self.assertIn("share", card)
            self.assertIn("change", card)
            self.assertIn("ohlc", card)
            self.assertEqual(len(card["ohlc"]), 7)

        # Payments & Goals
        self.assertGreaterEqual(len(data["payments"]), 1)
        self.assertGreaterEqual(len(data["goals"]), 2)

        # Cashflow & Stocks
        self.assertEqual(len(data["cashflow"]["months"]), 6)
        self.assertEqual(len(data["stocks"]["days"]), 5)
        self.assertEqual(len(data["stocks"]["values"]), 5)

    def test_api_bento_data_endpoint(self):
        resp = self.client.get("/api/bento/data")
        self.assertEqual(resp.status_code, 200)
        json_data = resp.json()
        self.assertIn("summary", json_data)
        self.assertIn("history", json_data)
        self.assertIn("crypto", json_data)
        self.assertIn("stocks", json_data)


if __name__ == "__main__":
    unittest.main()

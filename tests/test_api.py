import unittest
from fastapi.testclient import TestClient
from backend.main import app


class TestBackendAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.client.post("/api/auth/google/demo-login")

    def test_health_endpoint(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "online")
        self.assertIn("binance", data)
        self.assertTrue(data["binance"].get("whitelist_unlocked"))

    def test_get_market_quotes(self):
        res = self.client.get("/api/market/quotes")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("crypto", data)
        self.assertIn("b3", data)
        self.assertIn("us", data)

    def test_propose_trade_and_approval_flow(self):
        # 1. Propose trade on DOGE (now authorized with unlocked whitelist)
        payload = {
            "symbol": "DOGEUSDT",
            "side": "BUY",
            "market": "Binance",
            "notional": 15.0,
            "order_type": "MARKET",
            "rationale": "Teste com whitelist liberada"
        }
        res = self.client.post("/api/trades/propose", json=payload)
        self.assertEqual(res.status_code, 200)
        ticket = res.json()
        self.assertEqual(ticket["symbol"], "DOGEUSDT")
        self.assertEqual(ticket["status"], "READY")
        self.assertEqual(ticket["verdict"], "PASS")

        ticket_id = ticket["id"]

        # 2. Approve ticket
        app_res = self.client.post(f"/api/trades/{ticket_id}/approve")
        self.assertEqual(app_res.status_code, 200)
        app_data = app_res.json()
        self.assertEqual(app_data["ticket"]["status"], "APPROVED")

        # 3. Execute ticket
        exec_res = self.client.post(f"/api/trades/{ticket_id}/execute")
        self.assertEqual(exec_res.status_code, 200)
        exec_data = exec_res.json()
        self.assertEqual(exec_data["ticket"]["status"], "EXECUTED")


if __name__ == "__main__":
    unittest.main()

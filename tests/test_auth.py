import os
import sys
import unittest

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from fastapi.testclient import TestClient
from backend.main import app
from backend.auth import GoogleAuthManager
from backend.trade_manager import TradeManager


class TestGoogleAuth(unittest.TestCase):
    def setUp(self):
        self.trade_mgr = TradeManager()
        self.auth_mgr = GoogleAuthManager(self.trade_mgr)
        self.client = TestClient(app)
        self.orig_config = self.trade_mgr.load_config()

    def tearDown(self):
        # Restore original config
        self.trade_mgr.save_config({
            "google_auth_enabled": self.orig_config.get("google_auth_enabled", False),
            "google_client_id": self.orig_config.get("google_client_id", ""),
            "google_allowed_emails": self.orig_config.get("google_allowed_emails", []),
        })

    def test_jwt_session_token_roundtrip(self):
        user_info = {
            "id": "1234567890",
            "email": "teste@gmail.com",
            "name": "Trader Teste",
            "picture": "https://example.com/photo.jpg",
            "provider": "google"
        }
        token = self.auth_mgr.create_session_token(user_info)
        self.assertIsInstance(token, str)
        self.assertGreater(len(token), 20)

        decoded = self.auth_mgr.verify_session_token(token)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded["email"], "teste@gmail.com")
        self.assertEqual(decoded["name"], "Trader Teste")
        self.assertEqual(decoded["sub"], "1234567890")

    def test_invalid_token(self):
        self.assertIsNone(self.auth_mgr.verify_session_token("invalid.token.string"))
        self.assertIsNone(self.auth_mgr.verify_session_token(""))

    def test_demo_login_endpoint(self):
        resp = self.client.post("/api/auth/google/demo-login", json={"email": "custom@gmail.com", "name": "Custom"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertIn("token", data)
        self.assertEqual(data["user"]["email"], "custom@gmail.com")
        self.assertIn("trader_session", resp.cookies)

    def test_auth_status_endpoint(self):
        # Without cookie
        resp = self.client.get("/api/auth/status")
        self.assertEqual(resp.status_code, 200)
        st = resp.json()
        self.assertIn("enabled", st)
        self.assertIn("is_authenticated", st)

        # Login and check status with cookie
        login_resp = self.client.post("/api/auth/google/demo-login")
        token = login_resp.json()["token"]

        resp_authed = self.client.get("/api/auth/status", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(resp_authed.status_code, 200)
        st_authed = resp_authed.json()
        self.assertTrue(st_authed["is_authenticated"])
        self.assertIsNotNone(st_authed["user"])

    def test_protected_routes_when_auth_enabled(self):
        # Enable Google Auth
        self.trade_mgr.save_config({"google_auth_enabled": True})

        # Attempt to propose trade without auth -> 401
        resp = self.client.post("/api/trades/propose", json={
            "symbol": "BTCUSDT",
            "side": "BUY",
            "market": "Binance",
            "notional": 10.0
        })
        self.assertEqual(resp.status_code, 401)
        self.assertIn("Google", resp.json().get("detail", ""))

        # Authenticate with demo login
        login_resp = self.client.post("/api/auth/google/demo-login")
        token = login_resp.json()["token"]

        # Propose trade with Bearer token -> Should pass auth check (may succeed or validate ticket)
        resp_authed = self.client.post(
            "/api/trades/propose",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "symbol": "BTCUSDT",
                "side": "BUY",
                "market": "Binance",
                "notional": 10.0
            }
        )
        self.assertNotEqual(resp_authed.status_code, 401)

    def test_configured_email_otalogia(self):
        user = self.auth_mgr.create_demo_user()
        self.assertEqual(user["email"], "otalogia@gmail.com")

        resp = self.client.post("/api/auth/google/demo-login")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["user"]["email"], "otalogia@gmail.com")

    def test_logout_endpoint(self):
        resp = self.client.post("/api/auth/logout")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get("success"))


if __name__ == "__main__":
    unittest.main()

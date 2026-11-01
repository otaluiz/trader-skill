#!/usr/bin/env python3
"""Unit tests for AutoTrader, dynamic Whitelist, and US/B3 market controls."""

import os
import shutil
import tempfile
import unittest
from fastapi.testclient import TestClient

from backend.main import app
from backend.trade_manager import TradeManager
from backend.auto_trader import AutoTrader
from trader_engine.strategy import StrategyEngine


class TestAutoTraderAndControls(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.trade_mgr = TradeManager()
        self.strategy_engine = StrategyEngine()
        self.auto_trader = AutoTrader(self.trade_mgr, self.strategy_engine)

    def tearDown(self):
        cfg = self.trade_mgr.load_config()
        cfg["crypto_whitelist_enabled"] = False
        cfg["auto_trading_enabled"] = False
        cfg["us_market_enabled"] = True
        cfg["b3_market_enabled"] = True
        cfg["us_max_order_usd"] = 25.0
        cfg["b3_max_order_brl"] = 250.0
        self.trade_mgr.save_config(cfg)

    def test_get_status_default(self):
        status = self.auto_trader.get_status()
        self.assertIn("enabled", status)
        self.assertIn("max_spend_usd", status)
        self.assertIn("current_spent_usd", status)
        self.assertIn("remaining_spend_usd", status)
        self.assertFalse(status["quota_exhausted"])

    def test_run_cycle_when_disabled(self):
        cfg = self.trade_mgr.load_config()
        cfg["auto_trading_enabled"] = False
        self.trade_mgr.save_config(cfg)

        result = self.auto_trader.run_cycle()
        self.assertEqual(result["status"], "disabled")

    def test_run_cycle_quota_limit(self):
        cfg = self.trade_mgr.load_config()
        cfg["auto_trading_enabled"] = True
        cfg["auto_trading_max_spend_usd"] = 50.0
        cfg["auto_trading_current_spent_usd"] = 50.0
        self.trade_mgr.save_config(cfg)

        result = self.auto_trader.run_cycle()
        self.assertEqual(result["status"], "quota_reached")

        # Test reset spend
        reset_res = self.auto_trader.reset_spend()
        self.assertEqual(reset_res["current_spent_usd"], 0.0)
        self.assertEqual(reset_res["remaining_spend_usd"], 50.0)

    def test_crypto_whitelist_toggle(self):
        cfg = self.trade_mgr.load_config()
        # Enable whitelist with only BTC and ETH
        cfg["crypto_whitelist_enabled"] = True
        cfg["crypto_whitelist"] = ["BTC", "ETH"]
        self.trade_mgr.save_config(cfg)

        # BTC should PASS
        t_btc = self.trade_mgr.propose_order(
            symbol="BTCUSDT",
            side="BUY",
            market="Binance",
            notional=15.0,
            limit_price=65000.0
        )
        self.assertEqual(t_btc["status"], "READY")

        # SOL should BLOCK because it's not in whitelist
        t_sol = self.trade_mgr.propose_order(
            symbol="SOLUSDT",
            side="BUY",
            market="Binance",
            notional=15.0,
            limit_price=140.0
        )
        self.assertEqual(t_sol["status"], "BLOCKED")
        self.assertTrue(any("Whitelist Cripto Ativa" in r for r in t_sol["reasons"]))

        # Disable whitelist: SOL should now PASS
        cfg["crypto_whitelist_enabled"] = False
        self.trade_mgr.save_config(cfg)
        t_sol2 = self.trade_mgr.propose_order(
            symbol="SOLUSDT",
            side="BUY",
            market="Binance",
            notional=15.0,
            limit_price=140.0
        )
        self.assertEqual(t_sol2["status"], "READY")

    def test_us_market_controls(self):
        cfg = self.trade_mgr.load_config()
        cfg["us_market_enabled"] = False
        self.trade_mgr.save_config(cfg)

        t_us = self.trade_mgr.propose_order(
            symbol="AAPL",
            side="BUY",
            market="US",
            notional=10.0,
            limit_price=220.0
        )
        self.assertEqual(t_us["status"], "BLOCKED")
        self.assertTrue(any("Mercado Internacional (US) está desativado" in r for r in t_us["reasons"]))

        # Enable US market, but test order size cap
        cfg["us_market_enabled"] = True
        cfg["us_max_order_usd"] = 25.0
        self.trade_mgr.save_config(cfg)

        t_us_large = self.trade_mgr.propose_order(
            symbol="AAPL",
            side="BUY",
            market="US",
            notional=50.0,
            limit_price=220.0
        )
        self.assertEqual(t_us_large["status"], "BLOCKED")
        self.assertTrue(any("excede o limite máximo para mercado US" in r for r in t_us_large["reasons"]))

    def test_b3_market_controls(self):
        cfg = self.trade_mgr.load_config()
        cfg["b3_market_enabled"] = False
        self.trade_mgr.save_config(cfg)

        t_b3 = self.trade_mgr.propose_order(
            symbol="PETR4",
            side="BUY",
            market="B3",
            notional=50.0,
            limit_price=38.0
        )
        self.assertEqual(t_b3["status"], "BLOCKED")
        self.assertTrue(any("Mercado B3 (Brasil) está desativado" in r for r in t_b3["reasons"]))

        # Enable B3 market, but test order size cap
        cfg["b3_market_enabled"] = True
        cfg["b3_max_order_brl"] = 100.0
        self.trade_mgr.save_config(cfg)

        t_b3_large = self.trade_mgr.propose_order(
            symbol="PETR4",
            side="BUY",
            market="B3",
            notional=200.0,
            limit_price=38.0
        )
        self.assertEqual(t_b3_large["status"], "BLOCKED")
        self.assertTrue(any("excede o limite máximo para B3" in r for r in t_b3_large["reasons"]))

    def test_autotrading_api_endpoints(self):
        # 1. Status
        res = self.client.get("/api/autotrading/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("enabled", data)
        self.assertIn("max_spend_usd", data)

        # 2. Config update
        update_res = self.client.post("/api/config", json={
            "crypto_whitelist_enabled": True,
            "crypto_whitelist": ["BTC", "ETH", "AAVE", "SOL", "LINK"],
            "us_market_enabled": True,
            "us_max_order_usd": 30.0,
            "b3_market_enabled": True,
            "b3_max_order_brl": 300.0,
            "auto_trading_enabled": False,
            "auto_trading_max_spend_usd": 75.0,
            "auto_trading_order_size_usd": 15.0,
            "auto_trading_min_confidence": 85
        })
        self.assertEqual(update_res.status_code, 200)
        updated_cfg = update_res.json()["config"]
        self.assertTrue(updated_cfg["crypto_whitelist_enabled"])
        self.assertEqual(updated_cfg["crypto_whitelist"], ["BTC", "ETH", "AAVE", "SOL", "LINK"])
        self.assertEqual(updated_cfg["auto_trading_max_spend_usd"], 75.0)

        # 3. Reset spend
        res_reset = self.client.post("/api/autotrading/reset-spend")
        self.assertEqual(res_reset.status_code, 200)
        self.assertEqual(res_reset.json()["current_spent_usd"], 0.0)


if __name__ == "__main__":
    unittest.main()

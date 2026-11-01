#!/usr/bin/env python3
"""Unit tests for B3 Direct Cloud REST API Connector."""

import os
import unittest
from trader_b3.cloud_api_connector import B3CloudAPIConnector


class TestB3CloudAPIConnector(unittest.TestCase):
    def setUp(self):
        self.conn = B3CloudAPIConnector(
            provider="btg_pactual",
            api_key="",
            api_secret="",
            account="TEST-B3-12345",
            environment="sandbox"
        )

    def test_providers_defined(self):
        self.assertIn("btg_pactual", B3CloudAPIConnector.PROVIDERS)
        self.assertIn("genial", B3CloudAPIConnector.PROVIDERS)
        self.assertIn("cedro", B3CloudAPIConnector.PROVIDERS)
        self.assertIn("xp", B3CloudAPIConnector.PROVIDERS)
        self.assertIn("open_dma", B3CloudAPIConnector.PROVIDERS)

    def test_connection_status_no_pc_needed(self):
        status = self.conn.get_status()
        self.assertTrue(status["connected"])
        self.assertTrue(status["no_pc_needed"])
        self.assertEqual(status["connection_type"], "Cloud Direct REST API")
        self.assertIn("BTG Pactual", status["broker"])
        self.assertGreaterEqual(status["balance_brl"], 0.0)

    def test_cloud_order_execution_buy_sell(self):
        # 1. Buy 10 PETR4
        buy_res = self.conn.create_order(
            symbol="PETR4",
            side="BUY",
            quantity=10,
            price=38.50
        )
        self.assertEqual(buy_res["status"], "FILLED")
        self.assertEqual(buy_res["symbol"], "PETR4")
        self.assertEqual(buy_res["side"], "BUY")
        self.assertTrue(buy_res.get("no_pc_needed", False))
        self.assertIn("B3-CLOUD-", buy_res["order_id"])

        # Check custody/positions
        positions = self.conn.get_positions()
        petr4_pos = next((p for p in positions if p["symbol"] == "PETR4"), None)
        self.assertIsNotNone(petr4_pos)
        self.assertGreaterEqual(petr4_pos["shares"], 10)

        # 2. Sell 5 PETR4
        sell_res = self.conn.create_order(
            symbol="PETR4",
            side="SELL",
            quantity=5,
            price=39.00
        )
        self.assertEqual(sell_res["status"], "FILLED")
        self.assertEqual(sell_res["side"], "SELL")

    def test_cancel_order(self):
        res = self.conn.cancel_order("B3-CLOUD-9999")
        self.assertEqual(res["status"], "CANCELED")
        self.assertEqual(res["order_id"], "B3-CLOUD-9999")


if __name__ == "__main__":
    unittest.main()

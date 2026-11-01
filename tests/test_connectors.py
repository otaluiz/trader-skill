import unittest
from trader_us.alpaca_connector import AlpacaConnector
from trader_b3.mt5_connector import B3MT5Connector


class TestBrokerConnectors(unittest.TestCase):
    def test_alpaca_simulation_flow(self):
        alpaca = AlpacaConnector(paper=True)
        acct = alpaca.get_account()
        self.assertIn("cash", acct)
        self.assertIn(acct["mode"], ["simulation_local", "alpaca_paper", "alpaca_live"])

        # Test simulated buy order
        order = alpaca.create_order(symbol="AAPL", side="buy", notional=25.0, limit_price=150.0)
        self.assertEqual(order["status"], "filled")
        self.assertEqual(order["symbol"], "AAPL")
        self.assertEqual(order["side"], "buy")
        self.assertAlmostEqual(order["value"], 25.0)

    def test_mt5_symbol_formatting_and_simulation(self):
        mt5_conn = B3MT5Connector()
        status = mt5_conn.get_status()
        self.assertIn("mode", status)

        # Formatting standard lot vs fractional lot
        self.assertEqual(mt5_conn.format_b3_symbol("PETR4", 100), "PETR4")
        self.assertEqual(mt5_conn.format_b3_symbol("PETR4", 50), "PETR4F")
        self.assertEqual(mt5_conn.format_b3_symbol("VALE3.SA", 10), "VALE3F")
        self.assertEqual(mt5_conn.format_b3_symbol("ITUB4F", 200), "ITUB4")

        # Test simulated order
        order = mt5_conn.create_order(symbol="PETR4", side="BUY", qty=10, limit_price=40.0)
        self.assertEqual(order["status"], "FILLED")
        self.assertEqual(order["symbol"], "PETR4F")
        self.assertEqual(order["side"], "BUY")
        self.assertEqual(order["value_brl"], 400.0)


if __name__ == "__main__":
    unittest.main()

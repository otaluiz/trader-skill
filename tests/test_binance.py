import unittest
from trader_binance.connector import BinanceConnector, BinanceSecurityError, POPULAR_CRYPTO_SYMBOLS


class TestBinanceConnector(unittest.TestCase):
    def setUp(self):
        self.conn = BinanceConnector(paper=True)

    def test_popular_symbols_allowed(self):
        for sym in POPULAR_CRYPTO_SYMBOLS:
            canonical = self.conn.validate_symbol(sym)
            self.assertEqual(canonical, sym)

    def test_unlocked_whitelist_allows_any_valid_crypto(self):
        # Now that whitelist is unlocked, symbols like DOGE, BNB, NEAR, SUI are accepted
        valid_coins = ["DOGE", "DOGEUSDT", "BNB", "BNBUSDT", "ADA", "SUI", "NEAR"]
        for c in valid_coins:
            validated = self.conn.validate_symbol(c)
            self.assertTrue(validated.endswith("USDT"))

    def test_invalid_symbol_syntax_raises_error(self):
        invalid = ["INVALID$$$", "TOO_LONG_OF_A_SYMBOL_NAME_12345"]
        for inv in invalid:
            with self.assertRaises(BinanceSecurityError):
                self.conn.validate_symbol(inv)

    def test_paper_trading_balances_and_order_execution(self):
        conn = BinanceConnector(paper=True)
        conn._save_paper_balances({"USDT": 500.0, "DOGE": 0.0, "BTC": 0.0})

        # Test buy order on DOGE (previously blocked, now permitted!)
        order = conn.create_order(symbol="DOGEUSDT", side="BUY", notional=20.0, price=0.20)
        self.assertEqual(order["status"], "FILLED")
        self.assertEqual(order["symbol"], "DOGEUSDT")
        self.assertEqual(order["side"], "BUY")
        self.assertEqual(order["executed_qty"], 100.0)

        balances = conn._get_paper_balances()
        self.assertEqual(balances["USDT"], 480.0)
        self.assertEqual(balances["DOGE"], 100.0)


if __name__ == "__main__":
    unittest.main()

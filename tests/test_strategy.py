import unittest
from trader_engine.strategy import TechnicalAnalysis, StrategyEngine


class TestStrategyEngine(unittest.TestCase):
    def setUp(self):
        self.ta = TechnicalAnalysis()
        self.engine = StrategyEngine()

    def test_sma_calculation(self):
        prices = [10.0, 11.0, 12.0, 13.0, 14.0]
        sma = self.ta.calculate_sma(prices, 3)
        self.assertIsNone(sma[0])
        self.assertIsNone(sma[1])
        self.assertAlmostEqual(sma[2], 11.0)
        self.assertAlmostEqual(sma[3], 12.0)
        self.assertAlmostEqual(sma[4], 13.0)

    def test_rsi_bounds(self):
        # Monotonically increasing prices -> RSI should be high
        up_prices = [float(i) for i in range(1, 30)]
        rsi_up = self.ta.calculate_rsi(up_prices, 14)
        self.assertGreater(rsi_up[-1], 80.0)

        # Monotonically decreasing prices -> RSI should be low
        down_prices = [float(50 - i) for i in range(1, 30)]
        rsi_down = self.ta.calculate_rsi(down_prices, 14)
        self.assertLess(rsi_down[-1], 20.0)

    def test_asset_analysis_generates_targets(self):
        candles = []
        for i in range(40):
            p = 100.0 + (i * 0.5)
            candles.append({
                "time": i * 3600000,
                "open": p - 0.2,
                "high": p + 0.8,
                "low": p - 0.5,
                "close": p,
                "volume": 1000
            })
        rec = self.engine.analyze_asset("BTCUSDT", "Binance", candles)
        self.assertIsNotNone(rec)
        self.assertIn(rec["signal"], ["STRONG BUY", "BUY", "NEUTRAL", "SELL", "STRONG SELL"])
        self.assertIn(rec["action"], ["BUY", "SELL", "HOLD"])
        self.assertGreater(rec["stop_loss"], 0)
        self.assertGreater(rec["take_profit_1"], 0)
        self.assertTrue(len(rec["reasons"]) > 0)


if __name__ == "__main__":
    unittest.main()

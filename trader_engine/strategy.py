#!/usr/bin/env python3
"""Quantitative Strategy & Technical Analysis Engine.
Calculates RSI, MACD, Moving Averages, Bollinger Bands, and ATR.
Generates recommendations with entry, stop-loss, take-profit, and rationale.
"""

import math
from typing import List, Dict, Optional, Tuple


class TechnicalAnalysis:
    @staticmethod
    def calculate_sma(prices: List[float], period: int) -> List[Optional[float]]:
        smas = [None] * len(prices)
        if len(prices) < period:
            return smas
        for i in range(period - 1, len(prices)):
            window = prices[i - period + 1: i + 1]
            smas[i] = sum(window) / period
        return smas

    @staticmethod
    def calculate_ema(prices: List[float], period: int) -> List[Optional[float]]:
        emas = [None] * len(prices)
        if len(prices) < period:
            return emas
        k = 2 / (period + 1)
        # Seed first EMA with SMA
        seed = sum(prices[:period]) / period
        emas[period - 1] = seed
        for i in range(period, len(prices)):
            emas[i] = (prices[i] * k) + (emas[i - 1] * (1 - k))
        return emas

    @staticmethod
    def calculate_rsi(prices: List[float], period: int = 14) -> List[Optional[float]]:
        rsis = [None] * len(prices)
        if len(prices) <= period:
            return rsis

        gains = []
        losses = []
        for i in range(1, len(prices)):
            diff = prices[i] - prices[i - 1]
            gains.append(max(0.0, diff))
            losses.append(max(0.0, -diff))

        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period

        if avg_loss == 0:
            rsis[period] = 100.0
        else:
            rs = avg_gain / avg_loss
            rsis[period] = 100.0 - (100.0 / (1.0 + rs))

        for i in range(period, len(gains)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
            idx = i + 1
            if avg_loss == 0:
                rsis[idx] = 100.0
            else:
                rs = avg_gain / avg_loss
                rsis[idx] = 100.0 - (100.0 / (1.0 + rs))
        return rsis

    @staticmethod
    def calculate_macd(prices: List[float], fast: int = 12, slow: int = 26, signal_period: int = 9) -> Dict:
        ema_fast = TechnicalAnalysis.calculate_ema(prices, fast)
        ema_slow = TechnicalAnalysis.calculate_ema(prices, slow)
        macd_line = [None] * len(prices)

        for i in range(len(prices)):
            if ema_fast[i] is not None and ema_slow[i] is not None:
                macd_line[i] = ema_fast[i] - ema_slow[i]

        # Signal line is EMA of valid macd values
        valid_macd = [x for x in macd_line if x is not None]
        offset = len(macd_line) - len(valid_macd)
        signal_calc = TechnicalAnalysis.calculate_ema(valid_macd, signal_period)

        signal_line = [None] * len(prices)
        histogram = [None] * len(prices)

        for j in range(len(valid_macd)):
            full_idx = offset + j
            signal_line[full_idx] = signal_calc[j]
            if macd_line[full_idx] is not None and signal_line[full_idx] is not None:
                histogram[full_idx] = macd_line[full_idx] - signal_line[full_idx]

        return {
            "macd": macd_line,
            "signal": signal_line,
            "histogram": histogram
        }

    @staticmethod
    def calculate_bollinger_bands(prices: List[float], period: int = 20, num_std: float = 2.0) -> Dict:
        upper = [None] * len(prices)
        middle = TechnicalAnalysis.calculate_sma(prices, period)
        lower = [None] * len(prices)

        for i in range(period - 1, len(prices)):
            m = middle[i]
            if m is not None:
                window = prices[i - period + 1: i + 1]
                variance = sum((x - m) ** 2 for x in window) / period
                std_dev = math.sqrt(variance)
                upper[i] = m + (num_std * std_dev)
                lower[i] = m - (num_std * std_dev)

        return {"upper": upper, "middle": middle, "lower": lower}

    @staticmethod
    def calculate_atr(candles: List[Dict], period: int = 14) -> List[Optional[float]]:
        if len(candles) < 2:
            return [None] * len(candles)

        true_ranges = [candles[0]["high"] - candles[0]["low"]]
        for i in range(1, len(candles)):
            high = candles[i]["high"]
            low = candles[i]["low"]
            prev_close = candles[i - 1]["close"]
            tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
            true_ranges.append(tr)

        atrs = [None] * len(candles)
        if len(candles) < period:
            return atrs

        seed_atr = sum(true_ranges[:period]) / period
        atrs[period - 1] = seed_atr

        for i in range(period, len(candles)):
            atrs[i] = (atrs[i - 1] * (period - 1) + true_ranges[i]) / period

        return atrs


class StrategyEngine:
    def __init__(self):
        self.ta = TechnicalAnalysis()

    def analyze_asset(self, symbol: str, market: str, candles: List[Dict], current_price: float = None) -> Optional[Dict]:
        """Analyzes candlestick data and returns signals, targets, and rationale."""
        if not candles or len(candles) < 15:
            return None

        closes = [c["close"] for c in candles]
        price = current_price or closes[-1]

        # Calculate indicators
        rsis = self.ta.calculate_rsi(closes, period=14)
        latest_rsi = rsis[-1] if rsis[-1] is not None else 50.0

        macds = self.ta.calculate_macd(closes, fast=12, slow=26, signal_period=9)
        latest_macd = macds["macd"][-1] or 0.0
        latest_signal = macds["signal"][-1] or 0.0
        latest_hist = macds["histogram"][-1] or 0.0
        prev_hist = macds["histogram"][-2] if len(macds["histogram"]) > 1 and macds["histogram"][-2] is not None else 0.0

        smas20 = self.ta.calculate_sma(closes, 20)
        smas50 = self.ta.calculate_sma(closes, 50)
        latest_sma20 = smas20[-1] if smas20[-1] is not None else price
        latest_sma50 = smas50[-1] if smas50[-1] is not None else price

        bb = self.ta.calculate_bollinger_bands(closes, 20, 2.0)
        bb_upper = bb["upper"][-1] or (price * 1.05)
        bb_lower = bb["lower"][-1] or (price * 0.95)

        atrs = self.ta.calculate_atr(candles, 14)
        latest_atr = atrs[-1] if atrs[-1] is not None else (price * 0.02)

        # Scoring system (-100 to +100)
        score = 0
        reasons = []

        # RSI Evaluation
        if latest_rsi < 30:
            score += 35
            reasons.append(f"RSI em sobrevenda ({latest_rsi:.1f}), indicando forte potencial de reversão altista")
        elif latest_rsi < 42:
            score += 15
            reasons.append(f"RSI em patamar favorável de acumulação ({latest_rsi:.1f})")
        elif latest_rsi > 70:
            score -= 35
            reasons.append(f"RSI em sobrecompra ({latest_rsi:.1f}), sugerindo exaustão de compradores")
        elif latest_rsi > 60:
            score -= 10
            reasons.append(f"RSI aproximando-se de zona esticada ({latest_rsi:.1f})")

        # MACD Evaluation
        if latest_hist > 0 and prev_hist <= 0:
            score += 30
            reasons.append("Cruzamento de alta confirmado no MACD (Histograma virou positivo)")
        elif latest_hist > 0:
            score += 15
            reasons.append("MACD mantendo momento positivo acima da linha de sinal")
        elif latest_hist < 0 and prev_hist >= 0:
            score -= 30
            reasons.append("Cruzamento de baixa no MACD (Histograma virou negativo)")
        elif latest_hist < 0:
            score -= 15
            reasons.append("MACD com pressão vendedora")

        # Moving Averages Evaluation
        if price > latest_sma20:
            score += 15
            reasons.append("Preço sustentado acima da Média Móvel de 20 períodos")
        else:
            score -= 15
            reasons.append("Preço negociando abaixo da Média Móvel de 20 períodos")

        # Bollinger Bands
        if price <= bb_lower * 1.01:
            score += 20
            reasons.append("Preço testando a Banda Inferior de Bollinger (suporte dinâmico)")
        elif price >= bb_upper * 0.99:
            score -= 20
            reasons.append("Preço colado na Banda Superior de Bollinger (resistência dinâmica)")

        # Determine Recommendation Signal
        if score >= 45:
            signal = "STRONG BUY"
            action = "BUY"
            confidence = min(95, 75 + int(score * 0.2))
        elif score >= 20:
            signal = "BUY"
            action = "BUY"
            confidence = min(85, 65 + int(score * 0.3))
        elif score <= -45:
            signal = "STRONG SELL"
            action = "SELL"
            confidence = min(95, 75 + int(abs(score) * 0.2))
        elif score <= -20:
            signal = "SELL"
            action = "SELL"
            confidence = min(85, 65 + int(abs(score) * 0.3))
        else:
            signal = "NEUTRAL"
            action = "HOLD"
            confidence = 55
            reasons.append("Mercado em consolidação lateral sem viés direcional claro")

        # Determine Target Levels (Entry, Stop Loss, Take Profit)
        entry_price = round(price, 4 if price < 10 else 2)
        if action == "BUY":
            stop_loss = round(max(0.0001, entry_price - (1.5 * latest_atr)), 4 if price < 10 else 2)
            take_profit_1 = round(entry_price + (2.0 * latest_atr), 4 if price < 10 else 2)
            take_profit_2 = round(entry_price + (3.5 * latest_atr), 4 if price < 10 else 2)
            risk_pct = round(((entry_price - stop_loss) / entry_price) * 100, 2)
            reward_pct = round(((take_profit_1 - entry_price) / entry_price) * 100, 2)
        else:
            stop_loss = round(entry_price + (1.5 * latest_atr), 4 if price < 10 else 2)
            take_profit_1 = round(max(0.0001, entry_price - (2.0 * latest_atr)), 4 if price < 10 else 2)
            take_profit_2 = round(max(0.0001, entry_price - (3.5 * latest_atr)), 4 if price < 10 else 2)
            risk_pct = round(((stop_loss - entry_price) / entry_price) * 100, 2)
            reward_pct = round(((entry_price - take_profit_1) / entry_price) * 100, 2)

        rr_ratio = round(reward_pct / max(0.1, risk_pct), 2)

        return {
            "symbol": symbol,
            "market": market,
            "signal": signal,
            "action": action,
            "confidence": confidence,
            "score": score,
            "current_price": entry_price,
            "entry_price": entry_price,
            "stop_loss": stop_loss,
            "take_profit_1": take_profit_1,
            "take_profit_2": take_profit_2,
            "risk_pct": risk_pct,
            "reward_pct": reward_pct,
            "risk_reward_ratio": f"1:{rr_ratio}",
            "indicators": {
                "rsi_14": round(latest_rsi, 2),
                "macd": round(latest_macd, 4),
                "macd_signal": round(latest_signal, 4),
                "macd_hist": round(latest_hist, 4),
                "sma_20": round(latest_sma20, 2),
                "sma_50": round(latest_sma50, 2),
                "bollinger_upper": round(bb_upper, 2),
                "bollinger_lower": round(bb_lower, 2),
                "atr": round(latest_atr, 4),
            },
            "reasons": reasons,
            "rationale": "; ".join(reasons)
        }

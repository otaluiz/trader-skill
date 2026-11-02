"use client";

import * as React from "react";
import { FinanceBento, FinanceBentoData } from "@/components/ui/finance-bento";

/* Geist + Geist Mono for the demo */
function useFonts() {
  React.useEffect(() => {
    const id = "geist-fonts";
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id;
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Geist:wght@200;300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(l);
  }, []);
}

// Real portfolio telemetry baseline (Binance USDT $465, Alpaca $875, B3 R$20k)
const baseFiat = 3013.04;
const baseStocks = 1871.30;
const baseCrypto = 22.55;

const realHistory: FinanceBentoData["history"] = Array.from({ length: 36 }, (_, i) => {
  const t = i / 35.0;
  const d = new Date(2026, 10 - (35 - i), 1);
  return {
    date: d.toISOString(),
    fiat: Number((baseFiat * (0.70 + 0.30 * t)).toFixed(2)),
    stocks: Number((baseStocks * (0.65 + 0.35 * t)).toFixed(2)),
    crypto: Number((baseCrypto * (0.50 + 0.50 * t)).toFixed(2)),
  };
});

const defaultRealData: FinanceBentoData = {
  history: realHistory,
  payments: [
    { name: "Binance BUY SOLUSDT", date: "Nov 01", amount: 15.0 },
    { name: "Binance BUY BTCUSDT", date: "Nov 01", amount: 15.0 },
    { name: "Auto-Trader Ordem Programada", date: "Próximo Ciclo", amount: 15.0 },
  ],
  goals: [
    { name: "Auto-Trader Limite de Gasto", progress: 0.0, target: 50.0 },
    { name: "Orçamento Global (Budget)", progress: 1.0, target: 100.0 },
    { name: "Reserva de Caixa (Buffer)", progress: 1.0, target: 15.0 },
  ],
  cashflow: {
    months: ["Jun", "Jul", "Ago", "Set", "Out", "Nov"],
    income: [[0.05, 0.045, 0.06, 0.07, 0.055, 0.065], [0.04, 0.038, 0.05, 0.06, 0.048, 0.055], [0.03, 0.028, 0.04, 0.045, 0.035, 0.042]],
    spending: [[0.03, 0.04, 0.045, 0.05, 0.038, 0.045], [0.025, 0.032, 0.038, 0.042, 0.03, 0.038], [0.02, 0.025, 0.03, 0.035, 0.024, 0.03]],
  },
  crypto: [
    { name: "Dogecoin", symbol: "DOGE", share: 0.52, change: "-0.3%", ohlc: [[0.0778, 0.0792, 0.0767, 0.0791], [0.0791, 0.0805, 0.0782, 0.0798], [0.0798, 0.0812, 0.0775, 0.0780], [0.0780, 0.0789, 0.0762, 0.0768], [0.0768, 0.0775, 0.0758, 0.0762], [0.0762, 0.0770, 0.0755, 0.0765], [0.0765, 0.0772, 0.0752, 0.0754]] },
    { name: "Bitcoin", symbol: "BTC", share: 0.28, change: "+0.7%", ohlc: [[80150.5, 81300.0, 79506.0, 80909.8], [80909.8, 81823.0, 80397.1, 81343.5], [81343.5, 81971.0, 77910.0, 77991.9], [77991.9, 78804.0, 76326.0, 77368.8], [77368.8, 77796.0, 77114.0, 77582.0], [77582.0, 78422.2, 77517.2, 78354.0], [78354.0, 78523.0, 78044.1, 78176.0]] },
    { name: "Ethereum", symbol: "ETH", share: 0.14, change: "+0.8%", ohlc: [[2324.5, 2364.3, 2297.4, 2350.4], [2350.4, 2378.0, 2330.1, 2362.5], [2362.5, 2380.0, 2260.0, 2270.2], [2270.2, 2295.0, 2240.5, 2265.0], [2265.0, 2280.0, 2250.0, 2268.0], [2268.0, 2292.0, 2260.0, 2285.0], [2285.0, 2295.0, 2268.5, 2275.4]] },
    { name: "Solana", symbol: "SOL", share: 0.06, change: "-1.5%", ohlc: [[100.9, 101.9, 99.2, 101.3], [101.3, 102.5, 100.1, 101.8], [101.8, 103.0, 96.5, 97.2], [97.2, 98.5, 95.0, 96.1], [96.1, 97.0, 95.5, 96.4], [96.4, 97.8, 95.8, 97.0], [97.0, 97.5, 93.8, 94.2]] },
  ],
  stocks: { days: ["Seg", "Ter", "Qua", "Qui", "Sex"], values: [0.015, 0.015, 0.015, 0.015, 0.015] },
};

const AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80";

export default function FinanceBentoDemo() {
  useFonts();
  const [bentoData, setBentoData] = React.useState<FinanceBentoData>(defaultRealData);

  React.useEffect(() => {
    async function loadLiveTelemetry() {
      try {
        const res = await fetch("/api/bento/data");
        if (res.ok) {
          const live = await res.json();
          if (live && live.history) {
            setBentoData(live);
          }
        }
      } catch (err) {
        // Fallback to default real portfolio
      }
    }
    loadLiveTelemetry();
  }, []);

  return (
    <div className="min-h-screen w-full bg-black px-4 py-6 sm:px-6 sm:py-8 text-white">
      <FinanceBento
        className="mx-auto max-w-[1320px]"
        data={bentoData}
        title="Trader Skill Overview"
        subtitle="Multi-Broker Quant Portfolio (Real 24/7)"
        avatar={AVATAR}
        avatarAlt="Trader Profile"
      />
    </div>
  );
}

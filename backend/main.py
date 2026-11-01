#!/usr/bin/env python3
"""FastAPI Backend Server for Trader Skill Web System.
Supports Binance (BTC, ETH, AAVE, SOL, LINK), US Stocks (Alpaca), and B3 Stocks (MetaTrader 5).
"""

import asyncio
import os
import sys
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Add project root to sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from trader_binance.connector import BinanceConnector, POPULAR_CRYPTO_ASSETS, POPULAR_CRYPTO_SYMBOLS, BinanceSecurityError
from trader_b3.market import B3Market
from trader_b3.mt5_connector import B3MT5Connector
from trader_us.market import USMarket
from trader_us.alpaca_connector import AlpacaConnector
from trader_engine.strategy import StrategyEngine
from backend.trade_manager import TradeManager
from backend.auto_trader import AutoTrader

app = FastAPI(
    title="Trader Skill Web API",
    description="Sistema web de recomendações e gerenciamento de trades para Binance (Cripto), Alpaca (US) e MetaTrader 5 (B3).",
    version="2.1.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize engines
trade_mgr = TradeManager()
strategy_engine = StrategyEngine()
b3_market = B3Market()
us_market = USMarket()
auto_trader = AutoTrader(trade_mgr, strategy_engine)


@app.on_event("startup")
async def startup_auto_trading_worker():
    """Background task to run auto-trading cycles when enabled."""
    async def worker():
        while True:
            try:
                cfg = trade_mgr.load_config()
                if cfg.get("auto_trading_enabled", False):
                    auto_trader.run_cycle()
            except Exception as e:
                auto_trader.log(f"Worker background error: {e}")
            await asyncio.sleep(60)

    asyncio.create_task(worker())


# Pydantic Schemas
class ProposeTradeRequest(BaseModel):
    symbol: str
    side: str
    market: str
    notional: Optional[float] = None
    qty: Optional[float] = None
    order_type: Optional[str] = "MARKET"
    limit_price: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    rationale: Optional[str] = ""


class ConfigUpdateRequest(BaseModel):
    budget: Optional[float] = None
    cash_buffer_pct: Optional[float] = None
    max_position_pct: Optional[float] = None
    max_order_usd: Optional[float] = None
    min_order_usd: Optional[float] = None
    paper: Optional[bool] = None
    binance_live: Optional[bool] = None
    binance_testnet: Optional[bool] = None
    binance_api_key: Optional[str] = None
    binance_api_secret: Optional[str] = None
    crypto_whitelist_enabled: Optional[bool] = None
    crypto_whitelist: Optional[List[str]] = None
    us_market_enabled: Optional[bool] = None
    us_max_order_usd: Optional[float] = None
    us_budget_usd: Optional[float] = None
    alpaca_api_key: Optional[str] = None
    alpaca_api_secret: Optional[str] = None
    alpaca_paper: Optional[bool] = None
    b3_market_enabled: Optional[bool] = None
    b3_connection_type: Optional[str] = None
    b3_provider: Optional[str] = None
    b3_api_key: Optional[str] = None
    b3_api_secret: Optional[str] = None
    b3_account: Optional[str] = None
    b3_api_token: Optional[str] = None
    b3_cloud_live: Optional[bool] = None
    b3_cloud_endpoint: Optional[str] = None
    b3_max_order_brl: Optional[float] = None
    b3_budget_brl: Optional[float] = None
    b3_allow_fractional: Optional[bool] = None
    mt5_enabled: Optional[bool] = None
    auto_trading_enabled: Optional[bool] = None
    auto_trading_max_spend_usd: Optional[float] = None
    auto_trading_order_size_usd: Optional[float] = None
    auto_trading_min_confidence: Optional[int] = None
    auto_trading_current_spent_usd: Optional[float] = None


@app.get("/api/health")
def health_check():
    cfg = trade_mgr.load_config()
    b_conn = trade_mgr.get_binance_connector()
    alpaca = trade_mgr.get_alpaca_connector()
    b3_conn = trade_mgr.get_b3_connector()
    b3_status = b3_conn.get_status()

    return {
        "status": "online",
        "binance": {
            "live": cfg.get("binance_live", False),
            "testnet": cfg.get("binance_testnet", False),
            "has_keys": bool(cfg.get("binance_api_key")),
            "whitelist_unlocked": not cfg.get("crypto_whitelist_enabled", False),
            "whitelist_enabled": cfg.get("crypto_whitelist_enabled", False),
            "whitelist": cfg.get("crypto_whitelist", []),
            "popular_crypto": POPULAR_CRYPTO_ASSETS
        },
        "alpaca_us": {
            "enabled": cfg.get("us_market_enabled", True),
            "has_keys": alpaca.has_credentials(),
            "paper": bool(cfg.get("alpaca_paper", True))
        },
        "b3": {
            "enabled": cfg.get("b3_market_enabled", True),
            "connection_type": cfg.get("b3_connection_type", "cloud_api"),
            "no_pc_needed": cfg.get("b3_connection_type", "cloud_api") == "cloud_api",
            "provider": cfg.get("b3_provider", "btg_pactual"),
            "connected": b3_conn.is_connected(),
            "status": b3_status.get("broker")
        },
        "b3_mt5": {
            "enabled": cfg.get("b3_market_enabled", True),
            "connected": b3_conn.is_connected(),
            "status": b3_status.get("broker")
        },
        "auto_trading": auto_trader.get_status(),
        "supported_markets": ["Binance (Crypto)", "Alpaca (US Stocks)", "B3 Cloud API (Brasil 24/7)"]
    }


@app.get("/api/market/quotes")
def get_all_quotes():
    """Returns aggregated market quotes across Binance, US, and B3."""
    b_conn = trade_mgr.get_binance_connector()
    crypto_quotes = b_conn.get_24hr_tickers()
    b3_quotes = b3_market.get_watchlist_quotes()
    us_quotes = us_market.get_watchlist_quotes()

    return {
        "crypto": crypto_quotes,
        "b3": b3_quotes,
        "us": us_quotes
    }


@app.get("/api/market/chart/{market}/{symbol}")
def get_chart_candles(market: str, symbol: str, interval: str = "1h", limit: int = 60):
    """Fetches candlestick bars for interactive charts."""
    m = market.lower().strip()
    sym = symbol.strip().upper()

    try:
        if m in ("binance", "crypto"):
            b_conn = trade_mgr.get_binance_connector()
            return b_conn.get_klines(sym, interval=interval, limit=limit)
        elif m == "b3":
            return b3_market.get_klines(sym, range_period="1mo", interval="1d")
        elif m in ("us", "stocks"):
            return us_market.get_klines(sym, range_period="1mo", interval="1d")
        else:
            raise HTTPException(status_code=400, detail=f"Mercado inválido: {market}")
    except BinanceSecurityError as bse:
        raise HTTPException(status_code=403, detail=str(bse))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar candles: {str(e)}")


@app.get("/api/market/orderbook/{symbol}")
def get_order_book(symbol: str):
    """Fetches Binance order book for whitelisted symbols."""
    try:
        b_conn = trade_mgr.get_binance_connector()
        return b_conn.get_order_book(symbol, limit=10)
    except BinanceSecurityError as bse:
        raise HTTPException(status_code=403, detail=str(bse))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/recommendations")
def get_recommendations():
    """Runs the quantitative strategy engine and returns active signals."""
    cfg = trade_mgr.load_config()
    recommendations = []
    b_conn = trade_mgr.get_binance_connector()

    # 1. Binance Crypto Analysis (BTC, ETH, AAVE, SOL, LINK + Whitelist dinâmica)
    if cfg.get("allow_crypto", True):
        whitelist_enabled = bool(cfg.get("crypto_whitelist_enabled", False))
        user_whitelist = [s.strip().upper() for s in cfg.get("crypto_whitelist", []) if s.strip()]
        
        if whitelist_enabled and user_whitelist:
            crypto_candidates = [b_conn.validate_symbol(sym) for sym in user_whitelist]
        else:
            crypto_candidates = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "AAVEUSDT"]

        for sym in crypto_candidates:
            try:
                candles = b_conn.get_klines(sym, interval="1h", limit=50)
                rec = strategy_engine.analyze_asset(sym, "Binance", candles)
                if rec:
                    recommendations.append(rec)
            except Exception:
                pass

    # 2. B3 Top Stock Analysis (apenas se mercado B3 habilitado)
    if cfg.get("b3_market_enabled", True):
        for b3_sym in ["PETR4", "VALE3", "ITUB4", "WEGE3", "BBAS3"]:
            try:
                candles = b3_market.get_klines(b3_sym, range_period="2mo", interval="1d")
                rec = strategy_engine.analyze_asset(b3_sym, "B3", candles)
                if rec:
                    recommendations.append(rec)
            except Exception:
                pass

    # 3. US Top Stock Analysis (apenas se mercado US habilitado)
    if cfg.get("us_market_enabled", True):
        for us_sym in ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN"]:
            try:
                candles = us_market.get_klines(us_sym, range_period="2mo", interval="1d")
                rec = strategy_engine.analyze_asset(us_sym, "US", candles)
                if rec:
                    recommendations.append(rec)
            except Exception:
                pass

    return {
        "count": len(recommendations),
        "recommendations": recommendations
    }


@app.post("/api/trades/propose")
def propose_trade(req: ProposeTradeRequest):
    """Generates an order ticket and runs pre-trade risk validation."""
    try:
        ticket = trade_mgr.propose_order(
            symbol=req.symbol,
            side=req.side,
            market=req.market,
            notional=req.notional,
            qty=req.qty,
            order_type=req.order_type,
            limit_price=req.limit_price,
            stop_loss=req.stop_loss,
            take_profit=req.take_profit,
            rationale=req.rationale
        )
        return ticket
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/trades/tickets")
def list_tickets(status: Optional[str] = None):
    """Returns list of tickets."""
    tickets = trade_mgr.load_tickets()
    if status:
        tickets = [t for t in tickets if t.get("status", "").upper() == status.upper()]
    return {"tickets": tickets}


@app.post("/api/trades/{ticket_id}/approve")
def approve_ticket(ticket_id: str):
    """Records user explicit approval for the trade ticket."""
    try:
        updated = trade_mgr.approve_ticket(ticket_id)
        return {"success": True, "ticket": updated}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@app.post("/api/trades/{ticket_id}/execute")
def execute_ticket(ticket_id: str):
    """Executes the approved trade ticket on Binance, Alpaca (US), or MT5 (B3)."""
    try:
        executed = trade_mgr.execute_ticket(ticket_id)
        return {"success": True, "ticket": executed}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro na execução da ordem: {str(e)}")


@app.post("/api/trades/{ticket_id}/cancel")
def cancel_ticket(ticket_id: str):
    """Cancels a pending or approved trade ticket."""
    try:
        cancelled = trade_mgr.cancel_ticket(ticket_id)
        return {"success": True, "ticket": cancelled}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/portfolio")
def get_portfolio():
    """Unified multi-market portfolio: Binance wallet, Alpaca US, and B3 MT5."""
    cfg = trade_mgr.load_config()
    b_conn = trade_mgr.get_binance_connector()
    alpaca = trade_mgr.get_alpaca_connector()
    b3_conn = trade_mgr.get_b3_connector()
    b3_status = b3_conn.get_status()

    # Binance balances
    binance_account = b_conn.get_account_balances()
    binance_balances = binance_account.get("balances", [])

    # Calculate Binance wallet total USD
    binance_tickers = {t["asset"]: t["price"] for t in b_conn.get_24hr_tickers()}
    total_crypto_usd = 0.0
    for b in binance_balances:
        asset = b["asset"]
        amount = b["free"] + b["locked"]
        if asset == "USDT":
            total_crypto_usd += amount
        elif asset in binance_tickers:
            total_crypto_usd += amount * binance_tickers[asset]

    # Alpaca US status
    alpaca_account = alpaca.get_account()

    # Portfolio state
    tickets = trade_mgr.load_tickets()
    executed = [t for t in tickets if t.get("status") == "EXECUTED"]

    return {
        "budget": cfg.get("budget", 100.0),
        "cash_buffer_pct": cfg.get("cash_buffer_pct", 15),
        "binance": {
            "mode": binance_account.get("mode"),
            "balances": binance_balances,
            "total_estimated_usd": round(total_crypto_usd, 2)
        },
        "alpaca": alpaca_account,
        "b3": b3_status,
        "b3_mt5": b3_status,
        "executed_trades_count": len(executed),
        "recent_executions": executed[:10]
    }


@app.get("/api/market/b3/positions")
def get_b3_positions():
    """Returns active custody/positions in B3."""
    b3_conn = trade_mgr.get_b3_connector()
    return b3_conn.get_positions()


@app.get("/api/config")
def get_config():
    cfg = trade_mgr.load_config()
    safe_cfg = dict(cfg)
    if safe_cfg.get("binance_api_secret"):
        safe_cfg["binance_api_secret_masked"] = safe_cfg["binance_api_secret"][:4] + "..." + safe_cfg["binance_api_secret"][-4:]
    if safe_cfg.get("alpaca_api_secret"):
        safe_cfg["alpaca_api_secret_masked"] = safe_cfg["alpaca_api_secret"][:4] + "..." + safe_cfg["alpaca_api_secret"][-4:]
    return safe_cfg


@app.post("/api/config")
def update_config(req: ConfigUpdateRequest):
    updates = {k: v for k, v in req.dict().items() if v is not None}
    trade_mgr.save_config(updates)
    return {"success": True, "config": trade_mgr.load_config()}


# Auto-Trading Bot Endpoints
@app.get("/api/autotrading/status")
def get_autotrading_status():
    """Returns current auto-trading status, spend limits, quota, and recent logs."""
    return auto_trader.get_status()


@app.post("/api/autotrading/run")
def trigger_autotrading_cycle():
    """Manually triggers an automated scanning and execution cycle."""
    return auto_trader.run_cycle()


@app.post("/api/autotrading/reset-spend")
def reset_autotrading_spend():
    """Resets the spent quota for automated trading back to zero."""
    return auto_trader.reset_spend()


# Mount frontend static directory
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
def serve_dashboard():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Trader Dashboard backend is running."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)

#!/usr/bin/env python3
"""
Atlas Terminal nightly data pipeline.

Runs inside GitHub Actions (see .github/workflows/update-data.yml).
Fetches index constituents (S&P 500, Nasdaq 100, FTSE 100, EURO STOXX 50),
downloads 1 year of prices + fundamentals via yfinance, computes technical
indicators and a transparent 0-100 Opportunity Score, and writes JSON files
into /data for the static site to read.

No API keys required.
"""

import json
import math
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

WIKI = {
    "sp500": "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
    "ndx": "https://en.wikipedia.org/wiki/Nasdaq-100",
    "ftse": "https://en.wikipedia.org/wiki/FTSE_100_Index",
    "sx5e": "https://en.wikipedia.org/wiki/EURO_STOXX_50",
}

INDICES = [
    ("^GSPC", "S&P 500", "US"),
    ("^NDX", "Nasdaq 100", "US"),
    ("^DJI", "Dow Jones", "US"),
    ("^FTSE", "FTSE 100", "UK"),
    ("^STOXX50E", "Euro Stoxx 50", "EU"),
    ("^GDAXI", "DAX", "DE"),
    ("^FCHI", "CAC 40", "FR"),
    ("^SSMI", "SMI", "CH"),
    ("^N225", "Nikkei 225", "JP"),
]

SECTOR_ETFS = [
    ("XLK", "Technology"), ("XLF", "Financials"), ("XLV", "Health Care"),
    ("XLY", "Cons. Discretionary"), ("XLP", "Cons. Staples"), ("XLE", "Energy"),
    ("XLI", "Industrials"), ("XLB", "Materials"), ("XLU", "Utilities"),
    ("XLRE", "Real Estate"), ("XLC", "Communication"),
]


def log(msg):
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)


# ---------------------------------------------------------------- universes
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 AtlasTerminal/1.0")}


def _read_tables(url):
    """Wikipedia returns 403 to pandas' default user agent, so fetch with a
    browser identity first and parse the HTML text."""
    r = requests.get(url, headers=UA, timeout=30)
    r.raise_for_status()
    from io import StringIO
    return pd.read_html(StringIO(r.text), header=0)


def get_universe():
    """Return list of dicts: ticker, name, region, index memberships."""
    members = {}

    def add(ticker, name, region, idx):
        ticker = str(ticker).strip()
        if not ticker or ticker.lower() == "nan":
            return
        e = members.setdefault(ticker, {"ticker": ticker, "name": str(name).strip(),
                                        "region": region, "indices": []})
        if idx not in e["indices"]:
            e["indices"].append(idx)

    # S&P 500
    try:
        for t in _read_tables(WIKI["sp500"]):
            if "Symbol" in t.columns and "Security" in t.columns:
                for _, r in t.iterrows():
                    add(str(r["Symbol"]).replace(".", "-"), r["Security"], "US", "S&P 500")
                break
        log(f"S&P 500 loaded ({len(members)} total)")
    except Exception:
        log("S&P 500 fetch FAILED:\n" + traceback.format_exc())

    # Nasdaq 100
    try:
        for t in _read_tables(WIKI["ndx"]):
            cols = [c.lower() for c in t.columns.astype(str)]
            if any("ticker" in c or "symbol" in c for c in cols) and len(t) > 80:
                tick_col = t.columns[[i for i, c in enumerate(cols) if "ticker" in c or "symbol" in c][0]]
                name_col = t.columns[[i for i, c in enumerate(cols) if "company" in c][0]] if any("company" in c for c in cols) else tick_col
                for _, r in t.iterrows():
                    add(str(r[tick_col]).replace(".", "-"), r[name_col], "US", "Nasdaq 100")
                break
        log(f"Nasdaq 100 merged ({len(members)} total)")
    except Exception:
        log("Nasdaq 100 fetch FAILED:\n" + traceback.format_exc())

    # FTSE 100 -> .L suffix
    try:
        for t in _read_tables(WIKI["ftse"]):
            cols = [c.lower() for c in t.columns.astype(str)]
            if any("ticker" in c or "epic" in c for c in cols) and len(t) > 80:
                tick_col = t.columns[[i for i, c in enumerate(cols) if "ticker" in c or "epic" in c][0]]
                name_col = t.columns[[i for i, c in enumerate(cols) if "company" in c][0]] if any("company" in c for c in cols) else tick_col
                for _, r in t.iterrows():
                    tk = str(r[tick_col]).strip().replace(".", "")
                    add(tk + ".L", r[name_col], "UK", "FTSE 100")
                break
        log(f"FTSE 100 merged ({len(members)} total)")
    except Exception:
        log("FTSE 100 fetch FAILED:\n" + traceback.format_exc())

    # EURO STOXX 50 (tickers on Wikipedia already carry Yahoo-style suffixes)
    try:
        for t in _read_tables(WIKI["sx5e"]):
            cols = [c.lower() for c in t.columns.astype(str)]
            if any("ticker" in c for c in cols) and len(t) > 40:
                tick_col = t.columns[[i for i, c in enumerate(cols) if "ticker" in c][0]]
                name_col = t.columns[[i for i, c in enumerate(cols) if "name" in c or "company" in c][0]] if any("name" in c or "company" in c for c in cols) else tick_col
                for _, r in t.iterrows():
                    add(str(r[tick_col]).strip(), r[name_col], "EU", "Euro Stoxx 50")
                break
        log(f"Euro Stoxx 50 merged ({len(members)} total)")
    except Exception:
        log("Euro Stoxx 50 fetch FAILED:\n" + traceback.format_exc())

    return list(members.values())


# ---------------------------------------------------------------- prices
def download_prices(tickers, period="1y"):
    """Chunked download; returns dict ticker -> pd.Series of adjusted closes."""
    out = {}
    for i in range(0, len(tickers), 100):
        chunk = tickers[i:i + 100]
        log(f"prices {i + 1}-{i + len(chunk)} / {len(tickers)}")
        try:
            df = yf.download(chunk, period=period, interval="1d",
                             auto_adjust=True, progress=False, threads=True,
                             group_by="ticker")
        except Exception:
            log("chunk failed:\n" + traceback.format_exc())
            continue
        for t in chunk:
            try:
                s = df[t]["Close"].dropna() if len(chunk) > 1 else df["Close"].dropna()
                if len(s) > 30:
                    out[t] = s
            except Exception:
                pass
        time.sleep(1)
    return out


def rsi14(closes):
    d = closes.diff()
    up = d.clip(lower=0).rolling(14).mean()
    dn = (-d.clip(upper=0)).rolling(14).mean()
    rs = up / dn.replace(0, np.nan)
    r = 100 - 100 / (1 + rs)
    v = r.iloc[-1]
    return None if pd.isna(v) else round(float(v), 1)


def pct(a, b):
    if a is None or b is None or b == 0 or pd.isna(a) or pd.isna(b):
        return None
    return round((a / b - 1) * 100, 2)


def technicals(closes):
    c = closes
    last = float(c.iloc[-1])
    t = {"last": round(last, 2)}
    for n in (20, 50, 200):
        if len(c) >= n:
            t[f"sma{n}"] = round(float(c.rolling(n).mean().iloc[-1]), 2)
    t["rsi"] = rsi14(c)
    hi, lo = float(c.max()), float(c.min())
    t["from_high"] = pct(last, hi)
    t["from_low"] = pct(last, lo)
    for label, days in (("r1d", 1), ("r1m", 21), ("r3m", 63), ("r6m", 126), ("r1y", 252)):
        t[label] = pct(last, float(c.iloc[-days - 1])) if len(c) > days else None
    if "sma50" in t and "sma200" in t:
        s50 = c.rolling(50).mean()
        s200 = c.rolling(200).mean()
        if len(c) >= 205:
            now = s50.iloc[-1] > s200.iloc[-1]
            then = s50.iloc[-21] > s200.iloc[-21]
            t["golden_cross"] = bool(now and not then)
            t["death_cross"] = bool((not now) and then)
        t["above_200dma"] = bool(last > t["sma200"])
    ret = c.pct_change().dropna()
    if len(ret) > 30:
        t["vol_ann"] = round(float(ret.std() * math.sqrt(252) * 100), 1)
    return t


# ---------------------------------------------------------------- fundamentals
FUND_KEYS = {
    "trailingPE": "pe", "forwardPE": "fpe", "priceToBook": "pb",
    "enterpriseToEbitda": "ev_ebitda", "priceToSalesTrailing12Months": "ps",
    "profitMargins": "net_margin", "grossMargins": "gross_margin",
    "operatingMargins": "op_margin", "returnOnEquity": "roe",
    "debtToEquity": "de", "currentRatio": "current_ratio",
    "dividendYield": "div_yield", "revenueGrowth": "rev_growth",
    "earningsGrowth": "eps_growth", "freeCashflow": "fcf",
    "marketCap": "mcap", "beta": "beta",
}
PCT_KEYS = {"net_margin", "gross_margin", "op_margin", "roe", "rev_growth", "eps_growth"}


def fundamentals(ticker):
    try:
        info = yf.Ticker(ticker).info or {}
    except Exception:
        return {}
    out = {}
    for src, dst in FUND_KEYS.items():
        v = info.get(src)
        if isinstance(v, (int, float)) and not pd.isna(v) and abs(v) < 1e15:
            if dst in PCT_KEYS:
                v = v * 100
            out[dst] = round(float(v), 2)
    for k in ("sector", "industry", "country", "currency", "longName"):
        if info.get(k):
            out[k] = info[k]
    # yfinance sometimes reports dividendYield already in percent
    if out.get("div_yield") and out["div_yield"] > 25:
        out["div_yield"] = round(out["div_yield"] / 100, 2)
    return out


# ---------------------------------------------------------------- scoring
def _pct_rank(series):
    return series.rank(pct=True) * 100


def build_scores(df):
    """Percentile-based pillar scores. Missing pillars re-weight, never punish."""
    inv = lambda s: 100 - _pct_rank(s)  # lower is better

    val_parts = []
    for col in ("fpe", "pe", "ev_ebitda", "pb"):
        s = df[col].where(df[col] > 0)
        val_parts.append(inv(s))
    df["score_val"] = pd.concat(val_parts, axis=1).mean(axis=1, skipna=True)

    qual_parts = [_pct_rank(df["roe"]), _pct_rank(df["op_margin"]),
                  _pct_rank(df["gross_margin"]), inv(df["de"].where(df["de"] >= 0))]
    df["score_qual"] = pd.concat(qual_parts, axis=1).mean(axis=1, skipna=True)

    mom_parts = [_pct_rank(df["r3m"]), _pct_rank(df["r6m"]), _pct_rank(df["r1y"])]
    mom = pd.concat(mom_parts, axis=1).mean(axis=1, skipna=True)
    mom = mom + df["above_200dma"].fillna(False).astype(float) * 5 \
              + df["golden_cross"].fillna(False).astype(float) * 3
    df["score_mom"] = mom.clip(0, 100)

    gr_parts = [_pct_rank(df["rev_growth"]), _pct_rank(df["eps_growth"])]
    df["score_gr"] = pd.concat(gr_parts, axis=1).mean(axis=1, skipna=True)

    weights = {"score_val": 25, "score_qual": 25, "score_mom": 30, "score_gr": 20}
    num = pd.Series(0.0, index=df.index)
    den = pd.Series(0.0, index=df.index)
    for col, w in weights.items():
        m = df[col].notna()
        num[m] += df.loc[m, col] * w
        den[m] += w
    df["score"] = (num / den.replace(0, np.nan)).round(1)
    for c in weights:
        df[c] = df[c].round(1)
    return df


def reasons_for(row):
    r = []
    def has(k): return pd.notna(row.get(k))
    if has("fpe") and row["fpe"] > 0 and row.get("score_val", 0) >= 60:
        r.append(f"Forward P/E of {row['fpe']:.1f} sits in the cheaper part of the universe")
    if has("ev_ebitda") and 0 < row["ev_ebitda"] < 10:
        r.append(f"EV/EBITDA of {row['ev_ebitda']:.1f} is low in absolute terms")
    if has("roe") and row["roe"] > 20:
        r.append(f"Return on equity of {row['roe']:.0f}% signals a high-quality business")
    if has("op_margin") and row["op_margin"] > 20:
        r.append(f"Operating margin of {row['op_margin']:.0f}% is strong")
    if has("rev_growth") and row["rev_growth"] > 10:
        r.append(f"Revenue growing {row['rev_growth']:.0f}% year on year")
    if has("eps_growth") and row["eps_growth"] > 15:
        r.append(f"Earnings growing {row['eps_growth']:.0f}% year on year")
    if row.get("golden_cross"):
        r.append("Golden cross: 50-day average crossed above the 200-day in the last month")
    if row.get("above_200dma") and has("r6m") and row["r6m"] > 0:
        r.append("Trading above its 200-day moving average with positive 6-month momentum")
    if has("rsi") and row["rsi"] < 32:
        r.append(f"RSI of {row['rsi']:.0f} — technically oversold territory")
    # cautions
    if has("de") and row["de"] > 200:
        r.append(f"Caution: debt/equity of {row['de']:.0f}% is elevated")
    if has("net_margin") and row["net_margin"] < 0:
        r.append("Caution: currently unprofitable at the net level")
    if row.get("death_cross"):
        r.append("Caution: death cross in the last month (50-day fell below 200-day)")
    if has("from_high") and row["from_high"] < -40:
        r.append(f"Caution: {abs(row['from_high']):.0f}% below its 52-week high")
    return r[:7]


# ---------------------------------------------------------------- main
def main():
    log("=== Atlas Terminal pipeline start ===")
    universe = get_universe()
    if not universe:
        raise SystemExit("FATAL: no index constituents could be fetched from Wikipedia — "
                         "check the fetch errors logged above (layout change or network block).")
    if len(universe) < 300:
        log(f"WARNING: universe only has {len(universe)} names — Wikipedia layout may have changed")
    tickers = [u["ticker"] for u in universe]

    closes = download_prices(tickers)
    log(f"prices ok for {len(closes)}/{len(tickers)}")
    if not closes:
        raise SystemExit("FATAL: no prices downloaded from Yahoo Finance — "
                         "likely a temporary block; re-run the workflow later.")

    log("fetching fundamentals (this is the slow part)…")
    rows, prices_out = [], {}
    for n, u in enumerate(universe, 1):
        t = u["ticker"]
        if t not in closes:
            continue
        if n % 50 == 0:
            log(f"fundamentals {n}/{len(universe)}")
        row = {**u}
        row.update(technicals(closes[t]))
        row.update(fundamentals(t))
        rows.append(row)
        weekly = closes[t].resample("W").last().dropna().tail(52)
        prices_out[t] = [round(float(x), 2) for x in weekly.tolist()]
        time.sleep(0.15)

    df = pd.DataFrame(rows)
    for col in ("fpe", "pe", "ev_ebitda", "pb", "roe", "op_margin", "gross_margin",
                "de", "rev_growth", "eps_growth", "r3m", "r6m", "r1y", "rsi",
                "above_200dma", "golden_cross", "death_cross"):
        if col not in df.columns:
            df[col] = np.nan
    df = build_scores(df)
    df["reasons"] = df.apply(reasons_for, axis=1)
    df = df.sort_values("score", ascending=False)

    records = json.loads(df.to_json(orient="records"))
    (DATA / "screener.json").write_text(json.dumps(records, separators=(",", ":")))
    (DATA / "prices.json").write_text(json.dumps(prices_out, separators=(",", ":")))
    log(f"screener.json written ({len(records)} rows)")

    # ---- markets.json
    idx_out, spark_syms = [], [s for s, _, _ in INDICES] + [s for s, _ in SECTOR_ETFS]
    idx_closes = download_prices(spark_syms, period="1y")
    for sym, name, region in INDICES:
        if sym not in idx_closes:
            continue
        c = idx_closes[sym]
        t = technicals(c)
        idx_out.append({"symbol": sym, "name": name, "region": region,
                        "last": t["last"], "r1d": t.get("r1d"), "r1m": t.get("r1m"),
                        "r1y": t.get("r1y"),
                        "spark": [round(float(x), 2) for x in c.resample("W").last().dropna().tail(26)]})
    sec_out = []
    for sym, name in SECTOR_ETFS:
        if sym not in idx_closes:
            continue
        t = technicals(idx_closes[sym])
        sec_out.append({"symbol": sym, "name": name, "r1d": t.get("r1d"),
                        "r1m": t.get("r1m"), "r1y": t.get("r1y")})
    for c in ("r1d", "last", "sector", "region", "name"):
        if c not in df.columns:
            df[c] = np.nan
    movers = df[df["r1d"].notna()].copy()
    cols = ["ticker", "name", "last", "r1d", "sector", "region"]
    gain = json.loads(movers.nlargest(8, "r1d")[cols].to_json(orient="records"))
    lose = json.loads(movers.nsmallest(8, "r1d")[cols].to_json(orient="records"))
    (DATA / "markets.json").write_text(json.dumps(
        {"indices": idx_out, "sectors": sec_out, "gainers": gain, "losers": lose},
        separators=(",", ":")))
    log("markets.json written")

    (DATA / "meta.json").write_text(json.dumps({
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "names": len(records), "sample": False}))
    log("=== pipeline done ===")


if __name__ == "__main__":
    main()

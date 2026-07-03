#!/usr/bin/env python3
"""
Atlas Terminal — intraday quotes refresher.
Runs every 30 minutes during US market hours (see update-quotes.yml).
Updates ONLY index and sector-ETF levels/returns in data/markets.json,
preserving the nightly run's sparklines and movers. Takes ~1 minute.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
MK = DATA / "markets.json"

SYMS = ["^GSPC", "^NDX", "^DJI", "^FTSE", "^STOXX50E", "^GDAXI", "^FCHI",
        "^SSMI", "^N225", "XLK", "XLF", "XLV", "XLY", "XLP", "XLE", "XLI",
        "XLB", "XLU", "XLRE", "XLC"]


def main():
    if not MK.exists():
        raise SystemExit("markets.json missing — run the full nightly pipeline first.")
    markets = json.loads(MK.read_text())

    df = yf.download(SYMS, period="1y", interval="1d", auto_adjust=True,
                     progress=False, threads=True, group_by="ticker")
    quotes = {}
    for s in SYMS:
        try:
            c = df[s]["Close"].dropna()
            if len(c) < 30:
                continue
            last = float(c.iloc[-1])
            q = {"last": round(last, 2),
                 "r1d": round((last / float(c.iloc[-2]) - 1) * 100, 2)}
            if len(c) > 21:
                q["r1m"] = round((last / float(c.iloc[-22]) - 1) * 100, 2)
            if len(c) > 252:
                q["r1y"] = round((last / float(c.iloc[-253]) - 1) * 100, 2)
            quotes[s] = q
        except Exception:
            pass

    if len(quotes) < 5:
        raise SystemExit("Quote download mostly failed — keeping existing data untouched.")

    for i in markets.get("indices", []):
        if i["symbol"] in quotes:
            i.update(quotes[i["symbol"]])
    for s in markets.get("sectors", []):
        if s["symbol"] in quotes:
            s.update(quotes[s["symbol"]])
    MK.write_text(json.dumps(markets, separators=(",", ":")))

    meta_p = DATA / "meta.json"
    meta = json.loads(meta_p.read_text()) if meta_p.exists() else {}
    meta["quotes_updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    meta_p.write_text(json.dumps(meta))
    print(f"quotes refreshed for {len(quotes)} symbols")


if __name__ == "__main__":
    main()

# Atlas Terminal

**An open macro & equity intelligence dashboard.** Live at `https://<username>.github.io/atlas-terminal/`

- 🌍 **Globe** — interactive 3D earth; click any country for GDP growth, inflation, unemployment, debt, its central bank's policy rate and the latest economic headlines (World Bank + GDELT, fetched live).
- 📈 **Markets** — major indices with 26-week sparklines, US sector heatmap, daily top movers.
- 🔎 **Screener** — ~650 stocks (S&P 500, Nasdaq 100, FTSE 100, Euro Stoxx 50) ranked by a transparent four-pillar Opportunity Score (valuation 25 / quality 25 / momentum 30 / growth 20).
- 🏢 **Company pages** — 52-week chart, full ratio panel, and a plain-English explanation of every score.
- 📖 **Methodology** — the whole model, in the open.

## How it works

A scheduled GitHub Action (`.github/workflows/update-data.yml`) runs `scripts/update_data.py` each weekday after the US close: it pulls index constituents from Wikipedia, prices and fundamentals via `yfinance`, computes indicators and percentile scores, and commits the results as JSON into `/data`. The static site (plain HTML/CSS/JS, zero build step, zero frameworks, zero API keys) reads those files. Macro indicators and news are fetched live in the visitor's browser.

## Disclaimer

All scores are quantitative screening signals derived from public data. Nothing here is investment advice or a recommendation to buy or sell any security.

## Setup

See `UPLOAD_GUIDE.md` for the 15-minute, browser-only setup.

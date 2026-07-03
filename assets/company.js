/* Company detail page: ?t=TICKER */
(async () => {
  await MP.shell("screener");
  const t = new URLSearchParams(location.search).get("t");
  const root = document.getElementById("co-root");
  if (!t) { root.innerHTML = '<div class="skeleton">No ticker specified — open a company from the <a href="screener.html">screener</a>.</div>'; return; }

  const [all, prices] = await Promise.all([MP.getJSON("data/screener.json"), MP.getJSON("data/prices.json")]);
  const r = (all || []).find(x => x.ticker === t);
  if (!r) { root.innerHTML = `<div class="skeleton">${t} isn't in the current dataset. It appears after the next data run, or check the ticker on the <a href="screener.html">screener</a>.</div>`; return; }
  document.title = `${r.ticker} — Atlas Terminal`;

  const name = r.longName || r.name || r.ticker;
  const sc = r.score;
  const pillars = [
    ["Valuation", r.score_val, "25%"], ["Quality", r.score_qual, "25%"],
    ["Momentum", r.score_mom, "30%"], ["Growth", r.score_gr, "20%"],
  ];
  const stat = (k, v) => `<div class="card"><div class="k">${k}</div><div class="v" style="font-size:17px">${v}</div></div>`;

  root.innerHTML = `
    <div class="co-head">
      <h1>${name}</h1>
      <span class="mono" style="font-size:20px;color:var(--blue-bright)">${r.ticker}</span>
      <button class="star-btn ${MP.watch.has(r.ticker) ? "on" : ""}" id="co-star" title="Watchlist">★</button>
      ${r.earn_ts ? `<span class="pill" style="border-color:var(--amber);color:var(--amber)">earnings ${new Date(r.earn_ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>` : ""}
    </div>
    <div style="margin-bottom:16px">
      ${r.sector ? `<span class="pill">${r.sector}</span>` : ""}${r.industry ? `<span class="pill">${r.industry}</span>` : ""}
      ${(r.indices || []).map(i => `<span class="pill">${i}</span>`).join("")}
    </div>

    <div class="grid g2" style="align-items:start">
      <div class="card">
        <div class="k">Price — 52 weeks (weekly closes${r.currency ? ", " + r.currency : ""})</div>
        <div style="display:flex;gap:18px;align-items:baseline;margin:4px 0 8px">
          <span class="mono" style="font-size:26px">${MP.fmt.num(r.last)}</span>
          <span class="mono ${MP.fmt.cls(r.r1d)}">${MP.fmt.pct(r.r1d)} today</span>
          <span class="mono ${MP.fmt.cls(r.r1y)}">${MP.fmt.pct(r.r1y)} 1Y</span>
        </div>
        <div id="chart"></div>
        <div class="small mono" style="margin-top:6px">52w range: ${MP.fmt.pct(r.from_low)} above low · ${MP.fmt.pct(r.from_high)} vs high</div>
      </div>

      <div class="card">
        <div class="score-ring">
          <span class="pill score-pill" style="background:${MP.fmt.scoreColor(sc)};font-size:26px;padding:12px 20px;border-radius:12px">${sc === null || sc === undefined ? "—" : sc.toFixed(0)}</span>
          <div><div class="k">Opportunity Score</div>
          <div class="small">Percentile-ranked within a ~650-stock universe. A screening signal, not advice. <a href="methodology.html">Method →</a></div></div>
        </div>
        <div style="margin-top:14px">
          ${pillars.map(([n, v, w]) => `
            <div class="pillar">
              <div class="row"><span>${n} <span class="mono" style="color:var(--faint)">${w}</span></span><span class="mono">${v === null || v === undefined ? "—" : v.toFixed(0)}</span></div>
              <div class="bar-bg"><div class="bar" style="width:${v || 0}%"></div></div>
            </div>`).join("")}
        </div>
      </div>
    </div>

    <h2 class="section">Why this score</h2>
    <div class="card" id="reasons">
      ${(r.reasons || []).map(x => `<div class="reason ${x.startsWith("Caution") ? "warn" : ""}"><span class="ic">${x.startsWith("Caution") ? "!" : "▸"}</span><span>${x}</span></div>`).join("") || '<div class="small">No standout factors — a mid-pack profile on the metrics we track.</div>'}
    </div>

    <h2 class="section">Key figures</h2>
    <div class="grid g4">
      ${stat("Market cap", MP.fmt.mcap(r.mcap))}
      ${stat("Fwd P/E", MP.fmt.num(r.fpe, 1))}
      ${stat("Trailing P/E", MP.fmt.num(r.pe, 1))}
      ${stat("EV / EBITDA", MP.fmt.num(r.ev_ebitda, 1))}
      ${stat("Price / Book", MP.fmt.num(r.pb, 1))}
      ${stat("ROE", r.roe === null || r.roe === undefined ? "—" : MP.fmt.num(r.roe, 1) + "%")}
      ${stat("Operating margin", r.op_margin === null || r.op_margin === undefined ? "—" : MP.fmt.num(r.op_margin, 1) + "%")}
      ${stat("Gross margin", r.gross_margin === null || r.gross_margin === undefined ? "—" : MP.fmt.num(r.gross_margin, 1) + "%")}
      ${stat("Revenue growth", MP.fmt.pct(r.rev_growth, 1))}
      ${stat("EPS growth", MP.fmt.pct(r.eps_growth, 1))}
      ${stat("Debt / Equity", r.de === null || r.de === undefined ? "—" : MP.fmt.num(r.de, 0) + "%")}
      ${stat("Dividend yield", r.div_yield === null || r.div_yield === undefined ? "—" : MP.fmt.num(r.div_yield, 2) + "%")}
      ${stat("RSI (14)", MP.fmt.num(r.rsi, 0))}
      ${stat("vs 200-day avg", r.sma200 ? ((r.last / r.sma200 - 1) * 100).toFixed(1) + "%" : "—")}
      ${stat("Ann. volatility", r.vol_ann ? r.vol_ann + "%" : "—")}
      ${stat("Beta", MP.fmt.num(r.beta, 2))}
    </div>

    <h2 class="section">Recent news</h2>
    <div id="news"><div class="skeleton">Loading headlines…</div></div>
  `;

  window.AtlasContext = { view: "company page", company: name, ticker: r.ticker,
    metrics: { score: r.score, pillars: { val: r.score_val, qual: r.score_qual, mom: r.score_mom, gr: r.score_gr },
      fpe: r.fpe, pe: r.pe, ev_ebitda: r.ev_ebitda, pb: r.pb, roe: r.roe, op_margin: r.op_margin,
      rev_growth: r.rev_growth, eps_growth: r.eps_growth, de: r.de, div_yield: r.div_yield,
      rsi: r.rsi, r1d: r.r1d, r6m: r.r6m, r1y: r.r1y, from_high: r.from_high, mcap: r.mcap, beta: r.beta },
    reasons: r.reasons, sector: r.sector, region: r.region };

  document.getElementById("co-star").addEventListener("click", e =>
    e.currentTarget.classList.toggle("on", MP.watch.toggle(r.ticker)));

  MP.lineChart(document.getElementById("chart"), (prices || {})[t] || []);

  const q = encodeURIComponent(`"${(name || t).replace(/"/g, "")}"`);
  const g = await MP.getJSONx(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}%20sourcelang:eng&mode=ArtList&format=json&maxrecords=6&sort=DateDesc`);
  const arts = g && g.articles ? g.articles.filter(a => a.title) : [];
  document.getElementById("news").innerHTML = arts.length
    ? MP.newsRank(arts).slice(0, 6).map(a => MP.newsItem(a)).join("")
    : `<div class="small">No recent headlines found via GDELT.</div>`;
})();

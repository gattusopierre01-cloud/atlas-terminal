/* Markets dashboard */
(async () => {
  await MP.shell("markets");
  const m = await MP.getJSON("data/markets.json");
  const meta = await MP.getJSON("data/meta.json");
  if (!m || !m.indices || !m.indices.length || (meta && meta.sample)) {
    document.getElementById("banner").innerHTML =
      `<div class="banner">Showing placeholder data. Run the <b>Update market data</b> workflow in your repo's Actions tab to load real market data (see README, step 5).</div>`;
  }
  if (!m) return;

  document.getElementById("indices").innerHTML = (m.indices || []).map(i => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><div class="k">${i.name} <span class="pill">${i.region}</span></div>
        <div class="v">${MP.fmt.num(i.last, 0)}</div>
        <div class="sub"><span class="${MP.fmt.cls(i.r1d)}">${MP.fmt.pct(i.r1d)} today</span> · <span class="${MP.fmt.cls(i.r1y)}">${MP.fmt.pct(i.r1y)} 1Y</span></div></div>
        ${MP.spark(i.spark || [], { w: 110, h: 42, stroke: "auto" })}
      </div>
    </div>`).join("");

  const heat = v => {
    if (v === null || v === undefined) return "background:#0f1b2e";
    const a = Math.min(Math.abs(v) / 2.5, 1);
    return v >= 0
      ? `background:rgba(47,191,113,${(0.08 + a * 0.35).toFixed(2)})`
      : `background:rgba(229,72,77,${(0.08 + a * 0.35).toFixed(2)})`;
  };
  document.getElementById("sectors").innerHTML = (m.sectors || []).map(s => `
    <div class="tile" style="${heat(s.r1d)}">
      <div class="n">${s.name}</div>
      <div class="p ${MP.fmt.cls(s.r1d)}">${MP.fmt.pct(s.r1d)}</div>
      <div class="small mono">1M ${MP.fmt.pct(s.r1m)}</div>
    </div>`).join("");

  const mover = x => `
    <div class="ind-row" style="cursor:pointer" onclick="location.href='company.html?t=${encodeURIComponent(x.ticker)}'">
      <span><span class="tk">${x.ticker}</span><br><span class="small">${x.name || ""}</span></span>
      <span class="val ${MP.fmt.cls(x.r1d)}">${MP.fmt.pct(x.r1d)}</span>
    </div>`;
  document.getElementById("gainers").innerHTML = (m.gainers || []).map(mover).join("") || '<div class="small">—</div>';
  document.getElementById("losers").innerHTML = (m.losers || []).map(mover).join("") || '<div class="small">—</div>';

  // ---------- signals ----------
  const sig = await MP.getJSON("data/signals.json");
  const SIGCFG = [
    ["golden", "Golden crosses", "50-day crossed above 200-day", "var(--up)"],
    ["oversold", "Oversold (RSI ≤ 30)", "stretched to the downside", "var(--amber)"],
    ["high52", "New 52-week highs", "breaking out", "var(--blue-bright)"],
    ["low52", "New 52-week lows", "breaking down", "var(--down)"],
    ["bigmoves", "Big daily moves", "±6% or more today", "var(--ink)"],
    ["score_moves", "Score jumps", "Opportunity Score moved ≥8 pts", "var(--up)"],
  ];
  if (sig) {
    document.getElementById("sig-when").textContent = "— computed " + (sig.updated || "");
    document.getElementById("signals").innerHTML = SIGCFG.map(([k, title, sub, col]) => {
      const rows = sig[k] || [];
      const body = rows.length ? rows.slice(0, 6).map(x =>
        `<div class="ind-row" style="cursor:pointer;padding:7px 0" onclick="location.href='company.html?t=${encodeURIComponent(x.ticker)}'">
          <span><span class="tk">${x.ticker}</span> <span class="small">${(x.name || "").slice(0, 20)}</span></span>
          <span class="mono ${MP.fmt.cls(x.score_chg !== undefined ? x.score_chg : x.r1d)}">${x.score_chg !== undefined ? MP.fmt.pct(x.score_chg, 0).replace("%", " pts") : MP.fmt.pct(x.r1d)}</span>
        </div>`).join("")
        : '<div class="small" style="padding:6px 0">None today.</div>';
      return `<div class="card"><div class="k" style="color:${col}">${title} ${rows.length ? `<span class="pill">${rows.length}</span>` : ""}</div>
        <div class="small" style="margin:2px 0 6px">${sub}</div>${body}</div>`;
    }).join("");
    // earnings
    const ee = sig.earnings || [];
    document.getElementById("earnings").innerHTML = ee.length ? ee.slice(0, 10).map(x => {
      const d = new Date(x.earn_ts * 1000);
      return `<div class="ind-row" style="cursor:pointer;padding:7px 0" onclick="location.href='company.html?t=${encodeURIComponent(x.ticker)}'">
        <span><span class="tk">${x.ticker}</span> <span class="small">${(x.name || "").slice(0, 22)}</span></span>
        <span class="mono small">${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span></div>`;
    }).join("") : '<div class="small">No confirmed dates in the next 10 days.</div>';
  }

  // ---------- watchlist ----------
  const wl = MP.watch.all();
  if (wl.length) {
    const scr = await MP.getJSON("data/screener.json") || [];
    const rows = wl.map(t => scr.find(r => r.ticker === t)).filter(Boolean);
    document.getElementById("mywatch").innerHTML = rows.map(r =>
      `<div class="ind-row" style="cursor:pointer;padding:7px 0" onclick="location.href='company.html?t=${encodeURIComponent(r.ticker)}'">
        <span><span class="tk">${r.ticker}</span> <span class="pill score-pill" style="background:${MP.fmt.scoreColor(r.score)}">${r.score == null ? "—" : r.score.toFixed(0)}</span></span>
        <span class="mono">${MP.fmt.num(r.last)} <span class="${MP.fmt.cls(r.r1d)}">${MP.fmt.pct(r.r1d)}</span></span></div>`).join("")
      || '<div class="small">Starred names weren\'t found in the current dataset.</div>';
  }

  window.AtlasContext = { view: "markets dashboard",
    indices: (m.indices || []).map(i => ({ n: i.name, last: i.last, d1: i.r1d })),
    signals: sig ? Object.fromEntries(SIGCFG.map(([k]) => [k, (sig[k] || []).map(x => x.ticker)])) : null,
    watchlist: MP.watch.all() };
})();

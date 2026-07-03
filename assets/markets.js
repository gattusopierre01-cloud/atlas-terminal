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
})();

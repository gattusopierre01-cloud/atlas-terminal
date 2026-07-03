/* Screener: sortable, filterable table */
(async () => {
  await MP.shell("screener");
  const all = await MP.getJSON("data/screener.json") || [];
  const meta = await MP.getJSON("data/meta.json");
  if (!all.length || (meta && meta.sample)) {
    document.getElementById("banner").innerHTML =
      `<div class="banner">Placeholder rows shown. The full ~650-stock universe loads after the first data run — Actions tab → <b>Update market data</b> → Run workflow.</div>`;
  }

  const sectorSel = document.getElementById("sector");
  [...new Set(all.map(r => r.sector).filter(Boolean))].sort()
    .forEach(s => sectorSel.insertAdjacentHTML("beforeend", `<option>${s}</option>`));

  let sortKey = "score", sortDir = -1;
  const state = { q: "", region: "", sector: "", min: "" };

  const cells = r => {
    const sc = r.score;
    return `<tr class="row" onclick="location.href='company.html?t=${encodeURIComponent(r.ticker)}'">
      <td class="name-cell"><span class="tk">${r.ticker}</span><span class="co">${r.longName || r.name || ""}</span></td>
      <td><span class="pill score-pill" style="background:${MP.fmt.scoreColor(sc)}">${sc === null || sc === undefined ? "—" : sc.toFixed(0)}</span></td>
      <td>${MP.fmt.num(r.last)}</td>
      <td class="${MP.fmt.cls(r.r1d)}">${MP.fmt.pct(r.r1d)}</td>
      <td class="${MP.fmt.cls(r.r6m)}">${MP.fmt.pct(r.r6m)}</td>
      <td class="${MP.fmt.cls(r.r1y)}">${MP.fmt.pct(r.r1y)}</td>
      <td>${MP.fmt.num(r.fpe, 1)}</td>
      <td>${MP.fmt.num(r.ev_ebitda, 1)}</td>
      <td>${r.roe === null || r.roe === undefined ? "—" : MP.fmt.num(r.roe, 0) + "%"}</td>
      <td>${r.op_margin === null || r.op_margin === undefined ? "—" : MP.fmt.num(r.op_margin, 0) + "%"}</td>
      <td class="${MP.fmt.cls(r.rev_growth)}">${MP.fmt.pct(r.rev_growth, 0)}</td>
      <td>${MP.fmt.num(r.rsi, 0)}</td>
      <td>${MP.fmt.mcap(r.mcap)}</td>
    </tr>`;
  };

  function render() {
    let rows = all.filter(r =>
      (!state.q || (r.ticker + " " + (r.longName || r.name || "")).toLowerCase().includes(state.q)) &&
      (!state.region || r.region === state.region) &&
      (!state.sector || r.sector === state.sector) &&
      (!state.min || (r.score !== null && r.score >= +state.min)));
    rows.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
    document.getElementById("count").textContent = rows.length + " of " + all.length + " names";
    document.getElementById("rows").innerHTML =
      rows.slice(0, 800).map(cells).join("") ||
      `<tr><td colspan="13" class="skeleton">No matches.</td></tr>`;
  }

  document.getElementById("q").addEventListener("input", e => { state.q = e.target.value.toLowerCase(); render(); });
  document.getElementById("region").addEventListener("change", e => { state.region = e.target.value; render(); });
  sectorSel.addEventListener("change", e => { state.sector = e.target.value; render(); });
  document.getElementById("minscore").addEventListener("change", e => { state.min = e.target.value; render(); });

  document.querySelectorAll("th[data-k]").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.k;
    if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = k === "ticker" ? 1 : -1; }
    document.querySelectorAll("th").forEach(t => { t.classList.remove("sorted"); t.textContent = t.textContent.replace(/ [▾▴]/, ""); });
    th.classList.add("sorted");
    th.textContent += sortDir === -1 ? " ▾" : " ▴";
    render();
  }));

  render();
})();

/* Atlas Terminal — Portfolio Lab engine. All math client-side, no libraries. */
(async () => {
  await MP.shell("lab");
  const $ = id => document.getElementById(id);

  const [univ, lab] = await Promise.all([MP.getJSON("data/screener.json"), MP.getJSON("data/prices5y.json")]);
  if (!lab || !lab.series || !Object.keys(lab.series).length) {
    $("banner").innerHTML = `<div class="banner">The Lab dataset (<span class="mono">prices5y.json</span>) hasn't been generated yet. Upload the updated pipeline, then run <b>Update market data</b> in the Actions tab — the Lab activates on the next data refresh.</div>`;
    $("empty").style.display = "none";
    return;
  }
  const names = {}; (univ || []).forEach(r => names[r.ticker] = r.longName || r.name || r.ticker);
  const rfDefault = lab.rf ?? 4.0;
  $("rf").value = rfDefault;

  // ---------- state ----------
  let H = [];            // [{t, w}] weights in %
  const MAXH = 15;

  // ---------- currency conversion ----------
  // fx arrays are USD per 1 GBP / EUR on the weekly grid
  function usdPer(ccy, i) {
    if (ccy === "USD") return 1;
    const a = lab.fx[ccy]; if (!a) return null;
    for (let k = i; k >= 0; k--) if (a[k] != null) return a[k];   // backfill
    return null;
  }
  function seriesInBase(entry, base) {
    const out = new Array(lab.dates.length).fill(null);
    for (let i = 0; i < out.length; i++) {
      const p = entry.p[i]; if (p == null) continue;
      const a = usdPer(entry.ccy, i), b = usdPer(base, i);
      if (a == null || b == null) continue;
      out[i] = p * a / b;
    }
    return out;
  }

  // ---------- stats helpers ----------
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const std = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const pctl = (sorted, p) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)))];
  const toRets = px => { const r = []; for (let i = 1; i < px.length; i++) r.push(px[i] / px[i - 1] - 1); return r; };

  // ---------- portfolio construction ----------
  function buildWindow(tickers, lookback, base) {
    const n = lab.dates.length, start = Math.max(0, n - lookback - 1);
    const conv = tickers.map(t => seriesInBase(lab.series[t], base).slice(start));
    const ok = [];
    const dropped = [];
    tickers.forEach((t, i) => {
      const s = conv[i];
      const nulls = s.filter(x => x == null).length;
      (nulls > s.length * 0.1 ? dropped : ok).push(i);
    });
    // forward-fill tiny gaps for kept series
    const px = ok.map(i => { let last = null; return conv[i].map(x => (x == null ? last : (last = x))); });
    // trim any leading nulls jointly
    let first = 0;
    while (first < px[0].length && px.some(s => s[first] == null)) first++;
    return {
      tickers: ok.map(i => tickers[i]),
      dropped: dropped.map(i => tickers[i]),
      px: px.map(s => s.slice(first)),
      dates: lab.dates.slice(start).slice(first),
    };
  }

  function backtest(px, weights, cap, rebEvery) {
    // px: array of series (same length), weights sum to 1
    const T = px[0].length, N = px.length;
    let shares = weights.map((w, i) => cap * w / px[i][0]);
    const vals = [cap];
    for (let t = 1; t < T; t++) {
      let v = 0; for (let i = 0; i < N; i++) v += shares[i] * px[i][t];
      vals.push(v);
      if (rebEvery && t % rebEvery === 0) shares = weights.map((w, i) => v * w / px[i][t]);
    }
    return vals;
  }

  function drawdown(vals) {
    let peak = vals[0], maxDD = 0, ddStart = 0, worstStart = 0, worstEnd = 0;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] > peak) { peak = vals[i]; ddStart = i; }
      const dd = vals[i] / peak - 1;
      if (dd < maxDD) { maxDD = dd; worstStart = ddStart; worstEnd = i; }
    }
    return { maxDD, worstStart, worstEnd };
  }

  function regress(y, x) { // returns {beta, alpha (per period), r2}
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    const beta = sxy / sxx, alpha = my - beta * mx;
    const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
    return { beta, alpha, r2 };
  }

  // ---------- charts (SVG, no deps) ----------
  function multiLine(el, seriesList, labels, dates, shade) {
    const w = el.clientWidth || 900, h = 300, padL = 56, padB = 26, padT = 10, padR = 12;
    const all = seriesList.flat();
    const min = Math.min(...all), max = Math.max(...all), rng = (max - min) || 1;
    const T = seriesList[0].length;
    const X = i => padL + (i / (T - 1)) * (w - padL - padR);
    const Y = v => padT + (1 - (v - min) / rng) * (h - padT - padB);
    let g = "";
    for (let k = 0; k <= 4; k++) {
      const v = min + rng * k / 4, y = Y(v);
      g += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#1e3252" opacity=".6"/>`;
      g += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10.5" fill="#5b6880" font-family="IBM Plex Mono">${MP.fmt.num(v, 0)}</text>`;
    }
    for (let k = 0; k < 5; k++) {
      const i = Math.round(k * (T - 1) / 4);
      g += `<text x="${X(i)}" y="${h - 8}" text-anchor="middle" font-size="10" fill="#5b6880" font-family="IBM Plex Mono">${dates[i].slice(0, 7)}</text>`;
    }
    if (shade) {
      g += `<rect x="${X(shade[0])}" y="${padT}" width="${X(shade[1]) - X(shade[0])}" height="${h - padT - padB}" fill="#e5484d" opacity="0.07"/>`;
    }
    const cols = ["#e8b44c", "#4f8dfd", "#2fbf71"];
    seriesList.forEach((s, si) => {
      const d = s.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1)).join("");
      g += `<path d="${d}" fill="none" stroke="${cols[si]}" stroke-width="${si === 0 ? 2.2 : 1.6}" ${si ? 'opacity=".85"' : ""}/>`;
    });
    el.innerHTML = `<svg width="100%" viewBox="0 0 ${w} ${h}">${g}</svg>`;
  }

  function fanChart(el, bands, median, cap) {
    const w = el.clientWidth || 900, h = 280, padL = 56, padB = 24, padT = 10, padR = 12;
    const all = [...bands.p5, ...bands.p95];
    const min = Math.min(...all), max = Math.max(...all), rng = (max - min) || 1;
    const T = median.length;
    const X = i => padL + (i / (T - 1)) * (w - padL - padR);
    const Y = v => padT + (1 - (v - min) / rng) * (h - padT - padB);
    const area = (lo, hi, col, op) => {
      let d = lo.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1)).join("");
      for (let i = hi.length - 1; i >= 0; i--) d += "L" + X(i).toFixed(1) + "," + Y(hi[i]).toFixed(1);
      return `<path d="${d}Z" fill="${col}" opacity="${op}"/>`;
    };
    let g = "";
    for (let k = 0; k <= 4; k++) {
      const v = min + rng * k / 4, y = Y(v);
      g += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#1e3252" opacity=".6"/>
            <text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10.5" fill="#5b6880" font-family="IBM Plex Mono">${MP.fmt.num(v, 0)}</text>`;
    }
    g += area(bands.p5, bands.p95, "#16273f", 0.9);
    g += area(bands.p25, bands.p75, "#26406b", 0.9);
    const md = median.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1)).join("");
    g += `<path d="${md}" fill="none" stroke="#2563eb" stroke-width="2"/>`;
    g += `<line x1="${padL}" y1="${Y(cap)}" x2="${w - padR}" y2="${Y(cap)}" stroke="#8b98ae" stroke-dasharray="4 4" opacity=".6"/>`;
    el.innerHTML = `<svg width="100%" viewBox="0 0 ${w} ${h}">${g}</svg>`;
  }

  function scatter(el, cloud, marks) {
    const w = el.clientWidth || 900, h = 320, padL = 56, padB = 34, padT = 10, padR = 12;
    const xs = cloud.map(c => c[0]).concat(marks.map(m => m.x));
    const ys = cloud.map(c => c[1]).concat(marks.map(m => m.y));
    const minX = Math.min(...xs) * 0.95, maxX = Math.max(...xs) * 1.05;
    const minY = Math.min(...ys) - 2, maxY = Math.max(...ys) + 2;
    const X = v => padL + (v - minX) / (maxX - minX) * (w - padL - padR);
    const Y = v => padT + (1 - (v - minY) / (maxY - minY)) * (h - padT - padB);
    let g = "";
    for (let k = 0; k <= 4; k++) {
      const v = minY + (maxY - minY) * k / 4;
      g += `<line x1="${padL}" y1="${Y(v)}" x2="${w - padR}" y2="${Y(v)}" stroke="#1e3252" opacity=".5"/>
            <text x="${padL - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="10.5" fill="#5b6880" font-family="IBM Plex Mono">${v.toFixed(0)}%</text>`;
      const vx = minX + (maxX - minX) * k / 4;
      g += `<text x="${X(vx)}" y="${h - 8}" text-anchor="middle" font-size="10.5" fill="#5b6880" font-family="IBM Plex Mono">${vx.toFixed(0)}%</text>`;
    }
    g += `<text x="${(w + padL) / 2}" y="${h - 22}" text-anchor="middle" font-size="10" fill="#5b6880" font-family="IBM Plex Mono" opacity="0">.</text>`;
    cloud.forEach(c => { g += `<circle cx="${X(c[0]).toFixed(1)}" cy="${Y(c[1]).toFixed(1)}" r="1.6" fill="#26406b" opacity=".7"/>`; });
    marks.forEach(m => {
      g += `<circle cx="${X(m.x)}" cy="${Y(m.y)}" r="6" fill="${m.col}" stroke="#0a1322" stroke-width="1.5"/>
            <text x="${X(m.x) + 10}" y="${Y(m.y) + 4}" font-size="11" fill="${m.col}" font-family="Inter">${m.lbl}</text>`;
    });
    g += `<text x="${padL}" y="${padT + 4}" font-size="10.5" fill="#5b6880" font-family="IBM Plex Mono">ann. return ↑ · ann. volatility →</text>`;
    el.innerHTML = `<svg width="100%" viewBox="0 0 ${w} ${h}">${g}</svg>`;
  }

  // ---------- UI: holdings ----------
  function renderHoldings() {
    const tot = H.reduce((s, h) => s + h.w, 0);
    $("wsum").textContent = H.length ? `— ${H.length} names · weights ${tot.toFixed(0)}%` : "";
    $("holdings").innerHTML = H.map((h, i) => `
      <div class="holding">
        <div class="nm"><span class="tk">${h.t}</span><span class="co">${names[h.t] || ""}</span></div>
        <input type="range" min="0" max="100" step="1" value="${h.w}" data-i="${i}" aria-label="weight ${h.t}">
        <span class="w">${h.w.toFixed(0)}%</span>
        <button class="rm" data-i="${i}" aria-label="remove ${h.t}">✕</button>
      </div>`).join("") || `<div class="small" style="padding:14px 0">No holdings yet — search above to add.</div>`;
    $("holdings").querySelectorAll("input[type=range]").forEach(sl =>
      sl.addEventListener("input", e => { H[+e.target.dataset.i].w = +e.target.value; renderHoldings(); }));
    $("holdings").querySelectorAll(".rm").forEach(b =>
      b.addEventListener("click", e => { H.splice(+e.currentTarget.dataset.i, 1); renderHoldings(); }));
  }
  function addTicker(t) {
    if (H.length >= MAXH || H.some(h => h.t === t) || !lab.series[t]) return;
    H.push({ t, w: Math.round(100 / (H.length + 1)) });
    equalize(false);
  }
  function equalize(render = true) {
    const w = 100 / H.length;
    H.forEach(h => h.w = w);
    renderHoldings();
  }

  // search suggestions
  const tickList = Object.keys(lab.series);
  $("add").addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    const box = $("sugg");
    if (!q) { box.hidden = true; return; }
    const hits = tickList.filter(t => t.toLowerCase().includes(q) || (names[t] || "").toLowerCase().includes(q)).slice(0, 8);
    box.innerHTML = hits.map(t => `<div data-t="${t}"><span class="tk">${t}</span> <span class="small">${names[t] || ""}</span></div>`).join("");
    box.hidden = !hits.length;
    box.querySelectorAll("div").forEach(d => d.addEventListener("mousedown", () => {
      addTicker(d.dataset.t); $("add").value = ""; box.hidden = true;
    }));
  });
  $("add").addEventListener("blur", () => setTimeout(() => $("sugg").hidden = true, 150));

  $("eq").onclick = () => H.length && equalize();
  $("clear").onclick = () => { H = []; renderHoldings(); };
  $("iv").onclick = () => {
    if (H.length < 2) return;
    const base = $("ccy").value, lb = +$("lb").value;
    const W = buildWindow(H.map(h => h.t), lb, base);
    const vols = W.tickers.map((t, i) => std(toRets(W.px[i])));
    const inv = vols.map(v => 1 / (v || 1)); const s = inv.reduce((a, b) => a + b, 0);
    H = W.tickers.map((t, i) => ({ t, w: inv[i] / s * 100 }));
    renderHoldings();
  };
  $("demo").onclick = e => {
    e.preventDefault();
    ["MSFT", "ASML.AS", "MC.PA", "SHEL.L", "JNJ", "V"].forEach(t => lab.series[t] && H.length < 6 && !H.some(h => h.t === t) && H.push({ t, w: 0 }));
    if (H.length < 2) { // fallback to whatever exists
      H = tickList.slice(0, 6).map(t => ({ t, w: 0 }));
    }
    equalize();
  };

  // ---------- model portfolios (rule-based, from live scores) ----------
  function pickTop(pool, scoreKey, n, opts = {}) {
    const perSector = opts.perSector || 2;
    const sectors = {};
    const out = [];
    for (const r of pool) {
      if (out.length >= n) break;
      const sec = r.sector || "Other";
      if ((sectors[sec] || 0) >= perSector) continue;
      out.push(r); sectors[sec] = (sectors[sec] || 0) + 1;
    }
    return out;
  }
  function invVolWeights(rows) {
    const inv = rows.map(r => 1 / Math.max(8, r.vol_ann || 30));
    const s = inv.reduce((a, b) => a + b, 0);
    return rows.map((r, i) => ({ t: r.ticker, w: inv[i] / s * 100 }));
  }
  function buildModels() {
    const pool = (univ || []).filter(r => lab.series[r.ticker] && r.score != null);
    if (pool.length < 20) return [];
    const by = k => [...pool].sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1));
    const M = [];
    M.push({ name: "Atlas Core 10", tag: "Balanced flagship",
      why: "The ten highest overall Opportunity Scores, capped at two names per sector, weighted by inverse volatility so no single wild mover dominates.",
      rows: pickTop(by("score"), "score", 10) });
    M.push({ name: "Quality Compounders", tag: "Profitability first",
      why: "Highest quality-pillar scores among profitable, moderately-levered businesses — the boring-excellence basket.",
      rows: pickTop(by("score_qual").filter(r => (r.op_margin ?? 0) > 10 && (r.de ?? 999) < 200), "score_qual", 8) });
    M.push({ name: "Disciplined Value", tag: "Cheap, not broken",
      why: "Top valuation-pillar scores with a quality floor (positive operating margin, quality score above the median) to avoid classic value traps.",
      rows: pickTop(by("score_val").filter(r => (r.op_margin ?? -1) > 0 && (r.score_qual ?? 0) > 50), "score_val", 8) });
    M.push({ name: "Momentum Leaders", tag: "Trend riders",
      why: "Strongest momentum pillar among names trading above their 200-day average. Highest octane, biggest drawdowns — check the Monte Carlo.",
      rows: pickTop(by("score_mom").filter(r => r.above_200dma), "score_mom", 8) });
    M.push({ name: "Defensive Income", tag: "Sleep-at-night",
      why: "Low-volatility, low-beta dividend payers tilted to staples, health care and utilities — built to lose less when markets wobble.",
      rows: pickTop(pool.filter(r => (r.div_yield ?? 0) > 1.5 && (r.beta ?? 2) < 1 && (r.vol_ann ?? 99) < 30)
        .sort((a, b) => (a.vol_ann ?? 99) - (b.vol_ann ?? 99)), "", 8, { perSector: 3 }) });
    M.push({ name: "European Champions", tag: "Home-market tilt",
      why: "The best overall scores among UK and continental listings — a euro-centric core for investors who think in EUR or GBP.",
      rows: pickTop(by("score").filter(r => r.region !== "US"), "score", 8) });
    return M.filter(m => m.rows.length >= 5)
      .map(m => ({ ...m, port: invVolWeights(m.rows) }));
  }
  const MODELS = buildModels();
  const modelsEl = document.getElementById("models");
  if (modelsEl) {
    modelsEl.innerHTML = MODELS.length ? MODELS.map((m, i) => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
          <b>${m.name}</b><span class="pill">${m.tag}</span>
        </div>
        <div class="small" style="margin:8px 0 10px">${m.why}</div>
        <div style="margin-bottom:12px">${m.port.slice(0, 8).map(h => `<span class="pill">${h.t} ${h.w.toFixed(0)}%</span>`).join(" ")}</div>
        <button class="btn ghost" data-m="${i}">Load into Lab →</button>
      </div>`).join("")
      : '<div class="card"><div class="small">Model portfolios appear once the full dataset has been generated by the nightly run.</div></div>';
    modelsEl.querySelectorAll("button[data-m]").forEach(b => b.addEventListener("click", () => {
      H = MODELS[+b.dataset.m].port.map(h => ({ ...h }));
      renderHoldings(); run();
    }));
  }

  // ---------- the report ----------
  function metric(label, value, read) {
    return `<div class="card metric"><div class="k">${label}</div><div class="v">${value}</div><div class="read">${read}</div></div>`;
  }
  const P = (v, d = 1) => (v >= 0 ? "+" : "") + (v * 100).toFixed(d) + "%";

  function run() {
    if (H.length < 2) { alert("Add at least 2 holdings."); return; }
    const tot = H.reduce((s, h) => s + h.w, 0);
    if (tot <= 0) { alert("Weights are all zero."); return; }
    const base = $("ccy").value, lb = +$("lb").value, reb = +$("reb").value;
    const cap = Math.max(100, +($("cap").value.replace(/[^0-9.]/g, "")) || 10000);
    const rf = (+$("rf").value || rfDefault) / 100;

    const W = buildWindow(H.map(h => h.t), lb, base);
    if (W.tickers.length < 2) { alert("Not enough price history for these holdings at this lookback."); return; }
    const kept = new Set(W.tickers);
    const weights = H.filter(h => kept.has(h.t)).map(h => h.w);
    const wSum = weights.reduce((a, b) => a + b, 0);
    const wNorm = weights.map(w => w / wSum);

    // portfolio + benchmark
    const vals = backtest(W.px, wNorm, cap, reb);
    const dates = W.dates;
    const bEntry = lab.benchmarks[$("bench").value];
    const bSeries = seriesInBase(bEntry, base).slice(lab.dates.length - lb - 1);
    let bl = null; { let last = null; const s = bSeries.map(x => x == null ? last : (last = x)); 
      const off = s.length - vals.length; const t = s.slice(off);
      bl = t[0] ? t.map(x => x / t[0] * cap) : null; }

    const rets = toRets(vals);
    const years = rets.length / 52;
    const cagr = Math.pow(vals[vals.length - 1] / vals[0], 1 / years) - 1;
    const vol = std(rets) * Math.sqrt(52);
    const sharpe = (cagr - rf) / vol;
    const downside = rets.filter(r => r < 0);
    const sortino = downside.length > 1 ? (cagr - rf) / (std(downside) * Math.sqrt(52)) : NaN;
    const dd = drawdown(vals);
    const ddWeeks = dd.worstEnd - dd.worstStart;

    // CAPM vs benchmark
    let capm = null;
    if (bl) {
      const bRets = toRets(bl);
      const g = regress(rets, bRets);
      capm = { beta: g.beta, alphaAnn: g.alpha * 52, r2: g.r2,
               te: std(rets.map((r, i) => r - bRets[i])) * Math.sqrt(52),
               bCagr: Math.pow(bl[bl.length - 1] / bl[0], 1 / years) - 1 };
    }

    // tails
    const sorted = [...rets].sort((a, b) => a - b);
    const var95 = -pctl(sorted, 0.05), var99 = -pctl(sorted, 0.01);
    const cvar95 = -mean(sorted.slice(0, Math.max(1, Math.floor(0.05 * sorted.length))));
    const m = mean(rets), s = std(rets);
    const pvar95 = -(m - 1.645 * s), pvar99 = -(m - 2.326 * s);
    const skew = rets.reduce((a, x) => a + ((x - m) / s) ** 3, 0) / rets.length;
    const kurt = rets.reduce((a, x) => a + ((x - m) / s) ** 4, 0) / rets.length - 3;

    // correlation matrix + diversification
    const assetRets = W.px.map(toRets);
    const N = assetRets.length;
    const corr = [];
    for (let i = 0; i < N; i++) {
      corr.push([]);
      for (let j = 0; j < N; j++) {
        if (i === j) { corr[i].push(1); continue; }
        const a = assetRets[i], b = assetRets[j];
        const ma = mean(a), mb = mean(b);
        let sab = 0, saa = 0, sbb = 0;
        for (let k = 0; k < a.length; k++) { sab += (a[k] - ma) * (b[k] - mb); saa += (a[k] - ma) ** 2; sbb += (b[k] - mb) ** 2; }
        corr[i].push(sab / Math.sqrt(saa * sbb));
      }
    }
    const assetVols = assetRets.map(r => std(r) * Math.sqrt(52));
    const wAvgVol = wNorm.reduce((sum, w, i) => sum + w * assetVols[i], 0);
    const divRatio = wAvgVol / vol;
    let offDiag = []; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) offDiag.push(corr[i][j]);
    const avgCorr = offDiag.length ? mean(offDiag) : 1;

    // efficient frontier: 4000 random portfolios (long-only)
    const meansA = assetRets.map(r => mean(r) * 52);
    const cloud = [];
    let best = { sh: -1e9 }, minv = { v: 1e9 };
    for (let k = 0; k < 4000; k++) {
      let rw = wNorm.map(() => -Math.log(Math.random())); // Dirichlet(1)
      const sw = rw.reduce((a, b) => a + b, 0); rw = rw.map(x => x / sw);
      let pr = 0; for (let i = 0; i < N; i++) pr += rw[i] * meansA[i];
      let pv = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
        pv += rw[i] * rw[j] * corr[i][j] * (assetVols[i]) * (assetVols[j]);
      pv = Math.sqrt(pv);
      cloud.push([pv * 100, pr * 100]);
      const sh = (pr - rf) / pv;
      if (sh > best.sh) best = { sh, v: pv, r: pr, w: rw };
      if (pv < minv.v) minv = { v: pv, r: pr, w: rw };
    }
    let curR = 0; for (let i = 0; i < N; i++) curR += wNorm[i] * meansA[i];

    // Monte Carlo: bootstrap portfolio weekly returns, 10k paths x 52 weeks
    const PATHS = 10000, HOR = 52;
    const terminals = new Array(PATHS);
    const trackAt = []; for (let t = 0; t <= HOR; t++) trackAt.push(new Array(PATHS));
    for (let p = 0; p < PATHS; p++) {
      let v = cap; trackAt[0][p] = v;
      for (let t = 1; t <= HOR; t++) {
        v *= 1 + rets[(Math.random() * rets.length) | 0];
        trackAt[t][p] = v;
      }
      terminals[p] = v;
    }
    const bands = { p5: [], p25: [], p75: [], p95: [] }; const med = [];
    for (let t = 0; t <= HOR; t++) {
      const so = trackAt[t].sort((a, b) => a - b);
      bands.p5.push(pctl(so, 0.05)); bands.p25.push(pctl(so, 0.25));
      bands.p75.push(pctl(so, 0.75)); bands.p95.push(pctl(so, 0.95));
      med.push(pctl(so, 0.5));
    }
    const tSorted = terminals.sort((a, b) => a - b);
    const probLoss = tSorted.filter(x => x < cap).length / PATHS;
    const mcVar = cap - pctl(tSorted, 0.05);
    const mcCvar = cap - mean(tSorted.slice(0, Math.floor(0.05 * PATHS)));

    // ---------- render ----------
    $("report").style.display = "block"; $("empty").style.display = "none";
    const cs = base === "USD" ? "$" : base === "EUR" ? "€" : "£";
    const fmtM = v => cs + MP.fmt.num(v, 0);
    $("perf-sub").innerHTML = `${W.tickers.map((t, i) => `${t} ${(wNorm[i] * 100).toFixed(0)}%`).join(" · ")} — ${(rets.length / 52).toFixed(1)}y lookback, ${reb ? (reb === 4 ? "monthly" : "quarterly") + " rebalanced" : "buy & hold"}, in ${base}.` +
      (W.dropped.length ? ` <span style="color:var(--amber)">Dropped for missing history: ${W.dropped.join(", ")}.</span>` : "");

    multiLine($("growth"), bl ? [vals, bl] : [vals], null, dates, [dd.worstStart, dd.worstEnd]);
    $("growth-legend").innerHTML = `<span><i style="background:#e8b44c"></i>Portfolio (${fmtM(vals[vals.length - 1])})</span>` +
      (bl ? `<span><i style="background:#4f8dfd"></i>${$("bench").selectedOptions[0].text} (${fmtM(bl[bl.length - 1])})</span>` : "") +
      `<span><i style="background:rgba(229,72,77,.4)"></i>Worst drawdown window</span>`;

    $("perf-metrics").innerHTML =
      metric("Annualized return", P(cagr), `Your ${fmtM(cap)} compounded at ${(cagr * 100).toFixed(1)}% a year over this window${capm ? ` vs ${P(capm.bCagr)} for the benchmark` : ""}.`) +
      metric("Annualized volatility", (vol * 100).toFixed(1) + "%", "Typical size of yearly swings. Under 15% is calm; over 25% is a rough ride.") +
      metric("Sharpe ratio", sharpe.toFixed(2), sharpe > 1 ? "Above 1: strong reward per unit of risk in this period." : sharpe > 0.5 ? "Decent but not exceptional risk-adjusted return." : "Weak compensation for the risk taken.") +
      metric("Sortino ratio", isNaN(sortino) ? "—" : sortino.toFixed(2), "Like Sharpe, but only punishes downside volatility — kinder to lumpy winners.") +
      metric("Max drawdown", (dd.maxDD * 100).toFixed(1) + "%", `Worst peak-to-trough fall, lasting ~${ddWeeks} weeks (shaded on the chart). Could you have held on?`) +
      metric("Best / worst week", P(Math.max(...rets)) + " / " + P(Math.min(...rets)), "The realistic single-week range you'd have lived through.");

    $("risk-metrics").innerHTML =
      metric("VaR 95% (weekly, hist.)", (var95 * 100).toFixed(1) + "%", `In the worst 1-in-20 weeks, you lost at least this. On ${fmtM(cap)}: ${fmtM(cap * var95)}.`) +
      metric("CVaR 95% (weekly)", (cvar95 * 100).toFixed(1) + "%", "The average of those worst weeks — the honest tail number, and always uglier than VaR.") +
      metric("VaR 99% hist. / param.", (var99 * 100).toFixed(1) + "% / " + (pvar99 * 100).toFixed(1) + "%", "When history is worse than the bell-curve estimate, your tail is fatter than normal theory assumes.") +
      metric("Skew / excess kurtosis", skew.toFixed(2) + " / " + kurt.toFixed(2), (skew < 0 ? "Negative skew: crashes bigger than rallies. " : "Positive skew: upside surprises dominate. ") + (kurt > 1 ? "Fat tails present." : "Tails near-normal."));

    $("capm-metrics").innerHTML = capm ?
      metric("Beta", capm.beta.toFixed(2), capm.beta > 1.1 ? "Amplifies the market: expect bigger moves both ways." : capm.beta < 0.9 ? "Defensive: moves less than the market." : "Moves roughly one-for-one with the market.") +
      metric("Alpha (annualized)", P(capm.alphaAnn), capm.alphaAnn > 0 ? "Return above what beta alone would predict — the holy grail, if it persists." : "Underperformed what its market exposure should have delivered.") +
      metric("R²", (capm.r2 * 100).toFixed(0) + "%", `${(capm.r2 * 100).toFixed(0)}% of weekly moves are explained by the benchmark; the rest is stock-specific.`) +
      metric("Tracking error", (capm.te * 100).toFixed(1) + "%", "How far you stray from the benchmark. High alpha with low tracking error is rare and precious.")
      : '<div class="card"><div class="small">Benchmark series unavailable for this window.</div></div>';

    // correlation matrix
    let mx = "<table class='cmx'><tr><th></th>" + W.tickers.map(t => `<th>${t.split(".")[0]}</th>`).join("") + "</tr>";
    for (let i = 0; i < N; i++) {
      mx += `<tr><th>${W.tickers[i].split(".")[0]}</th>`;
      for (let j = 0; j < N; j++) {
        const c = corr[i][j];
        const bg = i === j ? "#14233b" : c > 0 ? `rgba(37,99,235,${(Math.abs(c) * .55).toFixed(2)})` : `rgba(47,191,113,${(Math.abs(c) * .55).toFixed(2)})`;
        mx += `<td style="background:${bg}">${c.toFixed(2)}</td>`;
      }
      mx += "</tr>";
    }
    $("cmx").innerHTML = mx + "</table>";
    $("div-metrics").innerHTML =
      metric("Average pair correlation", avgCorr.toFixed(2), avgCorr > 0.7 ? "Your holdings move together — this is closer to one big bet than a portfolio." : avgCorr > 0.4 ? "Moderate co-movement; diversification is working, partially." : "Genuinely diversified holdings.") +
      metric("Diversification ratio", divRatio.toFixed(2), `Weighted average of individual volatilities (${(wAvgVol * 100).toFixed(1)}%) ÷ portfolio volatility (${(vol * 100).toFixed(1)}%). Above ~1.3 means the mix is destroying real risk.`);

    scatter($("frontier"), cloud, [
      { x: vol * 100, y: curR * 100, col: "#e8b44c", lbl: "You" },
      { x: best.v * 100, y: best.r * 100, col: "#2fbf71", lbl: "Max Sharpe" },
      { x: minv.v * 100, y: minv.r * 100, col: "#4f8dfd", lbl: "Min vol" },
    ]);
    const bestW = best.w ? W.tickers.map((t, i) => `${t} ${(best.w[i] * 100).toFixed(0)}%`).join(", ") : "";
    $("frontier-note").innerHTML = `Each dot is a random long-only weighting of your chosen assets (expected return uses historical means — treat directionally). The max-Sharpe mix here would be: <span class="mono">${bestW}</span>. <button class="btn ghost" id="applybest" style="margin-left:8px;padding:5px 12px;font-size:12px">Apply max-Sharpe weights</button>`;
    $("applybest").onclick = () => {
      H = W.tickers.map((t, i) => ({ t, w: best.w[i] * 100 }));
      renderHoldings(); run();
    };

    fanChart($("fan"), bands, med, cap);
    $("mc-metrics").innerHTML =
      metric("Median outcome (1y)", fmtM(med[HOR]), `Half of 10,000 simulated years end above this, half below.`) +
      metric("Probability of loss", (probLoss * 100).toFixed(0) + "%", "Share of simulated years ending below your starting capital.") +
      metric("1-year VaR 95% (MC)", mcVar > 0 ? fmtM(mcVar) : "None", mcVar > 0 ? `In the worst 5% of simulated years you lose at least this much of ${fmtM(cap)}.` : "Even the 5th-percentile simulated year ended in profit — a sign this lookback window was unusually kind. Trust it accordingly.") +
      metric("1-year CVaR 95% (MC)", mcCvar > 0 ? fmtM(mcCvar) : "None", mcCvar > 0 ? "Average loss across those worst simulated years — budget for this, hope to never need it." : "The average of the worst simulated years was still a gain; history rarely stays this generous.");

    // update URL for sharing
    const enc = H.map(h => `${h.t}:${h.w.toFixed(0)}`).join(",");
    history.replaceState(null, "", `?p=${encodeURIComponent(enc)}&b=${$("bench").value}&c=${base}&l=${lb}&r=${reb}`);
    document.querySelector("#report").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("run").onclick = run;
  $("share").onclick = () => {
    navigator.clipboard.writeText(location.href).then(() => { $("share").textContent = "Copied ✓"; setTimeout(() => $("share").textContent = "Copy share link", 1600); });
  };

  // restore from URL
  const qp = new URLSearchParams(location.search);
  if (qp.get("p")) {
    H = qp.get("p").split(",").map(x => { const [t, w] = x.split(":"); return { t, w: +w || 0 }; }).filter(h => lab.series[h.t]);
    if (qp.get("b")) $("bench").value = qp.get("b");
    if (qp.get("c")) $("ccy").value = qp.get("c");
    if (qp.get("l")) $("lb").value = qp.get("l");
    if (qp.get("r")) $("reb").value = qp.get("r");
    renderHoldings();
    if (H.length >= 2) run();
  } else renderHoldings();
})();

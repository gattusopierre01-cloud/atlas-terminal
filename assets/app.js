/* Atlas Terminal shared shell: nav, ticker tape, helpers */
const MP = (() => {
  const fmt = {
    num(v, d = 2) { return (v === null || v === undefined || Number.isNaN(v)) ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 }); },
    pct(v, d = 1) {
      if (v === null || v === undefined || Number.isNaN(v)) return "—";
      const s = Number(v) > 0 ? "+" : "";
      return s + Number(v).toFixed(d) + "%";
    },
    cls(v) { return v > 0 ? "up" : v < 0 ? "down" : ""; },
    mcap(v) {
      if (!v) return "—";
      if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
      if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
      return (v / 1e6).toFixed(0) + "M";
    },
    scoreColor(s) {
      if (s === null || s === undefined) return "#5b6880";
      if (s >= 75) return "#2fbf71";
      if (s >= 55) return "#4f8dfd";
      if (s >= 40) return "#e8b44c";
      return "#e5484d";
    }
  };

  // Tiny dependency-free sparkline
  function spark(values, { w = 110, h = 30, stroke = "#4f8dfd", fill = true } = {}) {
    if (!values || values.length < 2) return "";
    const min = Math.min(...values), max = Math.max(...values);
    const rng = (max - min) || 1;
    const pts = values.map((v, i) =>
      [(i / (values.length - 1)) * w, h - 2 - ((v - min) / rng) * (h - 4)]);
    const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("");
    const up = values[values.length - 1] >= values[0];
    const col = stroke === "auto" ? (up ? "#2fbf71" : "#e5484d") : stroke;
    const area = fill ? `<path d="${path}L${w},${h}L0,${h}Z" fill="${col}" opacity="0.10"/>` : "";
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${area}<path d="${path}" fill="none" stroke="${col}" stroke-width="1.6"/></svg>`;
  }

  // Full-size line chart (company page)
  function lineChart(el, values, labels) {
    if (!values || values.length < 2) { el.innerHTML = '<div class="skeleton">No price history yet — data updates after the nightly run.</div>'; return; }
    const w = el.clientWidth || 700, h = 260, padL = 46, padB = 22, padT = 10;
    const min = Math.min(...values), max = Math.max(...values), rng = (max - min) || 1;
    const X = i => padL + (i / (values.length - 1)) * (w - padL - 8);
    const Y = v => padT + (1 - (v - min) / rng) * (h - padT - padB);
    let grid = "", ticks = "";
    for (let g = 0; g <= 4; g++) {
      const v = min + (rng * g) / 4, y = Y(v);
      grid += `<line x1="${padL}" y1="${y}" x2="${w - 8}" y2="${y}" stroke="#1e3252" stroke-width="1" opacity="0.6"/>`;
      ticks += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10.5" fill="#5b6880" font-family="IBM Plex Mono,monospace">${fmt.num(v, v > 100 ? 0 : 1)}</text>`;
    }
    const path = values.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1)).join("");
    const up = values[values.length - 1] >= values[0];
    const col = up ? "#2fbf71" : "#e5484d";
    el.innerHTML = `<svg width="100%" viewBox="0 0 ${w} ${h}">${grid}${ticks}
      <path d="${path}L${X(values.length - 1)},${h - padB}L${padL},${h - padB}Z" fill="${col}" opacity="0.07"/>
      <path d="${path}" fill="none" stroke="${col}" stroke-width="2"/>
      <circle cx="${X(values.length - 1)}" cy="${Y(values[values.length - 1])}" r="3.5" fill="${col}"/></svg>`;
  }

  async function getJSON(url) {
    try { const r = await fetch(url); if (!r.ok) throw 0; return await r.json(); }
    catch { return null; }
  }

  // For third-party APIs that may not send CORS headers: try direct, then a public CORS proxy
  async function getJSONx(url) {
    const direct = await getJSON(url);
    if (direct) return direct;
    return await getJSON("https://api.allorigins.win/raw?url=" + encodeURIComponent(url));
  }

  // Nav + tape injected on every page
  async function shell(active) {
    const nav = document.createElement("nav");
    nav.className = "nav";
    nav.innerHTML = `
      <a class="wordmark" href="index.html">Atlas <span>Terminal</span></a>
      <div class="links">
        <a href="index.html" ${active === "home" ? 'class="active"' : ""}>Home</a>
        <a href="globe.html" ${active === "globe" ? 'class="active"' : ""}>Globe</a>
        <a href="brief.html" ${active === "brief" ? 'class="active"' : ""}>Brief</a>
        <a href="markets.html" ${active === "markets" ? 'class="active"' : ""}>Markets</a>
        <a href="lab.html" ${active === "lab" ? 'class="active"' : ""}>Lab</a>
        <a href="screener.html" ${active === "screener" ? 'class="active"' : ""}>Screener</a>
        <a href="methodology.html" ${active === "method" ? 'class="active"' : ""}>Methodology</a>
      </div>
      <button class="kbtn" onclick="MP.openPalette()" aria-label="Search (Cmd+K)">⌘K</button>
      <span class="updated" id="mp-updated"></span>`;
    const tape = document.createElement("div");
    tape.className = "tape";
    tape.innerHTML = `<div class="tape-inner" id="mp-tape"><span class="item">Loading market tape…</span></div>`;
    document.body.prepend(tape);
    document.body.prepend(nav);

    const [meta, markets] = await Promise.all([getJSON("data/meta.json"), getJSON("data/markets.json")]);
    if (meta) {
      document.getElementById("mp-updated").textContent =
        meta.sample ? "sample data — run the Action" : "data as of " + meta.updated;
    }
    if (markets && markets.indices && markets.indices.length) {
      const items = markets.indices.map(i =>
        `<span class="item"><b>${i.name}</b> ${fmt.num(i.last, 0)} <span class="${fmt.cls(i.r1d)}">${fmt.pct(i.r1d)}</span></span>`);
      const half = items.join("");
      document.getElementById("mp-tape").innerHTML = half + half; // duplicated for seamless loop
    } else {
      document.getElementById("mp-tape").innerHTML =
        `<span class="item">Market tape will appear after the first data run — see the README.</span>`;
    }
    if (!document.querySelector("footer.site")) {
      const f = document.createElement("footer");
      f.className = "site";
      f.innerHTML = `Atlas Terminal — an open macro &amp; equity dashboard. All scores are quantitative screening signals derived from public data, not investment advice or recommendations. Data: World Bank, GDELT, Yahoo Finance. Built by Pierre.`;
      document.body.appendChild(f);
    }
  }

  // ---------- global command palette (Cmd+K) ----------
  let palReady = false, palUniv = null, palGeo = null;
  const PAGES = [
    ["Home — the terminal", "index.html"], ["Globe — country briefings", "globe.html"],
    ["Morning Brief", "brief.html"], ["Markets dashboard", "markets.html"],
    ["Portfolio Lab", "lab.html"], ["Screener — opportunity scores", "screener.html"],
    ["Methodology", "methodology.html"],
  ];
  function ensurePalette() {
    if (palReady) return; palReady = true;
    const d = document.createElement("div");
    d.id = "mp-pal"; d.innerHTML = `
      <div class="pal-back"></div>
      <div class="pal-box">
        <input id="pal-in" placeholder="Search a ticker, company, or page…  (Esc to close)" autocomplete="off">
        <div id="pal-res"></div>
      </div>`;
    document.body.appendChild(d);
    d.querySelector(".pal-back").onclick = closePalette;
    const inp = d.querySelector("#pal-in");
    inp.addEventListener("input", () => palRender(inp.value));
    inp.addEventListener("keydown", e => {
      if (e.key === "Escape") closePalette();
      if (e.key === "Enter") { const f = d.querySelector("#pal-res a"); if (f) f.click(); }
    });
  }
  async function openPalette() {
    ensurePalette();
    document.getElementById("mp-pal").classList.add("open");
    const inp = document.getElementById("pal-in");
    inp.value = ""; palRender(""); inp.focus();
    if (!palUniv) palUniv = (await getJSON("data/screener.json")) || [];
    if (!palGeo) {
      const g = await getJSON("data/countries.geojson");
      palGeo = ((g && g.features) || []).map(f => f.properties.ADMIN);
    }
  }
  function closePalette() { const p = document.getElementById("mp-pal"); if (p) p.classList.remove("open"); }
  function palRender(q) {
    q = q.trim().toLowerCase();
    const res = document.getElementById("pal-res");
    const pages = PAGES.filter(p => !q || p[0].toLowerCase().includes(q))
      .map(p => `<a href="${p[1]}"><span class="pal-k">page</span>${p[0]}</a>`);
    let ticks = [];
    if (q && palUniv) {
      ticks = palUniv.filter(r => r.ticker.toLowerCase().includes(q) || (r.longName || r.name || "").toLowerCase().includes(q))
        .slice(0, 7)
        .map(r => `<a href="company.html?t=${encodeURIComponent(r.ticker)}"><span class="pal-k">stock</span><b>${r.ticker}</b>&nbsp; ${r.longName || r.name || ""} ${r.score != null ? `<span class="pal-s" style="background:${fmt.scoreColor(r.score)}">${Math.round(r.score)}</span>` : ""}</a>`);
    }
    let ctys = [];
    if (q && palGeo) {
      ctys = palGeo.filter(n => n.toLowerCase().includes(q)).slice(0, 4)
        .map(n => `<a href="globe.html?focus=${encodeURIComponent(n)}"><span class="pal-k">country</span>${n}</a>`);
    }
    res.innerHTML = [...ticks, ...ctys, ...pages.slice(0, q ? 3 : 7)].join("") || `<div class="pal-none">No matches.</div>`;
  }
  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
  });

  return { fmt, spark, lineChart, getJSON, getJSONx, shell, openPalette };
})();

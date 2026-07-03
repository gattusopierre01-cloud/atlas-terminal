/* Globe page: interactive earth + country briefing panel */
(async () => {
  await MP.shell("globe");

  const WB_INDICATORS = [
    { code: "NY.GDP.MKTP.KD.ZG", label: "Real GDP growth", unit: "%", d: 1 },
    { code: "FP.CPI.TOTL.ZG", label: "Inflation (CPI)", unit: "%", d: 1 },
    { code: "SL.UEM.TOTL.ZS", label: "Unemployment", unit: "%", d: 1 },
    { code: "NY.GDP.PCAP.CD", label: "GDP per capita", unit: " USD", d: 0 },
    { code: "GC.DOD.TOTL.GD.ZS", label: "Gov. debt / GDP", unit: "%", d: 1 },
    { code: "BN.CAB.XOKA.GD.ZS", label: "Current account / GDP", unit: "%", d: 1 },
  ];

  const cbData = await MP.getJSON("data/central_banks.json");
  const banks = (cbData && cbData.banks) || [];
  const bankFor = iso2 => banks.find(b => b.iso2 === iso2 || (b.members || []).includes(iso2));

  const countries = await MP.getJSON("data/countries.geojson");
  const el = document.getElementById("globe");
  if (typeof Globe === "undefined" || !countries) {
    el.innerHTML = '<div class="skeleton" style="padding:120px 5%">The 3D globe library could not load (network or CDN issue). Refresh the page, or use the <a href="markets.html">Markets</a> and <a href="screener.html">Screener</a> pages.</div>';
    return;
  }

  const globe = Globe()(el)
    .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-night.jpg")
    .backgroundColor("rgba(0,0,0,0)")
    .showAtmosphere(true)
    .atmosphereColor("#2563eb")
    .atmosphereAltitude(0.18)
    .polygonsData(countries.features)
    .polygonCapColor(() => "rgba(37, 99, 235, 0.06)")
    .polygonSideColor(() => "rgba(37, 99, 235, 0.04)")
    .polygonStrokeColor(() => "#2b4a7e")
    .polygonAltitude(0.006)
    .polygonLabel(f => `<div style="font-family:'IBM Plex Mono',monospace;font-size:12px;background:#0f1b2e;border:1px solid #1e3252;border-radius:6px;padding:5px 9px;color:#e9eef6">${f.properties.ADMIN}</div>`)
    .onPolygonHover(f => {
      el.style.cursor = f ? "pointer" : "grab";
      if (!heatOn) globe.polygonCapColor(p => p === f ? "rgba(79,141,253,0.35)" : "rgba(37,99,235,0.06)");
      globe.polygonAltitude(p => p === f ? 0.02 : 0.006);
    })
    .onPolygonClick(f => openCountry(f.properties));

  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.55;
  globe.pointOfView({ lat: 25, lng: 5, altitude: 2.1 });
  const size = () => { globe.width(el.clientWidth); globe.height(el.clientHeight); };
  size(); window.addEventListener("resize", size);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) globe.controls().autoRotate = false;

  // ---------- heatmap (World Bank choropleth + policy rates) ----------
  const HEATCFG = {
    inflation: { code: "FP.CPI.TOTL.ZG", label: "CPI inflation %", stops: [0, 2, 4, 7, 12], colors: ["#2fbf71", "#9bd06a", "#e8b44c", "#e07b3f", "#e5484d"] },
    gdp: { code: "NY.GDP.MKTP.KD.ZG", label: "Real GDP growth %", stops: [-2, 0, 2, 4, 6], colors: ["#e5484d", "#e07b3f", "#e8b44c", "#9bd06a", "#2fbf71"] },
    rate: { label: "Policy rate %", stops: [0, 1, 2.5, 4, 6], colors: ["#2fbf71", "#9bd06a", "#e8b44c", "#e07b3f", "#e5484d"] },
  };
  const heatVals = {};
  let heatOn = "";
  function heatColor(cfg, v) {
    if (v == null) return "rgba(37,99,235,0.06)";
    let i = cfg.stops.findIndex(s => v < s); if (i === -1) i = cfg.colors.length - 1;
    return cfg.colors[Math.max(0, i)] + "B8";
  }
  async function loadHeat(metric) {
    if (heatVals[metric]) return heatVals[metric];
    const out = {};
    if (metric === "rate") {
      banks.forEach(b => {
        const isoList = [b.iso2, ...(b.members || [])];
        countries.features.forEach(f => {
          const p = f.properties;
          if (isoList.includes(p.ISO_A2)) out[p.ISO_A3_EH !== "-99" ? p.ISO_A3_EH : p.ISO_A3] = b.rate;
        });
      });
    } else {
      const cfg = HEATCFG[metric];
      const j = await MP.getJSON(`https://api.worldbank.org/v2/country/all/indicator/${cfg.code}?format=json&mrnev=1&per_page=400`);
      ((j && j[1]) || []).forEach(r => { if (r.value != null && r.countryiso3code) out[r.countryiso3code] = +r.value; });
    }
    heatVals[metric] = out;
    return out;
  }
  async function setHeat(metric) {
    heatOn = metric;
    document.querySelectorAll("#heatchips button").forEach(b => b.classList.toggle("on", b.dataset.h === metric));
    const leg = document.getElementById("heatlegend");
    if (!metric) { leg.hidden = true; globe.polygonCapColor(() => "rgba(37, 99, 235, 0.06)"); return; }
    const cfg = HEATCFG[metric];
    const vals = await loadHeat(metric);
    leg.hidden = false;
    leg.textContent = cfg.label + " · " + cfg.stops[0] + " → " + cfg.stops[cfg.stops.length - 1] + "+";
    globe.polygonCapColor(f => {
      const p = f.properties;
      return heatColor(cfg, vals[p.ISO_A3_EH !== "-99" ? p.ISO_A3_EH : p.ISO_A3]);
    });
    window.AtlasContext = { ...(window.AtlasContext || {}), heatmap: metric };
  }
  document.querySelectorAll("#heatchips button").forEach(b => b.addEventListener("click", () => setHeat(b.dataset.h)));
  const heatParam = new URLSearchParams(location.search).get("heat");
  if (heatParam && HEATCFG[heatParam]) setHeat(heatParam);
  window.AtlasContext = { view: "globe", heatmap: heatParam || "none" };

  // deep link: globe.html?focus=France opens that country's briefing
  const focusName = new URLSearchParams(location.search).get("focus");
  if (focusName) {
    const f = countries.features.find(x => x.properties.ADMIN.toLowerCase() === focusName.toLowerCase());
    if (f) setTimeout(() => {
      const c = f.properties;
      openCountry(c);
    }, 600);
  }

  const panel = document.getElementById("panel");
  const body = document.getElementById("panel-body");
  document.getElementById("panel-close").onclick = () => {
    panel.classList.remove("open");
    globe.controls().autoRotate = true;
  };

  function isoOf(p) {
    const a3 = p.ISO_A3_EH && p.ISO_A3_EH !== "-99" ? p.ISO_A3_EH : p.ISO_A3;
    const a2 = p.ISO_A2 && p.ISO_A2 !== "-99" ? p.ISO_A2 : null;
    return { a3: a3 !== "-99" ? a3 : null, a2 };
  }

  async function wbSeries(iso3, code) {
    const j = await MP.getJSON(`https://api.worldbank.org/v2/country/${iso3}/indicator/${code}?format=json&per_page=60`);
    if (!j || !j[1]) return null;
    const pts = j[1].filter(r => r.value !== null)
      .map(r => ({ y: +r.date, v: +r.value }))
      .sort((a, b) => a.y - b.y).slice(-12);
    return pts.length ? pts : null;
  }

  async function openCountry(p) {
    globe.controls().autoRotate = false;
    window.AtlasContext = { view: "globe — country briefing open", country: p.ADMIN, heatmap: heatOn || "none" };
    const { a3, a2 } = isoOf(p);
    const name = p.ADMIN;
    panel.classList.add("open");

    const bank = a2 ? bankFor(a2) : null;
    body.innerHTML = `
      <div class="eyebrow">Country briefing</div>
      <h2>${name}</h2>
      <div class="small" style="margin-bottom:10px">${p.CONTINENT || ""} · pop. ${MP.fmt.mcap(p.POP_EST)}</div>
      ${bank ? cbCard(bank) : ""}
      <div id="inds"><div class="skeleton">Loading World Bank indicators…</div></div>
      <h2 style="font-size:19px;margin-top:24px">Latest economic headlines</h2>
      <div id="news"><div class="skeleton">Loading news…</div></div>`;

    // indicators (parallel)
    const indEl = body.querySelector("#inds");
    if (!a3) { indEl.innerHTML = `<div class="small">No indicator data available for this territory.</div>`; }
    else {
      const series = await Promise.all(WB_INDICATORS.map(i => wbSeries(a3, i.code)));
      indEl.innerHTML = WB_INDICATORS.map((ind, i) => {
        const s = series[i];
        if (!s) return `<div class="ind-row"><span class="lbl">${ind.label}</span><span class="val">—</span></div>`;
        const last = s[s.length - 1];
        return `<div class="ind-row">
          <span class="lbl">${ind.label}<br><span class="yr">latest: ${last.y}</span></span>
          ${MP.spark(s.map(x => x.v), { w: 96, h: 26, stroke: "auto" })}
          <span class="val">${MP.fmt.num(last.v, ind.d)}${ind.unit}</span>
        </div>`;
      }).join("");
    }

    // news via GDELT — adjacency-phrased query + title filter so "articles that
    // merely mention the country" don't crowd out articles ABOUT the country
    const newsEl = body.querySelector("#news");
    const ALIAS = { "United States of America": ["United States", "US ", "U.S.", "America"],
      "United Kingdom": ["UK", "Britain", "British", "United Kingdom"],
      "Russia": ["Russia", "Russian"], "China": ["China", "Chinese"],
      "Netherlands": ["Netherlands", "Dutch"], "Switzerland": ["Switzerland", "Swiss"],
      "Czechia": ["Czech"], "South Korea": ["Korea"], "United Arab Emirates": ["UAE", "Emirates"] };
    const keys = ALIAS[name] || [name];
    const kMain = keys[0];
    const q1 = encodeURIComponent(`("${kMain} economy" OR "${kMain} inflation" OR "${kMain} GDP" OR "${kMain} economic" OR "${kMain} central bank")`);
    let g = await MP.getJSONx(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q1}%20sourcelang:eng&mode=ArtList&format=json&maxrecords=36&timespan=5d&sort=DateDesc`);
    let arts = MP.newsRank(g && g.articles);
    const aboutCountry = a => keys.some(k => a.title.toLowerCase().includes(k.toLowerCase().trim()));
    let filtered = arts.filter(aboutCountry);
    if (filtered.length < 2) {
      // broader retry: plain mention query, still title-filtered
      const q2 = encodeURIComponent(`"${kMain}" (economy OR inflation OR "central bank" OR GDP OR markets)`);
      g = await MP.getJSONx(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q2}%20sourcelang:eng&mode=ArtList&format=json&maxrecords=40&timespan=7d&sort=DateDesc`);
      arts = MP.newsRank(g && g.articles);
      filtered = arts.filter(aboutCountry);
      if (filtered.length < 2) filtered = arts.slice(0, 6); // last resort: show mentions, labelled
    }
    const strict = filtered.length && filtered.every(aboutCountry);
    const seen = new Set();
    filtered = filtered.filter(a => !seen.has(a.title) && seen.add(a.title)).slice(0, 7);
    newsEl.innerHTML = filtered.length
      ? (strict ? "" : `<div class="small" style="margin-bottom:6px">Few direct headlines — showing recent articles mentioning ${kMain}:</div>`) +
        filtered.map(a => MP.newsItem(a)).join("")
      : `<div class="small">No recent English-language economic headlines found for ${name}.</div>`;
  }

  function cbCard(b) {
    return `<div class="cb-card">
      <div class="k" style="font-size:11px;color:#8b98ae;letter-spacing:.08em;text-transform:uppercase;font-family:'IBM Plex Mono',monospace">${b.bank}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px">
        <span class="mono" style="font-size:24px">${b.range || b.rate.toFixed(2) + "%"}</span>
        <span class="small">${b.rate_name}</span>
      </div>
      <div class="small" style="margin-top:6px">Last move: ${b.last_move}${b.next_decision ? " · Next decision: " + b.next_decision : ""}</div>
    </div>`;
  }
})();

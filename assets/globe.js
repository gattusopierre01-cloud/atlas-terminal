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
      globe.polygonCapColor(p => p === f ? "rgba(79,141,253,0.35)" : "rgba(37,99,235,0.06)")
           .polygonAltitude(p => p === f ? 0.02 : 0.006);
    })
    .onPolygonClick(f => openCountry(f.properties));

  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.55;
  globe.pointOfView({ lat: 25, lng: 5, altitude: 2.1 });
  const size = () => { globe.width(el.clientWidth); globe.height(el.clientHeight); };
  size(); window.addEventListener("resize", size);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) globe.controls().autoRotate = false;

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

    // news via GDELT
    const newsEl = body.querySelector("#news");
    const q = encodeURIComponent(`"${name}" (economy OR inflation OR "central bank" OR GDP)`);
    const g = await MP.getJSONx(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}%20sourcelang:eng&mode=ArtList&format=json&maxrecords=7&sort=DateDesc`);
    const arts = g && g.articles ? g.articles.filter(a => a.title) : [];
    newsEl.innerHTML = arts.length
      ? arts.map(a => `<div class="news-item"><a href="${a.url}" target="_blank" rel="noopener">${a.title}</a><div class="src">${a.domain} · ${(a.seendate || "").slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}</div></div>`).join("")
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

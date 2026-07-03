/* Atlas Terminal — Morning Brief */
(async () => {
  await MP.shell("brief");
  const $ = id => document.getElementById(id);

  // greeting + date
  const now = new Date(), h = now.getHours();
  $("greet").innerHTML = (h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.") +
    " <em>Here's the state of play.</em>";
  $("date-line").textContent = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // scoreboard grouped by region
  const markets = await MP.getJSON("data/markets.json");
  if (markets && markets.indices) {
    const order = { JP: "Asia", EU: "Europe", DE: "Europe", FR: "Europe", CH: "Europe", UK: "Europe", US: "United States" };
    const groups = {};
    markets.indices.forEach(i => { const gp = order[i.region] || "Other"; (groups[gp] = groups[gp] || []).push(i); });
    $("board").innerHTML = ["Asia", "Europe", "United States"].filter(gp => groups[gp]).map(gp =>
      groups[gp].map(i => `<div class="b"><div class="n">${i.name} <span class="pill" style="padding:0 6px">${gp[0]}</span></div>
        <div class="v">${MP.fmt.num(i.last, 0)} <span class="${MP.fmt.cls(i.r1d)}" style="font-size:12.5px">${MP.fmt.pct(i.r1d)}</span></div></div>`).join("")
    ).join("");
  } else {
    $("board").innerHTML = '<div class="skeleton">Scoreboard fills after the first data run.</div>';
  }

  // central banks
  const cb = await MP.getJSON("data/central_banks.json");
  if (cb && cb.banks) {
    const upcoming = cb.banks.filter(b => b.next_decision)
      .sort((a, b) => a.next_decision.localeCompare(b.next_decision));
    const days = d => Math.ceil((new Date(d) - now) / 864e5);
    $("cb-next").innerHTML = upcoming.length ? upcoming.map(b => {
      const dd = days(b.next_decision);
      return `<div class="cbrow"><span>${b.bank}</span><span class="mono">${b.next_decision}${dd >= 0 ? ` · in ${dd}d` : ""}</span></div>`;
    }).join("") + `<div class="small" style="margin-top:8px">Dates maintained in <span class="mono" style="font-size:11px">data/central_banks.json</span> — 30-second edit after each decision.</div>`
      : '<div class="small">No confirmed upcoming dates in the reference file.</div>';
    $("cb-rates").innerHTML = cb.banks.map(b =>
      `<div class="cbrow"><span>${b.country}</span><span class="mono">${b.range || b.rate.toFixed(2) + "%"}</span></div>`).join("") +
      `<div class="small" style="margin-top:8px">As of ${cb.as_of}.</div>`;
  }

  window.AtlasContext = { view: "morning brief",
    scoreboard: ((markets && markets.indices) || []).map(i => ({ n: i.name, last: i.last, d1: i.r1d })),
    centralBanks: (cb && cb.banks || []).map(b => ({ bank: b.bank, rate: b.range || b.rate + "%", next: b.next_decision })),
    headlines: [] };

  // headline lanes
  const dedupe = new Set();
  async function lane(el, query, titleMust = []) {
    el.innerHTML = '<div class="skeleton">Loading headlines…</div>';
    const g = await MP.getJSONx("https://api.gdeltproject.org/api/v2/doc/doc?query=" +
      encodeURIComponent(query) + "%20sourcelang:eng&mode=ArtList&format=json&maxrecords=40&timespan=3days&sort=DateDesc");
    if (!g) {
      el.innerHTML = '<div class="small">Couldn\'t reach the news service just now (it rate-limits busy periods). <a href="#" class="lane-retry">Retry</a></div>';
      el.querySelector(".lane-retry").addEventListener("click", e => { e.preventDefault(); lane(el, query, titleMust); });
      return;
    }
    let arts = MP.newsRank(g.articles);
    if (titleMust.length) {
      const strict = arts.filter(a => titleMust.some(k => a.title.toLowerCase().includes(k)));
      if (strict.length >= 3) arts = strict;
    }
    arts = arts.filter(a => { const k = a.title.slice(0, 60); if (dedupe.has(k)) return false; dedupe.add(k); return true; }).slice(0, 6);
    arts.forEach(a => window.AtlasContext.headlines.push(a.title));
    el.innerHTML = arts.length
      ? arts.map((a, i) => MP.newsItem(a, i === 0)).join("")
      : '<div class="small">Nothing fresh found in this lane right now.</div>';
  }
  lane($("lane-cb"), '("central bank" OR "interest rate" OR "rate decision" OR "monetary policy" OR Fed OR ECB)', ["rate", "fed", "ecb", "central bank", "boe", "inflation"]);
  lane($("lane-mkt"), '(stocks OR markets OR earnings OR economy) (rally OR fall OR outlook OR growth OR data)', ["market", "stock", "econom", "earnings", "shares", "growth"]);
  lane($("lane-geo"), '(tariff OR sanctions OR trade OR geopolit OR OPEC OR "supply chain")', ["tariff", "sanction", "trade", "opec", "china", "oil"]);

  // custom persistent lane (stored on this device)
  const KEY = "atlas.lane4";
  const saved = (() => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } })();
  const runOwn = q => {
    if (!q) return;
    $("lane4-title").textContent = q;
    lane($("lane-own"), `"${q}"`, []);
  };
  if (saved) { $("lane4-q").value = saved; runOwn(saved); }
  let t;
  $("lane4-q").addEventListener("input", e => {
    clearTimeout(t);
    t = setTimeout(() => {
      const q = e.target.value.trim();
      try { localStorage.setItem(KEY, q); } catch {}
      if (q.length > 2) runOwn(q);
    }, 600);
  });
})();

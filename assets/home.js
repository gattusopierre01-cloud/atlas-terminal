/* Atlas Terminal — landing scene */
(async () => {
  await MP.shell("home");
  const $ = id => document.getElementById(id);
  const markets = await MP.getJSON("data/markets.json");
  const idx = {}; ((markets && markets.indices) || []).forEach(i => idx[i.symbol] = i);

  const TOWER_SYMS = [
    { sym: "^GSPC", x: 10, y: 46 }, { sym: "^NDX", x: 24, y: 52 },
    { sym: "^DJI", x: 38, y: 44 }, { sym: "^FTSE", x: 62, y: 50 },
    { sym: "^STOXX50E", x: 66, y: 45 }, { sym: "^N225", x: 76, y: 55 },
  ];

  // ---------- optional photo backdrop (assets/nyc.jpg, user-supplied) ----------
  const img = new Image();
  img.onload = () => { const pf = $("photofar"); pf.style.backgroundImage = "url(assets/nyc.jpg)"; pf.classList.add("on"); };
  img.src = "assets/nyc.jpg";

  // ---------- market clock (NYSE hours, America/New_York) ----------
  function nyNow() {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York",
      hour: "numeric", minute: "numeric", hour12: false, weekday: "short" }).formatToParts(new Date());
    const g = k => p.find(x => x.type === k).value;
    return { h: +g("hour") % 24, m: +g("minute"), wd: g("weekday") };
  }
  function marketState() {
    const { h, m, wd } = nyNow();
    const mins = h * 60 + m, open = 9 * 60 + 30, close = 16 * 60;
    const weekday = !["Sat", "Sun"].includes(wd);
    if (weekday && mins >= open && mins < close) return { s: "open", label: "NYSE open", left: close - mins, next: "closes" };
    if (weekday && mins >= open - 210 && mins < open) return { s: "pre", label: "Pre-market", left: open - mins, next: "opens" };
    let till = weekday && mins < open - 210 ? open - mins : (24 * 60 - mins) + open;
    if (wd === "Fri" && mins >= close) till += 24 * 60 * 2;
    if (wd === "Sat") till += 24 * 60;
    return { s: "night", label: "NYSE closed", left: till, next: "opens" };
  }
  function fmtLeft(mins) { const h = Math.floor(mins / 60), m = mins % 60; return (h ? h + "h " : "") + m + "m"; }
  function tickClock() {
    const st = marketState();
    $("sky").className = "sky " + (st.s === "open" ? "open" : st.s === "pre" ? "dawn" : "night");
    $("mktclock").innerHTML = `<span class="dot ${st.s === "open" ? "on" : st.s === "pre" ? "pre" : "off"}"></span>${st.label} · ${st.next} in ${fmtLeft(st.left)} <span style="opacity:.55">ET</span>`;
    return st;
  }
  const st0 = tickClock(); setInterval(tickClock, 30000);

  // ---------- stars ----------
  const stars = $("stars");
  for (let i = 0; i < 70; i++) {
    const s = document.createElement("span");
    s.style.left = (Math.random() * 100) + "%"; s.style.top = (Math.random() * 100) + "%";
    s.style.animationDelay = (Math.random() * 3) + "s"; s.style.opacity = .2 + Math.random() * .7;
    stars.appendChild(s);
  }

  // ---------- fallback silhouette (only when no photo is present) ----------
  const W = 1600, HM = 300;
  function silhouette(h, seed, fill) {
    let rng = seed;
    const rnd = () => (rng = (rng * 9301 + 49297) % 233280) / 233280;
    let d = `M0,${h} L0,${h - 40 - rnd() * 60}`;
    let x = 0;
    while (x < W) {
      const bw = 30 + rnd() * 90, bh = h * (0.25 + rnd() * 0.6);
      d += `L${x},${h - bh} L${x + bw},${h - bh}`;
      x += bw + rnd() * 24;
    }
    return `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMax slice"><path d="${d} L${W},${h} Z" fill="${fill}"/></svg>`;
  }
  $("lmid").innerHTML = silhouette(HM, 21, "#0a1626");
  const hideFallback = () => { $("lmid").style.display = "none"; };
  img.addEventListener("load", hideFallback);
  if (img.complete && img.naturalWidth) hideFallback();

  // ---------- lights living inside the photo ----------
  const lights = $("lights");
  const dayMoveAvg = (() => { const m = TOWER_SYMS.map(t => idx[t.sym] ? Math.abs(idx[t.sym].r1d || 0) : 0);
    return m.length ? m.reduce((a, b) => a + b, 0) / m.length : 0.4; })();
  const nLights = Math.round(50 + Math.min(60, dayMoveAvg * 45));  // busier market, busier city
  for (let i = 0; i < nLights; i++) {
    const sp = document.createElement("span");
    if (Math.random() < 0.3) sp.className = "b";
    sp.style.left = (Math.random() * 100) + "%";
    sp.style.top = (35 + Math.random() * 62) + "%";
    sp.style.animationDelay = (Math.random() * 4).toFixed(2) + "s";
    sp.style.animationDuration = (2.6 + Math.random() * 4).toFixed(2) + "s";
    const sc = .6 + Math.random();
    sp.style.transform = `scale(${sc.toFixed(2)})`;
    lights.appendChild(sp);
  }

  // ---------- HUD index pins over the skyline ----------
  const hud = $("hud");
  TOWER_SYMS.forEach((t, i) => {
    const d = idx[t.sym];
    const pin = document.createElement("div");
    pin.className = "pin";
    pin.style.left = t.x + "%";
    pin.style.top = t.y + "%";
    pin.style.animationDelay = (i * 0.7) + "s";
    const chg = d ? `<span class="${MP.fmt.cls(d.r1d)}">${MP.fmt.pct(d.r1d)}</span>` : "—";
    pin.innerHTML = `<div class="chip"><b>${d ? d.name : t.sym}</b> ${d ? MP.fmt.num(d.last, 0) : ""} ${chg}</div><div class="stem"></div><div class="node"></div>`;
    pin.addEventListener("mousemove", e => {
      if (!d) return;
      tip.hidden = false;
      tip.style.left = e.clientX + "px"; tip.style.top = (e.clientY - 6) + "px";
      tip.innerHTML = `<b>${d.name}</b>${MP.fmt.num(d.last, 0)} <span class="${MP.fmt.cls(d.r1d)}">${MP.fmt.pct(d.r1d)}</span> today · <span class="${MP.fmt.cls(d.r1y)}">${MP.fmt.pct(d.r1y)}</span> 1Y`;
    });
    pin.addEventListener("mouseleave", () => tip.hidden = true);
    pin.addEventListener("click", () => location.href = "markets.html");
    hud.appendChild(pin);
  });
  const tip = $("towertip");

  // ---------- holo portals: one interactive object per section ----------
  const cbJ = await MP.getJSON("data/central_banks.json");
  const scrJ = await MP.getJSON("data/screener.json");
  const portals = $("portals");
  function portal(kicker, viz, sub, href) {
    const d = document.createElement("div");
    d.className = "portal";
    d.innerHTML = `<div class="p-k">${kicker}<span class="go">→</span></div><div class="p-viz">${viz}</div><div class="p-sub">${sub}</div>`;
    d.addEventListener("click", () => location.href = href);
    // 3D tilt toward the cursor
    d.addEventListener("mousemove", e => {
      const r = d.getBoundingClientRect();
      const rx = ((e.clientY - r.top) / r.height - .5) * -14;
      const ry = ((e.clientX - r.left) / r.width - .5) * 16;
      d.style.transform = `rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) translateZ(8px)`;
    });
    d.addEventListener("mouseleave", () => d.style.transform = "");
    portals.appendChild(d);
  }
  if (portals) {
    // MARKETS — S&P sparkline that draws itself
    const gspc = idx["^GSPC"];
    if (gspc && gspc.spark && gspc.spark.length > 3) {
      const v = gspc.spark, min = Math.min(...v), max = Math.max(...v), rng = (max - min) || 1;
      const pts = v.map((x, i) => `${(i / (v.length - 1) * 150).toFixed(1)},${(50 - (x - min) / rng * 44).toFixed(1)}`).join(" ");
      const up = v[v.length - 1] >= v[0];
      portal("Markets",
        `<svg class="drawline" width="150" height="52" viewBox="0 0 150 52"><polyline class="line" points="${pts}" fill="none" stroke="${up ? "#2fbf71" : "#e5484d"}" stroke-width="2"/></svg>
         <span class="p-num">${MP.fmt.num(gspc.last, 0)}</span>`,
        `S&P 500 <span class="${MP.fmt.cls(gspc.r1d)}">${MP.fmt.pct(gspc.r1d)}</span> today — indices, sectors, movers`, "markets.html");
    } else {
      portal("Markets", `<span class="p-num">—</span>`, "Indices, sector heatmap and daily movers", "markets.html");
    }
    // SCREENER — top score ring counting up
    const top = (scrJ || []).find(r => r.score != null);
    if (top) {
      const pct = Math.round(top.score);
      portal("Screener",
        `<svg class="ringviz" width="52" height="52" viewBox="0 0 46 46">
           <circle cx="23" cy="23" r="20" fill="none" stroke="#1e3252" stroke-width="4"/>
           <circle class="fg" cx="23" cy="23" r="20" fill="none" stroke="${MP.fmt.scoreColor(top.score)}" stroke-width="4" stroke-linecap="round" stroke-dashoffset="126"/>
         </svg><div><div class="p-num">${pct}</div><div class="small mono">${top.ticker}</div></div>`,
        `Today's highest Opportunity Score of ~${(scrJ || []).length} names`, "screener.html");
      requestAnimationFrame(() => setTimeout(() => {
        const fg = portals.querySelector(".ringviz .fg");
        if (fg) fg.style.strokeDashoffset = (126 - 126 * pct / 100).toFixed(1);
      }, 250));
    }
    // LAB — orbiting particle system
    const orbitDots = [0, 1, 2, 3, 4].map(i =>
      `<i style="--r:${12 + i * 5}px; animation-duration:${(3 + i * 1.3).toFixed(1)}s; opacity:${(1 - i * .14).toFixed(2)}"></i>`).join("");
    portal("Portfolio Lab",
      `<div class="orbits">${orbitDots}<span class="ctr">β</span></div>
       <div class="p-sub" style="font-size:11px">Backtest · VaR · Monte Carlo · frontier</div>`,
      "Build a portfolio, stress it like a risk desk", "lab.html");
    // BRIEF — next central bank decision countdown
    const nextCB = ((cbJ && cbJ.banks) || []).filter(b => b.next_decision).sort((a, b) => a.next_decision.localeCompare(b.next_decision))[0];
    const dd = nextCB ? Math.max(0, Math.ceil((new Date(nextCB.next_decision) - Date.now()) / 864e5)) : null;
    portal("Morning Brief",
      nextCB ? `<span class="p-num">${dd}<span style="font-size:12px;color:var(--muted)">d</span></span>
        <div class="p-sub" style="font-size:11px">until the ${nextCB.bank.replace("European Central Bank", "ECB").replace("Federal Reserve", "Fed")} decision</div>`
        : `<span class="p-num">☕</span>`,
      "Scoreboard, central banks and ranked headlines", "brief.html");
  }

  // ---------- parallax ----------
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) {
    const scene = $("scene");
    scene.addEventListener("mousemove", e => {
      const dx = (e.clientX / scene.clientWidth - 0.5), dy = (e.clientY / scene.clientHeight - 0.5);
      $("photofar").style.transform = `translate(${dx * -14}px,${dy * -6}px) scale(1.03)`;
      $("lights").style.transform = `translate(${dx * -18}px,${dy * -8}px)`;
      $("hud").style.transform = `translate(${dx * -26}px,${dy * -11}px)`;
      $("portals").style.transform = `translate(${dx * 10}px,${dy * 7}px)`;
      $("moon").style.transform = `translate(${dx * 14}px,${dy * 10}px)`;
    });
    window.addEventListener("deviceorientation", e => {
      if (e.gamma == null) return;
      const dx = Math.max(-0.5, Math.min(0.5, e.gamma / 60));
      $("hud").style.transform = `translateX(${dx * -26}px)`;
    });
  }

  // ---------- earth-moon ----------
  $("moon").addEventListener("click", () => location.href = "globe.html");

  // ---------- LED tape ----------
  const items = ((markets && markets.indices) || []).map(i =>
    `<span>${i.name.toUpperCase()} ${MP.fmt.num(i.last, 0)} <span class="${(i.r1d || 0) >= 0 ? "u" : "d"}">${MP.fmt.pct(i.r1d)}</span></span>`);
  const led = items.length ? items.join("") : "<span>ATLAS TERMINAL · AWAITING FIRST DATA RUN · TRIGGER THE ACTION TO LIGHT THIS BOARD</span>";
  $("ledinner").innerHTML = led + led;
  const plainTape = document.querySelector(".tape"); if (plainTape) plainTape.style.display = "none";

  window.AtlasContext = { view: "home landing", marketState: st0.label,
    indices: ((markets && markets.indices) || []).map(i => ({ n: i.name, last: i.last, d1: i.r1d, y1: i.r1y })) };

  // ---------- below the fold ----------
  const scr = await MP.getJSON("data/screener.json");
  if (markets && markets.gainers) {
    $("fold-movers").innerHTML = [...(markets.gainers || []).slice(0, 3), ...(markets.losers || []).slice(0, 2)]
      .map(x => `<div style="display:flex;justify-content:space-between;padding:3px 0"><span class="tk">${x.ticker}</span><span class="mono ${MP.fmt.cls(x.r1d)}">${MP.fmt.pct(x.r1d)}</span></div>`).join("");
  }
  if (scr && scr.length) {
    $("fold-scores").innerHTML = scr.slice(0, 5).map(r =>
      `<div style="display:flex;justify-content:space-between;padding:3px 0"><span><span class="tk">${r.ticker}</span> <span class="small">${(r.sector || "").slice(0, 18)}</span></span><span class="pill score-pill" style="background:${MP.fmt.scoreColor(r.score)}">${r.score == null ? "—" : r.score.toFixed(0)}</span></div>`).join("");
  }
})();

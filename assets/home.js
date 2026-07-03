/* Atlas Terminal — landing scene */
(async () => {
  await MP.shell("home");
  const $ = id => document.getElementById(id);
  const markets = await MP.getJSON("data/markets.json");
  const idx = {}; ((markets && markets.indices) || []).forEach(i => idx[i.symbol] = i);

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

  // ---------- skyline generation ----------
  const W = 1600, HF = 380, HM = 300, HFA = 240;
  function silhouette(h, seed, fill, jag) {
    let rng = seed;
    const rnd = () => (rng = (rng * 9301 + 49297) % 233280) / 233280;
    let d = `M0,${h} L0,${h - 40 - rnd() * 60}`;
    let x = 0;
    while (x < W) {
      const bw = 30 + rnd() * 90, bh = h * (0.25 + rnd() * (jag ? 0.62 : 0.42));
      d += `L${x},${h - bh} L${x + bw},${h - bh}`;
      if (rnd() > 0.72) { const aw = 3, ah = 22 + rnd() * 30; const ax = x + bw / 2;
        d += `L${ax - aw},${h - bh} L${ax - aw},${h - bh - ah} L${ax + aw},${h - bh - ah} L${ax + aw},${h - bh}`; }
      x += bw + rnd() * 24;
    }
    return `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMax slice"><path d="${d} L${W},${h} Z" fill="${fill}"/></svg>`;
  }
  $("lfar").innerHTML = silhouette(HFA, 7, "#0c1a2f", false);
  $("lmid").innerHTML = silhouette(HM, 21, "#091423", true);

  // ---------- hero towers = live indices ----------
  const TOWERS = [
    { sym: "^GSPC", x: 120, w: 96, h: 330, style: "wtc" },
    { sym: "^NDX", x: 265, w: 78, h: 268, style: "flat" },
    { sym: "^DJI", x: 392, w: 88, h: 236, style: "setback" },
    { sym: "^FTSE", x: 900, w: 84, h: 252, style: "setback" },
    { sym: "^STOXX50E", x: 1050, w: 76, h: 222, style: "flat" },
    { sym: "^N225", x: 1180, w: 90, h: 288, style: "spire" },
  ];
  const dayMoves = TOWERS.map(t => idx[t.sym] ? Math.abs(idx[t.sym].r1d || 0) : 0);
  const avgMove = dayMoves.length ? dayMoves.reduce((a, b) => a + b, 0) / dayMoves.length : 0.4;
  const litBase = Math.min(0.75, 0.28 + avgMove * 0.4);

  function tower(t) {
    const d = idx[t.sym];
    const up = d ? (d.r1d || 0) >= 0 : true;
    const winCol = st0.s === "open" ? (up ? "#7fe8ae" : "#ff9a9e") : "#e8c98a";
    let g = `<g class="tower" data-sym="${t.sym}" transform="translate(${t.x},0)">`;
    const bh = t.h, bw = t.w, top = HF - bh;
    g += `<rect class="body" x="0" y="${top}" width="${bw}" height="${bh}" fill="#0d1b30" stroke="#16273f" stroke-width="1"/>`;
    if (t.style === "setback") {
      g += `<rect class="body" x="${bw * .18}" y="${top - 36}" width="${bw * .64}" height="40" fill="#0d1b30" stroke="#16273f"/>`;
    }
    if (t.style === "wtc") {
      g += `<polygon points="0,${top} ${bw},${top} ${bw * .5},${top - 26}" fill="#0d1b30" stroke="#16273f"/>
            <line x1="${bw * .5}" y1="${top - 26}" x2="${bw * .5}" y2="${top - 78}" stroke="#22375a" stroke-width="3"/>
            <circle cx="${bw * .5}" cy="${top - 78}" r="3.5" fill="${st0.s === "open" ? "#2fbf71" : "#e5484d"}">
              <animate attributeName="opacity" values="1;.15;1" dur="2.2s" repeatCount="indefinite"/></circle>`;
    }
    if (t.style === "spire") {
      g += `<line x1="${bw * .5}" y1="${top}" x2="${bw * .5}" y2="${top - 46}" stroke="#22375a" stroke-width="2.5"/>`;
    }
    const cols = Math.floor(bw / 10), rows = Math.floor(bh / 13);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (Math.random() > litBase) continue;
      const fl = Math.random() < 0.05;
      g += `<rect x="${4 + c * 10}" y="${top + 7 + r * 13}" width="4.5" height="6" fill="${winCol}" opacity="${(0.35 + Math.random() * 0.5).toFixed(2)}">${fl ? `<animate attributeName="opacity" values="0.7;0.05;0.7" dur="${(3 + Math.random() * 5).toFixed(1)}s" repeatCount="indefinite"/>` : ""}</rect>`;
    }
    return g + "</g>";
  }
  $("lfront").innerHTML = `<svg viewBox="0 0 ${W} ${HF}" preserveAspectRatio="xMidYMax slice">${silhouette(150, 3, "#060d18", false).replace(/<\/?svg[^>]*>/g, "")}${TOWERS.map(tower).join("")}</svg>`;

  const tip = $("towertip");
  document.querySelectorAll(".tower").forEach(el => {
    el.addEventListener("mousemove", e => {
      const d = idx[el.dataset.sym];
      tip.hidden = false;
      tip.style.left = e.clientX + "px";
      tip.style.top = (e.clientY - 6) + "px";
      tip.innerHTML = d
        ? `<b>${d.name}</b>${MP.fmt.num(d.last, 0)} <span class="${MP.fmt.cls(d.r1d)}">${MP.fmt.pct(d.r1d)}</span> today · <span class="${MP.fmt.cls(d.r1y)}">${MP.fmt.pct(d.r1y)}</span> 1Y`
        : `<b>${el.dataset.sym}</b>awaiting first data run`;
    });
    el.addEventListener("mouseleave", () => tip.hidden = true);
    el.addEventListener("click", () => location.href = "markets.html");
  });

  // ---------- parallax ----------
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) {
    const scene = $("scene");
    scene.addEventListener("mousemove", e => {
      const dx = (e.clientX / scene.clientWidth - 0.5), dy = (e.clientY / scene.clientHeight - 0.5);
      $("photofar").style.transform = `translate(${dx * -8}px,${dy * -4}px)`;
      $("lfar").style.transform = `translate(${dx * -16}px,${dy * -6}px)`;
      $("lmid").style.transform = `translate(${dx * -30}px,${dy * -10}px)`;
      $("lfront").style.transform = `translate(${dx * -48}px,${dy * -15}px)`;
      $("moon").style.transform = `translate(${dx * 14}px,${dy * 10}px)`;
    });
    window.addEventListener("deviceorientation", e => {
      if (e.gamma == null) return;
      const dx = Math.max(-0.5, Math.min(0.5, e.gamma / 60));
      $("lmid").style.transform = `translateX(${dx * -30}px)`;
      $("lfront").style.transform = `translateX(${dx * -48}px)`;
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

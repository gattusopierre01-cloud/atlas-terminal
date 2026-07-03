/* Atlas — the assistant layer. BYOK: the API key lives ONLY in this browser's
   localStorage, never in the repo. Visitors without a key see a dormant state. */
(() => {
  const LS_KEY = "atlas.apikey", LS_MODEL = "atlas.model", LS_VOICE = "atlas.voiceout";
  const MODELS = [["claude-haiku-4-5", "Haiku — fast & cheap"], ["claude-sonnet-4-6", "Sonnet — smartest"]];
  const $ = id => document.getElementById(id);
  const getKey = () => { try { return localStorage.getItem(LS_KEY) || ""; } catch { return ""; } };
  const getModel = () => { try { return localStorage.getItem(LS_MODEL) || MODELS[0][0]; } catch { return MODELS[0][0]; } };
  const voiceOut = () => { try { return localStorage.getItem(LS_VOICE) === "1"; } catch { return false; } };

  let history = [];   // {role, content} for this session
  let busy = false;

  // ---------- context from the current page ----------
  function pageContext() {
    const ctx = window.AtlasContext || {};
    const nav = { page: location.pathname.split("/").pop() || "index.html" };
    return JSON.stringify({ ...nav, ...ctx }).slice(0, 14000);
  }
  const SYSTEM = () => `You are Atlas, the built-in assistant of Atlas Terminal — an open macro & equity dashboard (globe with country data, markets page, ~650-stock screener with Opportunity Scores, Portfolio Lab with backtests/VaR/Monte Carlo, Morning Brief).
Style: concise, precise, lightly wry; a calm operations voice. Use short paragraphs, no headers, minimal lists. Numbers matter — cite them from CONTEXT when relevant. If CONTEXT lacks the answer, say so plainly rather than inventing figures.
You are not a financial advisor; frame everything as analysis of screening signals, never as advice to buy or sell.
You can trigger site actions. If (and only if) the user's request maps to one, end your reply with a new line exactly like:
ACTION:{"goto":"company.html?t=ASML.AS"}
Available actions: {"goto":"<any internal page url>"} — pages: index.html, brief.html, globe.html, globe.html?focus=<Country>, globe.html?heat=<inflation|gdp|rate>, markets.html, screener.html, lab.html, company.html?t=<TICKER>, methodology.html; {"loadModel":"<model portfolio name>"} for the Lab's model portfolios (Atlas Core 10, Quality Compounders, Disciplined Value, Momentum Leaders, Defensive Income, European Champions).
CONTEXT (live data from the page the user is viewing): ${pageContext()}`;

  // ---------- API (streaming) ----------
  async function ask(text, onDelta) {
    history.push({ role: "user", content: text });
    const body = {
      model: getModel(), max_tokens: 700, stream: true,
      system: SYSTEM(),
      messages: history.slice(-12),
    };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": getKey(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(res.status === 401 ? "Key rejected (401) — check it in settings." :
        res.status === 429 ? "Rate limited — a moment, then retry." : "API error " + res.status + ": " + err.slice(0, 140));
    }
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = "", full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const ln of lines) {
        if (!ln.startsWith("data:")) continue;
        try {
          const j = JSON.parse(ln.slice(5));
          if (j.type === "content_block_delta" && j.delta && j.delta.text) { full += j.delta.text; onDelta(full); }
        } catch {}
      }
    }
    history.push({ role: "assistant", content: full });
    return full;
  }

  // ---------- actions ----------
  function extractAction(text) {
    const m = text.match(/\nACTION:(\{.*\})\s*$/);
    if (!m) return { clean: text, act: null };
    try { return { clean: text.replace(m[0], "").trim(), act: JSON.parse(m[1]) }; }
    catch { return { clean: text.replace(m[0], "").trim(), act: null }; }
  }
  function runAction(act) {
    if (!act) return "";
    if (act.goto && /^[a-z]+\.html/.test(act.goto)) { setTimeout(() => location.href = act.goto, 1100); return "→ opening " + act.goto; }
    if (act.loadModel) {
      const url = "lab.html?model=" + encodeURIComponent(act.loadModel);
      setTimeout(() => location.href = url, 1100); return "→ loading " + act.loadModel + " in the Lab";
    }
    return "";
  }

  // ---------- voice ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recog = null;
  function listen(onText, onState) {
    if (!SR) { onState("unsupported"); return; }
    recog = new SR(); recog.lang = "en-US"; recog.interimResults = false;
    onState("listening");
    recog.onresult = e => { onState("idle"); onText(e.results[0][0].transcript); };
    recog.onerror = () => onState("idle");
    recog.onend = () => onState("idle");
    recog.start();
  }
  function speak(text) {
    if (!voiceOut() || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*_#`]/g, "").replace(/ACTION:.*/s, "");
    const u = new SpeechSynthesisUtterance(clean.slice(0, 600));
    u.rate = 1.04; u.pitch = 0.92;
    const vs = speechSynthesis.getVoices();
    const v = vs.find(x => /en-GB/i.test(x.lang)) || vs.find(x => /en/i.test(x.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  // ---------- UI ----------
  function buildUI() {
    // floating orb
    const orb = document.createElement("button");
    orb.id = "atlas-orb"; orb.setAttribute("aria-label", "Ask Atlas");
    orb.innerHTML = `<span class="core"></span>`;
    document.body.appendChild(orb);
    orb.addEventListener("click", () => openChat());

    // chat panel
    const p = document.createElement("div");
    p.id = "atlas-chat"; p.hidden = true;
    p.innerHTML = `
      <div class="ac-head">
        <span class="ac-title"><span class="ac-dot"></span>Atlas</span>
        <span style="display:flex;gap:8px">
          <button class="ac-ic" id="ac-voiceout" title="Spoken replies">${voiceOut() ? "🔊" : "🔇"}</button>
          <button class="ac-ic" id="ac-gear" title="Settings">⚙</button>
          <button class="ac-ic" id="ac-x" title="Close">✕</button>
        </span>
      </div>
      <div class="ac-msgs" id="ac-msgs"></div>
      <div class="ac-settings" id="ac-settings" hidden>
        <div class="small" style="margin-bottom:8px"><b>Bring your own key.</b> Your Anthropic API key is stored only in this browser (localStorage) and sent only to api.anthropic.com. It is never uploaded to the site's repository — visitors to this site cannot see or use it. Get one at console.anthropic.com.</div>
        <input id="ac-key" type="password" placeholder="sk-ant-…" autocomplete="off">
        <select id="ac-model">${MODELS.map(m => `<option value="${m[0]}">${m[1]}</option>`).join("")}</select>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn" id="ac-save" style="padding:7px 16px;font-size:13px">Save</button>
          <button class="btn ghost" id="ac-clearkey" style="padding:7px 16px;font-size:13px">Remove key</button>
        </div>
      </div>
      <div class="ac-inrow">
        <button class="ac-ic" id="ac-mic" title="Speak">🎙</button>
        <input id="ac-in" placeholder="Ask about this page, the market, your portfolio…" autocomplete="off">
        <button class="ac-ic" id="ac-send" title="Send">↵</button>
      </div>`;
    document.body.appendChild(p);

    $("ac-x").onclick = () => p.hidden = true;
    $("ac-gear").onclick = () => { const s = $("ac-settings"); s.hidden = !s.hidden; $("ac-key").value = getKey(); $("ac-model").value = getModel(); };
    $("ac-save").onclick = () => {
      try { localStorage.setItem(LS_KEY, $("ac-key").value.trim()); localStorage.setItem(LS_MODEL, $("ac-model").value); } catch {}
      $("ac-settings").hidden = true; sysMsg(getKey() ? "Key saved. Atlas is awake." : "No key entered.");
    };
    $("ac-clearkey").onclick = () => { try { localStorage.removeItem(LS_KEY); } catch {} $("ac-key").value = ""; sysMsg("Key removed. Atlas is dormant."); };
    $("ac-voiceout").onclick = () => {
      const nv = voiceOut() ? "0" : "1";
      try { localStorage.setItem(LS_VOICE, nv); } catch {}
      $("ac-voiceout").textContent = nv === "1" ? "🔊" : "🔇";
      if (nv === "0") speechSynthesis && speechSynthesis.cancel();
    };
    $("ac-mic").onclick = () => listen(t => { $("ac-in").value = t; send(); },
      st => $("ac-mic").classList.toggle("live", st === "listening"));
    $("ac-send").onclick = send;
    $("ac-in").addEventListener("keydown", e => { if (e.key === "Enter") send(); if (e.key === "Escape") p.hidden = true; });
  }

  function el(cls, html) { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; $("ac-msgs").appendChild(d); $("ac-msgs").scrollTop = 1e9; return d; }
  function sysMsg(t) { el("ac-m sys", t); }
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  async function send(preset) {
    const inp = $("ac-in");
    const q = (preset || inp.value).trim();
    if (!q || busy) return;
    inp.value = "";
    el("ac-m me", esc(q));
    if (!getKey()) {
      sysMsg(`Atlas is dormant — no API key on this device. Open ⚙ settings to add your Anthropic key (stored locally only).`);
      $("ac-settings").hidden = false;
      return;
    }
    busy = true;
    const out = el("ac-m ai", '<span class="ac-cursor">▋</span>');
    try {
      const full = await ask(q, partial => { out.innerHTML = esc(partial) + '<span class="ac-cursor">▋</span>'; });
      const { clean, act } = extractAction(full);
      out.innerHTML = esc(clean);
      const note = runAction(act);
      if (note) el("ac-m sys", note);
      speak(clean);
    } catch (e) {
      out.innerHTML = `<span style="color:var(--amber)">${esc(e.message)}</span>`;
    }
    busy = false;
  }

  function openChat(prefill) {
    const p = $("atlas-chat");
    if (!p) return;
    p.hidden = false;
    if (!$("ac-msgs").children.length) {
      sysMsg(getKey()
        ? "Atlas online. I can read this page's live data — ask away, or tell me where to go."
        : "Atlas is dormant on this device. Add your own Anthropic API key in ⚙ settings (it never leaves this browser) to wake it.");
    }
    if (prefill) { $("ac-in").value = prefill; send(); }
    else $("ac-in").focus();
  }

  // Lab deep-link executor for loadModel action
  if (location.pathname.endsWith("lab.html")) {
    const m = new URLSearchParams(location.search).get("model");
    if (m) window.AtlasLoadModel = m;
  }

  window.Atlas = { openChat };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildUI);
  else buildUI();
})();

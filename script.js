/*
 * Interactive frequency-response demo and the cost waterfall.
 *
 * Frequency model (illustrative, single bus):
 *   (2 E / f0) d(df)/dt = -dP + P_gov + P_ffr - D * df
 *   T_gov d(P_gov)/dt   = -K * df - P_gov
 * E   = kinetic energy of synchronous machines, falls as wind/solar replace them
 * K   = governor response, also provided by synchronous plants
 * FFR = battery response, starts after 0.5 s detection delay, full after 1 s
 */
(function () {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const F0 = 50, DP = 3000, D = 1500, TGOV = 5, FFR_MW = 2000;
  const T_END = 20, DT = 0.02, LIMIT = 49.0;
  const Y_MIN = 48.5, Y_MAX = 50.1;

  function params(share) {
    const s = share / 100;
    return { E: (15 + 220 * (1 - s)) * 1000, K: 3000 + 17000 * (1 - s) };
  }

  function simulate(share, ffr) {
    const { E, K } = params(share);
    let df = 0, pg = 0;
    const pts = [];
    for (let i = 0; i <= T_END / DT; i++) {
      const t = i * DT;
      pts.push([t, F0 + df]);
      const pf = ffr ? FFR_MW * Math.min(Math.max((t - 0.5) / 0.5, 0), 1) : 0;
      const ddf = (F0 / (2 * E)) * (-DP + pg + pf - D * df);
      pg += (DT * (-K * df - pg)) / TGOV;
      df += ddf * DT;
    }
    const nadir = Math.min(...pts.map((p) => p[1]));
    return { pts, nadir, E, rocof: (F0 * DP) / (2 * E) };
  }

  function el(name, attrs, parent) {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  const fmt = (x, d) => x.toFixed(d).replace("-", "−");

  /* ------------------------------------------------------------ frequency chart */
  const fsvg = document.getElementById("freq-chart");
  const share = document.getElementById("share");
  const ffr = document.getElementById("ffr");
  const shareOut = document.getElementById("share-out");
  const tip = document.getElementById("freq-tip");
  let firstDraw = true;
  let current = null;

  function drawFreq() {
    const W = fsvg.parentElement.clientWidth;
    const H = Math.round(Math.min(320, Math.max(220, W * 0.5)));
    const m = { l: 44, r: 12, t: 12, b: 30 };
    fsvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    fsvg.setAttribute("width", W);
    fsvg.setAttribute("height", H);
    fsvg.textContent = "";

    const x = (t) => m.l + (t / T_END) * (W - m.l - m.r);
    const y = (f) => m.t + ((Y_MAX - f) / (Y_MAX - Y_MIN)) * (H - m.t - m.b);

    const g = el("g", { class: "axis" }, fsvg);
    [48.5, 49.0, 49.5, 50.0].forEach((f) => {
      el("line", { x1: m.l, x2: W - m.r, y1: y(f), y2: y(f), class: f === 50 ? "nominal" : "gridline" }, g);
      el("text", { x: m.l - 8, y: y(f) + 4, "text-anchor": "end" }, g).textContent = f.toFixed(1);
    });
    [0, 5, 10, 15, 20].forEach((t) => {
      el("text", { x: x(t), y: H - 8, "text-anchor": t === 0 ? "start" : t === 20 ? "end" : "middle" }, g).textContent =
        t === 20 ? "20 s" : String(t);
    });

    el("line", { x1: m.l, x2: W - m.r, y1: y(LIMIT), y2: y(LIMIT), class: "limit" }, fsvg);
    el("text", { x: W - m.r, y: y(LIMIT) + 16, "text-anchor": "end", class: "limit-label" }, fsvg).textContent =
      "49.0 Hz: load shedding starts";
    el("text", { x: m.l + 6, y: y(50.0) - 6, class: "bar-label" }, fsvg).textContent = "Frequency, Hz";

    const sh = +share.value;
    const res = simulate(sh, ffr.checked);
    current = res;
    const path = (pts) => "M" + pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("L");

    if (ffr.checked) {
      const base = simulate(sh, false);
      el("path", { d: path(base.pts), class: "ghost" }, fsvg);
      const tn = base.pts.find((p) => p[1] === base.nadir)[0];
      el("text", { x: x(tn) + 8, y: Math.min(y(base.nadir) + 16, H - m.b - 4), class: "ghost-label" }, fsvg).textContent =
        "without batteries";
    }

    const tr = el("path", { d: path(res.pts), class: "trace" }, fsvg);
    if (firstDraw) {
      const len = tr.getTotalLength();
      tr.style.setProperty("--len", len);
      tr.classList.add("draw");
      firstDraw = false;
    }

    const cross = el("line", { class: "cross", y1: m.t, y2: H - m.b, visibility: "hidden" }, fsvg);
    const dot = el("circle", { class: "dot", r: 5, visibility: "hidden" }, fsvg);
    const hit = el("rect", { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: "transparent" }, fsvg);

    function move(ev) {
      const r = fsvg.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const t = Math.min(T_END, Math.max(0, ((px - m.l) / (W - m.l - m.r)) * T_END));
      const p = res.pts[Math.round(t / DT)];
      cross.setAttribute("x1", x(p[0])); cross.setAttribute("x2", x(p[0]));
      dot.setAttribute("cx", x(p[0])); dot.setAttribute("cy", y(p[1]));
      cross.setAttribute("visibility", "visible"); dot.setAttribute("visibility", "visible");
      tip.hidden = false;
      tip.textContent = `${p[0].toFixed(1)} s after the trip: ${p[1].toFixed(2)} Hz`;
      tip.style.left = Math.min(Math.max(x(p[0]), 90), W - 90) + "px";
      tip.style.top = y(p[1]) + "px";
    }
    function leave() {
      cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hidden = true;
    }
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", leave);

    updateReadouts(res);
  }

  const ICON_BAD = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15 14H1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 6v3.5M8 11.6v.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const ICON_OK = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m5 8.2 2 2 4-4.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function updateReadouts(res) {
    shareOut.textContent = share.value + "\u00A0%";
    document.getElementById("r-inertia").textContent = Math.round(res.E / 1000) + " GWs";
    document.getElementById("r-rocof").textContent = res.rocof.toFixed(2) + " Hz/s";
    document.getElementById("r-nadir").textContent = res.nadir.toFixed(2) + " Hz";
    const st = document.getElementById("status");
    if (res.nadir < LIMIT) {
      st.className = "status bad";
      st.innerHTML = ICON_BAD + "<span>Frequency falls below 49.0 Hz. Automatic load shedding disconnects customers to save the grid.</span>";
    } else {
      st.className = "status ok";
      st.innerHTML = ICON_OK + "<span>Frequency recovers without disconnecting anyone.</span>";
    }
    document.getElementById("freq-desc").textContent =
      `Line chart of grid frequency over 20 seconds after losing 3 GW, with ${share.value} percent wind and solar` +
      (ffr.checked ? " and battery fast frequency response" : "") +
      `. Frequency falls at ${res.rocof.toFixed(2)} hertz per second and bottoms out at ${res.nadir.toFixed(2)} hertz.`;
  }

  share.addEventListener("input", drawFreq);
  ffr.addEventListener("change", drawFreq);

  /* ------------------------------------------------------------ waterfall */
  const wsvg = document.getElementById("waterfall");
  const wtip = document.getElementById("wf-tip");
  const STEPS = [
    { label: "2030, no stability rules", short: "No rules", value: 10.03, kind: "total" },
    { label: "Reserve and inertia requirements", short: "+ Reserve & inertia", value: 1.69, kind: "increase" },
    { label: "Batteries provide fast frequency response", short: "+ Battery FFR", value: -1.12, kind: "decrease" },
    { label: "Half of EVs charge smartly", short: "+ Smart EV charging", value: -1.16, kind: "decrease" },
    { label: "Result", short: "Result", value: 9.44, kind: "total" },
  ];
  const COLOR = { total: "var(--total)", increase: "var(--increase)", decrease: "var(--accent)" };

  function drawWaterfall() {
    const W = wsvg.parentElement.clientWidth;
    const narrow = W < 520;
    const H = narrow ? 300 : 280;
    const m = { l: 8, r: 8, t: 28, b: narrow ? 56 : 40 };
    wsvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    wsvg.setAttribute("width", W);
    wsvg.setAttribute("height", H);
    wsvg.textContent = "";

    const lo = 0, hi = 12.5; // value axis starts at zero so step sizes are not exaggerated
    const y = (v) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);
    const n = STEPS.length;
    const slot = (W - m.l - m.r) / n;
    const bw = Math.min(72, slot * 0.6);

    let run = 0;
    const bars = STEPS.map((s) => {
      let a, b;
      if (s.kind === "total") { a = lo; b = s.value; run = s.value; }
      else { a = run; b = run + s.value; run = b; }
      return { ...s, a, b };
    });

    el("line", { x1: m.l, x2: W - m.r, y1: y(lo), y2: y(lo), class: "nominal" }, wsvg);

    bars.forEach((s, i) => {
      const cx = m.l + slot * i + slot / 2;
      const top = y(Math.max(s.a, s.b)), bot = y(Math.min(s.a, s.b));
      const g = el("g", { tabindex: 0, role: "img", "aria-label": `${s.label}: ${s.kind === "total" ? "" : s.value > 0 ? "plus " : "minus "}${Math.abs(s.value).toFixed(2)} billion euros` }, wsvg);
      el("rect", { x: cx - bw / 2, y: top, width: bw, height: Math.max(2, bot - top), rx: 3, fill: COLOR[s.kind] }, g);
      const valTxt = s.kind === "total" ? s.value.toFixed(2) : (s.value > 0 ? "+" : "−") + Math.abs(s.value).toFixed(2);
      el("text", { x: cx, y: top - 8, "text-anchor": "middle", class: "bar-value" }, g).textContent = valTxt;
      const lab = el("text", { x: cx, y: H - m.b + 18, "text-anchor": "middle", class: "bar-label" }, g);
      const words = s.short.split(" ");
      if (narrow && words.length > 1) {
        const half = Math.ceil(words.length / 2);
        [words.slice(0, half).join(" "), words.slice(half).join(" ")].forEach((line, k) => {
          el("tspan", { x: cx, dy: k === 0 ? 0 : 15 }, lab).textContent = line;
        });
      } else lab.textContent = s.short;

      if (i < bars.length - 1) {
        const nx = m.l + slot * (i + 1) + slot / 2;
        el("line", { x1: cx + bw / 2, x2: nx - bw / 2, y1: y(s.b), y2: y(s.b), class: "connector" }, wsvg);
      }
      const hit = el("rect", { x: cx - slot / 2, y: m.t - 20, width: slot, height: H - m.t - m.b + 20, fill: "transparent" }, g);
      const show = () => {
        wtip.hidden = false;
        wtip.textContent = `${s.label}: ${s.kind === "total" ? "€" + s.value.toFixed(2) + " bn" : (s.value > 0 ? "+€" : "−€") + Math.abs(s.value).toFixed(2) + " bn"} per year`;
        wtip.style.left = Math.min(Math.max(cx, 120), W - 120) + "px";
        wtip.style.top = top - 22 + "px";
      };
      hit.addEventListener("pointerenter", show);
      g.addEventListener("focus", show);
      hit.addEventListener("pointerleave", () => (wtip.hidden = true));
      g.addEventListener("blur", () => (wtip.hidden = true));
    });
  }

  /* ------------------------------------------------------------ init */
  function drawAll() { drawFreq(); drawWaterfall(); }
  let raf, lastW = 0;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(drawAll);
  });
  lastW = window.innerWidth;
  drawAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawWaterfall());
})();

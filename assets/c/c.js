// Preview C — design system behaviours (see _preview/DESIGN.md):
//   1. Lenis smooths desktop wheel scrolling so scroll-scrubbed scenes glide (touch stays native)
//   2. every device wears the official Apple bezel (iOS 27 UI Kit artwork)
//   3. exploded UI: the live Now screen's layers lift apart in depth and reassemble as it arrives

(() => {
  "use strict";

  const { gsap, ScrollTrigger, Lenis } = window;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // Calendar: the month fills in day by day; tap a day or a legend colour to see what it means.
  function initCalendar() {
    const cal = document.querySelector("[data-cal]");
    if (!cal) return;
    const days = Array.from(cal.querySelectorAll(".cal-grid li[data-day]"));
    const tip = cal.querySelector(".cal-tip");
    const legend = Array.from(cal.querySelectorAll(".cal-legend li"));
    const words = { 5: cal.dataset.tipOver, 4: cal.dataset.tipNear, 3: cal.dataset.tipUnder, 2: cal.dataset.tipUnder, 1: cal.dataset.tipUnder, 0: cal.dataset.tipNone };
    let tour = 0, isUserDriven = false;

    function pick(li) {
      days.forEach((d) => d.classList.toggle("is-picked", d === li));
      if (!li) { tip.textContent = ""; return; }
      const lvl = li.dataset.lvl;
      tip.replaceChildren();
      const dot = document.createElement("i");
      dot.style.setProperty("--c", getComputedStyle(li).getPropertyValue("--c"));
      const amt = document.createElement("b");
      amt.textContent = li.dataset.amtLabel || "—";
      tip.append(dot, `${li.dataset.label} · `, amt, ` — ${words[lvl]}`);
    }
    function filter(lvl) {
      cal.classList.toggle("is-filter", lvl !== null);
      days.forEach((d) => d.classList.toggle("is-match", lvl !== null && d.dataset.lvl === lvl));
      legend.forEach((l) => l.classList.toggle("is-on", lvl !== null && l.dataset.lvl === lvl));
    }
    const takeOver = () => { isUserDriven = true; clearInterval(tour); };
    days.forEach((li) => {
      li.addEventListener("pointerenter", () => { takeOver(); pick(li); });
      li.addEventListener("focus", () => { takeOver(); pick(li); });
      li.addEventListener("click", () => { takeOver(); pick(li); });
    });
    legend.forEach((l) => {
      l.addEventListener("pointerenter", () => { takeOver(); filter(l.dataset.lvl); });
      l.addEventListener("pointerleave", () => filter(null));
      l.addEventListener("click", () => { takeOver(); filter(cal.classList.contains("is-filter") && l.classList.contains("is-on") ? null : l.dataset.lvl); });
    });

    const showcase = [26, 9, 14, 31].map((n) => days[n - 1]).filter(Boolean); // red Monday, amber, green, today
    function play() {
      if (reduced) { days.forEach((d) => d.classList.add("is-in")); pick(showcase[0]); return; }
      cal.classList.add("is-armed");
      days.forEach((d, i) => setTimeout(() => d.classList.add("is-in"), 260 + i * 45));
      let k = 0;
      setTimeout(() => {
        if (isUserDriven) return;
        pick(showcase[0]);
        tour = setInterval(() => { if (isUserDriven) return; k = (k + 1) % showcase.length; pick(showcase[k]); }, 2600);
      }, 260 + days.length * 45 + 400);
    }
    if (!("IntersectionObserver" in window)) { pick(showcase[0]); return; }
    cal.classList.add("is-armed");
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      play();
    }, { threshold: 0.45 });
    io.observe(cal);
  }

  // the official bezel artwork sits over every device screen
  document.querySelectorAll(".phone, .tablet, .rc-inner, .demo-3d").forEach((device) => {
    if (device.querySelector(":scope > .bezel")) return;
    const bezel = document.createElement("i");
    bezel.className = "bezel";
    bezel.setAttribute("aria-hidden", "true");
    device.append(bezel);
  });

  initCalendar();

  if (!gsap || !ScrollTrigger || reduced) return;

  // 1. smooth wheel (desktop only)
  if (Lenis && finePointer) {
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, syncTouch: false });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        const target = document.querySelector(link.getAttribute("href"));
        if (!target) return;
        event.preventDefault();
        lenis.scrollTo(target, { offset: -20 });
      });
    });
  }

  // 3. exploded UI on the live Now screen
  const phone = document.querySelector(".phones .phone.live");
  const screen = phone && phone.querySelector(".ls");
  if (phone && screen) {
    const depth = { // px out of the glass, by layer
      ".ls-status": 24, ".ls-top": 40, ".ls-here": 96, ".ls-today": 150, ".ls-mic": 128, ".ls-hint": 110,
      ".ls-field": 120, ".ls-plus": 132, ".ls-recent": 70, ".ls-list": 84, ".ls-tabs": 140,
    };
    const layers = Object.entries(depth).map(([sel, z]) => [screen.querySelector(sel), z]).filter(([el]) => el);
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: phone, start: "top 95%", end: "center 52%", scrub: 0.8,
        onToggle: (self) => phone.classList.toggle("is-exploding", self.isActive && self.progress < 0.98),
        onLeave: () => phone.classList.remove("is-exploding"),
      },
    });
    tl.fromTo(phone, { transformPerspective: 1400, rotationY: -34, rotationX: 20, rotationZ: -6 }, { rotationY: 0, rotationX: 0, rotationZ: 0, ease: "power2.out", duration: 1 }, 0); // lands flat: the logging must be fully readable
    layers.forEach(([el, z], i) => {
      // centre-anchored layers keep their own translate; add depth and a small lift
      tl.fromTo(el, { z, y: -z * 0.08 }, { z: 0, y: 0, ease: "power3.inOut", duration: 0.85 }, 0.1 + i * 0.006);
    });
  }

  initDevicesC();
  window.addEventListener("load", () => ScrollTrigger.refresh());

  // 4. iPhone + iPad: both on the same Now screen; a latte typed on the iPhone lands in the iPad's list and total
  function initDevicesC() {
    const scene = document.querySelector(".devices[data-dvc]");
    if (!scene) return;
    const q = (s) => scene.querySelector(s);
    const phone = q(".phone"), tablet = q(".tablet");
    const pScreen = q(".dv-ls"), tScreen = q(".lsp");
    const pList = q(".dv-ls .ls-list ul"), tList = q(".lsp-list ul");
    const pNew = q(".dv-ls .ls-row.new"), tNew = q(".lsp-row.new");
    const pTotal = q(".dv-ls .ls-total"), pCount = q(".dv-ls .ls-count");
    const tTotal = q(".lsp-total"), tCount = q(".lsp-count");
    const input = q(".dv-ls .ls-input");
    const fly = q(".dv-fly"), svg = q(".dv-path"), guide = q(".dv-path .guide"), trail = q(".dv-path .trail"), label = q(".dv-label");
    const points = Array.from(document.querySelectorAll("#devices .points li"));
    // copy and numbers come from the page, so each language owns them
    const d = scene.dataset;
    const TYPED = d.typed || "Latte 4.80";
    const START = Number(d.start || 56.5), ADD = Number(d.add || 4.8);
    const DEC = Number(d.decimals || 2), CUR = d.currency || "$";
    const money = (v) => CUR + v.toLocaleString("en-US", { minimumFractionDigits: DEC, maximumFractionDigits: DEC });
    const count = (n) => (d.countLabel || "{n} entries today").replace("{n}", String(n));
    const ease = gsap.parseEase("power3.inOut");

    const st = { type: 0, pIns: 0, flight: 0, tIns: 0 };
    let geo = null; // flight geometry, measured in the flight pose

    function rowShift(list, row, p) {
      const h = row.offsetHeight;
      gsap.set(list, { y: -h * (1 - p) });
      row.style.setProperty("--glow", String(p > 0 ? Math.max(0, 1 - Math.abs(p - 1) * 1.2) * (1 - Math.max(0, p - 0.999)) : 0));
    }

    function render() {
      // typing on the iPhone
      const chars = Math.round(st.type * TYPED.length);
      input.textContent = st.pIns > 0 ? "" : TYPED.slice(0, chars);
      pScreen.classList.toggle("is-typing", chars > 0 && st.pIns === 0);
      pScreen.classList.toggle("is-chip", st.type > 0.97 && st.pIns < 0.35);
      // logged on the iPhone
      rowShift(pList, pNew, ease(st.pIns));
      pNew.style.setProperty("--glow", String(st.pIns > 0 && st.flight < 1 ? 1 : 0));
      pTotal.textContent = money(START + ADD * ease(st.pIns));
      pCount.textContent = count(st.pIns > 0.5 ? 5 : 4);
      pScreen.classList.toggle("is-bump", st.pIns > 0.2 && st.pIns < 1);
      // flight: out of the iPhone, up over the iPad through iCloud, down into its list
      if (geo) {
        const t = ease(st.flight);
        const p = bezier(geo, t);
        const grow = Math.sin(Math.PI * t);
        const base = 1 + (geo.b.w / geo.a.w - 1) * t;
        const fade = Math.min(1, st.flight / 0.04) * (1 - span(st.flight, 0.88, 1));
        gsap.set(fly, { x: p.x, y: p.y, scale: base * (1 + grow * 0.55), rotation: grow * -5, opacity: st.flight > 0 && st.flight < 1 ? fade : 0, xPercent: -50, yPercent: -50 });
        const showPath = st.flight > 0 && st.tIns < 0.6;
        trail.style.strokeDashoffset = String(1 - t);
        trail.style.opacity = showPath ? "1" : "0";
        guide.style.opacity = showPath ? "0.5" : "0";
        label.style.opacity = st.flight > 0 && st.tIns < 0.8 ? String(Math.min(1, st.flight * 4) * (1 - span(st.tIns, 0.3, 0.8))) : "0";
      }
      // landed on the iPad
      rowShift(tList, tNew, ease(st.tIns));
      tNew.style.setProperty("--glow", String(st.tIns > 0 && st.tIns < 1 ? 1 : 0));
      tTotal.textContent = money(START + ADD * ease(st.tIns));
      tCount.textContent = count(st.tIns > 0.5 ? 5 : 4);
      tScreen.classList.toggle("is-bump", st.tIns > 0.15 && st.tIns < 1);
    }

    const span = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));
    function bezier(g, t) {
      const m = 1 - t;
      return {
        x: m * m * m * g.a.x + 3 * m * m * t * g.c1.x + 3 * m * t * t * g.c2.x + t * t * t * g.b.x,
        y: m * m * m * g.a.y + 3 * m * m * t * g.c1.y + 3 * m * t * t * g.c2.y + t * t * t * g.b.y,
      };
    }

    function centerOf(el) {
      const r = el.getBoundingClientRect(), s = scene.getBoundingClientRect();
      return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, w: r.width, h: r.height };
    }

    // devices pose, scrubbed
    const tl = gsap.timeline({
      defaults: { ease: "power3.out" },
      onUpdate: render,
      scrollTrigger: {
        trigger: window.matchMedia("(min-width: 861px)").matches ? scene.closest(".split") || scene : scene,
        start: "center center", end: () => `+=${Math.round(window.innerHeight * 3.2)}`,
        pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true,
        onRefresh: measure,
      },
    });
    tl.set(tablet, { transformPerspective: 1600, rotationY: 34, rotationX: 8, x: "26%", z: -420, opacity: 0 }, 0)
      .set(phone, { transformPerspective: 1600, rotationY: -26, rotationX: 18, y: "45%", opacity: 0 }, 0)
      // both arrive, showing the same Now screen
      .to(tablet, { rotationY: -9, rotationX: 3, x: "0%", z: 0, opacity: 1, duration: 1.1 }, 0)
      .to(phone, { rotationY: 10, rotationX: 3, y: "0%", opacity: 1, duration: 1.1 }, 0.12)
      // type it on the iPhone, then log it
      .to(st, { type: 1, duration: 0.9, ease: "none" }, 1.5)
      .to(st, { pIns: 1, duration: 0.6, ease: "none" }, 2.5)
      // it travels through iCloud to the iPad
      .to(st, { flight: 1, duration: 1.3, ease: "none" }, 3.2)
      // and lands in the iPad's list and total
      .to(st, { tIns: 1, duration: 0.7, ease: "none" }, 4.35)
      // both settle facing you
      .to(tablet, { rotationY: -4, rotationX: 1, duration: 0.9 }, 5.2)
      .to(phone, { rotationY: 5, rotationX: 1, duration: 0.9 }, 5.2)
      .to({}, { duration: 0.5 });
    const FLIGHT_AT = 3.2;

    // Measure where the latte leaves (the iPhone row) and lands (the iPad's first row), in the flight pose.
    function measure() {
      const saved = tl.time();
      tl.time(FLIGHT_AT, true);
      gsap.set(pList, { y: 0 });
      gsap.set(tList, { y: 0 });
      const a = centerOf(pNew), b = centerOf(tNew);
      const W = scene.clientWidth, H = scene.clientHeight;
      fly.style.width = `${a.w}px`;
      fly.style.height = `${a.h}px`;
      fly.style.fontSize = `${a.w / 24}px`;
      // rise straight out of the phone, arc over the top of the iPad, come down into its list
      const c1 = { x: a.x - W * 0.02, y: a.y - H * 0.95 };
      const c2 = { x: b.x - W * 0.25, y: -H * 0.2 };
      geo = { a, b, c1, c2 };
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const d = `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
      guide.setAttribute("d", d);
      trail.setAttribute("d", d);
      const topOf = () => { let t = { x: 0, y: Infinity }; for (let i = 0; i <= 40; i++) { const p = bezier(geo, i / 40); if (p.y < t.y) t = p; } return t; };
      const ROOM = 52; // px kept free at the top of the stage for the iCloud label
      let top = topOf();
      for (let k = 0; k < 30 && top.y < ROOM; k++) { c1.y += 12; c2.y += 12; top = topOf(); }
      const d2 = `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
      guide.setAttribute("d", d2);
      trail.setAttribute("d", d2);
      gsap.set(label, { left: top.x, top: Math.max(14, top.y - 30) });
      tl.time(saved, true);
      render();
    }
    measure();
    // this pin is created after the scenes.js pins: re-sort so the sections below account for its spacing
    ScrollTrigger.sort();
    ScrollTrigger.refresh();
    tl.eventCallback("onUpdate", () => {
      render();
      const t = tl.time();
      const step = t < 3.2 ? 0 : t < 4.4 ? 2 : 1; // log → iCloud → one subscription
      points.forEach((li, i) => li.classList.toggle("is-on", i === step));
    });
  }
})();

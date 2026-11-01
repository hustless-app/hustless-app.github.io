// hustless landing — 3D and scroll scenes (GSAP + ScrollTrigger, self-hosted in /assets/vendor).
// Every scene's static markup is already the finished state; this file only adds motion.
//   hero     the chat window flies in, settles like a device and breathes while the AI is typing
//   rail     reminders: a swipeable 3D coverflow of real screens
//   live     the Now screen tilts as it scrolls by
//   cube     Insights: a 3D cube turned by scroll, six faces, charts draw on arrival
//   devices  iPhone → iCloud → iPad, scrubbed by scroll in both directions
//   manifesto words come into focus as you read down

(() => {
  "use strict";

  const root = document.documentElement;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function finishIntro() {
    root.classList.remove("intro-pending");
    document.dispatchEvent(new Event("hustless:intro-done"));
  }

  const { gsap, ScrollTrigger } = window;
  if (!gsap || !ScrollTrigger) {
    finishIntro();
    console.error("[hustless scenes] GSAP failed to load; showing static scenes");
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  // Split a heading into word spans without touching its inline markup.
  function splitWords(element) {
    const lang = root.lang || "en";
    const segmenter = "Segmenter" in Intl ? new Intl.Segmenter(lang, { granularity: "word" }) : null;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    const words = [];
    textNodes.forEach((node) => {
      const parts = segmenter ? Array.from(segmenter.segment(node.data), (s) => s.segment) : node.data.split(/(\s+)/);
      const fragment = document.createDocumentFragment();
      parts.forEach((part) => {
        if (!part) return;
        if (part.trim() === "") { fragment.append(part); return; }
        const span = document.createElement("span");
        span.className = "w";
        span.textContent = part;
        words.push(span);
        fragment.append(span);
      });
      node.replaceWith(fragment);
    });
    return words;
  }

  /* ---------------- hero ---------------- */
  function initHero() {
    const outer = document.querySelector(".demo-3d");
    const inner = document.querySelector("[data-demo]");
    if (!outer || !inner || prefersReducedMotion.matches) { finishIntro(); return; }

    const REST = { rotationY: -5, rotationX: 3 };
    gsap.set(outer, { transformPerspective: 1600, transformOrigin: "50% 60%", rotationY: -52, rotationX: 24, rotationZ: -9, x: 150, y: 110, z: -420, opacity: 0 });
    root.classList.remove("intro-pending"); // the inline start pose holds it from here

    let isSettled = false;
    const tiltY = gsap.quickTo(outer, "rotationY", { duration: 0.9, ease: "power3.out" });
    const tiltX = gsap.quickTo(outer, "rotationX", { duration: 0.9, ease: "power3.out" });

    function idle() {
      isSettled = true;
      gsap.to(inner, { y: -7, rotationX: 2.2, duration: 3.4, ease: "sine.inOut", yoyo: true, repeat: -1 });
    }

    function enter() {
      gsap.timeline({ onComplete: () => { document.dispatchEvent(new Event("hustless:intro-done")); idle(); } })
        .to(outer, { opacity: 1, duration: 0.55, ease: "power1.out" }, 0)
        .to(outer, { rotationY: 16, rotationX: -7, rotationZ: 2.5, x: 0, y: -14, z: 60, duration: 1.15, ease: "power3.out" }, 0)
        .to(outer, { ...REST, rotationZ: 0, y: 0, z: 0, duration: 1.1, ease: "elastic.out(1, 0.5)" }, ">-0.12");
    }

    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      enter();
    }, { threshold: 0.25 });
    io.observe(outer);

    // "Thinking": while the dots show, the device leans in and sways a little.
    const sway = gsap.timeline({ paused: true, repeat: -1, yoyo: true })
      .to(inner, { rotationZ: 1.1, z: 18, duration: 0.55, ease: "sine.inOut" });
    inner.addEventListener("demo:typing", (event) => {
      if (event.detail) { sway.play(); return; }
      sway.pause();
      gsap.to(inner, { rotationZ: 0, z: 0, duration: 0.5, ease: "power3.out" });
    });
    // Next conversation: a quick turn, like flipping to a new chat.
    inner.addEventListener("demo:next", () => {
      if (!isSettled) return;
      gsap.timeline()
        .to(outer, { rotationY: REST.rotationY + 22, duration: 0.28, ease: "power2.in" })
        .to(outer, { rotationY: REST.rotationY, duration: 1, ease: "elastic.out(1, 0.55)" });
    });

    // Desktop: the device follows the pointer, and its glass sheen moves with it.
    if (finePointer.matches) {
      const hero = document.querySelector(".hero") || document.body;
      hero.addEventListener("pointermove", (event) => {
        if (!isSettled) return;
        const nx = event.clientX / window.innerWidth - 0.5;
        const ny = event.clientY / window.innerHeight - 0.5;
        tiltY(REST.rotationY + nx * 14);
        tiltX(REST.rotationX - ny * 10);
        inner.style.setProperty("--sheen", `${40 + nx * 60}%`);
      });
      hero.addEventListener("pointerleave", () => { if (isSettled) { tiltY(REST.rotationY); tiltX(REST.rotationX); } });
    }
  }

  /* ---------------- reminders rail ---------------- */
  function initRail() {
    const rail = document.querySelector("[data-rail]");
    if (!rail) return;
    const track = rail.querySelector(".rail-track");
    const cards = Array.from(track.children);
    const dots = Array.from(rail.querySelectorAll(".rail-dots button"));
    if (cards.length === 0) return;

    const AUTO_MS = 5200;
    const USER_PAUSE_MS = 9000;
    let active = -1;
    let isTicking = false;
    let isVisible = false;
    let pausedUntil = 0;

    function setActive(index) {
      active = index;
      cards.forEach((card, i) => card.classList.toggle("is-active", i === index));
      dots.forEach((dot, i) => dot.setAttribute("aria-current", String(i === index)));
    }

    function render() {
      isTicking = false;
      const mid = track.scrollLeft + track.clientWidth / 2;
      let best = 0;
      let bestDistance = Infinity;
      cards.forEach((card, i) => {
        const step = card.offsetWidth + parseFloat(getComputedStyle(track).columnGap || "0");
        const offset = (card.offsetLeft + card.offsetWidth / 2 - mid) / step;
        const a = clamp(offset, -1.8, 1.8);
        const innerEl = card.firstElementChild;
        if (!prefersReducedMotion.matches) {
          innerEl.style.transform = `rotateY(${-a * 28}deg) translateZ(${-Math.abs(a) * 110}px) scale(${1 - Math.min(Math.abs(a), 1) * 0.06})`;
        }
        innerEl.style.opacity = String(1 - Math.min(Math.abs(offset), 2) * 0.3);
        if (Math.abs(offset) < bestDistance) { bestDistance = Math.abs(offset); best = i; }
      });
      if (best !== active) setActive(best);
    }
    const onScroll = () => { if (!isTicking) { isTicking = true; requestAnimationFrame(render); } };

    function goTo(index) {
      const card = cards[(index + cards.length) % cards.length];
      track.scrollTo({ left: card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2, behavior: prefersReducedMotion.matches ? "auto" : "smooth" });
    }
    const userPause = () => { pausedUntil = performance.now() + USER_PAUSE_MS; };

    rail.querySelector(".rail-btn.prev").addEventListener("click", () => { userPause(); goTo(active - 1); });
    rail.querySelector(".rail-btn.next").addEventListener("click", () => { userPause(); goTo(active + 1); });
    dots.forEach((dot, i) => dot.addEventListener("click", () => { userPause(); goTo(i); }));
    ["pointerdown", "wheel", "keydown", "touchstart"].forEach((type) => track.addEventListener(type, userPause, { passive: true }));
    track.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    // Mouse drag on desktop (touch already swipes natively).
    let drag = null;
    track.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse") return;
      drag = { x: event.clientX, left: track.scrollLeft, moved: false };
      track.style.scrollSnapType = "none";
      track.setPointerCapture(event.pointerId);
    });
    track.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      if (Math.abs(dx) > 3) drag.moved = true;
      track.scrollLeft = drag.left - dx;
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      track.style.scrollSnapType = "";
      goTo(active);
    };
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);

    new IntersectionObserver((entries) => { isVisible = entries.some((e) => e.isIntersecting); }, { threshold: 0.4 }).observe(rail);
    setInterval(() => {
      if (!isVisible || document.hidden || drag || performance.now() < pausedUntil || prefersReducedMotion.matches) return;
      goTo(active + 1 >= cards.length ? 0 : active + 1);
    }, AUTO_MS);

    rail.classList.add("is-armed");
    render();
  }

  /* ---------------- live Now screen tilt ---------------- */
  function initLiveTilt() {
    const phone = document.querySelector(".phones .phone.live");
    if (!phone) return;
    gsap.fromTo(phone,
      { transformPerspective: 1200, rotationY: 20, rotationX: 10, rotationZ: -3 },
      { rotationY: -14, rotationX: -6, rotationZ: -3, ease: "none", scrollTrigger: { trigger: phone, start: "top bottom", end: "bottom top", scrub: 0.6 } });
  }

  /* ---------------- insights cube ---------------- */
  const CUBE_SIDES = [[0, 4], [1, 5], [2], [3]];

  function makeCube(scene) {
    const cube = scene.querySelector(".cube");
    const sides = Array.from(scene.querySelectorAll(".cube-side"));
    const pages = Array.from(scene.querySelectorAll(".cube-page"));
    const steps = Array.from(scene.querySelectorAll(".cube-steps li"));
    const dots = Array.from(scene.querySelectorAll(".cube-dots i"));
    const aiBody = scene.querySelector(".cp-ai .body");
    const aiText = aiBody ? aiBody.dataset.typeText || aiBody.textContent : "";
    let current = -1;
    let typer = 0;

    function typeInsight() {
      if (!aiBody) return;
      clearInterval(typer);
      if (prefersReducedMotion.matches) { aiBody.textContent = aiText; return; }
      const chars = Array.from(aiText);
      let shown = 0;
      const caret = document.createElement("span");
      caret.className = "caret";
      aiBody.textContent = "";
      aiBody.append(document.createTextNode(""), caret);
      typer = setInterval(() => {
        shown = Math.min(chars.length, shown + 2);
        aiBody.firstChild.data = chars.slice(0, shown).join("");
        if (shown >= chars.length) { clearInterval(typer); setTimeout(() => caret.remove(), 1200); }
      }, 28);
    }

    function setCurrent(index) {
      if (index === current) return;
      current = index;
      pages.forEach((page) => page.classList.toggle("is-live", Number(page.dataset.page) === index));
      steps.forEach((step, i) => step.classList.toggle("is-on", i === index));
      dots.forEach((dot, i) => dot.classList.toggle("on", i === index));
      if (index === 5) typeInsight(); else { clearInterval(typer); if (aiBody) aiBody.textContent = aiText; }
    }

    // r is the face position, 0…5 (fractions while turning)
    function show(r) {
      cube.style.setProperty("--ry", `${-r * 90}deg`);
      sides.forEach((side, s) => {
        const page = CUBE_SIDES[s].reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a));
        side.querySelectorAll(".cube-page").forEach((p) => p.classList.toggle("is-shown", Number(p.dataset.page) === page));
        let angle = ((s * 90 - r * 90) % 360 + 540) % 360 - 180; // -180…180, 0 = facing us
        side.style.setProperty("--shade", (Math.min(1, Math.abs(angle) / 90) * 0.6).toFixed(3));
      });
      setCurrent(clamp(Math.round(r), 0, 5));
    }

    scene.classList.add("is-armed");
    return { show };
  }

  function initCube() {
    const scene = document.querySelector("[data-cube-scene]");
    if (!scene) return;
    const { show } = makeCube(scene);
    const phone = scene.querySelector(".cube-phone");
    const state = { r: 0 };
    show(0);

    const tl = gsap.timeline({
      defaults: { ease: "power2.inOut" },
      onUpdate: () => show(state.r),
      scrollTrigger: {
        trigger: scene,
        start: () => (scene.offsetHeight > window.innerHeight ? "bottom bottom" : "center center"),
        end: () => `+=${Math.round(window.innerHeight * 4.4)}`,
        pin: true, scrub: 0.7, anticipatePin: 1, invalidateOnRefresh: true,
      },
    });
    tl.to({}, { duration: 0.45 });
    for (let face = 1; face < 6; face++) tl.to(state, { r: face, duration: 1 }).to({}, { duration: 0.55 });
    tl.fromTo(phone, { rotationY: 12, rotationX: 4, transformPerspective: 1400 }, { rotationY: -10, rotationX: -2, ease: "none", duration: tl.duration() }, 0);
  }

  // The cube without scroll-jacking: it turns on its own while on screen, and follows a horizontal
  // swipe or drag like the app's cube. Vertical scrolling stays the page's (touch-action: pan-y).
  function initCubeSwipe() {
    const scene = document.querySelector("[data-cube-scene]");
    if (!scene) return;
    const { show } = makeCube(scene);
    const view = scene.querySelector(".cube-view");
    const steps = Array.from(scene.querySelectorAll(".cube-steps li"));
    const dots = Array.from(scene.querySelectorAll(".cube-dots i"));
    const LAST = 5, AUTO_MS = 3600, USER_PAUSE_MS = 9000;
    const state = { r: 0 };
    let tween = null, isVisible = false, pausedUntil = 0, drag = null;
    const render = () => show(Math.min(LAST, Math.max(0, state.r)));
    function goTo(face, duration = 0.95) {
      if (tween) tween.kill();
      const to = Math.min(LAST, Math.max(0, face));
      tween = gsap.to(state, { r: to, duration: duration * Math.max(1, Math.abs(to - state.r) * 0.45), ease: "power3.inOut", onUpdate: render });
    }
    const pause = () => { pausedUntil = performance.now() + USER_PAUSE_MS; };
    steps.forEach((li, i) => { li.style.cursor = "pointer"; li.addEventListener("click", () => { pause(); goTo(i); }); });
    dots.forEach((dot, i) => dot.addEventListener("click", () => { pause(); goTo(i); }));

    view.addEventListener("pointerdown", (e) => {
      if (tween) tween.kill();
      drag = { x: e.clientX, y: e.clientY, r: state.r, t: performance.now(), lastX: e.clientX, lastT: performance.now(), v: 0, axis: null, id: e.pointerId };
      pause();
    });
    view.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (drag.axis === "x") view.setPointerCapture(drag.id);
      }
      if (drag.axis !== "x") return;
      const now = performance.now();
      drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT);
      drag.lastX = e.clientX; drag.lastT = now;
      state.r = Math.min(LAST + 0.25, Math.max(-0.25, drag.r - dx / view.clientWidth));
      render();
    });
    const end = () => {
      if (!drag) return;
      const fling = drag.axis === "x" ? -drag.v * 0.35 : 0; // px/ms → faces
      const target = drag.axis === "x" ? Math.round(state.r + Math.max(-1, Math.min(1, fling))) : Math.round(state.r);
      drag = null;
      goTo(target, 0.6);
    };
    view.addEventListener("pointerup", end);
    view.addEventListener("pointercancel", end);
    view.style.touchAction = "pan-y";

    new IntersectionObserver((entries) => { isVisible = entries.some((e) => e.isIntersecting); }, { threshold: 0.5 }).observe(scene);
    setInterval(() => {
      if (!isVisible || document.hidden || drag || performance.now() < pausedUntil) return;
      const next = Math.round(state.r) >= LAST ? 0 : Math.round(state.r) + 1;
      goTo(next, next === 0 ? 0.7 : 0.95);
    }, AUTO_MS);
    show(0);
  }

  // Reduced motion: no scrubbing; the cube changes face every few seconds, without turning.
  function initCubeStill() {
    const scene = document.querySelector("[data-cube-scene]");
    if (!scene) return;
    const { show } = makeCube(scene);
    let face = 0;
    let isVisible = false;
    show(0);
    new IntersectionObserver((entries) => { isVisible = entries.some((e) => e.isIntersecting); }, { threshold: 0.4 }).observe(scene);
    setInterval(() => { if (isVisible && !document.hidden) { face = (face + 1) % 6; show(face); } }, 5000);
  }

  /* ---------------- devices ---------------- */
  function initDevices(isWide) {
    const scene = document.querySelector(".devices");
    if (!scene) return;
    const q = (s) => scene.querySelector(s);
    const tablet = q(".tablet");
    const phone = q(".phone");
    const row = q(".dv-row");
    const toast = q(".dv-toast");
    const orb = q(".dv-orb");
    const guide = q("#sync-path");
    const trail = q(".sync-arc .trail");
    const label = q(".sync-label");
    const chipFrom = q(".sync-chip.from");
    const chipTo = q(".sync-chip.to");
    const points = Array.from(document.querySelectorAll("#devices .points li"));
    if (!tablet || !phone || !guide || !orb) return;
    scene.classList.add("is-scrubbed");

    const length = guide.getTotalLength();
    const travel = { t: 0 };
    const placeOrb = () => {
      const p = guide.getPointAtLength(travel.t * length);
      const k = scene.clientWidth / 100; // the SVG viewBox is 100 units wide
      gsap.set(orb, { x: p.x * k, y: p.y * k });
      if (trail) trail.style.strokeDashoffset = String(1 - travel.t);
    };

    const pinTarget = isWide ? scene.closest(".split") || scene : scene;
    const tl = gsap.timeline({
      defaults: { ease: "power3.out" },
      scrollTrigger: {
        trigger: pinTarget, start: "center center", end: () => `+=${Math.round(window.innerHeight * 2.8)}`,
        pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true,
      },
    });

    tl.set([row, toast, orb, label, chipFrom, chipTo, guide], { opacity: 0 }, 0) // the iPad toast replaces the second chip here
      .set(tablet, { transformPerspective: 1600, rotationY: 40, rotationX: 10, x: "28%", z: -560, opacity: 0 }, 0)
      .set(phone, { transformPerspective: 1600, rotationY: -28, rotationX: 22, y: "60%", z: 160, opacity: 0 }, 0)
      // 1. the iPhone arrives and an expense is logged on it
      .to(phone, { y: "0%", rotationX: 8, rotationY: -18, z: 70, opacity: 1, duration: 1.2 }, 0)
      .fromTo(row, { opacity: 0, scale: 0.9, yPercent: -70 }, { opacity: 1, scale: 1, yPercent: 0, duration: 0.6, ease: "back.out(1.6)" }, 1.2)
      .fromTo(chipFrom, { opacity: 0, y: 14, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.5 }, 1.45)
      // 2. the iPad rises out of the depth beside it
      .to(tablet, { rotationY: -12, rotationX: 4, x: "0%", z: 0, opacity: 1, duration: 1.5 }, 2.1)
      .to(phone, { rotationY: 14, rotationX: 4, z: 40, duration: 1.5 }, 2.1)
      .to([guide, label], { opacity: 1, duration: 0.5 }, 3.0)
      // 3. through iCloud, along the arc
      .to(orb, { opacity: 1, duration: 0.2 }, 3.5)
      .to(travel, { t: 1, duration: 1.4, ease: "power1.inOut", onUpdate: placeOrb }, 3.5)
      // 4. it lands on the iPad
      .to(orb, { opacity: 0, scale: 2.2, duration: 0.35, ease: "power2.out" }, 4.9)
      .fromTo(toast, { opacity: 0, y: -16, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.5)" }, 4.85)
      .to(tablet, { scale: 1.02, duration: 0.25, yoyo: true, repeat: 1, ease: "sine.inOut" }, 4.9)
      // 5. both settle facing you
      .to(tablet, { rotationY: -5, rotationX: 2, duration: 1 }, 5.6)
      .to(phone, { rotationY: 6, rotationX: 2, z: 20, duration: 1 }, 5.6)
      .to({}, { duration: 0.6 });

    placeOrb();
    tl.eventCallback("onUpdate", () => {
      const t = tl.time();
      const step = t < 3.4 ? 0 : t < 4.9 ? 2 : 1; // log → iCloud → one subscription
      points.forEach((li, i) => li.classList.toggle("is-on", i === step));
    });
  }

  /* ---------------- manifesto ---------------- */
  function initManifesto() {
    const section = document.querySelector(".manifesto");
    const heading = section && section.querySelector(".big");
    if (!heading) return;
    const words = heading.querySelector(".w") ? Array.from(heading.querySelectorAll(".w")) : splitWords(heading);
    const accent = Array.from(heading.querySelectorAll(".voice .w"));
    const cols = Array.from(section.querySelectorAll(".cols > *"));
    const glow = { v: 0 };

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: () => (section.offsetHeight > window.innerHeight ? "bottom bottom" : "top top"),
        end: () => `+=${Math.round(window.innerHeight * 1.7)}`,
        pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true,
      },
    });
    tl.fromTo(words,
      { opacity: 0.06, filter: "blur(14px)", yPercent: 60, rotationX: -55, transformPerspective: 600, transformOrigin: "50% 100%" },
      { opacity: 1, filter: "blur(0px)", yPercent: 0, rotationX: 0, stagger: 0.14, duration: 0.9, ease: "power3.out" })
      .to(glow, { v: 1, duration: 1.2, ease: "power1.inOut", onUpdate: () => { section.style.setProperty("--glow", glow.v.toFixed(3)); section.style.setProperty("--glow-scale", (0.6 + glow.v * 0.5).toFixed(3)); } }, 0.6)
      .to(accent, { scale: 1.06, textShadow: "0 0 32px rgba(214, 166, 118, 0.6)", duration: 0.6, ease: "power2.out" }, ">-0.5")
      .fromTo(cols, { opacity: 0, y: 44 }, { opacity: 1, y: 0, stagger: 0.16, duration: 0.7, ease: "power3.out" }, ">-0.2")
      .to({}, { duration: 0.5 });
  }

  /* ---------------- boot ---------------- */
  initHero();
  initRail();
  const media = gsap.matchMedia();
  media.add({
    motion: "(prefers-reduced-motion: no-preference)",
    still: "(prefers-reduced-motion: reduce)",
    wide: "(min-width: 861px)",
  }, (context) => {
    const { motion, still, wide } = context.conditions;
    if (still) { initCubeStill(); return; }
    if (!motion) return;
    if (root.dataset.variant !== "c") initLiveTilt(); // preview C explodes the live screen instead (assets/c/c.js)
    if (root.dataset.variant === "c") initCubeSwipe(); else initCube(); // C: swipe, no scroll pinning
    if (root.dataset.world !== "devices" && root.dataset.variant !== "c") initDevices(wide); // WebGL (preview B) and preview C own it otherwise
    if (root.dataset.world !== "story") initManifesto(); // preview A reads the manifesto over its 3D world
  });
  window.addEventListener("load", () => ScrollTrigger.refresh());
})();

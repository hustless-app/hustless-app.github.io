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
    const real = Array.from(track.children).filter((c) => !c.hasAttribute("data-clone"));
    const dots = Array.from(rail.querySelectorAll(".rail-dots button"));
    if (real.length === 0) return;
    // a copy of the first screen after the last one, so autoplay can keep going forward: 1 → 6 → 1 (the swap back is unseen)
    let clone = track.querySelector("[data-clone]");
    if (!clone) {
      clone = real[0].cloneNode(true);
      clone.setAttribute("data-clone", "");
      clone.setAttribute("aria-hidden", "true");
      clone.removeAttribute("data-card");
      track.append(clone);
    }
    const N = real.length;
    const cards = [...real, clone];
    if (rail._bound) { rail._bound.activate(); return; } // already wired: the ring may have been on top of it

    const AUTO_MS = 5200;
    const USER_PAUSE_MS = 9000;
    let active = -1;
    let isTicking = false;
    let isVisible = false;
    let pausedUntil = 0;

    function setActive(index) {
      active = index;
      cards.forEach((card, i) => card.classList.toggle("is-active", i === index || (index === N && i === 0)));
      dots.forEach((dot, i) => dot.setAttribute("aria-current", String(i === index % N)));
    }

    function render() {
      isTicking = false;
      if (rail.classList.contains("is-ring")) return;
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

    // Programmatic scrolling is a tween on scrollLeft with snapping suspended: native smooth scrollTo against
    // scroll-snap stalls on iOS Safari (the rail got to 6 and never came back to 1).
    let scrollTween = null;
    const stopTween = () => { if (scrollTween) { scrollTween.kill(); scrollTween = null; track.style.scrollSnapType = ""; } };
    const posOf = (i) => cards[i].offsetLeft - (track.clientWidth - cards[i].offsetWidth) / 2;
    const jump = (i) => { // an instant, unseen swap between a screen and its copy
      track.style.scrollSnapType = "none";
      track.scrollLeft = posOf(i);
      requestAnimationFrame(() => { track.style.scrollSnapType = ""; });
    };
    function goTo(index) {
      stopTween();
      if (active === N && index !== N - 1) { jump(0); if (index > N) index -= N; } // resting on the copy: carry on from the real first screen
      if (index < 0) { jump(N); index = N - 1; }                                    // before the first: from its copy, back to the last
      if (index > N) index -= N;
      const left = posOf(index);
      if (prefersReducedMotion.matches) { track.scrollLeft = left; if (index === N) jump(0); return; }
      const proxy = { x: track.scrollLeft };
      track.style.scrollSnapType = "none";
      scrollTween = gsap.to(proxy, {
        x: left, duration: Math.min(1.5, 0.6 + Math.abs(left - proxy.x) / 1800), ease: "power3.inOut",
        onUpdate: () => { track.scrollLeft = proxy.x; },
        onComplete: () => {
          track.scrollLeft = left; scrollTween = null;
          if (index === N) jump(0); else track.style.scrollSnapType = "";
        },
      });
    }
    const userPause = () => { pausedUntil = performance.now() + USER_PAUSE_MS; stopTween(); };

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
      if (rail.classList.contains("is-ring") || !isVisible || document.hidden || drag || performance.now() < pausedUntil || prefersReducedMotion.matches) return;
      goTo(active + 1);
    }, AUTO_MS);

    rail.classList.add("is-armed");
    rail._bound = { activate: () => { rail.classList.add("is-armed"); cards.forEach((c) => { c.style.transform = ""; c.style.opacity = ""; c.style.filter = ""; c.style.zIndex = ""; }); render(); goTo(Math.max(0, active)); } };
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
  // page 6 is a copy of page 0 on the back side, so the cube can keep turning from the last face to the first
  const CUBE_SIDES = [[0, 4], [1, 5], [2, 6], [3]];

  function makeCube(scene) {
    const cube = scene.querySelector(".cube");
    const sides = Array.from(scene.querySelectorAll(".cube-side"));
    const first = scene.querySelector('.cube-page[data-page="0"]');
    const sideTwo = scene.querySelector('.cube-side[data-side="2"]');
    if (first && sideTwo && !sideTwo.querySelector('.cube-page[data-page="6"]')) {
      const copy = first.cloneNode(true);
      copy.dataset.page = "6";
      copy.classList.remove("is-shown", "is-live");
      sideTwo.append(copy);
    }
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
      pages.forEach((page) => page.classList.toggle("is-live", Number(page.dataset.page) % 6 === index));
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
      setCurrent(((Math.round(r) % 6) + 6) % 6);
    }

    // run the current face's charts (and typing) again, e.g. when the scene scrolls into view
    function replay() {
      pages.forEach((page) => page.classList.remove("is-live"));
      void scene.offsetWidth;
      pages.forEach((page) => page.classList.toggle("is-live", Number(page.dataset.page) % 6 === current));
      if (current === 5) typeInsight();
    }

    // how long face i's own preview takes to play: its longest transition (delay included), or the typed insight
    const previewCache = new Map();
    function previewMs(i) {
      if (previewCache.has(i)) return previewCache.get(i);
      const toMs = (v) => v.split(",").map((x) => (x.trim().endsWith("ms") ? parseFloat(x) : parseFloat(x) * 1000) || 0);
      let longest = 0;
      scene.querySelectorAll(`.cube-page[data-page="${i}"] .bar, .cube-page[data-page="${i}"] .seg, .cube-page[data-page="${i}"] .ln, .cube-page[data-page="${i}"] .end, .cube-page[data-page="${i}"] em, .cube-page[data-page="${i}"] .avg`).forEach((el) => {
        const cs = getComputedStyle(el), d = toMs(cs.transitionDuration), dl = toMs(cs.transitionDelay);
        d.forEach((x, k) => { longest = Math.max(longest, x + (dl[k % dl.length] || 0)); });
      });
      if (i === 5) longest = Math.max(longest, Math.ceil(Array.from(aiText).length / 2) * 28 + 400);
      previewCache.set(i, longest);
      return longest;
    }

    scene.classList.add("is-armed");
    return { show, replay, previewMs };
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

  // The six Insights screens stand on a ring in depth: the one in front is sharp and alive, the others sit
  // further round and further back, fainter with every step, their charts waiting until their turn.
  // One ring is built per page load (matchMedia may re-run the init); screens face the viewer, they are not a prism.
  const RING_N = 6, RING_STEP = 360 / RING_N, RING_RADIUS = 0.62, RING_YAW = 0.5;
  let ringBuilt = null;
  const wrapIndex = (n) => ((n % RING_N) + RING_N) % RING_N;

  function makeRing(scene) {
    if (ringBuilt) return ringBuilt;
    const stage = scene.querySelector(".cube-stage");
    const source = scene.querySelector(".cube-phone");
    const pages = Array.from(scene.querySelectorAll(".cube-page")).filter((p) => Number(p.dataset.page) < RING_N).sort((x, y) => x.dataset.page - y.dataset.page);
    const steps = Array.from(scene.querySelectorAll(".cube-steps li"));
    const aiBody = scene.querySelector(".cp-ai .body");
    const aiText = aiBody ? aiBody.dataset.typeText || aiBody.textContent : "";
    let typer = 0, current = -1;

    // a phone with the chrome (status bar, period pills, tabs) but an empty view
    const template = source.cloneNode(true);
    template.querySelector(".cube-view").replaceChildren();
    const ring = document.createElement("div");
    ring.className = "cube-ring";
    ring.setAttribute("role", "img");
    ring.setAttribute("aria-label", source.querySelector(".cube-screen").getAttribute("aria-label"));
    const items = pages.map((page, i) => {
      const item = template.cloneNode(true);
      item.classList.add("ring-phone");
      item.dataset.i = String(i);
      item.setAttribute("aria-hidden", "true");
      item.querySelector(".cube-screen").removeAttribute("role");
      item.querySelector(".cube-screen").removeAttribute("aria-label");
      item.querySelectorAll(".cube-dots i").forEach((dot, k) => dot.classList.toggle("on", k === i));
      if (!item.querySelector(":scope > .bezel")) { const bz = document.createElement("i"); bz.className = "bezel"; bz.setAttribute("aria-hidden", "true"); item.append(bz); }
      const side = document.createElement("div");
      side.className = "cube-side ring-side";
      page.classList.add("is-shown");
      side.append(page);
      item.querySelector(".cube-view").append(side);
      ring.append(item);
      return item;
    });
    source.after(ring);
    scene.classList.add("is-ring", "is-armed");

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
      pages.forEach((page, i) => page.classList.toggle("is-live", i === index)); // only the front screen plays
      items.forEach((item, i) => item.classList.toggle("is-front", i === index));
      steps.forEach((step, i) => step.classList.toggle("is-on", i === index));
      if (index === 5) typeInsight(); else { clearInterval(typer); if (aiBody) aiBody.textContent = aiText; }
    }

    // r = which screen is in front, fractions while the ring turns (any real number: the ring is a circle)
    function show(r) {
      const w = items[0].offsetWidth, R = w * RING_RADIUS;
      items.forEach((item, i) => {
        let d = ((i - r) % RING_N + RING_N) % RING_N; // 0…6
        if (d > RING_N / 2) d -= RING_N;               // -3…3 screens round the ring
        const th = d * RING_STEP * Math.PI / 180;
        const x = R * Math.sin(th), z = R * (Math.cos(th) - 1);
        const near = (1 + Math.cos(th)) / 2;           // 1 in front, 0 straight behind
        item.style.transform = `translate3d(${x.toFixed(1)}px, 0, ${z.toFixed(1)}px) rotateY(${(-th * RING_YAW * 180 / Math.PI).toFixed(2)}deg)`;
        item.style.opacity = (0.07 + 0.93 * Math.pow(near, 1.7)).toFixed(3);
        item.style.filter = near > 0.97 ? "none" : `blur(${((1 - near) * 2.2).toFixed(2)}px)`;
        item.style.zIndex = String(Math.round(near * 100));
      });
      setCurrent(wrapIndex(Math.round(r)));
    }
    function replay() {
      pages.forEach((page) => page.classList.remove("is-live"));
      void scene.offsetWidth;
      pages.forEach((page, i) => page.classList.toggle("is-live", i === current));
      if (current === 5) typeInsight();
    }
    const previewCache = new Map();
    function previewMs(i) {
      if (previewCache.has(i)) return previewCache.get(i);
      const toMs = (v) => v.split(",").map((x) => (x.trim().endsWith("ms") ? parseFloat(x) : parseFloat(x) * 1000) || 0);
      let longest = 0;
      pages[i].querySelectorAll(".bar, .seg, .ln, .end, em, .avg").forEach((el) => {
        const cs = getComputedStyle(el), d = toMs(cs.transitionDuration), dl = toMs(cs.transitionDelay);
        d.forEach((x, k) => { longest = Math.max(longest, x + (dl[k % dl.length] || 0)); });
      });
      if (i === 5) longest = Math.max(longest, Math.ceil(Array.from(aiText).length / 2) * 28 + 400);
      previewCache.set(i, longest);
      return longest;
    }
    function destroy() {
      clearInterval(typer);
      pages.forEach((page, i) => {
        const side = scene.querySelector(`.cube-side[data-side="${CUBE_SIDES.findIndex((g) => g.includes(i))}"]`);
        if (side) side.append(page);
        page.classList.remove("is-live");
      });
      ring.remove();
      scene.classList.remove("is-ring", "is-held", "is-dragging");
      ringBuilt = null;
    }
    ringBuilt = { show, replay, previewMs, ring, items, destroy };
    return ringBuilt;
  }

  // Autoplay, 1 → 6 → 1 round and round: a screen's own preview plays, then 2 s, then the ring turns to the next.
  // Hovering the ring, the arrows, a drag or a dot hold it; with no interaction for 5 s it carries on.
  // A press on the front screen (or the pause button) holds it until pressed again; a press on another screen brings it round.
  function initCubeSwipe() {
    const scene = document.querySelector("[data-cube-scene]");
    if (!scene) return;
    const { show, replay, previewMs, ring, items } = makeRing(scene);
    const steps = Array.from(scene.querySelectorAll(".cube-steps li"));
    const prevBtn = scene.querySelector(".cc-prev"), nextBtn = scene.querySelector(".cc-next"), holdBtn = scene.querySelector(".cc-hold");
    const TURN_MS = 950, GAP_MS = 2000, IDLE_MS = 5000, TAP_PX = 8;
    const state = { r: 0 };
    const off = new AbortController(), on = { signal: off.signal };
    let tween = null, isVisible = false, hasShown = false, drag = null, hovering = false, locked = false, advanceAt = Infinity;
    const face = () => wrapIndex(Math.round(state.r));
    const render = () => show(state.r);
    const arm = (ms) => { advanceAt = performance.now() + ms; };
    const dwell = (f) => TURN_MS + previewMs(f) + GAP_MS;
    // the shortest way round to screen i (so the ring never spins the long way)
    const via = (i) => { let d = wrapIndex(i - Math.round(state.r)); if (d > RING_N / 2) d -= RING_N; return Math.round(state.r) + d; };
    function goTo(target, duration = 0.95) {
      if (tween) tween.kill();
      tween = gsap.to(state, { r: target, duration: duration * Math.max(1, Math.abs(target - state.r) * 0.45), ease: "power3.inOut", onUpdate: render });
    }
    function userGo(target) {
      goTo(target);
      arm(Math.max(IDLE_MS, dwell(wrapIndex(target))));
    }
    function setLocked(isOn) {
      locked = isOn;
      scene.classList.toggle("is-held", isOn);
      if (holdBtn) { holdBtn.setAttribute("aria-pressed", String(isOn)); holdBtn.setAttribute("aria-label", isOn ? holdBtn.dataset.resume : holdBtn.dataset.hold); }
      if (!isOn) arm(GAP_MS);
    }
    steps.forEach((li, i) => { li.style.cursor = "pointer"; li.addEventListener("click", () => userGo(via(i)), on); });
    items.forEach((item, i) => item.querySelectorAll(".cube-dots i").forEach((dot, k) => dot.addEventListener("click", () => userGo(via(k)), on)));
    if (prevBtn) prevBtn.addEventListener("click", () => userGo(Math.round(state.r) - 1), on);
    if (nextBtn) nextBtn.addEventListener("click", () => userGo(Math.round(state.r) + 1), on);
    if (holdBtn) holdBtn.addEventListener("click", () => setLocked(!locked), on);

    ring.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hovering = true; }, on);
    ring.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { hovering = false; arm(IDLE_MS); } }, on);
    ring.addEventListener("pointerdown", (e) => {
      if (tween) tween.kill();
      drag = { x: e.clientX, y: e.clientY, r: state.r, lastX: e.clientX, lastT: performance.now(), v: 0, axis: null, id: e.pointerId, item: e.target.closest(".ring-phone") };
      scene.classList.add("is-dragging");
    }, on);
    ring.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.axis) {
        if (Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (drag.axis === "x") ring.setPointerCapture(drag.id);
      }
      if (drag.axis !== "x") return;
      const now = performance.now();
      drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT);
      drag.lastX = e.clientX; drag.lastT = now;
      state.r = drag.r - dx / (items[0].offsetWidth * 0.9);
      render();
    }, on);
    const end = (e) => {
      if (!drag) return;
      const wasTap = !drag.axis && e.type === "pointerup";
      const tapped = drag.item ? Number(drag.item.dataset.i) : face();
      const fling = drag.axis === "x" ? -drag.v * 0.35 : 0; // px/ms → screens
      const target = Math.round(state.r + Math.max(-1, Math.min(1, fling)));
      drag = null;
      scene.classList.remove("is-dragging");
      if (wasTap && tapped !== face()) { userGo(via(tapped)); return; } // another screen: bring it round
      if (wasTap) { goTo(Math.round(state.r), 0.6); setLocked(!locked); return; } // the front one: hold / release
      goTo(target, 0.6);
      arm(IDLE_MS);
    };
    ring.addEventListener("pointerup", end, on);
    ring.addEventListener("pointercancel", end, on);
    ring.style.touchAction = "pan-y";

    const io = new IntersectionObserver((entries) => {
      isVisible = entries.some((e) => e.isIntersecting);
      if (isVisible && !hasShown) { hasShown = true; replay(); arm(dwell(face())); }
    }, { threshold: 0.5 });
    io.observe(scene);
    const timer = setInterval(() => {
      if (!isVisible || document.hidden || drag || hovering || locked) return;
      if (performance.now() < advanceAt) return;
      const next = Math.round(state.r) + 1;
      goTo(next);
      arm(dwell(wrapIndex(next)));
    }, 200);
    show(0);
    return () => { off.abort(); clearInterval(timer); io.disconnect(); if (tween) tween.kill(); ringBuilt && ringBuilt.destroy(); };
  }

  // Reduced motion: the ring does not turn; the front screen changes every few seconds (and with the arrows).
  function initCubeStill() {
    const scene = document.querySelector("[data-cube-scene]");
    if (!scene) return;
    const { show, items } = makeRing(scene);
    const off = new AbortController(), on = { signal: off.signal };
    let face = 0, isVisible = false, heldUntil = 0, locked = false;
    const go = (f) => { face = wrapIndex(f); show(face); };
    const user = (f) => { go(f); heldUntil = performance.now() + IDLE_STILL; };
    const IDLE_STILL = 5000;
    const q = (c) => scene.querySelector(c);
    show(0);
    const io = new IntersectionObserver((entries) => { isVisible = entries.some((e) => e.isIntersecting); }, { threshold: 0.4 });
    io.observe(scene);
    if (q(".cc-prev")) q(".cc-prev").addEventListener("click", () => user(face - 1), on);
    if (q(".cc-next")) q(".cc-next").addEventListener("click", () => user(face + 1), on);
    if (q(".cc-hold")) q(".cc-hold").addEventListener("click", (e) => { locked = !locked; scene.classList.toggle("is-held", locked); e.currentTarget.setAttribute("aria-pressed", String(locked)); e.currentTarget.setAttribute("aria-label", locked ? e.currentTarget.dataset.resume : e.currentTarget.dataset.hold); }, on);
    items.forEach((item) => item.querySelectorAll(".cube-dots i").forEach((dot, k) => dot.addEventListener("click", () => user(k), on)));
    const timer = setInterval(() => { if (isVisible && !document.hidden && !locked && performance.now() > heldUntil) go(face + 1); }, 5000);
    return () => { off.abort(); clearInterval(timer); io.disconnect(); ringBuilt && ringBuilt.destroy(); };
  }

  // Phones: the Insights screens stay a cube that turns (as before), with the same rhythm and controls as the ring.
  function initCubeTurn() {
    const scene = document.querySelector("[data-cube-scene]");
    if (!scene) return;
    const { show, replay, previewMs } = makeCube(scene);
    const view = scene.querySelector(".cube-view");
    const phone = scene.querySelector(".cube-phone");
    const steps = Array.from(scene.querySelectorAll(".cube-steps li"));
    const dots = Array.from(scene.querySelectorAll(".cube-dots i"));
    const prevBtn = scene.querySelector(".cc-prev"), nextBtn = scene.querySelector(".cc-next"), holdBtn = scene.querySelector(".cc-hold");
    const LAST = 5, TURN_MS = 950, GAP_MS = 2000, IDLE_MS = 5000, TAP_PX = 8;
    const state = { r: 0 };
    const off = new AbortController(), on = { signal: off.signal };
    let tween = null, isVisible = false, hasShown = false, drag = null, hovering = false, locked = false, advanceAt = Infinity;
    const face = () => Math.min(LAST, Math.max(0, Math.round(state.r)));
    const render = () => show(Math.min(LAST + 1, Math.max(0, state.r)));
    const arm = (ms) => { advanceAt = performance.now() + ms; };
    const dwell = (f) => TURN_MS + previewMs(f) + GAP_MS;
    function goTo(target, duration = 0.95) {
      if (tween) tween.kill();
      const to = Math.min(LAST + 1, Math.max(0, target));
      tween = gsap.to(state, {
        r: to, duration: duration * Math.max(1, Math.abs(to - state.r) * 0.45), ease: "power3.inOut", onUpdate: render,
        // face 6 is face 0 seen from the back: swap to it unseen, so the cube carries on turning the same way
        onComplete: () => { if (state.r > LAST + 0.5) { state.r = 0; render(); } },
      });
    }
    function userGo(target) {
      if (target < 0) { state.r = LAST + 1; render(); } // before the first face: from the copy behind it, turn back to the last
      const to = target < 0 ? LAST : target > LAST ? LAST + 1 : target;
      goTo(to);
      arm(Math.max(IDLE_MS, dwell(to % (LAST + 1))));
    }
    function setLocked(isOn) {
      locked = isOn;
      scene.classList.toggle("is-held", isOn);
      if (holdBtn) { holdBtn.setAttribute("aria-pressed", String(isOn)); holdBtn.setAttribute("aria-label", isOn ? holdBtn.dataset.resume : holdBtn.dataset.hold); }
      if (!isOn) arm(GAP_MS);
    }
    steps.forEach((li, i) => { li.style.cursor = "pointer"; li.addEventListener("click", () => userGo(i), on); });
    dots.forEach((dot, i) => dot.addEventListener("click", () => userGo(i), on));
    if (prevBtn) prevBtn.addEventListener("click", () => userGo(face() - 1), on);
    if (nextBtn) nextBtn.addEventListener("click", () => userGo(face() + 1), on);
    if (holdBtn) holdBtn.addEventListener("click", () => setLocked(!locked), on);
    phone.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hovering = true; }, on);
    phone.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { hovering = false; arm(IDLE_MS); } }, on);
    view.addEventListener("pointerdown", (e) => {
      if (tween) tween.kill();
      drag = { x: e.clientX, y: e.clientY, r: state.r, lastX: e.clientX, lastT: performance.now(), v: 0, axis: null, id: e.pointerId };
      scene.classList.add("is-dragging");
    }, on);
    view.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.axis) {
        if (Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (drag.axis === "x") view.setPointerCapture(drag.id);
      }
      if (drag.axis !== "x") return;
      const now = performance.now();
      drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT);
      drag.lastX = e.clientX; drag.lastT = now;
      state.r = Math.min(LAST + 0.25, Math.max(-0.25, drag.r - dx / view.clientWidth));
      render();
    }, on);
    const end = (e) => {
      if (!drag) return;
      const wasTap = !drag.axis && e.type === "pointerup";
      const fling = drag.axis === "x" ? -drag.v * 0.35 : 0;
      const target = drag.axis === "x" ? Math.round(state.r + Math.max(-1, Math.min(1, fling))) : Math.round(state.r);
      drag = null;
      scene.classList.remove("is-dragging");
      if (wasTap) { goTo(target, 0.6); setLocked(!locked); return; }
      goTo(target, 0.6);
      arm(IDLE_MS);
    };
    view.addEventListener("pointerup", end, on);
    view.addEventListener("pointercancel", end, on);
    view.style.touchAction = "pan-y";
    const io = new IntersectionObserver((entries) => {
      isVisible = entries.some((e) => e.isIntersecting);
      if (isVisible && !hasShown) { hasShown = true; replay(); arm(dwell(0)); }
    }, { threshold: 0.5 });
    io.observe(scene);
    const timer = setInterval(() => {
      if (!isVisible || document.hidden || drag || hovering || locked) return;
      if (performance.now() < advanceAt) return;
      const f = face() % (LAST + 1), next = (f + 1) % (LAST + 1);
      goTo(f + 1);
      arm(dwell(next));
    }, 200);
    show(0);
    return () => { off.abort(); clearInterval(timer); io.disconnect(); if (tween) tween.kill(); };
  }

  // Reduced motion on a phone: the cube does not turn; the face changes every few seconds (and with the arrows).
  function initCubeStillFlat() {
    const scene = document.querySelector("[data-cube-scene]");
    if (!scene) return;
    const { show } = makeCube(scene);
    const off = new AbortController(), on = { signal: off.signal };
    let face = 0, isVisible = false, heldUntil = 0, locked = false;
    const go = (f) => { face = ((f % 6) + 6) % 6; show(face); };
    const user = (f) => { go(f); heldUntil = performance.now() + 5000; };
    const q = (c) => scene.querySelector(c);
    show(0);
    const io = new IntersectionObserver((entries) => { isVisible = entries.some((e) => e.isIntersecting); }, { threshold: 0.4 });
    io.observe(scene);
    if (q(".cc-prev")) q(".cc-prev").addEventListener("click", () => user(face - 1), on);
    if (q(".cc-next")) q(".cc-next").addEventListener("click", () => user(face + 1), on);
    if (q(".cc-hold")) q(".cc-hold").addEventListener("click", (e) => { locked = !locked; scene.classList.toggle("is-held", locked); e.currentTarget.setAttribute("aria-pressed", String(locked)); e.currentTarget.setAttribute("aria-label", locked ? e.currentTarget.dataset.resume : e.currentTarget.dataset.hold); }, on);
    Array.from(scene.querySelectorAll(".cube-dots i")).forEach((dot, i) => dot.addEventListener("click", () => user(i), on));
    const timer = setInterval(() => { if (isVisible && !document.hidden && !locked && performance.now() > heldUntil) go(face + 1); }, 5000);
    return () => { off.abort(); clearInterval(timer); io.disconnect(); };
  }

  // "No surprise bills" on a wide screen: the six reminder screens stand on a ring seen slightly from above, the
  // front one sharp and alive, the rest further round and deeper, smaller, fainter and turned away. Same rhythm and
  // controls as the Insights ring: a screen's own preview plays, then 2 s, then the ring turns on (1 → 6 → 1 …).
  const RAIL_RADIUS = 1.12, RAIL_YAW = 0.72, RAIL_RISE = 0.2;
  function initRailRing() {
    const rail = document.querySelector("[data-rail]");
    if (!rail) return;
    const track = rail.querySelector(".rail-track");
    const cards = Array.from(track.children).filter((c) => !c.hasAttribute("data-clone"));
    if (cards.length === 0) return;
    const N = cards.length, STEP = 360 / N;
    const dots = Array.from(rail.querySelectorAll(".rail-dots button"));
    const prevBtn = rail.querySelector(".rail-btn.prev"), nextBtn = rail.querySelector(".rail-btn.next"), holdBtn = rail.querySelector(".rail-hold");
    const TURN_MS = 950, GAP_MS = 2000, IDLE_MS = 5000, TAP_PX = 8;
    const state = { r: 0 };
    const off = new AbortController(), on = { signal: off.signal };
    const wrap = (n) => ((n % N) + N) % N;
    let tween = null, isVisible = false, hasShown = false, drag = null, hovering = false, locked = false, advanceAt = Infinity, front = -1;

    rail.classList.add("is-ring", "is-armed");
    track.scrollLeft = 0;
    cards.forEach((card) => { card.firstElementChild.style.transform = ""; card.firstElementChild.style.opacity = ""; });

    // how long a card's own preview takes (animations that finish), measured once with its is-active class on
    const previews = cards.map((card) => {
      card.classList.add("is-active");
      let longest = 0;
      card.querySelectorAll("*").forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.animationName === "none") return;
        const toMs = (v) => v.split(",").map((x) => (x.trim().endsWith("ms") ? parseFloat(x) : parseFloat(x) * 1000) || 0);
        const d = toMs(cs.animationDuration), dl = toMs(cs.animationDelay), it = cs.animationIterationCount.split(",");
        d.forEach((x, k) => { if (it[k % it.length] !== "infinite") longest = Math.max(longest, x + (dl[k % dl.length] || 0)); });
      });
      card.classList.remove("is-active");
      return longest;
    });
    const dwell = (i) => TURN_MS + previews[i] + GAP_MS;

    function setFront(i) {
      if (i === front) return;
      front = i;
      cards.forEach((card, k) => card.classList.toggle("is-active", k === i)); // only the front screen plays
      dots.forEach((dot, k) => dot.setAttribute("aria-current", String(k === i)));
    }
    function show(r) {
      const w = cards[0].offsetWidth, R = w * RAIL_RADIUS;
      cards.forEach((card, i) => {
        let d = wrap(i - r); if (d > N / 2) d -= N;
        const th = d * STEP * Math.PI / 180;
        const near = (1 + Math.cos(th)) / 2;
        const x = R * Math.sin(th), z = R * (Math.cos(th) - 1), y = -(1 - Math.cos(th)) / 2 * R * RAIL_RISE;
        card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${(-th * RAIL_YAW * 180 / Math.PI).toFixed(2)}deg)`;
        card.style.opacity = (0.06 + 0.94 * Math.pow(near, 1.8)).toFixed(3);
        card.style.filter = near > 0.97 ? "none" : `blur(${((1 - near) * 2.2).toFixed(2)}px)`;
        card.style.zIndex = String(Math.round(near * 100));
      });
      setFront(wrap(Math.round(r)));
    }
    const render = () => show(state.r);
    const face = () => wrap(Math.round(state.r));
    const arm = (ms) => { advanceAt = performance.now() + ms; };
    const via = (i) => { let d = wrap(i - Math.round(state.r)); if (d > N / 2) d -= N; return Math.round(state.r) + d; };
    function goTo(target, duration = 0.95) {
      if (tween) tween.kill();
      if (prefersReducedMotion.matches) { state.r = target; render(); return; }
      tween = gsap.to(state, { r: target, duration: duration * Math.max(1, Math.abs(target - state.r) * 0.45), ease: "power3.inOut", onUpdate: render });
    }
    function userGo(target) { goTo(target); arm(Math.max(IDLE_MS, dwell(wrap(target)))); }
    function setLocked(isOn) {
      locked = isOn;
      rail.classList.toggle("is-held", isOn);
      if (holdBtn) { holdBtn.setAttribute("aria-pressed", String(isOn)); holdBtn.setAttribute("aria-label", isOn ? holdBtn.dataset.resume : holdBtn.dataset.hold); }
      if (!isOn) arm(GAP_MS);
    }
    dots.forEach((dot, i) => dot.addEventListener("click", () => userGo(via(i)), on));
    if (prevBtn) prevBtn.addEventListener("click", () => userGo(Math.round(state.r) - 1), on);
    if (nextBtn) nextBtn.addEventListener("click", () => userGo(Math.round(state.r) + 1), on);
    if (holdBtn) holdBtn.addEventListener("click", () => setLocked(!locked), on);
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); userGo(Math.round(state.r) - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); userGo(Math.round(state.r) + 1); }
    }, on);

    track.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hovering = true; }, on);
    track.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { hovering = false; arm(IDLE_MS); } }, on);
    track.addEventListener("pointerdown", (e) => {
      if (tween) tween.kill();
      drag = { x: e.clientX, y: e.clientY, r: state.r, lastX: e.clientX, lastT: performance.now(), v: 0, axis: null, id: e.pointerId, card: e.target.closest(".rc") };
      rail.classList.add("is-dragging");
    }, on);
    track.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.axis) {
        if (Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (drag.axis === "x") track.setPointerCapture(drag.id);
      }
      if (drag.axis !== "x") return;
      const now = performance.now();
      drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT);
      drag.lastX = e.clientX; drag.lastT = now;
      state.r = drag.r - dx / (cards[0].offsetWidth * 0.9);
      render();
    }, on);
    const end = (e) => {
      if (!drag) return;
      const wasTap = !drag.axis && e.type === "pointerup";
      const tapped = drag.card ? cards.indexOf(drag.card) : face();
      const fling = drag.axis === "x" ? -drag.v * 0.35 : 0;
      const target = Math.round(state.r + Math.max(-1, Math.min(1, fling)));
      drag = null;
      rail.classList.remove("is-dragging");
      if (wasTap && tapped !== face()) { userGo(via(tapped)); return; } // another screen: bring it round
      if (wasTap) { goTo(Math.round(state.r), 0.6); setLocked(!locked); return; } // the front one: hold / release
      goTo(target, 0.6);
      arm(IDLE_MS);
    };
    track.addEventListener("pointerup", end, on);
    track.addEventListener("pointercancel", end, on);

    const io = new IntersectionObserver((entries) => {
      isVisible = entries.some((e) => e.isIntersecting);
      if (isVisible && !hasShown) { // start the first screen's preview as the ring comes into view
        hasShown = true;
        const f = front; front = -1; cards.forEach((c) => c.classList.remove("is-active")); void rail.offsetWidth; setFront(f);
        arm(dwell(face()));
      }
    }, { threshold: 0.4 });
    io.observe(rail);
    const timer = setInterval(() => {
      if (prefersReducedMotion.matches || !isVisible || document.hidden || drag || hovering || locked) return;
      if (performance.now() < advanceAt) return;
      const next = Math.round(state.r) + 1;
      goTo(next);
      arm(dwell(wrap(next)));
    }, 200);
    show(0);
    return () => {
      off.abort(); clearInterval(timer); io.disconnect(); if (tween) tween.kill();
      rail.classList.remove("is-ring", "is-held", "is-dragging");
      cards.forEach((c) => { c.style.transform = ""; c.style.opacity = ""; c.style.filter = ""; c.style.zIndex = ""; c.classList.remove("is-active"); });
    };
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

    // No pinning: the page keeps scrolling. The words come into focus once, over a few seconds, as the section arrives.
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(words,
      { opacity: 0.06, filter: "blur(14px)", yPercent: 60, rotationX: -55, transformPerspective: 600, transformOrigin: "50% 100%" },
      { opacity: 1, filter: "blur(0px)", yPercent: 0, rotationX: 0, stagger: 0.1, duration: 0.9, ease: "power3.out" })
      .to(glow, { v: 1, duration: 1.2, ease: "power1.inOut", onUpdate: () => { section.style.setProperty("--glow", glow.v.toFixed(3)); section.style.setProperty("--glow-scale", (0.6 + glow.v * 0.5).toFixed(3)); } }, 0.5)
      .to(accent, { scale: 1.06, textShadow: "0 0 32px rgba(214, 166, 118, 0.6)", duration: 0.6, ease: "power2.out" }, ">-0.5")
      .fromTo(cols, { opacity: 0, y: 44 }, { opacity: 1, y: 0, stagger: 0.16, duration: 0.7, ease: "power3.out" }, ">-0.2");
    let played = false;
    const play = () => { if (played) return; played = true; tl.play(); };
    const trigger = ScrollTrigger.create({
      trigger: section, start: "top 70%", once: true, onEnter: play,
      // arrived by an anchor link or a reload past the section: just show it
      onRefresh: (self) => { if (!played && self.scroll() > self.start + 1) { played = true; tl.progress(1); } },
    });
    return trigger;
  }

  /* ---------------- boot ---------------- */
  initHero();
  const media = gsap.matchMedia();
  media.add({
    motion: "(prefers-reduced-motion: no-preference)",
    still: "(prefers-reduced-motion: reduce)",
    wide: "(min-width: 861px)",
  }, (context) => {
    const { motion, still, wide } = context.conditions;
    const cleanups = [];
    const keep = (fn) => { if (typeof fn === "function") cleanups.push(fn); };
    // reminders: a ring in depth on a wide screen, the swipeable rail on a phone (or with reduced motion)
    if (wide && motion) keep(initRailRing()); else initRail();
    if (still) {
      keep(wide ? initCubeStill() : initCubeStillFlat());
      return () => cleanups.forEach((fn) => fn());
    }
    if (!motion) return () => cleanups.forEach((fn) => fn());
    if (root.dataset.variant !== "c") initLiveTilt(); // preview C explodes the live screen instead (assets/c/c.js)
    // insights: a ring in depth on a wide screen, the turning cube on a phone
    if (root.dataset.variant === "c") keep(wide ? initCubeSwipe() : initCubeTurn()); else initCube();
    if (root.dataset.world !== "devices" && root.dataset.variant !== "c") initDevices(wide); // WebGL (preview B) and preview C own it otherwise
    if (root.dataset.world !== "story") initManifesto(); // preview A reads the manifesto over its 3D world
    return () => cleanups.forEach((fn) => fn());
  });
  window.addEventListener("load", () => ScrollTrigger.refresh());
})();

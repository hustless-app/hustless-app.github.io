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

  initSyncVideo();
  window.addEventListener("load", () => ScrollTrigger.refresh());

  // 4. iPhone ⇄ iPad: a looping video of the sync, both directions. It plays in place (no pin) while it is on screen.
  function initSyncVideo() {
    const video = document.querySelector(".devices-video video");
    if (!video) return;
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) video.poster = video.dataset.posterDark;
    if (reduced) return; // the poster is the still
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    }, { threshold: 0.25 });
    io.observe(video);
  }

})();

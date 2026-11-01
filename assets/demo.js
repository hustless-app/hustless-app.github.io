// hustless landing — scripted "I'm here" demo. No dependencies.
// Scenarios live in the page as <script type="application/json" id="demo-data"> so each language owns its copy.
// The first scenario is also in the HTML (no JS, crawlers). With JS the chat starts empty (.is-pending,
// set before paint by early.js) and the first conversation types itself out when the demo comes into view.

(() => {
  "use strict";

  const TYPING_MS = 1100;   // the "thinking" dots
  const BETWEEN_MS = 1100;  // pause before the visitor's reply
  const READ_MS = 1100;     // pause after each AI reply
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.documentElement.classList.add("js");

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // The CSP blocks inline style attributes, so per-element CSS variables ride in data-vars="--a:1;--b:2"
  // and are applied here through the CSSOM (allowed). Without JS the stylesheet defaults stand.
  document.querySelectorAll("[data-vars]").forEach((el) => {
    el.dataset.vars.split(";").forEach((pair) => {
      const i = pair.indexOf(":");
      if (i < 1) return;
      const name = pair.slice(0, i).trim();
      if (name.startsWith("--")) el.style.setProperty(name, pair.slice(i + 1).trim());
    });
  });

  function readScenarios() {
    const node = document.getElementById("demo-data");
    if (!node) return null;
    try {
      const data = JSON.parse(node.textContent);
      const isValid = Array.isArray(data.scenarios) && data.scenarios.every(
        (s) => typeof s.label === "string" && Array.isArray(s.turns)
      );
      return isValid ? data : null;
    } catch (error) {
      console.error("[hustless demo] invalid scenario data", error);
      return null;
    }
  }

  function bubble(role, text, { closing = false, animate = false } = {}) {
    const li = document.createElement("li");
    li.className = ["msg", role, closing ? "closing" : "", animate ? "enter" : ""].filter(Boolean).join(" ");
    li.textContent = text; // textContent only — scenario copy is never parsed as HTML
    return li;
  }

  function typingIndicator() {
    const li = document.createElement("li");
    li.className = "typing";
    li.setAttribute("aria-hidden", "true");
    li.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    return li;
  }

  function initDemo() {
    const data = readScenarios();
    const root = document.querySelector("[data-demo]");
    if (!data || !root) return;
    document.documentElement.classList.add("demo-ready"); // the CSS fallback reveal is only for when this never runs

    const log = root.querySelector(".demo-log");
    const decide = root.querySelector(".demo-decide");
    const picksRow = root.querySelector(".picks");
    const pickButtons = Array.from(root.querySelectorAll(".picks button"));
    const decideButtons = Array.from(root.querySelectorAll(".decide-row button"));

    let runId = 0; // bumping it cancels any conversation still playing
    let hasDecided = false;
    let isAutoplay = true; // the demo plays itself until the visitor taps something
    let isVisible = false;
    let wakeUp = null; // resolves when the demo is back on screen

    const signal = (name, detail) => root.dispatchEvent(new CustomEvent(name, { detail }));

    function setPressed(index) {
      pickButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
      const button = pickButtons[index];
      if (!button || !picksRow || picksRow.scrollWidth <= picksRow.clientWidth) return;
      // keep the active pick in view inside its own row, never scrolling the page
      const left = button.offsetLeft - (picksRow.clientWidth - button.offsetWidth) / 2;
      picksRow.scrollTo({ left, behavior: prefersReducedMotion.matches ? "auto" : "smooth" });
    }

    function showDecision(isVisibleNow) {
      decide.hidden = !isVisibleNow;
      decideButtons.forEach((b) => { b.disabled = !isVisibleNow; });
    }

    function renderInstant(scenario) {
      log.replaceChildren(...scenario.turns.map((t) => bubble(t.role, t.text)));
      log.classList.remove("is-pending");
      showDecision(true);
    }

    // Resolves true when the conversation finished, false when something else took over.
    async function play(index) {
      const scenario = data.scenarios[index];
      if (!scenario) return false;
      const myRun = ++runId;
      hasDecided = false;
      setPressed(index);

      if (prefersReducedMotion.matches) {
        renderInstant(scenario);
        return true;
      }

      showDecision(false);
      log.replaceChildren();
      log.classList.remove("is-pending");
      for (const turn of scenario.turns) {
        if (turn.role === "ai") {
          const dots = typingIndicator();
          log.append(dots);
          signal("demo:typing", true);
          await sleep(TYPING_MS);
          dots.remove();
          signal("demo:typing", false);
          if (myRun !== runId) return false;
        } else {
          await sleep(BETWEEN_MS);
          if (myRun !== runId) return false;
        }
        log.append(bubble(turn.role, turn.text, { animate: true }));
        if (turn.role === "ai") {
          await sleep(READ_MS);
          if (myRun !== runId) return false;
        }
      }
      await sleep(BETWEEN_MS);
      if (myRun !== runId) return false;
      showDecision(true);
      return true;
    }

    function decideWith(choice) {
      if (hasDecided) return;
      const closing = data.closings[choice];
      const label = data.decisionLabels[choice];
      if (!closing || !label) return;
      hasDecided = true;
      runId++;
      showDecision(false);
      log.append(bubble("me", label, { animate: true })); // CSS turns this into a plain fade under reduced motion
      log.append(bubble("ai", closing, { closing: true, animate: true }));
    }

    function stopAutoplay() {
      isAutoplay = false;
      signal("demo:typing", false);
    }

    pickButtons.forEach((button, i) => button.addEventListener("click", () => { stopAutoplay(); play(i); }));
    decideButtons.forEach((button) => button.addEventListener("click", () => { stopAutoplay(); decideWith(button.dataset.choice); }));

    const AUTO = { DECIDE_AFTER: 1800, PRESS_MS: 300, HOLD: 4600, TURN_MS: 600 };
    const waitUntilVisible = () => (isVisible && !document.hidden)
      ? Promise.resolve()
      : new Promise((resolve) => { wakeUp = resolve; });

    // The device settles first (scenes.js), then the conversations play one after another.
    function waitForIntro() {
      if (!document.documentElement.classList.contains("intro-pending")) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => resolve();
        document.addEventListener("hustless:intro-done", done, { once: true });
        setTimeout(done, 3200); // never wait on scenes.js forever
      });
    }

    async function autoplay() {
      await waitForIntro();
      let index = 0;
      while (isAutoplay) {
        await waitUntilVisible();
        if (!isAutoplay) return;
        const finished = await play(index);
        if (!finished || !isAutoplay) return;
        await sleep(AUTO.DECIDE_AFTER);
        if (!isAutoplay) return;
        const choice = data.scenarios[index].auto;
        const button = decideButtons.find((b) => b.dataset.choice === choice);
        if (button) {
          button.classList.add("is-pressing");
          await sleep(AUTO.PRESS_MS);
          button.classList.remove("is-pressing");
        }
        if (!isAutoplay) return;
        decideWith(choice);
        await sleep(AUTO.HOLD);
        if (!isAutoplay) return;
        index = (index + 1) % data.scenarios.length;
        signal("demo:next", index);
        await sleep(prefersReducedMotion.matches ? 0 : AUTO.TURN_MS);
      }
    }

    if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
      renderInstant(data.scenarios[0]);
      return;
    }
    let hasStarted = false;
    const onVisibility = () => {
      if (isVisible && !document.hidden && wakeUp) { wakeUp(); wakeUp = null; }
    };
    new IntersectionObserver((entries) => {
      isVisible = entries.some((e) => e.isIntersecting);
      if (isVisible && !hasStarted) { hasStarted = true; autoplay(); }
      onVisibility();
    }, { threshold: 0.35 }).observe(root);
    document.addEventListener("visibilitychange", onVisibility);
  }

  initDemo();
})();

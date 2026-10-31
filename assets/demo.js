// hustless landing — scripted "I'm here" demo + sync scene pause. No dependencies.
// Scenarios live in the page as <script type="application/json" id="demo-data"> so each language owns its copy.
// The first scenario is also in the HTML (no JS, crawlers). With JS the chat starts empty (.is-pending,
// set before paint by early.js) and the first conversation types itself out when the demo comes into view.

(() => {
  "use strict";

  const TYPING_MS = 1100;
  const BETWEEN_MS = 650;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.documentElement.classList.add("js");

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const pickButtons = Array.from(root.querySelectorAll(".picks button"));
    const decideButtons = Array.from(root.querySelectorAll(".decide-row button"));

    let runId = 0; // bumping it cancels any conversation still playing
    let hasDecided = false;

    function setPressed(index) {
      pickButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
    }

    function showDecision(isVisible) {
      decide.hidden = !isVisible;
      decideButtons.forEach((b) => { b.disabled = !isVisible; });
    }

    function renderInstant(scenario) {
      log.replaceChildren(...scenario.turns.map((t) => bubble(t.role, t.text)));
      log.classList.remove("is-pending");
      showDecision(true);
    }

    async function play(index) {
      const scenario = data.scenarios[index];
      if (!scenario) return;
      const myRun = ++runId;
      hasDecided = false;
      setPressed(index);

      if (prefersReducedMotion.matches) {
        renderInstant(scenario);
        return;
      }

      showDecision(false);
      log.replaceChildren();
      log.classList.remove("is-pending");
      for (const turn of scenario.turns) {
        if (turn.role === "ai") {
          const dots = typingIndicator();
          log.append(dots);
          await sleep(TYPING_MS);
          if (myRun !== runId) return;
          dots.remove();
        } else {
          await sleep(BETWEEN_MS);
          if (myRun !== runId) return;
        }
        log.append(bubble(turn.role, turn.text, { animate: true }));
      }
      await sleep(BETWEEN_MS);
      if (myRun !== runId) return;
      showDecision(true);
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

    pickButtons.forEach((button, i) => button.addEventListener("click", () => play(i)));
    decideButtons.forEach((button) => button.addEventListener("click", () => decideWith(button.dataset.choice)));

    // Type the first conversation out once, the first time the demo is on screen.
    if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
      renderInstant(data.scenarios[0]);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      play(0);
    }, { threshold: 0.35 });
    observer.observe(root);
  }

  // Pause the sync scene while it is off screen: CSS chips via a class, the SVG dot via its own clock.
  function initDevices() {
    const scene = document.querySelector(".devices");
    if (!scene) return;
    const svg = scene.querySelector(".sync-arc");
    const setPlaying = (isPlaying) => {
      scene.classList.toggle("is-paused", !isPlaying);
      if (!svg || typeof svg.pauseAnimations !== "function") return;
      if (isPlaying) svg.unpauseAnimations(); else svg.pauseAnimations();
    };
    if (prefersReducedMotion.matches) { setPlaying(false); return; }
    if (!("IntersectionObserver" in window)) return;
    setPlaying(false);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => setPlaying(entry.isIntersecting));
    });
    observer.observe(scene);
  }

  initDemo();
  initDevices();
})();

// hustless landing — the live Now screen ("Say it. Logged."). No dependencies.
// The screen is plain HTML in the page; this only plays it. Copy and numbers come from
// <script type="application/json" id="live-data"> so each language owns its own.

(() => {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  const TIMING = {
    FIRST_DELAY: 700,   // after the phone comes into view
    LISTEN_LEAD: 520,   // mic glows before the first word
    WORD_MS: 230,       // per spoken word
    CHAR_MS: 115,       // per character for scripts without spaces
    AFTER_SPEECH: 420,
    PARSED_HOLD: 950,   // amount + category chip on screen
    COUNT_MS: 950,
    BETWEEN: 1700,
    END_HOLD: 3000,
    RESET_FADE: 420,
    ROW_SETTLE: 1700,
  };
  const MAX_ROWS = 7;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // textContent only — data is never parsed as HTML
    return node;
  }

  function readLiveData() {
    const node = document.getElementById("live-data");
    if (!node) return null;
    try {
      const data = JSON.parse(node.textContent);
      const isValid = data && typeof data.currency === "string" && data.start &&
        Number.isFinite(data.start.total) && Number.isFinite(data.start.count) &&
        Array.isArray(data.entries) && data.entries.length > 0 &&
        data.entries.every((e) => Array.isArray(e.tokens) && Number.isFinite(e.amount) && typeof e.name === "string");
      return isValid ? data : null;
    } catch (error) {
      console.error("[hustless live] invalid data", error);
      return null;
    }
  }

  function initLivePhone() {
    const screen = document.querySelector("[data-live-phone]");
    const data = readLiveData();
    if (!screen || !data) return;

    const money = new Intl.NumberFormat(data.locale || "en-US", { style: "currency", currency: data.currency });
    const fill = (template, n) => String(template).replace("{n}", String(n));
    const totalEl = screen.querySelector(".ls-total");
    const countEl = screen.querySelector(".ls-count");
    const input = screen.querySelector(".ls-input");
    const chip = screen.querySelector(".ls-cat");
    const list = screen.querySelector(".ls-list ul");
    if (!totalEl || !countEl || !input || !chip || !list) return;

    const initialRows = Array.from(list.children, (row) => row.cloneNode(true));
    let runId = 0; // bumping it cancels whatever is playing
    let total = data.start.total;
    let count = data.start.count;
    let added = []; // { ago, at } for rows added in this cycle

    function restore() {
      list.style.transition = "none";
      list.style.transform = "";
      list.replaceChildren(...initialRows.map((row) => row.cloneNode(true)));
      total = data.start.total;
      count = data.start.count;
      totalEl.textContent = money.format(total);
      countEl.textContent = fill(data.countLabel, count);
      added = [];
      input.replaceChildren();
      input.classList.remove("is-out");
      chip.textContent = "";
      screen.classList.remove("is-listening", "is-typing", "is-parsed", "is-bump", "is-resetting");
    }

    function countUp(from, to, myRun) {
      return new Promise((resolve) => {
        const start = performance.now();
        const step = (now) => {
          if (myRun !== runId) return resolve();
          const p = clamp01((now - start) / TIMING.COUNT_MS);
          const eased = 1 - Math.pow(1 - p, 4);
          totalEl.textContent = money.format(from + (to - from) * eased);
          if (p < 1) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      });
    }

    function makeRow(entry) {
      const li = el("li", "ls-row is-new");
      li.style.setProperty("--tone", entry.tone || "#33291f");
      const name = el("span", "nm", entry.name);
      name.append(el("small", null, entry.cat));
      const amount = el("span", "am", money.format(entry.amount));
      const ago = el("small", null, data.now);
      amount.append(ago);
      li.append(el("span", "ico", entry.emoji || ""), name, amount);
      return { li, ago };
    }

    // New row drops in at the top; the rows below slide down (FLIP on the list).
    function insertRow(li) {
      list.prepend(li);
      if (prefersReducedMotion.matches) return;
      const height = li.getBoundingClientRect().height;
      list.style.transition = "none";
      list.style.transform = `translateY(${-height}px)`;
      list.getBoundingClientRect(); // commit the start position
      list.style.transition = "transform 680ms cubic-bezier(0.16, 1, 0.3, 1)";
      list.style.transform = "";
    }

    function refreshAgo() {
      const now = performance.now();
      added.forEach(({ ago, at }) => {
        const seconds = Math.round((now - at) / 1000);
        ago.textContent = seconds < 2 ? data.now : fill(data.secondsAgo, seconds);
      });
    }

    async function speak(entry, myRun) {
      input.replaceChildren();
      input.classList.remove("is-out");
      chip.textContent = `${entry.emoji || ""} ${entry.cat}`.trim();
      screen.classList.add("is-listening");
      await sleep(TIMING.LISTEN_LEAD);
      if (myRun !== runId) return false;

      screen.classList.add("is-typing");
      const caret = el("span", "caret");
      input.append(caret);
      for (const token of entry.tokens) {
        const text = typeof token === "string" ? token : String(token.t);
        const isSpace = text.trim() === "";
        const span = el("span", isSpace ? "sp" : `tok${token.amt ? " amt" : ""}`, text);
        caret.before(span);
        if (isSpace) continue;
        await sleep(text.length > 1 ? TIMING.WORD_MS : TIMING.CHAR_MS);
        if (myRun !== runId) return false;
      }
      await sleep(TIMING.AFTER_SPEECH);
      if (myRun !== runId) return false;

      screen.classList.remove("is-listening");
      screen.classList.add("is-parsed");
      await sleep(TIMING.PARSED_HOLD);
      return myRun === runId;
    }

    async function commit(entry, myRun) {
      input.classList.add("is-out");
      screen.classList.remove("is-parsed");

      const { li, ago } = makeRow(entry);
      refreshAgo();
      added.push({ ago, at: performance.now() });
      insertRow(li);
      setTimeout(() => {
        li.classList.remove("is-new");
        while (list.children.length > MAX_ROWS) list.lastElementChild.remove();
      }, TIMING.ROW_SETTLE);

      const from = total;
      total += entry.amount;
      count += 1;
      countEl.textContent = fill(data.countLabel, count);
      screen.classList.add("is-bump");
      await countUp(from, total, myRun);
      if (myRun !== runId) return;
      await sleep(420);
      screen.classList.remove("is-bump", "is-typing");
      input.replaceChildren();
      input.classList.remove("is-out");
    }

    async function play() {
      const myRun = ++runId;
      restore();
      await sleep(TIMING.FIRST_DELAY);
      while (myRun === runId) {
        for (const entry of data.entries) {
          if (!(await speak(entry, myRun))) return;
          await commit(entry, myRun);
          await sleep(TIMING.BETWEEN);
          if (myRun !== runId) return;
          refreshAgo();
        }
        await sleep(TIMING.END_HOLD);
        if (myRun !== runId) return;
        screen.classList.add("is-resetting");
        await sleep(TIMING.RESET_FADE);
        if (myRun !== runId) return;
        restore();
        await sleep(TIMING.FIRST_DELAY);
      }
    }

    function stop() {
      runId++;
      restore();
    }

    if (!("IntersectionObserver" in window)) return; // the static screen stays as it is
    // Play only while the phone is on screen and the tab is visible; start fresh each time.
    let isOnScreen = false;
    let isPlaying = false;
    const update = () => {
      const shouldPlay = isOnScreen && !document.hidden;
      if (shouldPlay && !isPlaying) { isPlaying = true; play(); }
      else if (!shouldPlay && isPlaying) { isPlaying = false; stop(); }
    };
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => { isOnScreen = entry.isIntersecting; });
      update();
    }, { threshold: 0.45 }).observe(screen);
    document.addEventListener("visibilitychange", update);
  }

  initLivePhone();
})();

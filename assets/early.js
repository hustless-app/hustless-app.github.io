// Runs before first paint: mark JS as available, and hold the hero device back until scenes.js poses it.
(() => {
  const root = document.documentElement;
  root.classList.add("js");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.classList.add("intro-pending");
  // never leave the hero hidden if scenes.js does not arrive
  setTimeout(() => {
    if (!root.classList.contains("intro-pending")) return;
    root.classList.remove("intro-pending");
    document.dispatchEvent(new Event("hustless:intro-done"));
  }, 4000);
})();

// QR codes point here so the destination can change without reprinting them.
// At launch: set data-store="live" in get/index.html (and both landing pages).
(() => {
  "use strict";
  if (document.documentElement.dataset.store !== "live") return;
  const isJapanese = (navigator.language || "").toLowerCase().startsWith("ja");
  const store = isJapanese ? "https://apps.apple.com/jp/app/id6826845830" : "https://apps.apple.com/app/id6826845830";
  window.location.replace(store + "?ct=qr");
})();

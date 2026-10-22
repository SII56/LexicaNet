/*
 * Copyright (c) 2026 SII56
 * SPDX-License-Identifier: MIT
 * See the LICENSE file in the project root for the full license text.
 */

// Shared by collection, settings, and the toolbar's offscreen document.
(() => {
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let mode = "auto";
  const normalize = (value) => ["light", "dark", "auto"].includes(value) ? value : "auto";

  function apply() {
    const dark = mode === "dark" || (mode === "auto" && system.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    window.dispatchEvent(new Event("lexica-theme-change"));
  }

  window.LexicaTheme = {
    get mode() { return mode; },
    get dark() { return mode === "dark" || (mode === "auto" && system.matches); },
    async setMode(value) {
      const next = normalize(value);
      await chrome.storage.local.set({ themeMode: next });
      mode = next;
      apply();
    }
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.themeMode) {
      mode = normalize(changes.themeMode.newValue);
      apply();
    }
  });
  system.addEventListener("change", apply);
  window.LexicaTheme.ready = chrome.storage.local.get("themeMode").then((saved) => {
    mode = normalize(saved.themeMode);
    apply();
  }).catch((err) => {
    console.warn("Could not load appearance preference:", err);
    apply();
  });
})();

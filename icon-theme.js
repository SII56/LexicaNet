/*
 * Copyright (c) 2026 SII56
 * SPDX-License-Identifier: MIT
 * See the LICENSE file in the project root for the full license text.
 */

// Keep toolbar colors in sync even when the popup is closed.

function reportIconTheme() {
  chrome.runtime.sendMessage({ type: "ICON_THEME", dark: window.LexicaTheme.dark })
    .catch((err) => console.warn("Could not update toolbar icon:", err));
}

window.addEventListener("lexica-theme-change", reportIconTheme);
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "READ_ICON_THEME") reportIconTheme();
});
window.LexicaTheme.ready.then(reportIconTheme);

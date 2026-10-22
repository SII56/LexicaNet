/*
 * Copyright (c) 2026 SII56
 * SPDX-License-Identifier: MIT
 * See the LICENSE file in the project root for the full license text.
 */

/**
 * Settings page: owns the Anki target, appearance, API key, and generation prompt.
 * Preferences are shared through chrome.storage.local, not through popup.js.
 * Each HTML page has its own DOM and its own elements object.
 */

// Page elements -------------------------------------------------------------

const elements = {
  apiKey: document.getElementById("apiKey"),
  status: document.getElementById("status"),
  deck: document.getElementById("deckSelect"),
  loadAnki: document.getElementById("loadAnki"),
  theme: document.getElementById("themeMode"),
  prompt: document.getElementById("systemPrompt"),
};

// Background messaging ------------------------------------------------------

function request(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (res) => {
      const error = chrome.runtime.lastError?.message ||
        (!res?.ok && (res?.error || "Request failed."));
      if (error) {
        reject(new Error(error));
      } else {
        resolve(res);
      }
    });
  });
}

// Anki target ---------------------------------------------------------------

// This receives a DOM element, not its ID. It only belongs on the settings page.
function fillSelect(selectEl, items, savedValue) {
  selectEl.replaceChildren();
  for (const name of items) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    selectEl.appendChild(option);
  }
  selectEl.value = items.includes(savedValue) ? savedValue : (items[0] || "");
}

async function loadAnkiOptions() {
  elements.loadAnki.disabled = true;
  elements.deck.disabled = true;
  elements.status.textContent = "Loading Anki...";
  try {
    const res = await request({ type: "LOAD_ANKI_OPTIONS" });
    const saved = await chrome.storage.local.get("ankiDeck");
    fillSelect(elements.deck, res.decks, saved.ankiDeck);

    // Store the initial selection too: choosing the first option does not fire change.
    // An empty result must not erase a previously saved target.
    if (elements.deck.value) {
      await chrome.storage.local.set({ ankiDeck: elements.deck.value });
    }
    elements.status.textContent = res.decks.length
      ? "Anki loaded. Deck selection is saved automatically."
      : "No Anki decks found.";
  } catch (err) {
    elements.status.textContent = err.message;
  } finally {
    elements.loadAnki.disabled = false;
    elements.deck.disabled = !elements.deck.options.length;
  }
}

// Preference events ---------------------------------------------------------

// Background submission reads this key directly; the collection needs no deck UI.
elements.deck.addEventListener("change", async () => {
  try {
    await chrome.storage.local.set({ ankiDeck: elements.deck.value });
    elements.status.textContent = "Anki target saved.";
  } catch (err) {
    elements.status.textContent = err.message;
  }
});
elements.loadAnki.addEventListener("click", loadAnkiOptions);

// theme.js applies the preference to every open extension page and the toolbar.
window.addEventListener("lexica-theme-change", () => {
  elements.theme.value = window.LexicaTheme.mode;
});
elements.theme.addEventListener("change", async () => {
  elements.theme.disabled = true;
  try {
    await window.LexicaTheme.setMode(elements.theme.value);
    elements.status.textContent = "Appearance saved.";
  } catch (err) {
    elements.theme.value = window.LexicaTheme.mode;
    elements.status.textContent = err.message;
  } finally {
    elements.theme.disabled = false;
  }
});

document.getElementById("save").addEventListener("click", async () => {
  try {
    await chrome.storage.local.set({ apiKey: elements.apiKey.value.trim() });
    elements.status.textContent = "API key saved.";
  } catch (err) {
    elements.status.textContent = err.message;
  }
});

document.getElementById("test").addEventListener("click", async () => {
  elements.status.textContent = "Testing...";
  try {
    const res = await request({ type: "TEST_CONNECTIONS" });
    elements.status.textContent =
      `DeepSeek: ${res.deepseek ? "OK" : "Failed"} · Anki: ${res.anki ? "OK" : "Failed"}`;
  } catch (err) {
    elements.status.textContent = err.message;
  }
});

// Prompt edits are explicit: typing changes the form; Save changes future requests.
elements.prompt.addEventListener("input", () => {
  elements.status.textContent = "Prompt changed. Save it before generating.";
});
document.getElementById("savePrompt").addEventListener("click", async () => {
  const prompt = elements.prompt.value.trim();
  if (!prompt) {
    elements.status.textContent = "Enter instructions, or restore the default prompt.";
    return;
  }
  try {
    await chrome.storage.local.set({ systemPrompt: prompt });
    elements.status.textContent = "Prompt saved for future generations.";
  } catch (err) {
    elements.status.textContent = err.message;
  }
});

document.getElementById("resetPrompt").addEventListener("click", async () => {
  try {
    // Removing the override makes the worker use the shared default in prompts.js.
    await chrome.storage.local.remove("systemPrompt");
    elements.prompt.value = DEFAULT_SYSTEM_PROMPT;
    elements.status.textContent = "Default prompt restored.";
  } catch (err) {
    elements.status.textContent = err.message;
  }
});

// Startup -------------------------------------------------------------------

async function initializeSettings() {
  const saved = await chrome.storage.local.get(["apiKey", "systemPrompt", "ankiDeck"]);
  elements.apiKey.value = saved.apiKey || "";
  elements.prompt.value = saved.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  // Show the last saved target even if Anki is currently unavailable.
  if (saved.ankiDeck) {
    fillSelect(elements.deck, [saved.ankiDeck], saved.ankiDeck);
  }

  await window.LexicaTheme.ready;
  elements.theme.value = window.LexicaTheme.mode;
  elements.theme.disabled = false;

  // Restore saved values first, then fetch the current deck list to avoid a race.
  await loadAnkiOptions();
}

initializeSettings().catch((err) => {
  elements.status.textContent = err.message;
});

const apiKeyInput = document.getElementById("apiKey");
const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");
const wordInput = document.getElementById("wordInput");
const autoAddAnkiEl = document.getElementById("autoAddAnki");
const deckSelect = document.getElementById("deckSelect");
const modelSelect = document.getElementById("modelSelect");

chrome.storage.local.get(
  ["apiKey", "lastTsv", "autoAddAnki", "ankiDeck", "ankiModel"],
  (res) => {
    apiKeyInput.value = res.apiKey || "";
    outputEl.value = res.lastTsv || "";
    autoAddAnkiEl.checked = !!res.autoAddAnki;

    if (res.ankiDeck) {
      deckSelect.innerHTML = `<option>${res.ankiDeck}</option>`;
    }

    if (res.ankiModel) {
      modelSelect.innerHTML = `<option>${res.ankiModel}</option>`;
    }
  }
);

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.local.set({ apiKey: apiKeyInput.value.trim() }, () => {
    statusEl.textContent = "Saved.";
  });
});

autoAddAnkiEl.addEventListener("change", () => {
  chrome.storage.local.set({ autoAddAnki: autoAddAnkiEl.checked });
});

document.getElementById("generate").addEventListener("click", () => {
  const word = wordInput.value.trim();

  if (!word) {
    statusEl.textContent = "Enter a word first.";
    return;
  }

  statusEl.textContent = "Generating...";

  chrome.runtime.sendMessage({ type: "GENERATE_TSV", word }, (res) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = chrome.runtime.lastError.message;
      return;
    }

    if (!res?.ok) {
      statusEl.textContent = res?.error || "Failed.";
      return;
    }

    outputEl.value = res.tsv;
    statusEl.textContent = res.addedToAnki
      ? "Generated and added to Anki."
      : "Generated.";
  });
});

document.getElementById("copy").addEventListener("click", async () => {
  if (!outputEl.value) {
    statusEl.textContent = "No TSV output.";
    return;
  }

  await navigator.clipboard.writeText(outputEl.value);
  statusEl.textContent = "Copied.";
});

document.getElementById("test").addEventListener("click", () => {
  statusEl.textContent = "Testing...";

  chrome.runtime.sendMessage({ type: "TEST_CONNECTIONS" }, (res) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = chrome.runtime.lastError.message;
      return;
    }

    if (!res?.ok) {
      statusEl.textContent = res?.error || "Test failed.";
      return;
    }

    statusEl.textContent =
      `DeepSeek: ${res.deepseek ? "OK" : "Failed"} · Anki: ${res.anki ? "OK" : "Failed"}`;
  });
});

document.getElementById("loadAnki").addEventListener("click", () => {
  statusEl.textContent = "Loading Anki...";

  chrome.runtime.sendMessage({ type: "LOAD_ANKI_OPTIONS" }, (res) => {
    if (!res?.ok) {
      statusEl.textContent = res?.error || "Failed to load Anki.";
      return;
    }

    deckSelect.innerHTML = "";
    modelSelect.innerHTML = "";

    for (const deck of res.decks) {
      const opt = document.createElement("option");
      opt.value = deck;
      opt.textContent = deck;
      deckSelect.appendChild(opt);
    }

    for (const model of res.models) {
      const opt = document.createElement("option");
      opt.value = model;
      opt.textContent = model;
      modelSelect.appendChild(opt);
    }

    statusEl.textContent = "Anki loaded.";
  });
});

deckSelect.addEventListener("change", () => {
  chrome.storage.local.set({ ankiDeck: deckSelect.value });
});

modelSelect.addEventListener("change", () => {
  chrome.storage.local.set({ ankiModel: modelSelect.value });
});
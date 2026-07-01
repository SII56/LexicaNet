const apiKeyInput = document.getElementById("apiKey");
const statusEl = document.getElementById("status");
const wordInput = document.getElementById("wordInput");
const autoAddAnkiEl = document.getElementById("autoAddAnki");
const deckSelect = document.getElementById("deckSelect");
const modelSelect = document.getElementById("modelSelect");
const previewEl = document.getElementById("preview");

chrome.storage.local.get(
  ["apiKey", "lastTsv", "lastJson", "autoAddAnki", "ankiDeck", "ankiModel"],
  (res) => {
    apiKeyInput.value = res.apiKey || "";
    autoAddAnkiEl.checked = !!res.autoAddAnki;

    if (res.ankiDeck) {
      deckSelect.innerHTML = `<option>${res.ankiDeck}</option>`;
    }

    if (res.ankiModel) {
      modelSelect.innerHTML = `<option>${res.ankiModel}</option>`;
    }

    if (res.lastJson) {
      renderPreview(res.lastJson);
    }
  }
);

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.local.set({ apiKey: apiKeyInput.value.trim() }, () => {
    statusEl.textContent = "Saved.";
  });
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

autoAddAnkiEl.addEventListener("change", () => {
  chrome.storage.local.set({ autoAddAnki: autoAddAnkiEl.checked });
});

deckSelect.addEventListener("change", () => {
  chrome.storage.local.set({ ankiDeck: deckSelect.value });
});

modelSelect.addEventListener("change", () => {
  chrome.storage.local.set({ ankiModel: modelSelect.value });
});

document.getElementById("generate").addEventListener("click", () => {
  const word = wordInput.value.trim();

  if (!word) {
    statusEl.textContent = "Enter a word first.";
    return;
  }

  statusEl.textContent = "Generating...";

  chrome.runtime.sendMessage({
    type: "GENERATE_TSV",
    word,
    autoAddAnki: autoAddAnkiEl.checked
  }, (res) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = chrome.runtime.lastError.message;
      return;
    }

    if (!res?.ok) {
      statusEl.textContent = res?.error || "Failed.";
      return;
    }

    if (res.data) {
      renderPreview(res.data);
    }
    statusEl.textContent = res.addedToAnki
      ? "Generated and added to Anki."
      : "Generated.";
  });
});


document.getElementById("loadAnki").addEventListener("click", () => {
  statusEl.textContent = "Loading Anki...";

  chrome.runtime.sendMessage({ type: "LOAD_ANKI_OPTIONS" }, (res) => {
    if (!res?.ok) {
      statusEl.textContent = res?.error || "Failed to load Anki.";
      return;
    }

    chrome.storage.local.get(["ankiDeck", "ankiModel"], (saved) => {
      fillSelect(deckSelect, res.decks, saved.ankiDeck);
      fillSelect(modelSelect, res.models, saved.ankiModel);

      chrome.storage.local.set({
        ankiDeck: deckSelect.value,
        ankiModel: modelSelect.value
      });
    });

    statusEl.textContent = "Anki loaded.";
  });
});

document.getElementById("copy").addEventListener("click", async () => {
  const res = await chrome.storage.local.get(["lastTsv"]);

  if (!res.lastTsv) {
    statusEl.textContent = "No TSV output.";
    return;
  }

  await navigator.clipboard.writeText(res.lastTsv);
  statusEl.textContent = "Copied.";
});

function renderPreview(data) {
  const associations = data.associations
    .map(line => line.join(" · "))
    .join("\n");

  previewEl.innerHTML = `
    <div class="preview-word">${escapeHtml(data.word)}</div>

    <hr>

    <div class="preview-label">Definition</div>
    <div class="preview-definition">${escapeHtml(data.definition)}</div>

    <div class="preview-label">Core</div>
    <div class="preview-core">${escapeHtml(data.core)}</div>

    <div class="preview-label">Associations</div>
    <div class="preview-associations">${escapeHtml(associations)}</div>
  `;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fillSelect(selectEl, items, savedValue) {
    selectEl.innerHTML = "";
    let found = false;
    for(const item of items){
        const option=document.createElement("option");
        option.value=item;
        option.textContent=item;
        if(item===savedValue){
            option.selected=true;
            found=true;
        }
        selectEl.appendChild(option);
    }
    if(!found && items.length>0){
        selectEl.selectedIndex=0;
    }
}

function loadAnkiOptions() {
  chrome.runtime.sendMessage({ type: "LOAD_ANKI_OPTIONS" }, (res) => {
    if (!res?.ok) {
      statusEl.textContent = res?.error || "Failed to load Anki.";
      return;
    }

    chrome.storage.local.get(["ankiDeck", "ankiModel"], (saved) => {
      fillSelect(deckSelect, res.decks, saved.ankiDeck);
      fillSelect(modelSelect, res.models, saved.ankiModel);

      chrome.storage.local.set({
        ankiDeck: deckSelect.value,
        ankiModel: modelSelect.value
      });

      statusEl.textContent = "Anki loaded.";
    });
  });
}

loadAnkiOptions();
const elements = {
  apiKey: document.getElementById("apiKey"),
  word: document.getElementById("wordInput"),
  status: document.getElementById("status"),
  autoAddAnki: document.getElementById("autoAddAnki"),
  deck: document.getElementById("deckSelect"),
  preview: document.getElementById("preview"),
};

async function initialize() {
  const settings = await chrome.storage.local.get([
    "apiKey",
    "lastJson",
    "autoAddAnki",
    "ankiDeck"
  ]);

  elements.apiKey.value = settings.apiKey || "";
  elements.autoAddAnki.checked = !!settings.autoAddAnki;

  if (settings.ankiDeck) {
    elements.deck.innerHTML = `<option>${settings.ankiDeck}</option>`;
  }

  if (settings.lastJson) {
    renderPreview(settings.lastJson);
  }
}

initialize();

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.local.set({ apiKey: elements.apiKey.value.trim() }, () => {
    elements.status.textContent = "Saved.";
  });
});

document.getElementById("test").addEventListener("click", () => {
  elements.status.textContent = "Testing...";

  chrome.runtime.sendMessage({ type: "TEST_CONNECTIONS" }, (res) => {
    if (chrome.runtime.lastError) {
      elements.status.textContent = chrome.runtime.lastError.message;
      return;
    }

    if (!res?.ok) {
      elements.status.textContent = res?.error || "Test failed.";
      return;
    }

    elements.status.textContent =
      `DeepSeek: ${res.deepseek ? "OK" : "Failed"} · Anki: ${res.anki ? "OK" : "Failed"}`;
  });
});

elements.autoAddAnki.addEventListener("change", () => {
  chrome.storage.local.set({ autoAddAnki: elements.autoAddAnki.checked });
});

elements.deck.addEventListener("change", () => {
  chrome.storage.local.set({ ankiDeck: elements.deck.value });
});

document.getElementById("generate").addEventListener("click", () => {
  const word = elements.word.value.trim();

  if (!word) {
    elements.status.textContent = "Enter a word first.";
    return;
  }

  elements.status.textContent = "Generating...";

  chrome.runtime.sendMessage({
    type: "GENERATE_TSV",
    word,
    autoAddAnki: elements.autoAddAnki.checked
  }, (res) => {
    if (chrome.runtime.lastError) {
      elements.status.textContent = chrome.runtime.lastError.message;
      return;
    }

    if (!res?.ok) {
      elements.status.textContent = res?.error || "Failed.";
      return;
    }

    if (res.data) {
      renderPreview(res.data);
    }
    elements.status.textContent = res.addedToAnki
      ? "Generated and added to Anki."
      : "Generated.";
  });
});


document.getElementById("loadAnki").addEventListener("click", () => {
  elements.status.textContent = "Loading Anki...";

  chrome.runtime.sendMessage({ type: "LOAD_ANKI_OPTIONS" }, (res) => {
    if (!res?.ok) {
      elements.status.textContent = res?.error || "Failed to load Anki.";
      return;
    }

    chrome.storage.local.get(["ankiDeck"], (saved) => {
      fillSelect(elements.deck, res.decks, saved.ankiDeck);

      chrome.storage.local.set({
        ankiDeck: elements.deck.value,
      });
    });

    elements.status.textContent = "Anki loaded.";
  });
});

document.getElementById("copy").addEventListener("click", async () => {
  const res = await chrome.storage.local.get(["lastTsv"]);

  if (!res.lastTsv) {
    elements.status.textContent = "No TSV output.";
    return;
  }

  await navigator.clipboard.writeText(res.lastTsv);
  elements.status.textContent = "Copied.";
});

function renderPreview(data) {
  const associations = data.associations
    .map(line => line.join(" · "))
    .join("\n");

  elements.preview.innerHTML = `
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
      elements.status.textContent = res?.error || "Failed to load Anki.";
      return;
    }

    chrome.storage.local.get(["ankiDeck"], (saved) => {
      fillSelect(elements.deck, res.decks, saved.ankiDeck);

      chrome.storage.local.set({
        ankiDeck: elements.deck.value,
      });

      elements.status.textContent = "Anki loaded.";
    });
  });
}

loadAnkiOptions();
/*
 * Copyright (c) 2026 SII56
 * SPDX-License-Identifier: MIT
 * See the LICENSE file in the project root for the full license text.
 */

/**
 * Background worker: external API requests and persistent pending-draft writes.
 * popup.js owns the collection DOM; settings.js owns preference controls.
 * Neither page calls DeepSeek or AnkiConnect directly.
 *
 * Storage contract:
 * - apiKey / systemPrompt / ankiDeck / themeMode: preferences owned by settings.
 * - pending:<id>: { id, data, createdAt, error }; deleted only after submission or removal.
 * - lastJson / lastWord / lastTsv: legacy latest-result snapshots, not the pending list.
 */

const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

// Classic service workers load shared prompt constants with importScripts.
importScripts("prompts.js");

// Extension entry points ----------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "generate-anki-tsv",
    title: "Add to pending list: \"%s\"",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "generate-anki-tsv") return;

  const word = (info.selectionText || "").trim();

  if (!word) return;

  try {
    const result = await generateAndSave(word);
    console.log("Queued from context menu:", result);
  } catch (err) {
    console.error(err);
  }
});

// Message routing: always return true when a response is sent asynchronously.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ICON_THEME" && sender.url === chrome.runtime.getURL("icon-theme.html")) {
    const prefix = msg.dark ? "icons/icon-dark-" : "icons/icon-";
    chrome.action.setIcon({
      path: { 16: `${prefix}16.png`, 32: `${prefix}32.png`, 48: `${prefix}48.png` }
    }).then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (["SAVE_PENDING", "SUBMIT_PENDING", "DELETE_PENDING"].includes(msg.type)) {
    updatePending(msg)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));

    return true;
  }

  if (msg.type === "GENERATE_TSV") {
    generateAndSave(msg.word)
      .then((result) => {
        sendResponse({
          ok: true,
          tsv: result.tsv,
          data: result.data,
          item: result.item
        });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });

    return true;
  }

  if (msg.type === "TEST_CONNECTIONS") {
    (async () => {
      const { apiKey } = await chrome.storage.local.get(["apiKey"]);

      if (!apiKey) {
        sendResponse({ ok: false, error: "No API key saved." });
        return;
      }

      const deepseek = await testDeepSeek(apiKey);
      const anki = await testAnkiConnect();

      sendResponse({
        ok: true,
        deepseek,
        anki
      });
    })();

    return true;
  }

  if (msg.type === "LOAD_ANKI_OPTIONS") {
    (async () => {
      try {
        const decks = await ankiRequest("deckNames");
        const modelName = await ensureLexicalModel();

        sendResponse({
          ok: true,
          decks,
          modelName
        });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err.message
        });
      }
    })();

    return true;
  }
});

// Generation: user instructions + fixed output contract ----------------------

async function callDeepSeek(apiKey, word, systemPrompt) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}\n\n${OUTPUT_CONTRACT}` },
        { role: "user", content: `Target word: ${word}` }
      ],
      temperature: 0.4,
      max_tokens: 1000
    })
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  const content = body.choices[0].message.content.trim();
  return JSON.parse(content);
}

function jsonToTsv(data) {
  const assoc = data.associations
    .map((line) => line.join(" · "))
    .join("\\n");

  return [
    data.word,
    data.definition,
    data.core,
    assoc,
    data.partOfSpeech || "",
    data.cefr || ""
  ].join("\t");
}

// Generate independently of Anki; each draft has its own storage key.
async function generateAndSave(word) {
  const { apiKey, systemPrompt } = await chrome.storage.local.get(["apiKey", "systemPrompt"]);

  if (!apiKey) {
    throw new Error("No API key. Save your DeepSeek API key first.");
  }

  const data = await callDeepSeek(apiKey, word, systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT);
  if (!data || ![data.word, data.definition, data.core].every((value) => typeof value === "string" && value.trim()) ||
      !Array.isArray(data.associations) || !data.associations.length ||
      !data.associations.every((line) => Array.isArray(line) && line.length && line.every((item) => typeof item === "string" && item.trim()))) {
    throw new Error("The model returned an incomplete note. Check the prompt and try again.");
  }
  data.partOfSpeech = typeof data.partOfSpeech === "string" ? data.partOfSpeech : "";
  data.cefr = typeof data.cefr === "string" ? data.cefr : "";
  const tsv = jsonToTsv(data);

  const item = { id: crypto.randomUUID(), data, createdAt: Date.now(), error: null };
  await chrome.storage.local.set({
    [`pending:${item.id}`]: item,
    lastTsv: tsv,
    lastWord: word,
    lastJson: data
  });

  return {
    tsv,
    data,
    item
  };
}

// Pending mutations ---------------------------------------------------------

// One in-flight mutation per draft; unrelated drafts may still be generated.
const pendingLocks = new Set();

async function updatePending(msg) {
  const key = `pending:${msg.id}`;
  if (pendingLocks.has(msg.id)) throw new Error("This draft is being submitted. Please wait.");
  pendingLocks.add(msg.id);
  try {
    const stored = await chrome.storage.local.get(key);
    const item = stored[key];
    if (!item) throw new Error("Draft no longer exists. Refresh the pending list.");
    if (msg.type === "DELETE_PENDING") {
      await chrome.storage.local.remove(key);
      return {};
    }
    // Save edits before calling Anki, so a failed submission leaves a recoverable draft.
    item.data = msg.data;
    item.error = null;
    await chrome.storage.local.set({ [key]: item });
    if (msg.type === "SAVE_PENDING") return { item };

    try {
      const noteId = await addToAnki(item.data);
      await chrome.storage.local.remove(key);
      return { noteId };
    } catch (err) {
      item.error = err.message;
      await chrome.storage.local.set({ [key]: item });
      throw err;
    }
  } finally {
    pendingLocks.delete(msg.id);
  }
}

// Anki submission -----------------------------------------------------------

// Read the current deck at submission time, including settings changed after generation.
async function addToAnki(data) {
  if (!data || ![data.word, data.definition, data.core].every((value) => typeof value === "string" && value.trim()) ||
      !Array.isArray(data.associations) || !data.associations.length ||
      !data.associations.every((line) => Array.isArray(line) && line.length && line.every((item) => typeof item === "string" && item.trim()))) {
    throw new Error("Fill in Word, Definition, Core and at least one association.");
  }
  const { ankiDeck } = await chrome.storage.local.get(["ankiDeck"]);

  if (!ankiDeck) {
    throw new Error("Choose Anki deck and note type first.");
  }

  const modelName = await ensureLexicalModel();

  return await ankiRequest("addNote", {
    note: {
      deckName: ankiDeck,
      modelName,
      fields: {
        Word: escapeAnkiHtml(data.word),
        Definition: escapeAnkiHtml(data.definition),
        Core: escapeAnkiHtml(data.core),
        Associations: data.associations.map((line) => `<div class="association-row">${line.map((item) => `<span>${escapeAnkiHtml(item)}</span>`).join(" ")}</div>`).join(""),
        PartOfSpeech: escapeAnkiHtml(data.partOfSpeech || ""),
        CEFR: escapeAnkiHtml(data.cefr || "")
      },
      tags: ["lexical_network", "deepseek"]
    }
  });
}

// Connection checks ---------------------------------------------------------

async function testDeepSeek(apiKey) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "user", content: "Reply with OK only." }
      ],
      max_tokens: 5
    })
  });

  return res.ok;
}

async function testAnkiConnect() {
  try {
    const res = await fetch("http://127.0.0.1:8765", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "version",
        version: 6
      })
    });

    const data = await res.json();
    return data.error === null;
  } catch {
    return false;
  }
}

async function ankiRequest(action, params = {}) {
  const res = await fetch("http://127.0.0.1:8765", {
    signal: AbortSignal.timeout(10000),
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action,
      version: 6,
      params
    })
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data.result;
}

function escapeAnkiHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Toolbar appearance --------------------------------------------------------

async function initializeIconTheme() {
  if (!await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.createDocument({
      url: "icon-theme.html",
      reasons: ["MATCH_MEDIA"],
      justification: "Match the transparent toolbar icon to the system light or dark color scheme."
    });
  }
  await chrome.runtime.sendMessage({ type: "READ_ICON_THEME" });
}

initializeIconTheme().catch((err) => console.warn("Could not initialize icon theme:", err));

// Anki note model and card presentation -------------------------------------

async function ensureLexicalModel() {
  // Use a new model so existing cards and user-customized templates stay intact.
  const modelName = "Lexical Network v2";
  const models = await ankiRequest("modelNames");
  if (models.includes(modelName)) return modelName;
  const heading = `<div class="brand">lexica.</div><div class="word">{{Word}}</div>
<div class="meta">{{#PartOfSpeech}}{{PartOfSpeech}}{{#CEFR}} · {{/CEFR}}{{/PartOfSpeech}}{{#CEFR}}{{CEFR}}{{/CEFR}}</div>`;
  await ankiRequest("createModel", {
    modelName,
    inOrderFields: ["Word", "Definition", "Core", "Associations", "PartOfSpeech", "CEFR"],
    cardTemplates: [{
      Name: "Card 1",
      Front: `${heading}<div class="hint">Think of the word and its connections.</div>`,
      Back: `${heading}<hr><div class="label">Definition</div><div class="definition">{{Definition}}</div>
<div class="label">Core idea</div><div class="core">{{Core}}</div>
<div class="label">Associations</div><div class="associations">{{Associations}}</div>`
    }],
    css: `
.card { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fff; color: #252525; font-size: 18px; line-height: 1.7; text-align: left; padding: 30px; max-width: 640px; margin: auto; }
.brand { font-size: 12px; letter-spacing: 1px; color: #888; margin-bottom: 28px; }
.word { font-family: Georgia, "Times New Roman", serif; font-size: 46px; line-height: 1.2; font-weight: 400; letter-spacing: -1px; overflow-wrap: anywhere; }
.meta { font-size: 13px; color: #888; margin-top: 10px; }
.hint { color: #888; font-size: 14px; margin-top: 40px; }
hr { border: 0; border-top: 1px solid #eaeaea; margin: 28px 0; }
.label { font-size: 11px; letter-spacing: 1.7px; text-transform: uppercase; color: #888; margin: 25px 0 10px; }
.core { border-left: 2px solid currentColor; padding-left: 15px; font: 24px/1.5 Georgia, serif; }
.association-row { margin: 8px 0; }
.associations span { display: inline-block; border: 1px solid #e5e5e5; border-radius: 3px; padding: 5px 10px; margin: 3px 3px 3px 0; font-size: 15px; }
.nightMode.card, .night_mode.card { background: #1d1d1d; color: #e8e8e8; }
.nightMode .associations span, .night_mode .associations span { border-color: #444; }
@media (max-width: 480px) { .card { padding: 20px; } .word { font-size: 38px; } }
`.trim()
  });
  return modelName;
}

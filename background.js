const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

const SYSTEM_PROMPT = `
Generate an English lexical activation note for the target word.

Learner: CEFR B2, productive vocabulary.
Goal: help recall the word through semantic associations, not synonyms only.

Return valid JSON only:
{"word":"","definition":"","core":"","associations":[["","",""],["","",""],["","",""],["","",""]]}

Rules:
- word: target word only
- definition: English, one sense, <=15 words
- core: intuitive mental tag, 2-4 words
- associations: 3-4 lines, 3-4 items each
- mix common verbs/nouns/adjectives/concepts/opposites/situations
- use common B1-B2 words; avoid rare/literary words
- order from strongest recall cues to weaker cues
- no explanation, no markdown
`.trim();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "generate-anki-tsv",
    title: "Generate Anki TSV: \"%s\"",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "generate-anki-tsv") return;

  const word = (info.selectionText || "").trim();

  if (!word) return;

  try {
    const { autoAddAnki } = await chrome.storage.local.get(["autoAddAnki"]);

    if (!autoAddAnki) {
      console.log("Auto add is disabled. Open popup to preview or enable auto add.");
      return;
    }

    const result = await generateAndSave(word, true);
    console.log("Added from context menu:", result);
  } catch (err) {
    console.error(err);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GENERATE_TSV") {
    generateAndSave(msg.word)
      .then((result) => {
        sendResponse({
          ok: true,
          tsv: result.tsv,
          data: result.data,
          addedToAnki: !!result.addedToAnki
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
        const models = await ankiRequest("modelNames");

        sendResponse({
            ok: true,
            decks,
            models
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

async function callDeepSeek(apiKey, word) {
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
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Target word: ${word}` }
      ],
      temperature: 0.4,
      max_tokens: 300
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
    .map(line => line.join(" · "))
    .join("\\n");

  return [
    data.word,
    data.definition,
    data.core,
    assoc
  ].join("\t");
}

async function generateAndSave(word, autoAddAnki) {
  const { apiKey } = await chrome.storage.local.get([
    "apiKey"
  ]);

  if (!apiKey) {
    throw new Error("No API key. Save your DeepSeek API key first.");
  }

  const data = await callDeepSeek(apiKey, word);
  const tsv = jsonToTsv(data);

  await chrome.storage.local.set({
    lastTsv: tsv,
    lastWord: word,
    lastJson: data
  });

  let addedToAnki = false;

  if (autoAddAnki) {
    await addToAnki(data);
    addedToAnki = true;
  }

  return {
    tsv,
    data,
    addedToAnki
  };
}

async function addToAnki(data) {
  const { ankiDeck, ankiModel } = await chrome.storage.local.get([
    "ankiDeck",
    "ankiModel"
  ]);

  if (!ankiDeck || !ankiModel) {
    throw new Error("Choose Anki deck and note type first.");
  }

  const assoc = data.associations
    .map(line => line.join(" · "))
    .join("\n");

  return await ankiRequest("addNote", {
    note: {
      deckName: ankiDeck,
      modelName: ankiModel,
      fields: {
        Word: data.word,
        Definition: data.definition,
        Core: data.core,
        Associations: assoc
      },
      tags: ["lexical_network", "deepseek"]
    }
  });
}

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
/*
 * Copyright (c) 2026 SII56
 * SPDX-License-Identifier: MIT
 * See the LICENSE file in the project root for the full license text.
 */

/**
 * Collection page: generate words, edit pending drafts, and request submission.
 * Settings owns API keys, prompts, themes, and the Anki deck selector.
 * The background worker reads the saved deck when handling SUBMIT_PENDING;
 * this page never needs to load Anki options or render a deck selector.
 */

// Page elements and editor state --------------------------------------------

const elements = {
  word: document.getElementById("wordInput"),
  status: document.getElementById("status"),
  preview: document.getElementById("preview"),
  pending: document.getElementById("pendingList"),
  addToAnki: document.getElementById("addToAnki"),
};

// Editor changes stay in memory until saved, submitted, or another draft is opened.
let currentPreview = null;
let currentId = null;
let previewBusy = false;
let dirty = false;
let pendingItems = [];

// Background messaging ------------------------------------------------------

// Convert callback errors into rejected promises for the event handlers below.
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

// Pending drafts ------------------------------------------------------------

// Read only pending:* records; refresh the list without replacing unsaved editor text.
async function refreshPending() {
  const stored = await chrome.storage.local.get(null);
  pendingItems = Object.entries(stored)
    .filter(([key]) => key.startsWith("pending:"))
    .map(([, item]) => item)
    .sort((a, b) => b.createdAt - a.createdAt);
  document.getElementById("pendingCount").textContent = pendingItems.length;
  elements.pending.replaceChildren();
  if (!pendingItems.length) {
    elements.pending.textContent = "No pending cards. Select a word on a page and use the right-click menu, or generate one above.";
    return;
  }
  for (const item of pendingItems) {
    const button = document.createElement("button");
    button.className = "pending-item secondary";
    button.classList.toggle("selected", item.id === currentId);
    button.setAttribute("aria-pressed", String(item.id === currentId));
    button.disabled = previewBusy;
    const title = document.createElement("strong");
    title.textContent = item.data.word;
    const detail = document.createElement("span");
    detail.textContent = item.error ? `Failed: ${item.error}` : item.data.definition;
    button.append(title, detail);
    button.addEventListener("click", () => selectPending(item.id));
    elements.pending.appendChild(button);
  }
}

// Persist through the worker so it can coordinate writes with submissions.
async function saveDraft() {
  if (!currentId || !dirty) return;
  await request({ type: "SAVE_PENDING", id: currentId, data: currentPreview });
  dirty = false;
}

// Save the previous draft before switching to another stored note.
async function selectPending(id) {
  if (previewBusy || id === currentId) return;
  setPreviewBusy(true);
  try {
    await saveDraft();
    const stored = await chrome.storage.local.get(`pending:${id}`);
    const item = stored[`pending:${id}`];
    if (!item) throw new Error("Draft no longer exists.");
    currentId = id;
    dirty = false;
    renderPreview(item.data);
    elements.status.textContent = item.error
      ? `Last submission failed: ${item.error}`
      : "Edit this draft, then submit to Anki.";
  } catch (err) {
    elements.status.textContent = err.message;
  } finally {
    setPreviewBusy(false);
    await refreshPending();
  }
}

function clearPreview() {
  currentId = null;
  currentPreview = null;
  dirty = false;
  elements.preview.innerHTML = '<div class="placeholder">Select a pending card to edit.</div>';
  setPreviewBusy(false);
}

async function initialize() {
  await refreshPending();
  if (pendingItems.length) {
    await selectPending(pendingItems[0].id);
  }
}

// Editor validation and rendering -------------------------------------------

function validatePreview() {
  if (
    !currentPreview.word ||
    !currentPreview.definition ||
    !currentPreview.core ||
    !currentPreview.associations.length
  ) {
    elements.status.textContent = "Fill in Word, Definition, Core and at least one association.";
    return false;
  }
  return true;
}

// Match the six Anki fields; keep each note on one physical TSV line.
function previewToTsv() {
  const clean = (text) => text.replace(/[\t\r\n]+/g, " ");
  return [
    currentPreview.word,
    currentPreview.definition,
    currentPreview.core,
    currentPreview.associations.map((line) => line.map(clean).join(" · ")).join("\\n"),
    currentPreview.partOfSpeech || "",
    currentPreview.cefr || "",
  ].map(clean).join("\t");
}

// Prevent navigation and editing while an operation is saving or submitting a draft.
function setPreviewBusy(busy) {
  previewBusy = busy;
  document.getElementById("openSettings").disabled = busy;
  elements.addToAnki.disabled = busy || !currentPreview;
  elements.pending.querySelectorAll("button").forEach((button) => button.disabled = busy);
  document.getElementById("removePending").disabled = busy || !currentId;
  const fields = document.getElementById("previewFields");
  if (fields) fields.disabled = busy;
  document.getElementById("savePreview").disabled = busy || !currentPreview;
  document.getElementById("copy").disabled = busy;
  document.getElementById("generate").disabled = busy;
}

// Escape stored/model text before inserting it into the editable HTML template.
function renderPreview(data) {
  currentPreview = data;
  elements.addToAnki.disabled = false;
  document.getElementById("savePreview").disabled = false;
  document.getElementById("removePending").disabled = false;
  const associations = data.associations
    .map((line) => line.join(" · "))
    .join("\n");

  elements.preview.innerHTML = `
    <fieldset id="previewFields">
      <label class="preview-label" for="editWord">Word</label>
      <input id="editWord" value="${escapeHtml(data.word)}" />
      <div id="previewMetadata" class="edit-help">${escapeHtml([data.partOfSpeech, data.cefr].filter(Boolean).join(" · "))}</div>
      <label class="preview-label" for="editPartOfSpeech">Part of speech</label>
      <input id="editPartOfSpeech" value="${escapeHtml(data.partOfSpeech || "")}" placeholder="e.g. adjective" />
      <label class="preview-label" for="editCefr">CEFR · estimated word level</label>
      <input id="editCefr" value="${escapeHtml(data.cefr || "")}" placeholder="e.g. B2 · optional" />
      <label class="preview-label" for="editDefinition">Definition</label>
      <textarea id="editDefinition" rows="2">${escapeHtml(data.definition)}</textarea>
      <label class="preview-label" for="editCore">Core</label>
      <input id="editCore" value="${escapeHtml(data.core)}" />
      <label class="preview-label" for="editAssociations">Associations</label>
      <textarea id="editAssociations" rows="4" aria-describedby="associationHelp">${escapeHtml(associations)}</textarea>
      <div id="associationHelp" class="edit-help">One group per line. Separate items with ·</div>
    </fieldset>
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

// Page events ---------------------------------------------------------------

// Right-click generation can add records while this page is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some((key) => key.startsWith("pending:"))) {
    refreshPending().catch((err) => {
      elements.status.textContent = err.message;
    });
  }
});

document.getElementById("generate").addEventListener("click", async () => {
  const word = elements.word.value.trim();
  if (!word) {
    elements.status.textContent = "Enter a word first.";
    return;
  }
  setPreviewBusy(true);
  elements.status.textContent = "Generating...";
  try {
    await saveDraft();
    const res = await request({ type: "GENERATE_TSV", word });
    currentId = res.item.id;
    dirty = false;
    renderPreview(res.item.data);
    elements.status.textContent = "Added to pending list. Review and submit when ready.";
  } catch (err) {
    elements.status.textContent = err.message;
  } finally {
    setPreviewBusy(false);
    await refreshPending();
  }
});

elements.addToAnki.addEventListener("click", async () => {
  if (!currentId || !validatePreview()) return;
  setPreviewBusy(true);
  elements.status.textContent = "Submitting to Anki...";
  try {
    // The background saves these edits before attempting Anki submission.
    await request({ type: "SUBMIT_PENDING", id: currentId, data: currentPreview });
    clearPreview();
    elements.status.textContent = "Added to Anki and removed from pending list.";
  } catch (err) {
    elements.status.textContent = `Submission failed. Draft kept for retry: ${err.message}`;
  } finally {
    setPreviewBusy(false);
    await refreshPending();
  }
});

document.getElementById("removePending").addEventListener("click", async () => {
  if (!currentId) return;
  setPreviewBusy(true);
  try {
    await request({ type: "DELETE_PENDING", id: currentId });
    clearPreview();
    elements.status.textContent = "Removed from pending list.";
  } catch (err) {
    elements.status.textContent = err.message;
  } finally {
    setPreviewBusy(false);
    await refreshPending();
  }
});

document.getElementById("copy").addEventListener("click", async () => {
  if (!currentPreview || !validatePreview()) return;
  try {
    await navigator.clipboard.writeText(previewToTsv());
    elements.status.textContent = "Copied current edits.";
  } catch (err) {
    elements.status.textContent = err.message;
  }
});

document.getElementById("savePreview").addEventListener("click", async () => {
  if (!currentPreview) return;
  setPreviewBusy(true);
  try {
    await saveDraft();
    elements.status.textContent = "Changes saved to pending list.";
  } catch (err) {
    elements.status.textContent = err.message;
  } finally {
    setPreviewBusy(false);
    await refreshPending();
  }
});

// Delegation keeps editing functional after renderPreview replaces the form.
elements.preview.addEventListener("input", () => {
  if (!currentPreview || previewBusy) return;
  currentPreview = {
    word: document.getElementById("editWord").value.trim(),
    partOfSpeech: document.getElementById("editPartOfSpeech").value.trim(),
    cefr: document.getElementById("editCefr").value.trim(),
    definition: document.getElementById("editDefinition").value.trim(),
    core: document.getElementById("editCore").value.trim(),
    associations: document.getElementById("editAssociations").value
      .split("\n")
      .map((line) => line
        .split("·")
        .map((item) => item.trim())
        .filter(Boolean))
      .filter((line) => line.length)
  };
  dirty = true;
  document.getElementById("previewMetadata").textContent = [
    currentPreview.partOfSpeech,
    currentPreview.cefr,
  ].filter(Boolean).join(" · ");
  elements.status.textContent = "Unsaved edits. Save changes before closing.";
});

// Save the active draft before leaving the collection page.
document.getElementById("openSettings").addEventListener("click", async () => {
  if (previewBusy) return;
  setPreviewBusy(true);
  try {
    await saveDraft();
    window.location.href = "settings.html";
  } catch (err) {
    elements.status.textContent = err.message;
    setPreviewBusy(false);
  }
});

// Startup -------------------------------------------------------------------
// Register events before asynchronous initialization begins.
initialize().catch((err) => {
  elements.status.textContent = err.message;
});

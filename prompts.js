/*
 * Copyright (c) 2026 SII56
 * SPDX-License-Identifier: MIT
 * See the LICENSE file in the project root for the full license text.
 */

// Shared defaults for settings.html and the background worker.
// The saved systemPrompt overrides DEFAULT_SYSTEM_PROMPT, but OUTPUT_CONTRACT is
// always appended so custom learning instructions preserve the required fields.
const DEFAULT_SYSTEM_PROMPT = `
Generate an English lexical activation note for the target word.

Learner: CEFR B2, productive vocabulary.
Goal: help recall the word through semantic associations, not synonyms only.

Return valid JSON only:
{"word":"","partOfSpeech":"","cefr":"","definition":"","core":"","associations":[["","",""],["","",""],["","",""],["","",""]]}

Rules:
- word: target word only
- partOfSpeech: the part of speech for the selected sense, e.g. adjective
- cefr: estimated CEFR level of the target word in this sense (A1-C2), not the learner level; empty if uncertain
- definition: English, one sense, <=15 words
- core: intuitive mental tag, 2-4 words
- associations: 3-4 lines, 3-4 items each
- mix common verbs/nouns/adjectives/concepts/opposites/situations
- use common B1-B2 words; avoid rare/literary words
- order from strongest recall cues to weaker cues
- no explanation, no markdown
`.trim();

const OUTPUT_CONTRACT = `
Return a JSON object with string fields word, partOfSpeech, cefr, definition, core,
and associations as an array of non-empty arrays of strings.
Keep these field names and types so the extension can display and submit the note.
No markdown or additional text.
`.trim();

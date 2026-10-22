# LexicaNet

**Learn words as connected concepts, not isolated definitions.**

LexicaNet is a browser extension that turns English words into editable lexical network cards for Anki.

Each note brings together a short definition, a core memory cue, and groups of semantic associations—helping you build connections for speaking and writing.

## Collect → Refine → Review

1. Select a word on a webpage and add it through the right-click menu, or enter it in the extension.
2. Generate a note with DeepSeek.
3. Review and edit it in your pending collection.
4. Submit it to your chosen Anki deck when ready.

Generated notes stay in your pending collection until you submit or remove them. Nothing is automatically sent to Anki.

## Features

- **Pending collection** — Collect multiple words and review them at your own pace.
- **Editable notes** — Refine the word, definition, core cue, associations, part of speech, and estimated CEFR level.
- **Manual submission** — Submit individual notes to Anki. Failed submissions keep the draft available for retry.
- **Custom prompts** — Edit the default generation instructions to match your learning goals, or restore the defaults.
- **Automatic note type setup** — The extension creates the required Anki note type.
- **TSV export** — Copy the current note for manual import.
- **Light, dark, and automatic themes** — Choose your preferred appearance in Settings.

## Getting Started

### Requirements

- Google Chrome
- Anki Desktop with AnkiConnect installed
- A DeepSeek API key with available API access

### Install the extension

1. Download and extract the repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.

### Configure LexicaNet

1. Keep Anki Desktop running with AnkiConnect enabled.
2. Open LexicaNet and go to **Settings**.
3. Enter and save your DeepSeek API key.
4. Load the Anki decks and choose your target deck.
5. Optionally customize the generation prompt and appearance.

You can now start collecting words.

## Card Structure

New notes use the **Lexical Network v2** note type:

| Field | Purpose |
| --- | --- |
| Word | The target word |
| Definition | A short definition for one sense |
| Core | A compact memory cue |
| Associations | Groups of related words and concepts |
| PartOfSpeech | The word’s part of speech in the selected sense |
| CEFR | An AI-estimated level for the target word |

CEFR levels and other generated content are model estimates. Review and adjust them before submission.

Existing cards using the original **Lexical Network** note type remain unchanged.

## Customizing Generation

Settings includes the default prompt as editable text. Change the learner profile, vocabulary difficulty, association style, or other learning instructions, then save.

Saved instructions apply to both right-click and popup generation. The extension retains a required JSON output structure so generated notes remain compatible with the editor and Anki.

Prompt changes affect future generations; existing drafts are not regenerated.

## Data and API Usage

Your API key, preferences, and pending drafts are stored locally in the browser extension.

Generation sends the target text and prompt to DeepSeek. Submitting a note sends its fields to AnkiConnect at `http://127.0.0.1:8765`.

DeepSeek usage is billed according to your API account. Anki Desktop must be running when loading decks or submitting notes.

## License

MIT License. Copyright (c) 2026 SII56.

See [LICENSE](LICENSE) for the full text.
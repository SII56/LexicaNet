Instead of generating dictionary-style flashcards, this extension builds lexical activation networks to help learners strengthen productive vocabulary for speaking and writing.

## Anki Note Type Setup

Create a custom note type in Anki with exactly these fields:

1. Word
2. Definition
3. Core
4. Associations

Field names are case-sensitive.

### Front Template

```html
<div class="hint">
  Think of the word.
</div>

<div class="word">
  {{Word}}
</div>

```

### Back Template
```html
<div class="word">
  {{Word}}
</div>

<hr>

<div class="label">Definition</div>
<div class="definition">
  {{Definition}}
</div>

<div class="label">Core</div>
<div class="core small">
  {{Core}}
</div>

<div class="label">Associations</div>
<div class="associations">
  {{Associations}}
</div>
```

Styling

```css
.card {
    font-family: -apple-system !important;
    background: white;
    color: #1d1d1f;

    font-size: 21px;
    line-height: 1.65;

    padding: 36px;

    text-align: left;

    max-width: 760px;
    margin: auto;
}

/* Answer */

.word {
    font-size: 48px;
    font-weight: 700;
    letter-spacing: -0.6px;

    margin-bottom: 26px;
}

.label {

    font-size: 21px;

    font-weight: 600;

    margin-top: 24px;

    margin-bottom: 6px;

    color: #1d1d1f;
}

/* Core */

.core {

    font-size: 30px;

    font-weight: 600;

    margin-bottom: 18px;
}

.core.small {

    font-size: 20px;

    margin-bottom: 12px;
}

/* Definition */

.definition {

    font-size: 21px;

    color: #555;

    margin-bottom: 10px;
}

/* Associations */

.associations {
    font-size: 21px;
    line-height: 1.8;
}

.associations span {
    display: inline-block;
    background: #f5f5f7;
    color: #1d1d1f;

    padding: 3px 10px;
    margin: 4px 5px 4px 0;

    border-radius: 999px;

    font-size: 20px;
    line-height: 1.4;
}
/* 分割线 */

hr {

    border: none;

    border-top: 1px solid #e5e5ea;

    margin: 28px 0;
}
```

```markdown

The extension sends notes to Anki using these field names. If your note type uses different names, auto-add will fail.
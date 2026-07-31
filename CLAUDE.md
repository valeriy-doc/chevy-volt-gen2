# CLAUDE.md

Guidance for working on this project. Read this first — the operational split
below is not obvious from the code.

## What this is

A single-page fan site for the **second-generation Chevrolet Volt (2016–2019)**,
in **Russian**, with three interactive calculators (battery health, resale value,
replacement-battery price) and an **AI chat assistant** that answers questions
about the car.

Static site, **no build step** — plain HTML/CSS/JS. Open `index.html` directly,
or serve the folder, to develop locally.

## Architecture & account split (the important part)

Two halves living under **two different accounts**:

| Piece | What | Where it lives |
|-------|------|----------------|
| **Website** (static front-end) | `index.html`, `styles.css`, `script.js`, `chat.js`, `volt.jpg` | GitHub Pages, repo **`valeriy-doc/chevy-volt-gen2`** |
| **Chat backend** (`chat-proxy/`) | Cloudflare Worker that holds the Anthropic API key and calls Claude | **Cloudflare account of `vstepanovdev`** (worker `volt-chat-proxy`) |

The browser calls the Worker; the Worker calls Claude. The API key is a Cloudflare
**secret** — never in the repo, never in the browser.

```
Browser  ─►  Cloudflare Worker (holds key)  ─►  Claude API
```

## Live URLs

- Site: `https://valeriy-doc.github.io/chevy-volt-gen2/`
- Worker: `https://volt-chat-proxy.vstepanovdev.workers.dev` (also set in `chat.js`)

## Common tasks

**Change the site** (content, calculators, chat UI, suggested questions):
edit files → commit → `git push`. GitHub Pages redeploys in ~1–2 min. Hard-refresh
(`Cmd+Shift+R`) to bypass the 10-min browser cache when verifying.

**Change the chat backend** (`chat-proxy/`): edit `worker.js` / `wrangler.toml`,
then from `chat-proxy/`:

```
wrangler deploy                     # redeploy
wrangler secret put ANTHROPIC_API_KEY   # rotate the key (run in a real terminal)
```

Edit `ALLOWED_ORIGINS` in `wrangler.toml` to change which site(s) may call the
Worker (currently only `https://valeriy-doc.github.io`).

## Key facts

- **Model:** `claude-sonnet-4-6` (set in `worker.js`). `claude-haiku-4-5` is
  cheaper; `claude-opus-4-8` is top quality.
- **System prompt:** in `worker.js` — scopes the assistant to Volt questions and
  Russian answers, concise, no Markdown headers.
- **Protections:** origin lock (only the father's site) + payload caps
  (`MAX_TOKENS`, message/char limits). The real cost ceiling is a **monthly spend
  limit set in the Anthropic console** — the native Cloudflare rate-limit binding
  was tried and *failed open* on this account, so it's intentionally not used.
- **Units:** the whole site uses **km** (EPA miles were converted); prices in USD.
- **Suggested questions:** `PRESET_QUESTIONS` array in `chat.js`; 3 shown at random
  on an empty chat.

## Gotchas

- **Edge propagation:** for ~30–60s after `wrangler deploy`, Cloudflare serves a
  mix of old and new worker versions. Wait before trusting a test result.
- **You (`vstepanovdev`) are a collaborator, not owner** — push access yes, repo
  admin/settings (e.g. Pages source) no. Repo settings changes need `valeriy-doc`.
- **Attribution:** `volt.jpg` is CC BY-SA 4.0 (Kevauto, Wikimedia Commons) —
  credited in the page footer; keep the credit.
- `Archive.zip` in the root is a stray local file, gitignored — not part of the site.

# Volt chat proxy (Cloudflare Worker)

A tiny serverless proxy that lets the static site talk to the Claude API
**without exposing the API key**. The key lives on Cloudflare as an encrypted
secret; the browser only ever talks to this worker.

```
Browser (public)  ─►  this Worker (holds key)  ─►  api.anthropic.com
```

## One-time setup

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and an
[Anthropic API key](https://console.anthropic.com/) (with billing enabled).

```bash
# 1. Install the Cloudflare CLI (once)
npm install -g wrangler

# 2. Log in to Cloudflare (opens a browser)
wrangler login

# 3. From this chat-proxy/ folder, store your Anthropic key as a secret.
#    Paste the key when prompted — it goes straight into Cloudflare's
#    encrypted store and is never written to any file or shown again.
wrangler secret put ANTHROPIC_API_KEY

# 4. Deploy
wrangler deploy
```

`wrangler deploy` prints your worker URL, e.g.:

```
https://volt-chat-proxy.YOUR-SUBDOMAIN.workers.dev
```

## Wire it to the site

Open `../chat.js` and set `CHAT_API_URL` to that worker URL, then commit &
push. The chat widget goes live.

## Verify

```bash
curl -X POST https://volt-chat-proxy.YOUR-SUBDOMAIN.workers.dev \
  -H "Content-Type: application/json" \
  -H "Origin: https://vstepanovdev.github.io" \
  -d '{"messages":[{"role":"user","content":"Какой запас хода у Volt?"}]}'
```

You should see a stream of `data:` lines. A request **without** that `Origin`
header (or with a different one) is rejected with `403` — that's the origin lock
working.

## Cost & abuse notes

- Each reply is capped at `MAX_TOKENS = 1024` in `worker.js`. On Opus 4.8 that's
  roughly a few cents per conversation at most; switch `MODEL` to
  `claude-haiku-4-5` in `worker.js` to cut that ~5× for a high-traffic public
  widget.
- **Origin lock** stops other websites' browsers from using your key, but a
  determined person running `curl` can still send a fake `Origin`. For real
  protection, either uncomment the `CHAT_LIMITER` block in `wrangler.toml`
  (per-IP rate limit) or add a **Rate limiting rule** on the worker route in the
  Cloudflare dashboard. For a hobby site the origin lock + token cap is usually
  enough — just keep an eye on your Anthropic usage dashboard.
- The key is **only** ever in Cloudflare's secret store. It is not in this repo,
  not in the browser, and not visible to the site's visitors.

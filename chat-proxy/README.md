# Volt chat proxy (Cloudflare Worker)

A small Cloudflare Worker that lets the site use Claude **without exposing the
API key**. The key is stored as an encrypted Cloudflare secret; the browser only
ever talks to this worker, never the Claude API directly.

```
Browser  ─►  this Worker (holds the key)  ─►  Claude API
```

## Maintenance (site owner only)

Assumes the worker already exists and you are logged in (`wrangler login`).
Run these from this folder:

| Task | Command |
|------|---------|
| Redeploy after editing `worker.js` | `wrangler deploy` |
| Rotate / change the API key | `wrangler secret put ANTHROPIC_API_KEY` |
| Change which site(s) may call it | edit `ALLOWED_ORIGINS` in `wrangler.toml`, then redeploy |

## Protections

- **Origin lock** — requests are accepted only from the site's own origin.
- **Payload caps** — replies and conversation history are length-limited to
  bound cost per request.
- **Rate limiting** *(optional)* — uncomment the `CHAT_LIMITER` block in
  `wrangler.toml` and redeploy to cap requests per IP.

Keep an eye on usage in the Anthropic console and set a monthly spend limit
there as a hard ceiling.

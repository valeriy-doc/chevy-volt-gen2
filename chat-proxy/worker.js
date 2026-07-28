/* =======================================================================
   Chevrolet Volt Gen 2 — Claude chat proxy (Cloudflare Worker)

   This sits between the static site and the Claude API. The API key is
   stored as an ENCRYPTED SECRET on Cloudflare (never in this file, never
   sent to the browser). Set it once with:

       wrangler secret put ANTHROPIC_API_KEY

   The browser calls THIS worker; the worker calls Claude. The key never
   reaches the client. Protections built in:
     - Origin allow-list  (blocks other websites' browsers)
     - payload caps        (max messages / chars / output tokens)
     - optional rate limit (enable the CHAT_LIMITER binding — see README)
   ======================================================================= */

const MODEL = "claude-sonnet-4-6"; // "claude-haiku-4-5" = cheaper, "claude-opus-4-8" = top quality
const MAX_TOKENS = 1024;         // caps the length (and cost) of each reply
const MAX_MESSAGES = 20;         // caps conversation history sent upstream
const MAX_CHARS_PER_MSG = 2000;  // caps each individual message

const SYSTEM_PROMPT = `Ты — дружелюбный помощник на любительском сайте о Chevrolet Volt второго поколения (2016–2019).
Отвечай на вопросы об этом автомобиле: характеристики, батарея, зарядка, надёжность, покупка на вторичном рынке, обслуживание.

Ключевые факты для справки:
- Электрозапас ~85 км (53 мили EPA), общий запас хода ~676 км.
- Батарея 18.4 кВт·ч (~14 полезных), жидкостное охлаждение, 192 ячейки.
- Двигатель-генератор 1.5 л; электромотор 149 л.с. / 398 Нм; разгон 0–100 км/ч ~8.0 с.
- Зарядка: Level 1 (120 В) ~13 ч, Level 2 (240 В) ~4.5 ч, в 2019 — опция 7.2 кВт ~2.3 ч.
- Гарантия на батарею 8 лет / 160 000 км. Модель снята с производства в начале 2019.

Правила:
- Отвечай кратко и по делу, обычным текстом (без Markdown-заголовков и таблиц), сразу давай ответ без вступлений вроде «Отличный вопрос».
- Отвечай на языке пользователя (по умолчанию — русский).
- Если вопрос не про Chevrolet Volt, вежливо верни разговор к теме автомобиля.
- Не давай юридических или инвестиционных советов; все цифры ориентировочные — советуй проверять актуальные данные у дилера.`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const corsOrigin = allowed.includes(origin) ? origin : allowed[0] || "*";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(corsOrigin) });
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, corsOrigin);
    }

    // Origin lock — a browser on any other site is rejected.
    if (allowed.length && !allowed.includes(origin)) {
      return json({ error: "Origin not allowed" }, 403, corsOrigin);
    }

    // Optional rate limiting (enable the CHAT_LIMITER binding in wrangler.toml).
    if (env.CHAT_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") || "anon";
      const { success } = await env.CHAT_LIMITER.limit({ key: ip });
      if (!success) {
        return json(
          { error: "Слишком много запросов. Попробуйте через минуту." },
          429,
          corsOrigin
        );
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Bad JSON" }, 400, corsOrigin);
    }

    let messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages || messages.length === 0) {
      return json({ error: "No messages" }, 400, corsOrigin);
    }

    // Sanitize + cap what we forward upstream.
    messages = messages.slice(-MAX_MESSAGES).map((m) => ({
      role: m && m.role === "assistant" ? "assistant" : "user",
      content: String((m && m.content) || "").slice(0, MAX_CHARS_PER_MSG),
    }));

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        stream: true,
        messages,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      return json(
        { error: "Upstream error", status: upstream.status, detail: detail.slice(0, 500) },
        502,
        corsOrigin
      );
    }

    // Pass the Server-Sent Events stream straight back to the browser.
    return new Response(upstream.body, {
      headers: {
        ...corsHeaders(corsOrigin),
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  },
};

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(origin), "content-type": "application/json" },
  });
}

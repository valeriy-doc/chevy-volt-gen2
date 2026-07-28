/* =======================================================================
   Volt Gen 2 — chat widget (client side)

   Talks to the Cloudflare Worker proxy, which holds the Claude API key.
   No key is present or needed here — this file is 100% safe to publish.

   After deploying the worker (see chat-proxy/README.md), paste its URL
   into CHAT_API_URL below.
   ======================================================================= */

"use strict";

// Deployed Cloudflare Worker proxy (holds the API key server-side).
const CHAT_API_URL = "https://volt-chat-proxy.vstepanovdev.workers.dev";

const NOT_CONFIGURED = CHAT_API_URL.includes("YOUR-SUBDOMAIN");

const history = []; // {role, content} pairs sent to the proxy
let busy = false;

function el(id) {
  return document.getElementById(id);
}

function addBubble(role, text) {
  const wrap = document.createElement("div");
  wrap.className = "chat-msg chat-" + role;
  wrap.textContent = text;
  const log = el("chatLog");
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
  return wrap;
}

function setBusy(state) {
  busy = state;
  el("chatSend").disabled = state;
  el("chatInput").disabled = state;
}

async function send() {
  const input = el("chatInput");
  const text = input.value.trim();
  if (!text || busy) return;

  if (NOT_CONFIGURED) {
    addBubble("user", text);
    addBubble(
      "assistant",
      "Чат ещё не подключён: нужно указать адрес прокси в chat.js (см. chat-proxy/README.md)."
    );
    input.value = "";
    return;
  }

  input.value = "";
  addBubble("user", text);
  history.push({ role: "user", content: text });

  setBusy(true);
  const bubble = addBubble("assistant", "");
  bubble.classList.add("chat-typing");

  try {
    const resp = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });

    if (!resp.ok || !resp.body) {
      throw new Error("HTTP " + resp.status);
    }

    // Read the SSE stream and append text deltas as they arrive.
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep the last (possibly partial) line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let evt;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }
        if (
          evt.type === "content_block_delta" &&
          evt.delta &&
          evt.delta.type === "text_delta"
        ) {
          bubble.classList.remove("chat-typing");
          answer += evt.delta.text;
          bubble.textContent = answer;
          el("chatLog").scrollTop = el("chatLog").scrollHeight;
        } else if (evt.type === "error") {
          throw new Error((evt.error && evt.error.message) || "stream error");
        }
      }
    }

    bubble.classList.remove("chat-typing");
    if (!answer) {
      bubble.textContent = "Не удалось получить ответ. Попробуйте ещё раз.";
    } else {
      history.push({ role: "assistant", content: answer });
    }
  } catch (err) {
    bubble.classList.remove("chat-typing");
    bubble.textContent =
      "Ошибка связи с ассистентом. Попробуйте позже. (" + err.message + ")";
  } finally {
    setBusy(false);
    el("chatInput").focus();
  }
}

function toggleChat(open) {
  const panel = el("chatPanel");
  panel.hidden = !open;
  if (open) el("chatInput").focus();
}

document.addEventListener("DOMContentLoaded", () => {
  el("chatLauncher").addEventListener("click", () => toggleChat(true));
  el("chatClose").addEventListener("click", () => toggleChat(false));
  el("chatSend").addEventListener("click", send);
  el("chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
});

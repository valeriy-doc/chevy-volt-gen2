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

// Library of starter questions — a few are shown at random on an empty chat.
const PRESET_QUESTIONS = [
  "Насколько надёжна батарея после 150 000 км?",
  "Стоит ли брать Volt, если негде заряжать дома?",
  "Сколько стоит замена батареи?",
  "Как холод влияет на запас хода зимой?",
  "Почему Volt сняли с производства?",
  "Какой расход бензина, если не заряжать?",
  "На что смотреть при покупке б/у Volt?",
  "Можно ли зарядить Volt на быстрой станции (DC)?",
  "Чем второе поколение лучше первого?",
  "Подходит ли Volt для дальних поездок?",
  "Как часто выходит из строя 12-вольтовый аккумулятор?",
  "2018 Volt или подержанный Chevrolet Bolt — что выбрать?",
];
const SUGGEST_COUNT = 3;

const history = []; // {role, content} pairs sent to the proxy
let busy = false;

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderSuggestions() {
  clearSuggestions();
  const wrap = document.createElement("div");
  wrap.className = "chat-suggest";
  wrap.id = "chatSuggest";
  for (const q of shuffled(PRESET_QUESTIONS).slice(0, SUGGEST_COUNT)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chat-chip";
    chip.textContent = q;
    chip.addEventListener("click", () => {
      el("chatInput").value = q;
      send();
    });
    wrap.appendChild(chip);
  }
  el("chatLog").appendChild(wrap);
}

function clearSuggestions() {
  const s = el("chatSuggest");
  if (s) s.remove();
}

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
  clearSuggestions();
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
  if (open) {
    if (history.length === 0) renderSuggestions(); // fresh picks each open
    el("chatInput").focus();
  }
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

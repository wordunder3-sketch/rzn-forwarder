// RZN v16 SECURE — GOLDEN v14 + Secrets + Verified Auth
// Токен НЕ в коде, берется только из env: BOT_TOKEN, ADMIN_TELEGRAM_ID, SESSION_SECRET
// GOLDEN v14 поведение сохранено: dual-send канал+форум, 1 копия, без года/района, хештеги только в Telegram

const FORUM_ID = -1003905818473;
const CHANNEL = "@rzn_graffiti_archive";
const TOPICS = { "HGK": 7, "NGL": 6, "Джаст": 5, "Just": 19, "ОПА": 342 };
const TIERS = { WRITER: 50, BOMBER: 150, KING: 300, LEGEND: 500 };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" }
  });
}

async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Проверка Telegram initData (WebApp)
async function verifyInitData(env, initData) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const checkString = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join("\n");
    const secretKey = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("WebAppData" + env.BOT_TOKEN));
    const key = await crypto.subtle.importKey("raw", secretKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(checkString));
    const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
    if (hex !== hash) return null;
    const user = JSON.parse(params.get("user") || "{}");
    return user;
  } catch { return null; }
}

async function makeSession(env, user) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 30;
  const payload = `${user.id}.${exp}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const isAdmin = String(user.id) === String(env.ADMIN_TELEGRAM_ID);
  return { token: `${payload}.${sigB64}`, user, isAdmin, exp };
}

async function verifySession(env, token) {
  try {
    const [id, exp, sigB64] = token.split(".");
    if (Date.now() > Number(exp)) return null;
    const payload = `${id}.${exp}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sigBytes = Uint8Array.from(atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
    if (!ok) return null;
    return { id: Number(id), isAdmin: String(id) === String(env.ADMIN_TELEGRAM_ID) };
  } catch { return null; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({ ok: true });

    // Проверка что секреты на месте
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, version: "v16 SECURE", auth: "ready", has_token: !!env.BOT_TOKEN, has_admin: !!env.ADMIN_TELEGRAM_ID, has_session: !!env.SESSION_SECRET });
    }

    // --- AUTH для сайта: сайт шлет initData, мы проверяем и выдаем сессию ---
    if (url.pathname === "/auth" && request.method === "POST") {
      const { initData } = await request.json().catch(() => ({}));
      const user = await verifyInitData(env, initData || "");
      if (!user || !user.id) return json({ ok: false, error: "bad_initData" }, 401);
      const sess = await makeSession(env, user);
      return json({ ok: true, ...sess });
    }

    // --- SEND с сайта: только с валидной сессией ---
    if (url.pathname === "/send" && request.method === "POST") {
      const auth = request.headers.get("Authorization") || "";
      const token = auth.replace("Bearer ", "");
      const sess = await verifySession(env, token);
      if (!sess) return json({ ok: false, error: "unauthorized" }, 401);

      const data = await request.json().catch(() => ({}));
      const { author, title, crew, photo, comment } = data;
      // На сайте НЕТ хештегов, НЕТ района, НЕТ года
      const captionSite = `✍️ ${esc(author)}\n${esc(title || "")}\n${crew ? `Команда: ${esc(crew)}` : ""}\n${comment ? esc(comment) : ""}`.trim();
      // В Telegram — с хештегами
      const hashtags = crew ? `#${crew.replace(/[^A-Za-zА-Яа-я0-9_]/g, "")} #RZN #Graffiti #Ryazan` : `#RZN #Graffiti #Ryazan`;
      const captionTG = captionSite + `\n\n${hashtags}`;

      // 1. Канал
      let channelMsg = null;
      if (photo) channelMsg = await tg(env, "sendPhoto", { chat_id: CHANNEL, photo, caption: captionTG });
      else channelMsg = await tg(env, "sendMessage", { chat_id: CHANNEL, text: captionTG });

      // 2. Форум — 1 копия, в топик по команде, General без thread_id если нет топика
      const threadId = TOPICS[crew] || null;
      const forumBody = photo
        ? { chat_id: FORUM_ID, photo, caption: captionTG, ...(threadId ? { message_thread_id: threadId } : {}) }
        : { chat_id: FORUM_ID, text: captionTG, ...(threadId ? { message_thread_id: threadId } : {}) };
      const forumMsg = await tg(env, photo ? "sendPhoto" : "sendMessage", forumBody);

      return json({ ok: true, channel: channelMsg, forum: forumMsg, author_id: sess.id, isAdmin: sess.isAdmin });
    }

    // --- Telegram Webhook: /start, донаты Stars ---
    if (request.method === "POST") {
      const upd = await request.json().catch(() => ({}));
      // Stars: pre_checkout
      if (upd.pre_checkout_query) {
        await tg(env, "answerPreCheckoutQuery", { pre_checkout_query_id: upd.pre_checkout_query.id, ok: true });
        return json({ ok: true });
      }
      // Stars: успешный платеж
      if (upd.message?.successful_payment) {
        const pay = upd.message.successful_payment;
        const chatId = upd.message.chat.id;
        const amount = pay.total_amount; // в Stars
        let tier = "WRITER";
        if (amount >= 500) tier = "LEGEND"; else if (amount >= 300) tier = "KING"; else if (amount >= 150) tier = "BOMBER";
        await tg(env, "sendMessage", { chat_id: chatId, text: `Спасибо! ⭐ ${amount} Stars — титул ${tier} активирован.\n\nЗагружай свои теги в приложении RZN GRAFFITI TAGS.` });
        return json({ ok: true });
      }
      const msg = upd.message || upd.callback_query?.message;
      const text = upd.message?.text || upd.callback_query?.data || "";
      const chatId = msg?.chat?.id;
      if (chatId && text === "/start") {
        await tg(env, "sendMessage", {
          chat_id: chatId,
          text: `Привет! Это архив RZN GRAFFITI TAGS.\n\n📸 Загружай теги в приложении\n⭐ Донат — /donate\n\nWRITER 50 ⭐ | BOMBER 150 ⭐ | KING 300 ⭐ | LEGEND 500 ⭐`,
          reply_markup: { inline_keyboard: [[{ text: "⭐ Донат — поддержать архив", callback_data: "donate" }]] }
        });
        return json({ ok: true });
      }
      if (upd.callback_query?.data === "donate" || text === "/donate") {
        const cid = upd.callback_query?.message?.chat?.id || chatId;
        await tg(env, "sendMessage", {
          chat_id: cid, text: "Выбери титул:",
          reply_markup: { inline_keyboard: [
            [{ text: "WRITER — 50 ⭐", callback_data: "buy_WRITER" }],
            [{ text: "BOMBER — 150 ⭐", callback_data: "buy_BOMBER" }],
            [{ text: "KING — 300 ⭐", callback_data: "buy_KING" }],
            [{ text: "LEGEND — 500 ⭐", callback_data: "buy_LEGEND" }]
          ]}
        });
        return json({ ok: true });
      }
      if (upd.callback_query?.data?.startsWith("buy_")) {
        const tier = upd.callback_query.data.replace("buy_", "");
        const price = TIERS[tier] || 50;
        const cid = upd.callback_query.message.chat.id;
        await tg(env, "sendInvoice", {
          chat_id: cid, title: `Титул ${tier}`, description: `Поддержка архива RZN. Титул ${tier} в профиле.`,
          payload: `tier_${tier}`, currency: "XTR", prices: [{ label: tier, amount: price }]
        });
        return json({ ok: true });
      }
      return json({ ok: true });
    }
    return json({ ok: false, error: "not_found" }, 404);
  }
};

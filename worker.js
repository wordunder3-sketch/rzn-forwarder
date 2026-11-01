const BOT_TOKEN = "9036965917:AAFl2i0zVQ-AhSKYUy4i3OxonnVd-azv4_o";
const FORUM_CHAT_ID = "-1003905818473";
const CHANNEL_USERNAME = "@rzn_graffiti_archive"; // для теста

export default {
  async fetch(request, env, ctx) {
    const api = async (method, body) => {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const txt = await res.text();
      try { return JSON.parse(txt); } catch(e){ return {ok:false, raw:txt.slice(0,500)}; }
    };

    // ТЕСТ по GET - открой https://rzn-forwarder.wordunder3.workers.dev/ в браузере
    if (request.method === "GET") {
      const r1 = await api("sendMessage", { chat_id: FORUM_CHAT_ID, message_thread_id: 1, text: `✅ Воркер живой! ${new Date().toISOString()}\nЕсли ты видишь это в General - бот админ и может писать.` });
      const r2 = await api("getWebhookInfo", {});
      return new Response(`TEST SEND to General: ${JSON.stringify(r1)}\n\nWEBHOOK: ${JSON.stringify(r2)}\n\nОткрой форум General - должно прийти сообщение. Если не пришло - бот НЕ админ или токен не тот.`, { status: 200 });
    }

    try {
      const update = await request.json();

      if (update.channel_post) {
        const post = update.channel_post;
        const fromId = post.chat.id;
        const mid = post.message_id;
        const cap = (post.caption || post.text || "").slice(0,200);

        // Пробуем 3 способа, пишем результат в General
        // 1) copyMessage в General
        let res = await api("copyMessage", { chat_id: FORUM_CHAT_ID, message_thread_id: 1, from_chat_id: fromId, message_id: mid });
        if (!res.ok) {
          await api("sendMessage", { chat_id: FORUM_CHAT_ID, message_thread_id: 1, text: `❌ copyMessage в General не сработал: ${res.description}\nfrom_chat_id=${fromId} message_id=${mid}\ncap=${cap}\n\nПробую forwardMessage...` });
          // 2) forwardMessage
          let res2 = await api("forwardMessage", { chat_id: FORUM_CHAT_ID, message_thread_id: 1, from_chat_id: fromId, message_id: mid });
          if (!res2.ok) {
            await api("sendMessage", { chat_id: FORUM_CHAT_ID, message_thread_id: 1, text: `❌ forward тоже упал: ${res2.description}\n\nПроверь что бот @rzn_archive_2026_bot админ в КАНАЛЕ тоже, и в форуме с правом 'Управление темами'` });
          }
        } else {
          // если в General скопировалось - копируем в нужную папку
          const upper = (post.caption || post.text || "").toUpperCase();
          const THREADS = { "JUST": 19, "ДЖАСТ": 5, "NGL": 6, "HGK": 7, "ОПА": 342, "OPA": 342 };
          let target = 1;
          for (const k in THREADS) if (upper.includes(k)) { target = THREADS[k]; break; }
          if (target !== 1) {
            await api("copyMessage", { chat_id: FORUM_CHAT_ID, message_thread_id: target, from_chat_id: fromId, message_id: mid });
          }
        }
      }
      return new Response("ok", {status:200});
    } catch(e){ return new Response("ok", {status:200}); }
  }
}

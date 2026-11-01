const BOT_TOKEN = "9036965917:AAFl2i0zVQ-AhSKYUy4i3OxonnVd-azv4_o";
const FORUM_CHAT_ID = "-1003905818473";

export default {
  async fetch(request, env, ctx) {
    const api = async (method, body) => {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const txt = await res.text();
      try { return JSON.parse(txt); } catch(e){ return {ok:false, raw:txt}; }
    };

    if (request.method === "GET") {
      // тест без thread_id и с thread_id 1
      const a = await api("sendMessage", { chat_id: FORUM_CHAT_ID, text: `✅ Тест БЕЗ thread_id - если видишь это в General, значит General = без ID` });
      const b = await api("sendMessage", { chat_id: FORUM_CHAT_ID, message_thread_id: 1, text: `Тест С thread_id=1` });
      return new Response(`Без thread: ${JSON.stringify(a)}\nС thread 1: ${JSON.stringify(b)}\n\nЕсли первое ok=true а второе false - то General надо слать без thread_id`, { status: 200 });
    }

    try {
      const update = await request.json();

      if (update.channel_post) {
        const post = update.channel_post;
        const upper = (post.caption || post.text || "").toUpperCase();
        
        // ID из твоих скринов, General будем слать без ID
        const THREADS = {
          "JUST": 19,
          "ДЖАСТ": 5,
          "NGL": 6,
          "HGK": 7,
          "ОПА": 342, "OPA": 342
        };
        
        let target = null; // null = General без thread_id
        for (const k in THREADS) if (upper.includes(k)) { target = THREADS[k]; break; }

        let res;
        if (target === null) {
          // General - БЕЗ message_thread_id
          res = await api("copyMessage", { chat_id: FORUM_CHAT_ID, from_chat_id: post.chat.id, message_id: post.message_id });
        } else {
          // Команда - С thread_id
          res = await api("copyMessage", { chat_id: FORUM_CHAT_ID, message_thread_id: target, from_chat_id: post.chat.id, message_id: post.message_id });
          if (!res.ok) {
            // фолбек в General без ID
            await api("sendMessage", { chat_id: FORUM_CHAT_ID, text: `⚠️ Не скопировал в ${target}: ${res.description}, кидаю в General` });
            res = await api("copyMessage", { chat_id: FORUM_CHAT_ID, from_chat_id: post.chat.id, message_id: post.message_id });
          }
        }
      }

      // команды /id - всегда отвечаем с тем thread_id в котором спросили
      if (update.message) {
        const t = (update.message.text || "").trim();
        if (t.startsWith("/id")) {
          await api("sendMessage", {
            chat_id: update.message.chat.id,
            message_thread_id: update.message.message_thread_id,
            text: `📍 Chat: ${update.message.chat.id}\n🧵 Thread: ${update.message.message_thread_id||'General (без ID)'}`,
            reply_to_message_id: update.message.message_id
          });
        }
      }

      return new Response("ok", {status:200});
    } catch(e){ return new Response("ok", {status:200}); }
  }
}

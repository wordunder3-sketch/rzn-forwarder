const BOT_TOKEN = "9036965917:AAFl2i0zVQ-AhSKYUy4i3OxonnVd-azv4_o";
const FORUM_CHAT_ID = "-1003905818473";
const CHANNEL_ID = "-1001383119145"; // из твоего лога

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
      // тест: пишем в General без thread и в Hgk с thread 7
      const a = await api("sendMessage", { chat_id: FORUM_CHAT_ID, text: `✅ v13 LIVE ${new Date().toISOString()} - General без thread_id работает` });
      const b = await api("sendMessage", { chat_id: FORUM_CHAT_ID, message_thread_id: 7, text: `✅ v13 LIVE - Hgk топик 7 работает` });
      const wh = await api("getWebhookInfo", {});
      return new Response(`General без thread: ${JSON.stringify(a)}\nHgk с thread 7: ${JSON.stringify(b)}\n\nWebhook: ${JSON.stringify(wh)}\n\nЕсли оба ok=true - воркер может писать везде`, { status: 200 });
    }

    try {
      const update = await request.json();

      if (update.channel_post) {
        const post = update.channel_post;
        const cap = (post.caption || post.text || "");
        const upper = cap.toUpperCase();

        const THREADS = {
          "JUST": 19, "ДЖАСТ": 5, "NGL": 6, "HGK": 7, "ОПА": 342, "OPA": 342
        };
        let target = null;
        for (const k in THREADS) if (upper.includes(k)) { target = THREADS[k]; break; }

        let copyParams;
        if (target === null) {
          // General - БЕЗ message_thread_id (критично!)
          copyParams = { chat_id: FORUM_CHAT_ID, from_chat_id: post.chat.id, message_id: post.message_id };
        } else {
          copyParams = { chat_id: FORUM_CHAT_ID, message_thread_id: target, from_chat_id: post.chat.id, message_id: post.message_id };
        }

        const res = await api("copyMessage", copyParams);
        if (!res.ok) {
          // пишем ошибку в General БЕЗ thread_id чтобы ты увидел
          await api("sendMessage", {
            chat_id: FORUM_CHAT_ID,
            text: `❌ COPY FAIL в ${target||'General'}: ${res.description}\nfrom=${post.chat.id} mid=${post.message_id}\ncap=${cap.slice(0,150)}`
          });
        }
      }

      if (update.message && update.message.text?.startsWith("/id")) {
        const tid = update.message.message_thread_id;
        let payload = { chat_id: update.message.chat.id, text: `📍 Chat: ${update.message.chat.id}\n🧵 Thread: ${tid||'General БЕЗ ID'}`, reply_to_message_id: update.message.message_id };
        if (tid) payload.message_thread_id = tid;
        await api("sendMessage", payload);
      }

      return new Response("ok", { status: 200 });
    } catch (e) { return new Response("ok", { status: 200 }); }
  }
}

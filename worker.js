const BOT_TOKEN = "9036965917:AAFl2i0zVQ-AhSKYUy4i3OxonnVd-azv4_o";
const FORUM_CHAT_ID = "-1003905818473";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      return new Response("RZN v12 - GENERAL WITHOUT THREAD_ID - OK " + new Date().toISOString(), { status: 200 });
    }
    try {
      const update = await request.json();
      const api = async (method, body) => {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const txt = await res.text();
        try { return JSON.parse(txt); } catch(e){ return {ok:false, raw:txt}; }
      };

      if (update.pre_checkout_query) { await api("answerPreCheckoutQuery", { pre_checkout_query_id: update.pre_checkout_query.id, ok: true }); return new Response("ok",{status:200}); }
      if (update.callback_query) {
        const cb = update.callback_query; const data = cb.data || "";
        const chatId = cb.message?.chat?.id || cb.from.id;
        if (data.startsWith("donate_")) {
          const amount = parseInt(data.split("_")[1]);
          await api("answerCallbackQuery", { callback_query_id: cb.id, text: `Счёт на ${amount} ⭐` });
          await api("sendInvoice", { chat_id: chatId, title: `Поддержка`, description: `Донат`, payload: data, currency: "XTR", prices: [{ label: "Поддержка", amount: amount }] });
        }
        return new Response("ok",{status:200});
      }
      if (update.message?.successful_payment) {
        await api("sendMessage", { chat_id: update.message.chat.id, text: `Спасибо за ${update.message.successful_payment.total_amount} ⭐!` });
        // в General БЕЗ thread_id
        try { await api("sendMessage", { chat_id: FORUM_CHAT_ID, text: `💰 Донат ${update.message.successful_payment.total_amount} ⭐ от @${update.message.from.username || update.message.from.first_name}` }); } catch(e){}
        return new Response("ok",{status:200});
      }
      if (update.message) {
        const text = (update.message.text || "").trim();
        const chatId = update.message.chat.id; const threadId = update.message.message_thread_id;
        if (text.startsWith("/id")) {
          const reply = { chat_id: chatId, text: `📍 Chat ID: ${chatId}\n🧵 Thread ID: ${threadId||"БЕЗ ID (это General)"}\n\nGeneral = без thread_id`, reply_to_message_id: update.message.message_id };
          if (threadId) reply.message_thread_id = threadId;
          await api("sendMessage", reply);
          return new Response("ok",{status:200});
        }
        if (text.startsWith("/start") || text.startsWith("/donate")) {
          const payload = { chat_id: chatId, text: `RZN ARCHIVE ⭐`, reply_markup: { inline_keyboard: [[{ text: "50 ⭐", callback_data: "donate_50" }],[{ text: "150 ⭐", callback_data: "donate_150" }],[{ text: "300 ⭐", callback_data: "donate_300" }],[{ text: "500 ⭐", callback_data: "donate_500" }]] } };
          if (threadId) payload.message_thread_id = threadId;
          await api("sendMessage", payload);
          return new Response("ok",{status:200});
        }
      }

      // === ФОРВАРД ИЗ КАНАЛА В ФОРУМ - ФИКС GENERAL ===
      if (update.channel_post) {
        const post = update.channel_post;
        const upper = (post.caption || post.text || "").toUpperCase();

        const THREADS = {
          "JUST": 19, "ДЖАСТ": 5, "NGL": 6, "HGK": 7, "ОПА": 342, "OPA": 342
        };
        let targetThread = null;
        for (const k in THREADS) if (upper.includes(k)) { targetThread = THREADS[k]; break; }
        
        // если не нашли команду - в General (БЕЗ thread_id)
        if (!targetThread) {
          let r = await api("copyMessage", { chat_id: FORUM_CHAT_ID, from_chat_id: post.chat.id, message_id: post.message_id });
          if (!r.ok) {
            await api("sendMessage", { chat_id: FORUM_CHAT_ID, text: `❌ Не скопировал в General: ${r.description}` });
          }
          return new Response("ok",{status:200});
        }

        // копируем в папку команды ОДИН РАЗ
        let res = await api("copyMessage", {
          chat_id: FORUM_CHAT_ID,
          message_thread_id: targetThread,
          from_chat_id: post.chat.id,
          message_id: post.message_id
        });
        if (!res.ok) {
          // фолбек в General без thread_id + ошибка
          await api("sendMessage", { chat_id: FORUM_CHAT_ID, text: `⚠️ Не смог в топик ${targetThread} (${res.description}), кидаю в General\nCaption: ${(post.caption||'').slice(0,200)}` });
          await api("copyMessage", { chat_id: FORUM_CHAT_ID, from_chat_id: post.chat.id, message_id: post.message_id });
        }
      }
      return new Response("ok", { status: 200 });
    } catch (e) { return new Response("ok", { status: 200 }); }
  }
}

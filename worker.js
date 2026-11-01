const BOT_TOKEN = "9036965917:AAFl2i0zVQ-AhSKYUy4i3OxonnVd-azv4_o";
const FORUM_CHAT_ID = "-1003905818473";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      return new Response("RZN v8 FORWARD DEBUG TG - OK " + new Date().toISOString(), { status: 200 });
    }
    try {
      const update = await request.json();

      const api = async (method, body) => {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const txt = await res.text();
        let data;
        try { data = JSON.parse(txt); } catch(e){ data = {ok:false, raw:txt}; }
        return data;
      };

      // Stars
      if (update.pre_checkout_query) {
        await api("answerPreCheckoutQuery", { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
        return new Response("ok", { status: 200 });
      }
      if (update.callback_query) {
        const cb = update.callback_query;
        const data = cb.data || "";
        const chatId = cb.message?.chat?.id || cb.from.id;
        if (data.startsWith("donate_")) {
          const amount = parseInt(data.split("_")[1]);
          await api("answerCallbackQuery", { callback_query_id: cb.id, text: `Счёт на ${amount} ⭐` });
          await api("sendInvoice", { chat_id: chatId, title: `Поддержка RZN`, description: `Донат`, payload: data, currency: "XTR", prices: [{ label: "Поддержка", amount: amount }] });
        }
        return new Response("ok", { status: 200 });
      }
      if (update.message?.successful_payment) {
        await api("sendMessage", { chat_id: update.message.chat.id, text: `Спасибо за ${update.message.successful_payment.total_amount} ⭐!` });
        return new Response("ok", { status: 200 });
      }
      if (update.message) {
        const text = (update.message.text || "").trim();
        const chatId = update.message.chat.id;
        const threadId = update.message.message_thread_id;
        if (text.startsWith("/id")) {
          await api("sendMessage", { chat_id: chatId, message_thread_id: threadId, text: `Chat: ${chatId}\nThread: ${threadId||1}` });
          return new Response("ok", { status: 200 });
        }
        if (text.startsWith("/start") || text.startsWith("/donate")) {
          await api("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `RZN ARCHIVE ⭐`,
            reply_markup: { inline_keyboard: [[{ text: "WRITER 50 ⭐", callback_data: "donate_50" }],[{ text: "BOMBER 150 ⭐", callback_data: "donate_150" }],[{ text: "KING 300 ⭐", callback_data: "donate_300" }],[{ text: "LEGEND 500 ⭐", callback_data: "donate_500" }]] }
          });
          return new Response("ok", { status: 200 });
        }
      }

      // === ФОРВАРД КАНАЛ -> ФОРУМ С ДЕБАГОМ В GENERAL ===
      if (update.channel_post) {
        const post = update.channel_post;
        const caption = (post.caption || post.text || "");
        const upper = caption.toUpperCase();

        // сразу пишем в General что получили channel_post — чтобы ты видел что воркер жив
        await api("sendMessage", {
          chat_id: FORUM_CHAT_ID,
          message_thread_id: 1,
          text: `🔍 DEBUG: получил channel_post\nCaption: ${caption.slice(0,400)}\nChatID: ${post.chat.id} MsgID: ${post.message_id}`
        });

        const THREADS = {
          "JUST": 5, "ДЖАСТ": 5,
          "NGL": 6,
          "HGK": 7,
          "ОПА": 342, "OPA": 342
        };

        let targetThread = 1;
        for (const k in THREADS) {
          if (upper.includes(k)) { targetThread = THREADS[k]; break; }
        }

        // пробуем скопировать
        let res = await api("copyMessage", {
          chat_id: FORUM_CHAT_ID,
          message_thread_id: targetThread,
          from_chat_id: post.chat.id,
          message_id: post.message_id
        });

        if (!res.ok) {
          // если не вышло в нужный топик — пробуем в General без thread_id
          await api("sendMessage", {
            chat_id: FORUM_CHAT_ID,
            message_thread_id: 1,
            text: `⚠️ Не смог скопировать в топик ${targetThread}: ${res.description || JSON.stringify(res).slice(0,500)}\nПробую в General...`
          });
          // вторая попытка в General
          let res2 = await api("copyMessage", {
            chat_id: FORUM_CHAT_ID,
            message_thread_id: 1,
            from_chat_id: post.chat.id,
            message_id: post.message_id
          });
          if (!res2.ok) {
            await api("sendMessage", {
              chat_id: FORUM_CHAT_ID,
              message_thread_id: 1,
              text: `❌ Вторая попытка тоже не удалась: ${res2.description || JSON.stringify(res2).slice(0,500)}\n\nПроверь ID топиков: JUST=5 NGL=6 HGK=7 ОПА=342. Может топики удалены.`
            });
          }
        }
      }

      return new Response("ok", { status: 200 });
    } catch (e) {
      try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: FORUM_CHAT_ID, message_thread_id: 1, text: `💥 FATAL в воркере: ${e.message}\n${e.stack?.slice(0,500)}` })
        });
      } catch {}
      return new Response("ok", { status: 200 });
    }
  }
}

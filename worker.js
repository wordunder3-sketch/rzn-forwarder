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
      return new Response("RZN v15 REPLY NOTIFY + STARS + GOLDEN - OK", { status: 200 });
    }

    try {
      const update = await request.json();

      // Stars
      if (update.pre_checkout_query) { await api("answerPreCheckoutQuery", { pre_checkout_query_id: update.pre_checkout_query.id, ok: true }); return new Response("ok", { status: 200 }); }
      if (update.callback_query) {
        const cb = update.callback_query; const data = cb.data || ""; const chatId = cb.message?.chat?.id || cb.from.id; const threadId = cb.message?.message_thread_id;
        if (data.startsWith("donate_")) {
          const amount = parseInt(data.split("_")[1]);
          await api("answerCallbackQuery", { callback_query_id: cb.id, text: `Счёт на ${amount} ⭐` });
          let payload = { chat_id: chatId, title: `Поддержка`, description: `Донат`, payload: data, currency: "XTR", prices: [{ label: "Поддержка", amount: amount }] };
          if (threadId) payload.message_thread_id = threadId;
          await api("sendInvoice", payload);
        }
        return new Response("ok", { status: 200 });
      }
      if (update.message?.successful_payment) {
        const msg = update.message;
        await api("sendMessage", { chat_id: msg.chat.id, text: `🔥 Спасибо за ${msg.successful_payment.total_amount} ⭐!`, message_thread_id: msg.message_thread_id });
        try { await api("sendMessage", { chat_id: FORUM_CHAT_ID, text: `💰 Донат ${msg.successful_payment.total_amount} ⭐ от @${msg.from.username || msg.from.first_name}` }); } catch(e){}
        return new Response("ok", { status: 200 });
      }

      // Команды /id /start
      if (update.message) {
        const text = (update.message.text || "").trim();
        const chatId = update.message.chat.id;
        const threadId = update.message.message_thread_id;

        if (text.startsWith("/id")) {
          let payload = { chat_id: chatId, text: `📍 Chat ID: ${chatId}\n🧵 Thread ID: ${threadId||"General (без ID)"}`, reply_to_message_id: update.message.message_id };
          if (threadId) payload.message_thread_id = threadId;
          await api("sendMessage", payload);
          return new Response("ok", { status: 200 });
        }
        if (text.startsWith("/start") || text.startsWith("/donate") || text.toLowerCase().includes("донат")) {
          let payload = {
            chat_id: chatId,
            text: `RZN GRAFFITI ARCHIVE ⭐\nАрхив держится на энтузиазме.\nДеньги идут на сканер 90-х и хостинг.\n\nВыбери уровень:`,
            reply_markup: { inline_keyboard: [[{ text: "WRITER — 50 ⭐", callback_data: "donate_50" }],[{ text: "BOMBER — 150 ⭐", callback_data: "donate_150" }],[{ text: "KING — 300 ⭐", callback_data: "donate_300" }],[{ text: "LEGEND — 500 ⭐", callback_data: "donate_500" }]] }
          };
          if (threadId) payload.message_thread_id = threadId;
          await api("sendMessage", payload);
          return new Response("ok", { status: 200 });
        }

        // === УВЕДОМЛЕНИЕ ОБ ОТВЕТЕ НА КОММЕНТАРИЙ ===
        // Если сообщение - ответ на другое сообщение в форуме
        if (chatId.toString() === FORUM_CHAT_ID && update.message.reply_to_message) {
          const orig = update.message.reply_to_message;
          const replier = update.message.from;
          const origAuthor = orig.from;

          // не уведомляем самого себя и ботов
          if (origAuthor && replier && origAuthor.id !== replier.id && !origAuthor.is_bot && !replier.is_bot) {
            const origName = origAuthor.username ? `@${origAuthor.username}` : origAuthor.first_name;
            const replierName = replier.username ? `@${replier.username}` : replier.first_name;
            const threadName = threadId ? `топик ${threadId}` : "General";

            // 1. Тег в том же топике (чтобы было видно в чате)
            try {
              let notifyText = `🔔 ${origName}, тебе ответили в ${threadName}!\n👤 ${replierName}: ${(update.message.text || "[фото/стикер]").slice(0,150)}`;
              let payload = { chat_id: FORUM_CHAT_ID, text: notifyText, reply_to_message_id: update.message.message_id };
              if (threadId) payload.message_thread_id = threadId;
              await api("sendMessage", payload);
            } catch(e){}

            // 2. Личка от бота (если юзер хоть раз нажимал /start)
            try {
              await api("sendMessage", {
                chat_id: origAuthor.id,
                text: `💬 Тебе ответили в RZN архиве!\n\nВ ${threadName}:\n👤 ${replierName}: ${(update.message.text || "[фото]").slice(0,300)}\n\n👉 Открыть: https://t.me/c/3905818473/${threadId||1}/${update.message.message_id}`
              });
            } catch(e){
              // юзер не запускал бота - не можем писать в личку, это норм
              console.log("DM fail", e);
            }
          }
        }
      }

      return new Response("ok", { status: 200 });
    } catch (e) { return new Response("ok", { status: 200 }); }
  }
}

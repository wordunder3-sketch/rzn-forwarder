const BOT_TOKEN = "9036965917:AAFl2i0zVQ-AhSKYUy4i3OxonnVd-azv4_o";
const FORUM_CHAT_ID = "-1003905818473";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      return new Response("RZN v6 DEBUG FORWARD - OK " + new Date().toISOString(), { status: 200 });
    }
    try {
      const update = await request.json();
      console.log("UPDATE TYPE:", Object.keys(update).join(','), JSON.stringify(update).slice(0,3000));

      const api = async (method, body) => {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const txt = await res.text();
        console.log(`API ${method} -> ${res.status}: ${txt.slice(0,2000)}`);
        try { return JSON.parse(txt); } catch(e){ return {ok:false, raw:txt}; }
      };

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
          await api("sendInvoice", {
            chat_id: chatId,
            title: `Поддержка RZN - ${amount} ⭐`,
            description: `Поддержка архива ${amount} звёзд`,
            payload: data,
            currency: "XTR",
            prices: [{ label: "Поддержка", amount: amount }]
          });
        }
        return new Response("ok", { status: 200 });
      }
      if (update.message?.successful_payment) {
        const msg = update.message;
        await api("sendMessage", { chat_id: msg.chat.id, text: `🔥 Спасибо за ${msg.successful_payment.total_amount} ⭐! Ты KING!` });
        return new Response("ok", { status: 200 });
      }
      if (update.message) {
        const text = (update.message.text || "").trim();
        const chatId = update.message.chat.id;
        const threadId = update.message.message_thread_id;
        if (text.startsWith("/id")) {
          await api("sendMessage", { chat_id: chatId, message_thread_id: threadId, text: `Chat: ${chatId}\nThread: ${threadId||1}`, reply_to_message_id: update.message.message_id });
          return new Response("ok", { status: 200 });
        }
        if (text.startsWith("/start") || text.startsWith("/donate") || text.toLowerCase().includes("донат")) {
          await api("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `RZN ARCHIVE ⭐\n\nВыбери уровень:`,
            reply_markup: {
              inline_keyboard: [
                [{ text: "WRITER — 50 ⭐", callback_data: "donate_50" }],
                [{ text: "BOMBER — 150 ⭐", callback_data: "donate_150" }],
                [{ text: "KING — 300 ⭐", callback_data: "donate_300" }],
                [{ text: "LEGEND — 500 ⭐", callback_data: "donate_500" }]
              ]
            }
          });
          return new Response("ok", { status: 200 });
        }
      }

      // === ФОРВАРД КАНАЛ -> ФОРУМ ===
      if (update.channel_post) {
        const post = update.channel_post;
        const caption = (post.caption || post.text || "");
        const upper = caption.toUpperCase();
        console.log("CHANNEL_POST received! Chat:", post.chat.id, "Caption:", caption.slice(0,500));

        const THREADS = {
          "JUST": 5, "ДЖАСТ": 5,
          "NGL": 6,
          "HGK": 7,
          "ОПА": 342, "OPA": 342,
          "RAS": 5, "RASOE": 5
        };

        let targetThread = 1; // General по умолчанию
        for (const k in THREADS) {
          if (upper.includes(k)) {
            targetThread = THREADS[k];
            console.log(`MATCH crew ${k} -> thread ${targetThread}`);
            break;
          }
        }

        console.log(`Copying to forum ${FORUM_CHAT_ID} thread ${targetThread}`);

        const result = await api("copyMessage", {
          chat_id: FORUM_CHAT_ID,
          message_thread_id: targetThread,
          from_chat_id: post.chat.id,
          message_id: post.message_id
        });
        console.log("copyMessage result:", JSON.stringify(result).slice(0,2000));
      }

      return new Response("ok", { status: 200 });
    } catch (e) {
      console.log("FATAL:", e.message, e.stack);
      return new Response("ok", { status: 200 });
    }
  }
}

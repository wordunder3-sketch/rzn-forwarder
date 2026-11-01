const BOT_TOKEN = "9036965917:AAFl2i0zVQ-AhSKYUy4i3OxonnVd-azv4_o";
const FORUM_CHAT_ID = "-1003905818473";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      return new Response("RZN FINAL v5 NO-YEAR-FOLDERS - OK " + new Date().toISOString(), { status: 200 });
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
        try { return JSON.parse(txt); } catch(e){ return {ok:false, raw:txt}; }
      };

      // Stars - pre_checkout
      if (update.pre_checkout_query) {
        await api("answerPreCheckoutQuery", { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
        return new Response("ok", { status: 200 });
      }

      // Stars - callback (оплата)
      if (update.callback_query) {
        const cb = update.callback_query;
        const data = cb.data || "";
        const chatId = cb.message?.chat?.id || cb.from.id;

        if (data.startsWith("donate_")) {
          const amount = parseInt(data.split("_")[1]);
          const tiers = {
            50: { title: "WRITER — RZN", desc: "Бейдж † у ника" },
            150: { title: "BOMBER — RZN", desc: "Цветной ник + без модерации" },
            300: { title: "KING — RZN", desc: "Приватный архив + стена почёта" },
            500: { title: "LEGEND — RZN", desc: "Всё + оцифровка плёнок и зин" }
          };
          const t = tiers[amount] || tiers[50];
          await api("answerCallbackQuery", { callback_query_id: cb.id, text: `Счёт на ${amount} ⭐` });
          await api("sendInvoice", {
            chat_id: chatId,
            title: `${t.title} — Поддержка`,
            description: t.desc,
            payload: data,
            currency: "XTR",
            prices: [{ label: "Поддержка", amount: amount }]
          });
        } else {
          await api("answerCallbackQuery", { callback_query_id: cb.id, text: "Кнопка работает!" });
        }
        return new Response("ok", { status: 200 });
      }

      // Stars - успешная оплата
      if (update.message?.successful_payment) {
        const msg = update.message;
        const pay = msg.successful_payment;
        const amount = pay.total_amount;
        let level = "WRITER";
        if (pay.invoice_payload.includes("500")) level = "LEGEND";
        else if (pay.invoice_payload.includes("300")) level = "KING";
        else if (pay.invoice_payload.includes("150")) level = "BOMBER";

        await api("sendMessage", {
          chat_id: msg.chat.id,
          text: `🔥 Ты теперь ${level}! Спасибо за ${amount} ⭐`
        });
        try {
          await api("sendMessage", {
            chat_id: FORUM_CHAT_ID,
            message_thread_id: 1,
            text: `💰 Донат ${amount} ⭐ от @${msg.from.username || msg.from.first_name} — ${level}`
          });
        } catch(e){}
        return new Response("ok", { status: 200 });
      }

      // Команды /id /start /donate
      if (update.message) {
        const text = (update.message.text || "").trim();
        const chatId = update.message.chat.id;
        const threadId = update.message.message_thread_id;

        if (text.startsWith("/id")) {
          await api("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `📍 Chat ID: ${chatId}\n🧵 Thread ID: ${threadId||1}`,
            reply_to_message_id: update.message.message_id
          });
          return new Response("ok", { status: 200 });
        }
        if (text.startsWith("/start") || text.startsWith("/donate") || text.toLowerCase().includes("донат")) {
          await api("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `RZN GRAFFITI ARCHIVE ⭐\nАрхив держится на энтузиазме.\nДеньги идут на сканер 90-х и хостинг.\n\nВыбери уровень:`,
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

      // === ФОРВАРД ИЗ КАНАЛА В ФОРУМ - НОВАЯ ЛОГИКА БЕЗ ГОДОВЫХ ПАПОК ===
      if (update.channel_post) {
        const post = update.channel_post;
        const caption = (post.caption || post.text || "");
        const upper = caption.toUpperCase();

        // Только папки команд, без годов!
        const THREADS = {
          "JUST": 5, "ДЖАСТ": 5,
          "NGL": 6,
          "HGK": 7,
          "ОПА": 342, "OPA": 342
          // добавь остальные команды через /id, но НЕ годы
        };

        // Ищем команду в тексте (поддерживаем и #HGK и #HGK2018 и JUST)
        let targetThread = null;
        for (const k in THREADS) {
          if (upper.includes(k)) {
            targetThread = THREADS[k];
            break;
          }
          // также ищем #HGK2018 -> содержит HGK
          // уже покрыто upper.includes
        }

        // Если не нашли команду - в General (ID 1)
        if (!targetThread) targetThread = 1;

        // Копируем только в ОДНУ папку команды, не в годовые!
        // Хештеги #HGK2018 #Ama остаются в тексте и кликабельны в форуме
        try {
          await api("copyMessage", {
            chat_id: FORUM_CHAT_ID,
            message_thread_id: targetThread,
            from_chat_id: post.chat.id,
            message_id: post.message_id
          });
        } catch(e){
          console.log("COPY ERR", e);
        }
      }

      return new Response("ok", { status: 200 });
    } catch (e) {
      return new Response("ok", { status: 200 });
    }
  }
}

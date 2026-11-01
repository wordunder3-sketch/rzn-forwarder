export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") {
      return new Response("RZN Forwarder + Stars OK - " + new Date().toISOString(), { status: 200 });
    }
    if (request.method !== "POST") return new Response("ok", { status: 200 });

    try {
      const update = await request.json();
      const BOT_TOKEN = env.BOT_TOKEN;
      const FORUM_CHAT_ID = env.FORUM_CHAT_ID || "-1003905818473";

      if (!BOT_TOKEN) {
        return new Response("no BOT_TOKEN env", { status: 200 });
      }

      const api = async (method, body) => {
        const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const j = await r.json();
        // для дебага можно логировать, но пока тихо
        return j;
      };

      // 1. pre_checkout - ОБЯЗАТЕЛЬНО для Stars
      if (update.pre_checkout_query) {
        await api("answerPreCheckoutQuery", {
          pre_checkout_query_id: update.pre_checkout_query.id,
          ok: true
        });
        return new Response("ok", { status: 200 });
      }

      // 2. callback кнопки
      if (update.callback_query) {
        const cb = update.callback_query;
        const data = cb.data || "";
        const chatId = cb.message?.chat?.id || cb.from?.id;

        if (data.startsWith("donate_")) {
          const amount = parseInt(data.split("_")[1]);
          const tiers = {
            50: { title: "WRITER - RZN Archive", desc: "Бейдж † у ника + спасибо в канале" },
            150: { title: "BOMBER - RZN Archive", desc: "Цветной ник, постинг без модерации" },
            300: { title: "KING - RZN Archive", desc: "Приватный архив 2010-14, стена почёта" },
            500: { title: "LEGEND - RZN Archive", desc: "Всё + оцифровка плёнок и зин" }
          };
          const tier = tiers[amount] || tiers[50];

          await api("answerCallbackQuery", { callback_query_id: cb.id, text: `Готовлю счёт на ${amount} ⭐` });

          await api("sendInvoice", {
            chat_id: chatId,
            title: tier.title,
            description: tier.desc,
            payload: data,
            currency: "XTR",
            prices: [{ label: "Поддержка", amount: amount }],
            start_parameter: "rzn_donate"
          });
        }
        return new Response("ok", { status: 200 });
      }

      // 3. успешная оплата
      if (update.message?.successful_payment) {
        const msg = update.message;
        const pay = msg.successful_payment;
        const amount = pay.total_amount;
        const payload = pay.invoice_payload;

        let level = "WRITER";
        if (payload.includes("500")) level = "LEGEND";
        else if (payload.includes("300")) level = "KING";
        else if (payload.includes("150")) level = "BOMBER";

        await api("sendMessage", {
          chat_id: msg.chat.id,
          text: `🔥 Ты теперь ${level}! Спасибо за ${amount} ⭐\n\nНапиши @Bttn ник на сайте — выдам бейдж.\nДеньги идут на сканер Epson V850.`
        });

        try {
          await api("sendMessage", {
            chat_id: FORUM_CHAT_ID,
            message_thread_id: 1,
            text: `💰 Донат ${amount} ⭐ — @${msg.from.username || msg.from.first_name} — ${level} — ${payload}`
          });
        } catch(e){}
        return new Response("ok", { status: 200 });
      }

      // 4. команды /start /id /donate /help
      if (update.message?.text) {
        const text = update.message.text.trim();
        const chatId = update.message.chat.id;
        const threadId = update.message.message_thread_id;

        // /id - для форума
        if (text.startsWith("/id")) {
          await api("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `📍 Chat ID: ${chatId}\n🧵 Thread ID: ${threadId || 1}`,
            reply_to_message_id: update.message.message_id
          });
          return new Response("ok", { status: 200 });
        }

        // /start и /donate и /help - всё ведёт в донат-меню
        if (text.startsWith("/start") || text.startsWith("/donate") || text.startsWith("/help") || text.toLowerCase().includes("донат")) {
          await api("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `RZN GRAFFITI ARCHIVE ⭐\n\nПривет! Это архив Рязани.\n\nЯ умею:\n• /id — узнать ID топика (в форуме)\n• /donate — поддержать архив звёздами\n\nДеньги идут на сканер плёнок 90-х, хостинг и печать зина.\n\nВыбери уровень:`,
            reply_markup: {
              inline_keyboard: [
                [{ text: "WRITER — 50 ⭐ (бейдж)", callback_data: "donate_50" }],
                [{ text: "BOMBER — 150 ⭐ (без модерации)", callback_data: "donate_150" }],
                [{ text: "KING — 300 ⭐ (приват)", callback_data: "donate_300" }],
                [{ text: "LEGEND — 500 ⭐ (зин)", callback_data: "donate_500" }]
              ]
            }
          });
          return new Response("ok", { status: 200 });
        }
      }

      // 5. форвард из канала @rzn_graffiti_archive в форум
      if (update.channel_post) {
        const post = update.channel_post;
        const caption = (post.caption || post.text || "").toUpperCase();

        const THREADS = {
          "JUST": 5, "ДЖАСТ": 5,
          "NGL": 6,
          "HGK": 7,
          "ОПА": 342, "OPA": 342
        };
        const YEAR_THREADS = {
          "2018": 20
        };

        const targets = new Set();
        for (const k in THREADS) if (caption.includes(k)) targets.add(THREADS[k]);
        const ym = caption.match(/#?20(1[4-9]|2[0-6])/);
        if (ym) {
          const y = ym[0].replace(/[^0-9]/g,"");
          if (YEAR_THREADS[y]) targets.add(YEAR_THREADS[y]);
        }
        if (targets.size === 0) targets.add(1);

        for (const tid of targets) {
          try {
            await api("copyMessage", {
              chat_id: FORUM_CHAT_ID,
              message_thread_id: tid,
              from_chat_id: post.chat.id,
              message_id: post.message_id
            });
          } catch(e){}
        }
      }

      return new Response("ok", { status: 200 });
    } catch (e) {
      return new Response("error " + e.message, { status: 200 });
    }
  }
}

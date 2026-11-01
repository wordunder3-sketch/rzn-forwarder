export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // health check
    if (url.pathname === "/") {
      return new Response("RZN Forwarder + Stars Donate is running", { status: 200 });
    }

    if (request.method !== "POST") {
      return new Response("ok", { status: 200 });
    }

    try {
      const update = await request.json();
      const BOT_TOKEN = env.BOT_TOKEN;
      const FORUM_CHAT_ID = env.FORUM_CHAT_ID || "-1003905818473";
      
      const api = async (method, body) => {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        return res.json();
      };

      // === 1. PRE_CHECKOUT (обязательно для Звёзд) ===
      if (update.pre_checkout_query) {
        await api("answerPreCheckoutQuery", {
          pre_checkout_query_id: update.pre_checkout_query.id,
          ok: true
        });
        return new Response("ok", { status: 200 });
      }

      // === 2. CALLBACK от кнопок доната ===
      if (update.callback_query) {
        const cb = update.callback_query;
        const data = cb.data || "";
        const chatId = cb.message?.chat?.id || cb.from.id;

        if (data.startsWith("donate_")) {
          const amount = parseInt(data.split("_")[1]); // 50,150,300,500
          const tiers = {
            50: { title: "WRITER - Поддержка RZN", desc: "Бейдж у ника + спасибо в канале. Поддерживаешь архив." },
            150: { title: "BOMBER - Поддержка RZN", desc: "Цветной ник, без премодерации, лимит 50 фото в день." },
            300: { title: "KING - Поддержка RZN", desc: "Приватный архив 2010-2014, стена почёта, HD без вотермарок." },
            500: { title: "LEGEND - Поддержка RZN", desc: "Всё + оцифровка твоих плёнок и упоминание в зине." }
          };
          const tier = tiers[amount] || tiers[50];

          // убираем часики у кнопки
          await api("answerCallbackQuery", { callback_query_id: cb.id });

          // отправляем инвойс на Звёзды
          await api("sendInvoice", {
            chat_id: chatId,
            title: tier.title,
            description: tier.desc,
            payload: data, // donate_150 и т.д.
            currency: "XTR",
            prices: [{ label: "Поддержка архива", amount: amount }],
            start_parameter: "rzn_donate"
          });
        }
        return new Response("ok", { status: 200 });
      }

      // === 3. УСПЕШНАЯ ОПЛАТА ЗВЁЗДАМИ ===
      if (update.message?.successful_payment) {
        const msg = update.message;
        const pay = msg.successful_payment;
        const amount = pay.total_amount; // в звёздах
        const payload = pay.invoice_payload; // donate_150

        let level = "WRITER";
        if (payload.includes("500")) level = "LEGEND";
        else if (payload.includes("300")) level = "KING";
        else if (payload.includes("150")) level = "BOMBER";

        // спасибо юзеру
        await api("sendMessage", {
          chat_id: msg.chat.id,
          text: `🔥 Спасибо! Ты теперь ${level} архива RZN!\n\n` +
                `Ты задонатил ${amount} ⭐\n\n` +
                `Напиши @Bttn в личку, скинь этот скрин и свой ник на сайте — выдам бейдж и доступ.\n\n` +
                `Все деньги идут на сканер для архивов 90-х и хостинг.`,
          parse_mode: "HTML"
        });

        // уведомление в General топик форума для тебя
        try {
          await api("sendMessage", {
            chat_id: FORUM_CHAT_ID,
            message_thread_id: 1,
            text: `💰 Новый донат! ${amount} ⭐ от @${msg.from.username || msg.from.first_name} — уровень ${level}\nPayload: ${payload}`
          });
        } catch(e){}

        return new Response("ok", { status: 200 });
      }

      // === 4. КОМАНДА /donate ===
      if (update.message?.text) {
        const text = update.message.text.trim();
        const chatId = update.message.chat.id;
        const threadId = update.message.message_thread_id;

        // /id - оставить как было
        if (text.startsWith("/id")) {
          await api("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `📍 Chat ID: ${chatId}\n🧵 Thread ID: ${threadId || 1}\n\nСкопируй Thread ID в THREADS в коде`,
            reply_to_message_id: update.message.message_id
          });
          return new Response("ok", { status: 200 });
        }

        if (text.startsWith("/donate") || text.startsWith("/start donate") || text.toLowerCase().includes("донат")) {
          await api("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `RZN GRAFFITI ARCHIVE — ПОДДЕРЖАТЬ ⭐\n\nАрхив держится на энтузиазме. Деньги идут на:\n• сканер плёнок 90-х\n• хостинг и домен\n• печать зина\n\nВыбери уровень:`,
            reply_markup: {
              inline_keyboard: [
                [{ text: "WRITER — 50 ⭐ (бейдж)", callback_data: "donate_50" }],
                [{ text: "BOMBER — 150 ⭐ (без модерации)", callback_data: "donate_150" }],
                [{ text: "KING — 300 ⭐ (приватный архив)", callback_data: "donate_300" }],
                [{ text: "LEGEND — 500 ⭐ (всё + зин)", callback_data: "donate_500" }]
              ]
            }
          });
          return new Response("ok", { status: 200 });
        }
      }

      // === 5. ФОРВАРД ИЗ КАНАЛА В ФОРУМ (твоя старая логика) ===
      if (update.channel_post) {
        const post = update.channel_post;
        const caption = (post.caption || post.text || "").toUpperCase();

        const THREADS = {
          "JUST": 5, "ДЖАСТ": 5,
          "NGL": 6,
          "HGK": 7,
          "ОПА": 342,
          "OPA": 342,
          "GGG": 6, // добавь свои
          "OP": 7
        };
        const YEAR_THREADS = {
          "2018": 20,
          "2014": 342, // заглушки - замени через /id
          "2015": 342,
          "2016": 342,
          "2017": 342,
          "2019": 20,
          "2020": 20,
          "2021": 20,
          "2022": 20,
          "2023": 20,
          "2024": 20
        };

        const targets = new Set();

        for (const k in THREADS) {
          if (caption.includes(k)) targets.add(THREADS[k]);
        }
        // ищем #2018 в тексте
        const yearMatch = caption.match(/#?20(1[4-9]|2[0-6])/);
        if (yearMatch) {
          const y = yearMatch[0].replace("#","").replace("#","").trim();
          const cleanY = y.replace(/[^0-9]/g,"");
          if (YEAR_THREADS[cleanY]) targets.add(YEAR_THREADS[cleanY]);
        }

        if (targets.size === 0) targets.add(1); // General

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
      return new Response("error: " + e.message, { status: 200 });
    }
  }
}

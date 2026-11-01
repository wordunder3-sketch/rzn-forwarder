const BOT_TOKEN = "9036965917:AAFl2i0zVQ-AhSKYUy4i3OxonnVd-azv4_o";
const FORUM_CHAT_ID = "-1003905818473";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      return new Response("RZN FINAL v4 Stars + Forum - OK " + new Date().toISOString(), { status: 200 });
    }

    try {
      const update = await request.json();
      console.log("UPDATE:", JSON.stringify(update).slice(0, 2000));

      const api = async (method, body) => {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const txt = await res.text();
        console.log(`API ${method} ${res.status}: ${txt.slice(0, 1500)}`);
        try { return JSON.parse(txt); } catch(e){ return {ok:false, raw:txt}; }
      };

      // 1. pre_checkout - ОБЯЗАТЕЛЬНО для Stars!
      if (update.pre_checkout_query) {
        await api("answerPreCheckoutQuery", {
          pre_checkout_query_id: update.pre_checkout_query.id,
          ok: true
        });
        return new Response("ok", { status: 200 });
      }

      // 2. callback - кнопки доната
      if (update.callback_query) {
        const cb = update.callback_query;
        const data = cb.data || "";
        const chatId = cb.message?.chat?.id || cb.from.id;

        console.log("CALLBACK:", data);

        if (data.startsWith("donate_")) {
          const amount = parseInt(data.split("_")[1]);
          const tiers = {
            50: { title: "WRITER — RZN", desc: "Бейдж † у ника + спасибо в канале" },
            150: { title: "BOMBER — RZN", desc: "Цветной ник, без модерации, 50 фото/день" },
            300: { title: "KING — RZN", desc: "Приватный архив 2010-14, стена почёта, HD" },
            500: { title: "LEGEND — RZN", desc: "Всё + оцифровка плёнок и зин" }
          };
          const t = tiers[amount] || tiers[50];

          await api("answerCallbackQuery", { callback_query_id: cb.id, text: `Готовлю счёт на ${amount} ⭐` });

          const inv = await api("sendInvoice", {
            chat_id: chatId,
            title: `${t.title} — Поддержка`,
            description: t.desc,
            payload: data,
            currency: "XTR",
            prices: [{ label: "Поддержка архива", amount: amount }]
          });
          console.log("INVOICE RESULT:", JSON.stringify(inv).slice(0,1000));
        } else {
          await api("answerCallbackQuery", { callback_query_id: cb.id, text: "Кнопка работает!" });
        }
        return new Response("ok", { status: 200 });
      }

      // 3. успешная оплата Stars
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
          text: `🔥 Спасибо! Ты теперь ${level} архива RZN!\n\nЗадонатил ${amount} ⭐\nНапиши @Bttn ник на сайте — выдам бейдж 👑`
        });

        try {
          await api("sendMessage", {
            chat_id: FORUM_CHAT_ID,
            message_thread_id: 1,
            text: `💰 Донат ${amount} ⭐ от @${msg.from.username || msg.from.first_name} — ${level} — ${payload}`
          });
        } catch(e){ console.log("FORUM NOTIFY ERR", e.message); }

        return new Response("ok", { status: 200 });
      }

      // 4. сообщения /start /donate /id
      if (update.message) {
        const text = (update.message.text || "").trim();
        const chatId = update.message.chat.id;
        const threadId = update.message.message_thread_id;

        if (text.startsWith("/id")) {
          await api("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `📍 Chat ID: ${chatId}\n🧵 Thread ID: ${threadId||1}\n\nСкопируй Thread ID в код`,
            reply_to_message_id: update.message.message_id
          });
          return new Response("ok", { status: 200 });
        }

        if (text.startsWith("/start") || text.startsWith("/donate") || text.toLowerCase().includes("донат")) {
          await api("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `RZN GRAFFITI ARCHIVE ⭐\n\nАрхив держится на энтузиазме.\nДеньги идут на сканер 90-х и хостинг.\n\nВыбери уровень поддержки:`,
            reply_markup: {
              inline_keyboard: [
                [{ text: "WRITER — 50 ⭐ (бейдж)", callback_data: "donate_50" }],
                [{ text: "BOMBER — 150 ⭐ (без модерации)", callback_data: "donate_150" }],
                [{ text: "KING — 300 ⭐ (приват)", callback_data: "donate_300" }],
                [{ text: "LEGEND — 500 ⭐ (всё + зин)", callback_data: "donate_500" }]
              ]
            }
          });
          return new Response("ok", { status: 200 });
        }
      }

      // 5. форвард из канала в форум (твоя старая функция, остаётся!)
      if (update.channel_post) {
        const post = update.channel_post;
        const caption = (post.caption || post.text || "").toUpperCase();
        console.log("CHANNEL POST:", caption.slice(0,200));

        const THREADS = {
          "JUST": 5, "ДЖАСТ": 5,
          "NGL": 6,
          "HGK": 7,
          "ОПА": 342, "OPA": 342
        };
        const YEAR_THREADS = {
          "2018": 20,
          "2019": 20,
          "2020": 20,
          "2021": 20,
          "2022": 20,
          "2023": 20,
          "2024": 20
        };

        const targets = new Set();
        for (const k in THREADS) if (caption.includes(k)) targets.add(THREADS[k]);
        const ym = caption.match(/#?20(1[4-9]|2[0-6])/);
        if (ym) {
          const clean = ym[0].replace(/[^0-9]/g,"");
          if (YEAR_THREADS[clean]) targets.add(YEAR_THREADS[clean]);
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
          } catch(e){ console.log("COPY ERR", tid, e.message); }
        }
      }

      return new Response("ok", { status: 200 });
    } catch (e) {
      console.log("FATAL ERROR:", e.message, e.stack);
      return new Response("ok", { status: 200 });
    }
  }
}

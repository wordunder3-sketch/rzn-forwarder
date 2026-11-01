BOT_TOKEN = "9036965917:AAFl2i0zVQ-AhSKYUy4i3OxonnVd-azv4_o";
const FORUM_CHAT_ID = "-1003905818473";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (url.pathname === "/") {
      return new Response("RZN Bot v3 Stars - OK - " + new Date().toISOString(), { status: 200 });
    }
    if (request.method !== "POST") {
      return new Response("ok", { status: 200 });
    }

    try {
      const update = await request.json();
      
      const api = async (method, body) => {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const j = await res.json();
        console.log(method, JSON.stringify(j).slice(0,500));
        return j;
      };

      // === PRE_CHECKOUT (обязательно!) ===
      if (update.pre_checkout_query) {
        await api("answerPreCheckoutQuery", {
          pre_checkout_query_id: update.pre_checkout_query.id,
          ok: true
        });
        return new Response("ok", { status: 200 });
      }

      // === CALLBACK ===
      if (update.callback_query) {
        const cb = update.callback_query;
        const data = cb.data || "";
        const chatId = cb.message?.chat?.id || cb.from.id;

        await api("answerCallbackQuery", { callback_query_id: cb.id, text: "Готовлю счёт..." });

        if (data.startsWith("donate_")) {
          const amount = parseInt(data.split("_")[1]);
          const tiers = {
            50: { title: "WRITER", desc: "Бейдж у ника + спасибо в канале" },
            150: { title: "BOMBER", desc: "Цветной ник, без модерации" },
            300: { title: "KING", desc: "Приватный архив 2010-14, стена почёта, HD" },
            500: { title: "LEGEND", desc: "Всё + оцифровка плёнок и зин" }
          };
          const t = tiers[amount] || tiers[50];
          await api("sendInvoice", {
            chat_id: chatId,
            title: `${t.title} — Поддержка RZN`,
            description: t.desc,
            payload: data,
            currency: "XTR",
            prices: [{ label: "Поддержка архива", amount: amount }]
          });
        }
        return new Response("ok", { status: 200 });
      }

      // === SUCCESSFUL PAYMENT ===
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
          text: `🔥 Спасибо! Ты теперь ${level} архива!\n\nТы задонатил ${amount} ⭐\nНапиши @Bttn ник на сайте — выдам бейдж.`
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

      // === MESSAGES ===
      if (update.message) {
        const text = (update.message.text || "").trim();
        const chatId = update.message.chat.id;
        const threadId = update.message.message_thread_id;
        const msgId = update.message.message_id;

        // /id
        if (text.startsWith("/id")) {
          await api("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `📍 Chat ID: ${chatId}\n🧵 Thread ID: ${threadId || 1}`,
            reply_to_message_id: msgId
          });
          return new Response("ok", { status: 200 });
        }

        // /start и /donate
        if (text.startsWith("/start") || text.startsWith("/donate") || text.toLowerCase().includes("донат")) {
          await api("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `RZN GRAFFITI ARCHIVE\n\nПоддержи архив ⭐\nДеньги идут на сканер 90-х и хостинг.\n\nВыбери уровень:`,
            reply_markup: {
              inline_keyboard: [
                [{ text: "WRITER — 50 ⭐ (бейдж)", callback_data: "donate_50" }],
                [{ text: "BOMBER — 150 ⭐ (без модера)", callback_data: "donate_150" }],
                [{ text: "KING — 300 ⭐ (приват)", callback_data: "donate_300" }],
                [{ text: "LEGEND — 500 ⭐ (всё + зин)", callback_data: "donate_500" }]
              ]
            }
          });
          return new Response("ok", { status: 200 });
        }
      }

      // === CHANNEL POST FORWARD ===
      if (update.channel_post) {
        const post = update.channel_post;
        const caption = (post.caption || post.text || "").toUpperCase();
        const THREADS = { "JUST":5,"ДЖАСТ":5,"NGL":6,"HGK":7,"ОПА":342,"OPA":342 };
        const YEAR_THREADS = { "2018":20,"2019":20,"2020":20,"2021":20,"2022":20,"2023":20,"2024":20 };
        const targets = new Set();
        for (const k in THREADS) if (caption.includes(k)) targets.add(THREADS[k]);
        const ym = caption.match(/#?20(1[4-9]|2[0-6])/);
        if (ym) {
          const clean = ym[0].replace(/[^0-9]/g,"");
          if (YEAR_THREADS[clean]) targets.add(YEAR_THREADS[clean]);
        }
        if (targets.size===0) targets.add(1);
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

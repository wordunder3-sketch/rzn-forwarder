const BOT_TOKEN = "9036965917:AAFl2i0zVQ-AhSKYUy4i3OxonnVd-azv4_o";
const FORUM_CHAT_ID = "-1003905818473";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      return new Response("RZN TEST PING " + new Date().toISOString(), { status: 200 });
    }
    
    try {
      const update = await request.json();
      
      // ЛОГ ВСЕГО АПДЕЙТА В CLOUDFLARE
      console.log("UPDATE:", JSON.stringify(update).slice(0, 2000));

      const api = async (method, body) => {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const txt = await res.text();
        console.log(`API ${method} -> ${res.status}: ${txt.slice(0,1000)}`);
        return JSON.parse(txt);
      };

      // Любое сообщение - отвечаем PONG
      if (update.message) {
        const chatId = update.message.chat.id;
        const text = update.message.text || "";
        const threadId = update.message.message_thread_id;

        // Проверка /id для форума - оставляем
        if (text.startsWith("/id")) {
          await api("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `📍 Chat: ${chatId}\n🧵 Thread: ${threadId||1}`
          });
          return new Response("ok", { status: 200 });
        }

        // ВСЁ остальное - просто PONG + донат меню
        await api("sendMessage", {
          chat_id: chatId,
          message_thread_id: threadId,
          text: `PONG ✅ Воркер работает!\nТы написал: ${text}\n\nТеперь жми донат:`,
          reply_markup: {
            inline_keyboard: [
              [{ text: "50 ⭐", callback_data: "donate_50" }],
              [{ text: "150 ⭐", callback_data: "donate_150" }],
              [{ text: "300 ⭐", callback_data: "donate_300" }],
              [{ text: "500 ⭐", callback_data: "donate_500" }]
            ]
          }
        });
        return new Response("ok", { status: 200 });
      }

      if (update.callback_query) {
        const cb = update.callback_query;
        await api("answerCallbackQuery", { callback_query_id: cb.id, text: "Кнопка работает!" });
        console.log("CALLBACK DATA:", cb.data);
        return new Response("ok", { status: 200 });
      }

      if (update.channel_post) {
        console.log("CHANNEL POST RECEIVED");
        // пока не форвардим, только лог
        return new Response("ok", { status: 200 });
      }

      return new Response("ok", { status: 200 });
    } catch (e) {
      console.log("ERROR:", e.message, e.stack);
      return new Response("ok", { status: 200 });
    }
  }
}

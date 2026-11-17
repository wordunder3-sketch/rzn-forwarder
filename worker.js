// RZN v16 SECURE Worker - BOT_TOKEN только из env, проверка Telegram initData
// В Cloudflare Dashboard -> Workers -> rzn-forwarder -> Settings -> Variables:
//  BOT_TOKEN = 903696... (НОВЫЙ после ротации, старый уже утек в фронт)
//  ADMIN_TELEGRAM_ID = 123456789 (твой Telegram ID, узнай через @userinfobot)
//  SESSION_SECRET = случайная длинная строка

const FORUM_CHAT_ID = "-1003905818473";

function json(data, status=200){
  return new Response(JSON.stringify(data), { status, headers: {"Content-Type":"application/json", "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Methods":"POST, GET, OPTIONS", "Access-Control-Allow-Headers":"Content-Type"} });
}

async function hmacSha256(key, message){
  let k = await crypto.subtle.importKey("raw", key, {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  let sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}
function toHex(bytes){ return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function sha256Bytes(text){ let d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return new Uint8Array(d); }

async function verifyInitData(initData, botToken){
  try{
    let params = new URLSearchParams(initData);
    let hash = params.get("hash");
    if(!hash) return null;
    params.delete("hash");
    // Проверка срока - не старше 24ч
    let authDate = parseInt(params.get("auth_date")||"0");
    if(Date.now()/1000 - authDate > 86400) return null;
    // Сортировка ключей
    let keys = [...params.keys()].sort();
    let check = keys.map(k=> k+"="+params.get(k)).join("\n");
    let secret = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
    let calc = await hmacSha256(secret, check);
    let calcHex = toHex(calc);
    if(calcHex !== hash) return null;
    let user = JSON.parse(params.get("user")||"{}");
    if(!user.id) return null;
    return user; // {id, first_name, username, ...}
  }catch(e){ return null; }
}

async function makeSessionToken(telegramId, sessionSecret){
  let payload = telegramId + "." + Math.floor(Date.now()/1000);
  let sig = await hmacSha256(new TextEncoder().encode(sessionSecret), payload);
  return payload + "." + toHex(sig).slice(0,32);
}

export default {
  async fetch(request, env, ctx){
    const BOT_TOKEN = env.BOT_TOKEN || "";
    const SESSION_SECRET = env.SESSION_SECRET || "change-me";
    const ADMIN_ID = String(env.ADMIN_TELEGRAM_ID || "");

    if(request.method === "OPTIONS") return new Response(null, {status:204, headers:{"Access-Control-Allow-Origin":"*", "Access-Control-Allow-Methods":"POST, GET, OPTIONS", "Access-Control-Allow-Headers":"Content-Type"}});

    const url = new URL(request.url);

    // === /auth - проверка Telegram initData, выдача session ===
    if(url.pathname === "/auth" && request.method === "POST"){
      try{
        let body = await request.json().catch(()=>({}));
        let initData = body.initData || "";
        if(!BOT_TOKEN) return json({ok:false, error:"BOT_TOKEN not set in env"}, 500);
        let user = await verifyInitData(initData, BOT_TOKEN);
        if(!user) return json({ok:false, error:"invalid initData"}, 401);
        let token = await makeSessionToken(String(user.id), SESSION_SECRET);
        let isAdmin = String(user.id)===ADMIN_ID; return json({ok:true, telegram_id: String(user.id), first_name: user.first_name||"", username: user.username||"", is_admin: isAdmin, isAdmin: isAdmin, session_token: token, token: token});
      }catch(e){ return json({ok:false, error: String(e)}, 500); }
    }

    // === /send - отправка в канал + архив форум, только по сессии админа ===
    if(url.pathname === "/send" && request.method === "POST"){
      try{
        let auth = request.headers.get("Authorization") || "";
        let token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if(!token) return json({ok:false, error:"no token"}, 401);
        // token = telegramId.timestamp.sig (sig = HMAC(SESSION_SECRET, telegramId.timestamp).slice 0,32)
        let parts = token.split(".");
        if(parts.length!==3) return json({ok:false, error:"bad token"}, 401);
        let payload = parts[0] + "." + parts[1];
        let sig = await hmacSha256(new TextEncoder().encode(SESSION_SECRET), payload);
        let expect = toHex(sig).slice(0,32);
        if(expect !== parts[2]) return json({ok:false, error:"bad sig"}, 401);
        if(String(parts[0]) !== ADMIN_ID) return json({ok:false, error:"not admin"}, 403);
        let body = await request.json().catch(()=>({}));
        let author = body.author || "";
        let title = body.title || body.tag || "";
        let crew = body.crew || "";
        let photo = body.photo || body.imgUrl || body.image_url || "";
        let comment = body.comment || body.year || "";
        if(!photo) return json({ok:false, error:"no photo"}, 400);
        let _crewTag = String(crew||"").replace(/[^A-Za-zА-Яа-яЁё0-9_]/g,"");
        let _titleTag = String(title||"").replace(/[^A-Za-zА-Яа-яЁё0-9_]/g,"");
        let _ym = String(comment||"").match(/(19|20)\d{2}/);
        let _year = _ym ? _ym[0] : "";
        let _tags = [];
        if(_crewTag) _tags.push("#"+_crewTag);
        if(_titleTag && _year) _tags.push("#"+_titleTag+_year);
        if(_titleTag) _tags.push("#"+_titleTag);
        let cap = (crew?`👥 ${crew} `:'') + `🎨 ${title} | ${comment}\n👤 ${author}` + (_tags.length ? `\n${_tags.join(" ")}` : "");
        // 1. В канал
        let r1 = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({chat_id:"@rzn_graffiti_archive", photo: photo, caption: cap})});
        let j1 = await r1.json().catch(()=>({ok:false}));
        // 2. В форум архив
        let THREADS_MAP = {"JUST":19,"ДЖАСТ":5,"NGL":6,"HGK":7,"ОПА":342,"OPA":342};
        let upper = (crew+" "+title).toUpperCase();
        let target = null;
        for(const k in THREADS_MAP){ if(upper.includes(k)){ target=THREADS_MAP[k]; break; } }
        let payload2 = {chat_id: FORUM_CHAT_ID, photo: photo, caption: cap};
        if(target!==null) payload2.message_thread_id = target;
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload2)});
        return json({ok: !!j1.ok, channel: j1});
      }catch(e){ return json({ok:false, error: String(e)}, 500); }
    }

    const api = async (method, body) => {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      const txt = await res.text();
      try{ return JSON.parse(txt); }catch(e){ return {ok:false, raw:txt}; }
    };

    // === Telegram webhook - звёзды /id /start (как в v14) ===
    if(request.method === "GET"){
      // Не шлем сообщение при каждом GET в v16, чтобы не спамить - просто пинг
      return new Response("v16 SECURE ok - /auth ready", {status:200});
    }

    try{
      const update = await request.json();
      if(update.pre_checkout_query){
        await api("answerPreCheckoutQuery", {pre_checkout_query_id: update.pre_checkout_query.id, ok:true});
        return new Response("ok", {status:200});
      }
      if(update.callback_query){
        const cb = update.callback_query;
        const data = cb.data || "";
        const chatId = cb.message?.chat?.id || cb.from.id;
        const msgThread = cb.message?.message_thread_id;
        if(data.startsWith("donate_")){
          const amount = parseInt(data.split("_")[1]);
          const tiers = {50:{title:"WRITER — RZN", desc:"Бейдж у ника"},150:{title:"BOMBER — RZN", desc:"Цветной ник + без модерации"},300:{title:"KING — RZN", desc:"Приватный архив + стена почёта"},500:{title:"LEGEND — RZN", desc:"Всё + оцифровка плёнок и зин"}};
          const t = tiers[amount] || tiers[50];
          await api("answerCallbackQuery", {callback_query_id: cb.id, text: `Счёт на ${amount} ⭐`});
          let inv = {chat_id: chatId, title: `${t.title} — Поддержка`, description: t.desc, payload: data, currency:"XTR", prices:[{label:"Поддержка", amount}]};
          if(msgThread) inv.message_thread_id = msgThread;
          await api("sendInvoice", inv);
        } else {
          await api("answerCallbackQuery", {callback_query_id: cb.id, text:"Кнопка работает!"});
        }
        return new Response("ok", {status:200});
      }
      if(update.message?.successful_payment){
        const msg = update.message;
        const pay = msg.successful_payment;
        const amount = pay.total_amount;
        let level="WRITER";
        if(pay.invoice_payload.includes("500")) level="LEGEND";
        else if(pay.invoice_payload.includes("300")) level="KING";
        else if(pay.invoice_payload.includes("150")) level="BOMBER";
        await api("sendMessage", {chat_id: msg.chat.id, text: `Ты теперь ${level}! Спасибо за ${amount} ⭐`, message_thread_id: msg.message_thread_id});
        try{ await api("sendMessage", {chat_id: FORUM_CHAT_ID, text: `Донат ${amount} ⭐ от @${msg.from.username||msg.from.first_name} — ${level}`}); }catch(e){}
        return new Response("ok", {status:200});
      }
      if(update.message){
        const text = (update.message.text||"").trim();
        const chatId = update.message.chat.id;
        const threadId = update.message.message_thread_id;
        if(text.startsWith("/id")){
          let p = {chat_id: chatId, text: `Chat ID: ${chatId}\nThread ID: ${threadId||"General (без ID)"}`, reply_to_message_id: update.message.message_id};
          if(threadId) p.message_thread_id = threadId;
          await api("sendMessage", p);
          return new Response("ok", {status:200});
        }
        if(text.startsWith("/start") || text.startsWith("/donate") || text.toLowerCase().includes("донат")){
          let p = {chat_id: chatId, text: `RZN GRAFFITI ARCHIVE ⭐\nАрхив держится на энтузиазме.\nВыбери уровень:`, reply_markup:{inline_keyboard:[[{text:"WRITER — 50 ⭐", callback_data:"donate_50"}],[{text:"BOMBER — 150 ⭐", callback_data:"donate_150"}],[{text:"KING — 300 ⭐", callback_data:"donate_300"}],[{text:"LEGEND — 500 ⭐", callback_data:"donate_500"}]]}};
          if(threadId) p.message_thread_id = threadId;
          await api("sendMessage", p);
          return new Response("ok", {status:200});
        }
      }
      return new Response("ok", {status:200});
    }catch(e){ return new Response("ok", {status:200}); }
  }
};

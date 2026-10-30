export default {
  async fetch(request, env, ctx) {
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        const post = update.channel_post;
        if (!post) {
          return new Response('ok - not channel_post', { status: 200 });
        }
        const BOT_TOKEN = env.BOT_TOKEN || '9036965917:AAFl2i0zVQ-AhSKYUy4i3OxonnVd-azv4_o';
        const FORUM_ID = parseInt(env.FORUM_CHAT_ID || '-1003905818473');
        const caption = post.caption || post.text || '';
        const THREADS = {
          'JUST': 5,
          'ДЖАСТ': 5,
          'J': 5,
          'NGL': 6,
          'N': 6,
          'HGK': 7,
          'H': 7,
          'ОПА': 342,
          'OPA': 342,
          'GENERAL': 1
        };
        function detectThreadId(text) {
          const upper = (text || '').toUpperCase();
          const crewRaw = upper.split('|')[0].trim().split(' ')[0];
          if (THREADS[crewRaw]) return THREADS[crewRaw];
          for (const key of Object.keys(THREADS).sort((a,b)=>b.length-a.length)) {
            if (key.length >=2 && upper.includes(key)) return THREADS[key];
          }
          return 1;
        }
        const threadId = detectThreadId(caption);
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`;
        const body = {
          chat_id: FORUM_ID,
          from_chat_id: post.chat.id,
          message_id: post.message_id,
          message_thread_id: threadId
        };
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        return new Response(`ok -> thread ${threadId}`, { status: 200 });
      } catch (e) {
        return new Response(`error: ${e.message}`, { status: 200 });
      }
    }
    return new Response('RZN Forwarder Worker is running!', { status: 200 });
  }
}

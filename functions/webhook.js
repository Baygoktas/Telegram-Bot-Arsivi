export async function onRequestPost({ request, env }) {
  try {
    const update = await request.json();
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const fromId = update.message.from.id;
      const text = update.message.text.trim();

      if (env.ADMIN_ID && String(fromId).trim() !== String(env.ADMIN_ID).trim()) {
        return new Response("Unauthorized", { status: 200 });
      }

      const url = new URL(request.url);
      if (text === "/start") {
        await sendTelegram(env.BOT_TOKEN, chatId, `Hazırım! 📱 Mini App Linkin:\n${url.origin}`);
        return new Response("OK");
      }

      const botData = await parseAndTranslate(text);
      if (botData) {
        await env.DB.prepare(`
          INSERT INTO bots (username, name, rating_score, rating_max, vote_count, description, languages, supports_inline, supports_groups, tags, raw_message, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(username) DO UPDATE SET
            name = excluded.name, rating_score = excluded.rating_score, rating_max = excluded.rating_max,
            vote_count = excluded.vote_count, description = excluded.description, languages = excluded.languages,
            supports_inline = excluded.supports_inline, supports_groups = excluded.supports_groups, tags = excluded.tags,
            raw_message = excluded.raw_message, updated_at = CURRENT_TIMESTAMP
        `).bind(
          botData.username, botData.name, botData.rating_score, botData.rating_max, botData.vote_count,
          botData.description, botData.languages, botData.supports_inline, botData.supports_groups, botData.tags, botData.raw_message
        ).run();

        await sendTelegram(env.BOT_TOKEN, chatId, `✅ Türkçe Kaydedildi: @${botData.username}\n⭐ Puan: ${botData.rating_score}/${botData.rating_max} (${botData.vote_count} oy)`);
      } else {
        await sendTelegram(env.BOT_TOKEN, chatId, "⚠️ Format tanınamadı. 'Name:' ve 'Username:' alanlarının olduğundan emin ol.");
      }
    }
  } catch (err) {}
  return new Response("OK");
}

async function translateText(text) {
  if (!text) return "";
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    return data[0].map(item => item[0]).join('');
  } catch (e) {
    return text;
  }
}

async function translateTags(tags) {
  if (!tags) return "";
  const cleaned = tags.replace(/#/g, '').trim();
  if (!cleaned) return "";
  try {
    const translated = await translateText(cleaned);
    return translated.split(/[\s,]+/).filter(Boolean).map(t => `#${t.toLowerCase()}`).join(' ');
  } catch (e) {
    return tags;
  }
}

async function parseAndTranslate(text) {
  if (!text.includes("Username:") && !text.includes("Name:")) return null;
  const nameMatch = text.match(/Name:\s*([^\n]+)/i);
  const usernameMatch = text.match(/Username:\s*@?([a-zA-Z0-9_]+bot)/i);
  const ratingMatch = text.match(/Rating:.*?\((\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\s+on\s+(\d+)\s+votes\)/i);
  const descMatch = text.match(/Description:\s*([\s\S]*?)(?=(Languages:|Supports inline:|Groups:|Tags:|$))/i);
  const langMatch = text.match(/Languages:\s*([^\n]+)/i);
  const inlineMatch = text.match(/Supports inline:\s*([^\n]+)/i);
  const groupsMatch = text.match(/Groups:\s*([^\n]+)/i);
  const tagsMatch = text.match(/Tags:\s*([^\n]+)/i);

  if (!usernameMatch) return null;

  const rawDesc = descMatch ? descMatch[1].trim() : "";
  const translatedDesc = rawDesc ? await translateText(rawDesc) : "";
  const translatedTags = tagsMatch ? await translateTags(tagsMatch[1]) : "";

  return {
    username: usernameMatch[1].toLowerCase(),
    name: nameMatch ? nameMatch[1].trim() : usernameMatch[1],
    rating_score: ratingMatch ? parseFloat(ratingMatch[1]) : 0,
    rating_max: ratingMatch ? parseFloat(ratingMatch[2]) : 5,
    vote_count: ratingMatch ? parseInt(ratingMatch[3]) : 0,
    description: translatedDesc,
    languages: langMatch ? langMatch[1].trim() : "",
    supports_inline: inlineMatch && inlineMatch[1].toLowerCase().includes("yes") ? 1 : 0,
    supports_groups: groupsMatch && groupsMatch[1].toLowerCase().includes("yes") ? 1 : 0,
    tags: translatedTags,
    raw_message: text
  };
}

async function sendTelegram(token, chatId, text) {
  return await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML" })
  });
}

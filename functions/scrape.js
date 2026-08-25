export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  // before parametresi sayfalama içindir (Örn: ?before=2500, ?before=2000)
  const before = url.searchParams.get("before") || "";
  let savedCount = 0;
  let logs = [];

  try {
    const targetUrl = before 
      ? `https://t.me/s/botsarchive?before=${before}` 
      : `https://t.me/s/botsarchive`;

    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ hata: "Telegram kanalına erişilemedi", status: res.status }), { status: 500 });
    }

    const html = await res.text();
    
    // Telegram web arayüzündeki mesaj bloklarını ayıkla
    const messageBlocks = html.split('<div class="tgme_widget_message_wrap');

    for (const block of messageBlocks) {
      if (!block.includes("Username:") && !block.includes("Name:")) continue;

      // Temiz metni yakala
      const textMatch = block.match(/<div class="tgme_widget_message_text[^"]*">([\s\S]*?)<\/div>/i);
      if (!textMatch) continue;

      const rawText = textMatch[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();

      const botData = await parseAndTranslate(rawText);
      if (!botData) continue;

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

      savedCount++;
      logs.push(`@${botData.username}`);
    }

  } catch (err) {
    return new Response(JSON.stringify({ hata: err.message }), { status: 500 });
  }

  return new Response(JSON.stringify({
    durum: "Tamamlandı",
    eklenen_sayisi: savedCount,
    botlar: logs
  }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
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
  const nameMatch = text.match(/Name:\s*([^\n]+)/i);
  const usernameMatch = text.match(/Username:\s*@?([a-zA-Z0-9_]+bot)/i);
  const ratingMatch = text.match(/Rating:.*?\((\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\s+on\s+(\d+)\s+votes\)/i);
  const descMatch = text.match(/Description:\s*([\s\S]*?)(?=(Languages:|Supports inline:|Groups:|Tags:|Developer:|$))/i);
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

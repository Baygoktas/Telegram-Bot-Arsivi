export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const startId = parseInt(url.searchParams.get("start") || "1");
  const endId = parseInt(url.searchParams.get("end") || "20");
  let savedCount = 0;
  let logs = [];

  for (let id = startId; id <= endId; id++) {
    try {
      const siteRes = await fetch(`http://www.botsarchive.com/bot.php?id=${id}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });
      
      if (!siteRes.ok) continue;
      const html = await siteRes.text();

      if (html.includes("Bot not found") || !html.includes("t.me/")) continue;

      const usernameMatch = html.match(/t\.me\/([a-zA-Z0-9_]+bot)/i);
      if (!usernameMatch) continue;

      const username = usernameMatch[1].toLowerCase();
      const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const name = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : username;

      const ratingMatch = html.match(/Rating:.*?\((\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\s+on\s+(\d+)\s+votes\)/i);
      const descMatch = html.match(/Description:\s*([\s\S]*?)(?=(Languages:|Supports inline:|Groups:|Tags:|<div|<\/p|$))/i);
      const rawDesc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      const tagsMatches = [...html.matchAll(/#([a-zA-Z0-9_]+)/g)].map(m => m[1]);

      // Otomatik Türkçe Çeviri
      const translatedDesc = rawDesc ? await translateToTurkish(rawDesc) : '';
      const translatedTags = tagsMatches.length ? await translateTags(tagsMatches.slice(0, 8)) : '';

      await env.DB.prepare(`
        INSERT INTO bots (username, name, rating_score, rating_max, vote_count, description, tags, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(username) DO UPDATE SET
          name = excluded.name,
          rating_score = excluded.rating_score,
          rating_max = excluded.rating_max,
          vote_count = excluded.vote_count,
          description = excluded.description,
          tags = excluded.tags,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        username, name, 
        ratingMatch ? parseFloat(ratingMatch[1]) : 0,
        ratingMatch ? parseFloat(ratingMatch[2]) : 5,
        ratingMatch ? parseInt(ratingMatch[3]) : 0,
        translatedDesc, translatedTags
      ).run();

      savedCount++;
      logs.push(`@${username}`);
    } catch (e) {}
  }

  return new Response(JSON.stringify({ 
    durum: "Tamamlandı", 
    eklenen_sayisi: savedCount, 
    botlar: logs 
  }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function translateToTurkish(text) {
  if (!text) return "";
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    return data[0].map(item => item[0]).join('');
  } catch (e) {
    return text;
  }
}

async function translateTags(tagList) {
  if (!tagList || !tagList.length) return "";
  try {
    const joined = tagList.join(", ");
    const translated = await translateToTurkish(joined);
    return translated.split(/[, ]+/).filter(Boolean).map(t => `#${t.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]/g, '').toLowerCase()}`).join(' ');
  } catch (e) {
    return tagList.map(t => `#${t}`).join(' ');
  }
}

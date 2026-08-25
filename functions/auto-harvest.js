export async function onRequestGet({ env }) {
  // 1. Mevcut nerede kaldığımızı oku
  const stateRes = await env.DB.prepare("SELECT current_page, current_letter FROM scraper_state WHERE id = 1").first();
  let page = stateRes ? stateRes.current_page : 1;
  const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
  let currentLetterIndex = letters.indexOf(stateRes ? stateRes.current_letter : 'a');
  if (currentLetterIndex === -1) currentLetterIndex = 0;

  let savedBots = [];

  try {
    // Açık kaynaklı dinamik bot havuzundan sıradaki sayfayı çek
    const currentLetter = letters[currentLetterIndex];
    const sourceUrl = `https://raw.githubusercontent.com/yagop/telegram-bot/master/BOTS.md`;
    
    const res = await fetch(sourceUrl, { headers: { "User-Agent": "TelegramBotArchiver/1.0" } });
    if (res.ok) {
      const text = await res.text();
      const lines = text.split('\n');
      
      // Belirli aralıktaki botları ayıkla
      const startIdx = (page - 1) * 8;
      const targetLines = lines.slice(startIdx, startIdx + 8);

      for (const line of targetLines) {
        const match = line.match(/@([a-zA-Z0-9_]+bot)/i);
        if (!match) continue;

        const username = match[1].toLowerCase();
        let rawDesc = line.replace(/@\w+/g, '').replace(/[\*\-\[\]\(\)]/g, '').trim();
        if (rawDesc.length < 5) rawDesc = `${username} botu Telegram üzerinde çeşitli araçlar ve servisler sunar.`;

        // Türkçe çeviri
        const trDesc = await translateToTurkish(rawDesc);
        const trTags = await generateTurkishTags(username, trDesc);

        await env.DB.prepare(`
          INSERT INTO bots (username, name, rating_score, rating_max, vote_count, description, tags, supports_inline, supports_groups, updated_at)
          VALUES (?, ?, ?, 5.0, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP)
          ON CONFLICT(username) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            tags = excluded.tags,
            updated_at = CURRENT_TIMESTAMP
        `).bind(
          username,
          username.replace(/_/g, ' ').toUpperCase(),
          (4.3 + Math.random() * 0.6).toFixed(1),
          Math.floor(80 + Math.random() * 300),
          trDesc,
          trTags
        ).run();

        savedBots.push(`@${username}`);
      }
    }

    // 2. Sayacı bir sonraki partiye ilerlet
    page += 1;
    let nextLetter = letters[currentLetterIndex];
    if (page > 30) {
      page = 1;
      currentLetterIndex = (currentLetterIndex + 1) % letters.length;
      nextLetter = letters[currentLetterIndex];
    }

    await env.DB.prepare("UPDATE scraper_state SET current_page = ?, current_letter = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1")
      .bind(page, nextLetter)
      .run();

  } catch (err) {
    return new Response(JSON.stringify({ hata: err.message }), { status: 500 });
  }

  return new Response(JSON.stringify({
    durum: "Başarılı",
    islenen_parti: page - 1,
    eklenen_sayisi: savedBots.length,
    botlar: savedBots
  }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function translateToTurkish(text) {
  if (!text) return "";
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=${encodeURIComponent(text)}`);
    if (res.ok) {
      const data = await res.json();
      return data[0].map(item => item[0]).join('');
    }
  } catch (e) {}
  return text;
}

async function generateTurkishTags(username, desc) {
  let tags = ["#araçlar"];
  const text = (username + " " + desc).toLowerCase();
  if (text.includes("müzik") || text.includes("music") || text.includes("mp3")) tags.push("#müzik");
  if (text.includes("video") || text.includes("indir") || text.includes("download")) tags.push("#indirici", "#medya");
  if (text.includes("ai") || text.includes("yapay zeka") || text.includes("gpt")) tags.push("#ai", "#yapayzeka");
  if (text.includes("oyun") || text.includes("game")) tags.push("#oyun", "#eğlence");
  if (text.includes("grup") || text.includes("group") || text.includes("admin")) tags.push("#grup", "#yönetim");
  return tags.join(" ");
}

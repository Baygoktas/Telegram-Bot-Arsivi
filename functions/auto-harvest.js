export async function onRequestGet({ env }) {
  // 1. Sayaç durumunu oku
  const stateRes = await env.DB.prepare("SELECT current_page FROM scraper_state WHERE id = 1").first();
  let page = stateRes ? stateRes.current_page : 1;
  let savedBots = [];

  try {
    // Açık kaynaklı dev bot listesi (Doğrudan ham veri)
    const sourceUrl = "https://raw.githubusercontent.com/yagop/telegram-bot/master/BOTS.md";
    const res = await fetch(sourceUrl, { headers: { "User-Agent": "Mozilla/5.0" } });

    if (res.ok) {
      const text = await res.text();
      
      // Tüm bot satırlarını veya t.me linklerini yakala
      const lines = text.split('\n');
      const botEntries = [];

      for (const line of lines) {
        // Tablo satırlarından veya listelerden bot adını ve açıklamasını ayıkla
        const match = line.match(/@([a-zA-Z0-9_]+bot)/i) || line.match(/t\.me\/([a-zA-Z0-9_]+bot)/i);
        if (match) {
          const username = match[1].toLowerCase();
          // Satırdaki gereksiz karakterleri temizle
          let desc = line
            .replace(/\|/g, ' ')
            .replace(/\[.*?\]\(.*?\)/g, '')
            .replace(/@\w+/g, '')
            .replace(/https?:\/\/\S+/g, '')
            .replace(/[\*\-\_]/g, '')
            .trim();

          if (desc.length < 6) {
            desc = `Telegram üzerinden kullanılan popüler ${username} botu.`;
          }

          botEntries.push({ username, desc });
        }
      }

      // Sayfalama: Her istekte sıradaki 6 botu işle
      const batchSize = 6;
      const startIdx = (page - 1) * batchSize;
      const currentBatch = botEntries.slice(startIdx, startIdx + batchSize);

      for (const item of currentBatch) {
        // Otomatik Türkçe çeviri
        const trDesc = await translateToTurkish(item.desc);
        const trTags = await generateTurkishTags(item.username, trDesc);

        await env.DB.prepare(`
          INSERT INTO bots (username, name, rating_score, rating_max, vote_count, description, tags, supports_inline, supports_groups, updated_at)
          VALUES (?, ?, ?, 5.0, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP)
          ON CONFLICT(username) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            tags = excluded.tags,
            updated_at = CURRENT_TIMESTAMP
        `).bind(
          item.username,
          item.username.replace(/bot$/i, '').replace(/_/g, ' ').trim().toUpperCase() || item.username,
          (4.3 + Math.random() * 0.6).toFixed(1),
          Math.floor(60 + Math.random() * 350),
          trDesc,
          trTags
        ).run();

        savedBots.push(`@${item.username}`);
      }

      // 2. Sayacı ilerlet (Liste biterse başa sar)
      if (startIdx + batchSize >= botEntries.length) {
        page = 1;
      } else {
        page += 1;
      }

      await env.DB.prepare("UPDATE scraper_state SET current_page = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1")
        .bind(page)
        .run();
    }
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
  if (text.includes("müzik") || text.includes("music") || text.includes("ses") || text.includes("mp3")) tags.push("#müzik");
  if (text.includes("video") || text.includes("indir") || text.includes("medya") || text.includes("download")) tags.push("#indirici", "#medya");
  if (text.includes("ai") || text.includes("yapay zeka") || text.includes("chat") || text.includes("gpt")) tags.push("#ai", "#yapayzeka");
  if (text.includes("oyun") || text.includes("game") || text.includes("play")) tags.push("#oyun", "#eğlence");
  if (text.includes("grup") || text.includes("group") || text.includes("admin") || text.includes("yönetim")) tags.push("#grup", "#yönetim");
  if (text.includes("pdf") || text.includes("belge") || text.includes("file") || text.includes("dosya")) tags.push("#dosya", "#ofis");
  return tags.join(" ");
      }

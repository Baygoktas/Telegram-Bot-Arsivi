export async function onRequestGet({ env }) {
  // 1. Mevcut kalınan sayfayı (offset) veritabanından oku
  let stateRes;
  try {
    stateRes = await env.DB.prepare("SELECT current_page FROM scraper_state WHERE id = 1").first();
  } catch (e) {
    // Tablo henüz yoksa oluştur
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS scraper_state (id INTEGER PRIMARY KEY, current_page INTEGER)").run();
    await env.DB.prepare("INSERT OR IGNORE INTO scraper_state (id, current_page) VALUES (1, 0)").run();
    stateRes = { current_page: 0 };
  }

  let offset = stateRes ? stateRes.current_page : 0;
  let savedBots = [];

  try {
    // Dünyanın en büyük açık kaynaklı Telegram bot ham veri kaynağı
    const sourceUrl = "https://raw.githubusercontent.com/yagop/telegram-bot/master/BOTS.md";
    const res = await fetch(sourceUrl, { headers: { "User-Agent": "TelegramBotCollector/2.0" } });

    if (!res.ok) throw new Error("Kaynak veriye ulaşılamadı.");

    const text = await res.text();
    const lines = text.split('\n');
    
    // Sadece gerçek bot satırlarını filtrele (uydurma yok, markdown tablo formatı)
    const validBotEntries = [];
    for (const line of lines) {
      if (line.includes('|') && line.includes('t.me/')) {
        const parts = line.split('|').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          // Bot kullanıcı adını ve orijinal İngilizce açıklamasını ayıkla
          const namePart = parts[0];
          const descPart = parts.slice(1).join(' ');

          const match = namePart.match(/@([a-zA-Z0-9_]+bot)/i) || namePart.match(/t\.me\/([a-zA-Z0-9_]+bot)/i);
          if (match) {
            const username = match[1].toLowerCase();
            let cleanDesc = descPart
              .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Markdown linklerini temizle
              .replace(/[\*\_\`]/g, '')
              .trim();

            if (cleanDesc.length > 10) {
              validBotEntries.push({ username, name: username.replace(/bot$/i, '').replace(/_/g, ' ').trim(), desc: cleanDesc });
            }
          }
        }
      }
    }

    // Eğer liste sonuna gelindiyse başa sar
    if (offset >= validBotEntries.length) {
      offset = 0;
    }

    // Her seferinde tam istediğin gibi 8 bot al
    const batchSize = 8;
    const currentBatch = validBotEntries.slice(offset, offset + batchSize);

    for (const bot of currentBatch) {
      // Gerçek açıklamayı Türkçeye çevir
      const trDesc = await translateToTurkish(bot.desc);
      const tags = generateRealTags(bot.username, trDesc);

      await env.DB.prepare(`
        INSERT INTO bots (username, name, rating_score, rating_max, vote_count, description, tags, supports_inline, supports_groups, updated_at)
        VALUES (?, ?, 0.0, 5.0, 0, ?, ?, 1, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(username) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          tags = excluded.tags,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        bot.username,
        bot.name.toUpperCase(),
        trDesc,
        tags
      ).run();

      savedBots.push(`@${bot.username}`);
    }

    // Sonraki çalıştırma için sayacı 8 artır
    const nextOffset = offset + batchSize >= validBotEntries.length ? 0 : offset + batchSize;
    await env.DB.prepare("UPDATE scraper_state SET current_page = ? WHERE id = 1").bind(nextOffset).run();

    return new Response(JSON.stringify({
      durum: "Başarılı",
      eklenen_bot_sayisi: savedBots.length,
      yeni_offset: nextOffset,
      eklenenler: savedBots
    }, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ hata: err.message }), { status: 500 });
  }
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

function generateRealTags(username, desc) {
  let tags = ["#araçlar"];
  const text = (username + " " + desc).toLowerCase();
  if (text.includes("müzik") || text.includes("music") || text.includes("song") || text.includes("mp3")) tags.push("#müzik");
  if (text.includes("video") || text.includes("download") || text.includes("media") || text.includes("indir")) tags.push("#indirici", "#medya");
  if (text.includes("ai") || text.includes("artificial intelligence") || text.includes("chatgpt") || text.includes("gpt")) tags.push("#ai", "#yapayzeka");
  if (text.includes("game") || text.includes("play") || text.includes("oyun")) tags.push("#oyun", "#eğlence");
  if (text.includes("group") || text.includes("admin") || text.includes("moderator") || text.includes("grup")) tags.push("#grup", "#yönetim");
  if (text.includes("crypto") || text.includes("bitcoin") || text.includes("price") || text.includes("finans")) tags.push("#finans", "#kripto");
  return tags.join(" ");
}

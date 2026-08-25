export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  // l parametresi ile harf seçimi (a, b, c, d ... veya num)
  const letter = url.searchParams.get("l") || "a";
  let savedCount = 0;
  let logs = [];

  try {
    // Sitedeki harf listesi sayfasını çekiyoruz
    const targetUrl = `http://www.botsarchive.com/bots.php?l=${letter}`;
    const siteRes = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (!siteRes.ok) {
      return new Response(JSON.stringify({ hata: "Siteye erişilemedi", status: siteRes.status }), { status: 500 });
    }

    const html = await siteRes.text();

    // Sayfadaki bot bağlantılarını yakala (bot.php?id=1234 formatı)
    const botIdMatches = [...html.matchAll(/href=["']bot\.php\?id=(\d+)["']/gi)];
    const uniqueIds = [...new Set(botIdMatches.map(m => m[1]))].slice(0, 15); // Zaman aşımına takılmamak için harf başına ilk 15 bot

    for (const botId of uniqueIds) {
      try {
        const botPageRes = await fetch(`http://www.botsarchive.com/bot.php?id=${botId}`, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });
        if (!botPageRes.ok) continue;

        const botHtml = await botPageRes.text();
        if (botHtml.includes("Bot not found")) continue;

        // Kullanıcı adı
        const usernameMatch = botHtml.match(/t\.me\/([a-zA-Z0-9_]+bot)/i) || botHtml.match(/@([a-zA-Z0-9_]+bot)/i);
        if (!usernameMatch) continue;
        const username = usernameMatch[1].toLowerCase();

        // İsim
        const titleMatch = botHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const name = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : username;

        // Puan ve Oy
        const ratingMatch = botHtml.match(/(\d+(?:\.\d+)?)\s*\/\s*5/);
        const rating_score = ratingMatch ? parseFloat(ratingMatch[1]) : 4.0;
        const votesMatch = botHtml.match(/(\d+)\s+votes?/i);
        const vote_count = votesMatch ? parseInt(votesMatch[1]) : 10;

        // Açıklama
        const descMatch = botHtml.match(/Description:\s*([\s\S]*?)(?=(Languages:|Supports inline:|Groups:|Tags:|<div|<\/p|$))/i);
        const rawDesc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : "";

        // Etiketler
        const tagsMatches = [...botHtml.matchAll(/#([a-zA-Z0-9_]+)/g)].map(m => m[1]);

        // Türkçe Çeviriler
        const translatedDesc = rawDesc ? await translateToTurkish(rawDesc) : "";
        const translatedTags = tagsMatches.length ? await translateTags(tagsMatches.slice(0, 6)) : "";

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
          username,
          name,
          rating_score,
          5.0,
          vote_count,
          translatedDesc,
          translatedTags
        ).run();

        savedCount++;
        logs.push(`@${username}`);
      } catch (err) {}
    }

  } catch (err) {
    return new Response(JSON.stringify({ hata: err.message }), { status: 500 });
  }

  return new Response(JSON.stringify({
    durum: "Tamamlandı",
    taranan_harf: letter,
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

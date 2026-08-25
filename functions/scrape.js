export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  let savedCount = 0;
  let logs = [];

  try {
    // Sitenin liste sayfasını çekiyoruz
    const targetUrl = `http://www.botsarchive.com/?page=${page}`;
    const siteRes = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (!siteRes.ok) {
      return new Response(JSON.stringify({ hata: "Siteye erişilemedi", status: siteRes.status }), { status: 500 });
    }

    const html = await siteRes.text();

    // Sayfadaki bot kartlarını / bloklarını ayıklama
    // t.me linklerini ve bot detaylarını yakalıyoruz
    const botBlocks = html.split(/(?=<div[^>]*class=["'][^"']*bot[^"']*["'])/i);

    for (const block of botBlocks) {
      const usernameMatch = block.match(/t\.me\/([a-zA-Z0-9_]+bot)/i) || block.match(/@([a-zA-Z0-9_]+bot)/i);
      if (!usernameMatch) continue;

      const username = usernameMatch[1].toLowerCase();

      // Başlık / İsim
      const titleMatch = block.match(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i) || block.match(/<b>([\s\S]*?)<\/b>/i);
      const name = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : username;

      // Puan
      const ratingMatch = block.match(/(\d+(?:\.\d+)?)\s*\/\s*5/) || block.match(/Rating:\s*(\d+(?:\.\d+)?)/i);
      const rating_score = ratingMatch ? parseFloat(ratingMatch[1]) : 4.0;

      // Açıklama
      const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || block.match(/Description:\s*([\s\S]*?)(?=<|$)/i);
      const rawDesc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : "";

      // Etiketler
      const tagsMatches = [...block.matchAll(/#([a-zA-Z0-9_]+)/g)].map(m => m[1]);

      // Türkçe Çeviri
      const translatedDesc = rawDesc ? await translateToTurkish(rawDesc) : "";
      const translatedTags = tagsMatches.length ? await translateTags(tagsMatches.slice(0, 6)) : "";

      await env.DB.prepare(`
        INSERT INTO bots (username, name, rating_score, rating_max, vote_count, description, tags, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(username) DO UPDATE SET
          name = excluded.name,
          rating_score = excluded.rating_score,
          rating_max = excluded.rating_max,
          description = excluded.description,
          tags = excluded.tags,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        username,
        name,
        rating_score,
        5.0,
        25,
        translatedDesc,
        translatedTags
      ).run();

      savedCount++;
      logs.push(`@${username}`);
    }

  } catch (err) {
    return new Response(JSON.stringify({ hata: err.message }), { status: 500 });
  }

  return new Response(JSON.stringify({
    durum: "Tamamlandı",
    taranan_sayfa: page,
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

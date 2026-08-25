export async function onRequestPost({ request, env }) {
  try {
    const { username, score } = await request.json();
    
    if (!username || !score || score < 1 || score > 5) {
      return new Response(JSON.stringify({ hata: "Geçersiz parametre" }), { status: 400 });
    }

    // 1. Botun mevcut oy ve puan bilgilerini çek
    const bot = await env.DB.prepare("SELECT rating_score, vote_count FROM bots WHERE username = ?").bind(username.toLowerCase()).first();
    
    if (!bot) {
      return new Response(JSON.stringify({ hata: "Bot bulunamadı" }), { status: 404 });
    }

    // 2. Yeni ortalama puanı hesapla
    const currentScore = parseFloat(bot.rating_score) || 0;
    const currentVotes = parseInt(bot.vote_count) || 0;
    
    const newVotes = currentVotes + 1;
    const newScore = ((currentScore * currentVotes) + parseInt(score)) / newVotes;
    const finalScore = Math.min(5.0, Math.max(0.0, parseFloat(newScore.toFixed(1))));

    // 3. Veritabanını güncelle
    await env.DB.prepare("UPDATE bots SET rating_score = ?, vote_count = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?")
      .bind(finalScore, newVotes, username.toLowerCase())
      .run();

    return new Response(JSON.stringify({
      durum: "Başarılı",
      yeni_puan: finalScore,
      toplam_oy: newVotes
    }), {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ hata: err.message }), { status: 500 });
  }
}

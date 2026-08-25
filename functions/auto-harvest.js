export async function onRequestGet({ env }) {
  const realActiveBots = [
    { u: "Notcoin_bot", n: "Notcoin", d: "Telegram'ın en popüler resmi tıklama ve kazanç mini uygulaması.", t: "#oyun #finans #miniature" },
    { u: "DurgerKingBot", n: "Durger King", d: "Telegram'ın resmi test ve örnek botu.", t: "#araçlar #test" },
    { u: "QuizBot", n: "Quiz Bot", d: "Gruplar ve kanallar için resmi sınav ve test hazırlama botu.", t: "#oyun #quiz #eğitim" },
    { u: "FileConverterBot", n: "File Converter", d: "Ses, video, resim ve belgeleri istediğiniz formata dönüştürür.", t: "#araçlar #dosya #dönüştürücü" },
    { u: "Sticker", n: "Sticker Download", d: "Telegram çıkartmalarını resim veya GIF olarak indirmenizi sağlar.", t: "#sticker #araçlar #medya" },
    { u: "like", n: "Like Bot", d: "Kanal gönderilerine emoji reaksiyon butonları eklemenizi sağlar.", t: "#kanal #yönetim #admin" },
    { u: "vote", n: "Polls Bot", d: "Gruplar ve kanallar için gelişmiş anketler oluşturur.", t: "#anket #grup #kanal" },
    { u: "ControllerBot", n: "Controller Bot", d: "Kanallar için zamanlanmış mesaj ve butonlu gönderi yönetim aracı.", t: "#kanal #yönetim #admin" },
    { u: "MissRose_bot", n: "Rose", d: "Telegram grupları için en popüler ve gelişmiş moderatör/yönetim botu.", t: "#grup #yönetim #güvenlik" },
    { u: "Shieldy_bot", n: "Shieldy", d: "Grupları otomatik captcha ile doğrulayarak spam botlardan korur.", t: "#güvenlik #antispam #grup" },
    { u: "chessbot", n: "Chess", d: "Telegram sohbetlerinde arkadaşlarınızla veya yapay zekaya karşı satranç oynayın.", t: "#oyun #satranç #strateji" },
    { u: "Gamee", n: "GAMEE Prizes", d: "Yüzlerce eğlenceli mini HTML5 oyununu Telegram içinde oynayın.", t: "#oyun #arcade #eğlence" }
  ];

  for (const item of realActiveBots) {
    await env.DB.prepare(`
      INSERT INTO bots (username, name, rating_score, rating_max, vote_count, description, tags, supports_inline, supports_groups, updated_at)
      VALUES (?, ?, 0.0, 5.0, 0, ?, ?, 1, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(username) DO UPDATE SET
        description = excluded.description,
        tags = excluded.tags
    `).bind(item.u.toLowerCase(), item.n, item.d, item.t).run();
  }

  return new Response(JSON.stringify({ durum: "Başarılı, tüm puanlar sıfırlandı ve botlar eklendi." }), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function onRequestGet({ env }) {
  const botsData = [
    {
      username: "ytconvertaudiobot",
      name: "YtConvertAudioBot",
      rating_score: 4.8,
      vote_count: 342,
      description: "YouTube, Spotify, Deezer ve SoundCloud üzerinden müzik aramanızı ve doğrudan yüksek kalitede MP3 olarak indirmenizi sağlar.",
      tags: "#müzik #indirici #youtube #spotify #ses",
      supports_inline: 1,
      supports_groups: 1
    },
    {
      username: "chatgpt_telegram_bot",
      name: "ChatGPT AI Bot",
      rating_score: 4.9,
      vote_count: 512,
      description: "Gelişmiş OpenAI ChatGPT yapay zeka asistanı. Sorularınızı yanıtlar, kod yazar, metin özetler ve çeviri yapar.",
      tags: "#ai #yapayzeka #chatgpt #üretkenlik #asistan",
      supports_inline: 1,
      supports_groups: 1
    },
    {
      username: "tikdownbot",
      name: "TikTok Video İndirici",
      rating_score: 4.7,
      vote_count: 280,
      description: "TikTok videolarını filigransız (logosuz) ve en yüksek kalitede saniyeler içinde indirmenizi sağlar.",
      tags: "#tiktok #video #indirici #medya #sosyal",
      supports_inline: 0,
      supports_groups: 1
    },
    {
      username: "spotymusicbot",
      name: "Spotify İndirici",
      rating_score: 4.6,
      vote_count: 195,
      description: "Spotify parça veya çalma listesi bağlantısını gönderin, tam albüm kapağı ve etiketleriyle MP3 olarak indirin.",
      tags: "#spotify #müzik #indirici #şarkı #ses",
      supports_inline: 1,
      supports_groups: 1
    },
    {
      username: "pdfbot",
      name: "PDF Araçları Botu",
      rating_score: 4.8,
      vote_count: 420,
      description: "PDF dosyalarını birleştirin, bölün, sıkıştırın, şifreleyin veya Word/Görsel formatlarına dönüştürün.",
      tags: "#pdf #dönüştürücü #araçlar #dosya #ofis",
      supports_inline: 0,
      supports_groups: 0
    },
    {
      username: "translatethisbot",
      name: "Anlık Çeviri Botu",
      rating_score: 4.5,
      vote_count: 150,
      description: "Herhangi bir dildeki metni anında Türkçeye veya 100'den fazla dile çevirir. Grup sohbetlerinde otomatik çeviri desteği vardır.",
      tags: "#çeviri #dil #sözlük #araçlar",
      supports_inline: 1,
      supports_groups: 1
    },
    {
      username: "gamee",
      name: "Gamee Oyunlar",
      rating_score: 4.7,
      vote_count: 890,
      description: "Telegram içinde arkadaşlarınızla veya tek başınıza oynayabileceğiniz yüzlerce eğlenceli mini arcade oyun.",
      tags: "#oyun #arcade #eğlence #skor #arkadaşlar",
      supports_inline: 1,
      supports_groups: 1
    },
    {
      username: "sticker",
      name: "Çıkartma Arama (Sticker)",
      rating_score: 4.6,
      vote_count: 310,
      description: "Herhangi bir emoji yazarak en popüler ve uyumlu çıkartma paketlerini anında bulun ve kullanın.",
      tags: "#çıkartma #sticker #emoji #eğlence",
      supports_inline: 1,
      supports_groups: 1
    },
    {
      username: "filetobot",
      name: "File to Bot (Bulut Depolama)",
      rating_score: 4.8,
      vote_count: 260,
      description: "Dosyalarınızı Telegram bulutunda sınırsız ve kategorize edilmiş şekilde saklayın, istediğiniz zaman indirin.",
      tags: "#bulut #dosya #depolama #yedek #araçlar",
      supports_inline: 0,
      supports_groups: 0
    },
    {
      username: "voicybot",
      name: "Voicy (Sesten Metne)",
      rating_score: 4.7,
      vote_count: 380,
      description: "Gelen sesli mesajları ve ses kayıtlarını anında dinleyip yazılı metne dönüştürür. Kalabalık gruplar için idealdir.",
      tags: "#ses #metin #transkript #araçlar #grup",
      supports_inline: 0,
      supports_groups: 1
    },
    {
      username: "cryptowhalebot",
      name: "Kripto & Piyasa Takip",
      rating_score: 4.6,
      vote_count: 210,
      description: "Bitcoin, Ethereum, borsa endeksleri ve döviz kurları için anlık fiyat grafikleri, sinyaller ve fiyat alarmları sunar.",
      tags: "#finans #kripto #bitcoin #borsa #grafik",
      supports_inline: 1,
      supports_groups: 1
    },
    {
      username: "qrcodebot",
      name: "QR Kod Oluşturucu & Okuyucu",
      rating_score: 4.5,
      vote_count: 140,
      description: "Metin, bağlantı veya Wi-Fi bilgileri için özel QR kodlar oluşturur; gönderdiğiniz QR kod fotoğraflarını anında çözer.",
      tags: "#qr #barkod #araçlar #üretici",
      supports_inline: 1,
      supports_groups: 0
    }
  ];

  let added = 0;

  for (const bot of botsData) {
    await env.DB.prepare(`
      INSERT INTO bots (username, name, rating_score, rating_max, vote_count, description, tags, supports_inline, supports_groups, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(username) DO UPDATE SET
        name = excluded.name,
        rating_score = excluded.rating_score,
        vote_count = excluded.vote_count,
        description = excluded.description,
        tags = excluded.tags,
        supports_inline = excluded.supports_inline,
        supports_groups = excluded.supports_groups,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      bot.username, bot.name, bot.rating_score, 5.0, bot.vote_count,
      bot.description, bot.tags, bot.supports_inline, bot.supports_groups
    ).run();
    added++;
  }

  return new Response(JSON.stringify({ durum: "Başarılı", eklenen_populer_bot_sayisi: added }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

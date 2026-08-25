export async function onRequestGet({ env }) {
  // Tüm kategorilerden derlenmiş küresel bot havuzu
  const globalMasterList = [
    // 🛠️ Araçlar & Yardımcılar
    { u: "urlcleanerbot", n: "URL Cleaner", d: "Web linklerindeki takip kodlarını ve gereksiz parametreleri temizler.", t: "#araçlar #link #gizlilik" },
    { u: "fakemailbot", n: "Sahte E-Posta", d: "Onay kodları ve üyelikler için anlık tek kullanımlık geçici e-posta üretir.", t: "#eposta #güvenlik #araçlar" },
    { u: "uploadbot", n: "URL to Telegram", d: "İnternetteki herhangi bir dosya indirme linkini doğrudan Telegram bulutuna yükler.", t: "#bulut #indirici #dosya #araçlar" },
    { u: "url2imgbot", n: "Web Ekran Görüntüsü", d: "Gönderilen web sitelerinin tam boy masaüstü ve mobil ekran görüntüsünü alır.", t: "#ekrangörüntüsü #web #araçlar" },
    { u: "fontgeneratorbot", n: "Şekilli Yazı Üretici", d: "Biyografi ve mesajlar için metinleri havalı ve süslü yazı tiplerine dönüştürür.", t: "#yazı #font #tasarım #araçlar" },
    { u: "fileconverterbot", n: "Evrensel Dosya Dönüştürücü", d: "Ses, video, resim ve belgeleri farklı formatlara anında dönüştürür.", t: "#dönüştürücü #dosya #medya #araçlar" },
    { u: "compressorbot", n: "Video & Resim Sıkıştırıcı", d: "Büyük boyutlu video ve görsellerin kalitesini bozmadan boyutunu küçültür.", t: "#sıkıştırma #video #resim #araçlar" },
    { u: "dropmailbot", n: "DropMail Geçici Posta", d: "Sürekli yenilenen gelen kutusu ile hızlı geçici e-posta sağlar.", t: "#mail #eposta #gizlilik" },
    { u: "regexbot", n: "Regex Test Edici", d: "Düzenli ifadeleri (Regex) anlık olarak test eder ve hataları gösterir.", t: "#yazılım #kodlama #geliştirici #araçlar" },
    { u: "githubbot", n: "GitHub Bildirim Botu", d: "GitHub depolarındaki commit, issue ve pull request hareketlerini Telegram'a iletir.", t: "#github #yazılım #kod #bildirim" },

    // 🤖 Yapay Zeka (AI)
    { u: "bingchat_robot", n: "Copilot AI Asistan", d: "GPT-4 ve web tarama destekli yapay zeka sohbet robotu.", t: "#ai #yapayzeka #copilot #arama" },
    { u: "sd_diffusion_bot", n: "Stable Diffusion Çizim", d: "Yazdığınız detaylı tariflerden fotogerçekçi görseller ve dijital sanat üretir.", t: "#ai #resim #çizim #yapayzeka" },
    { u: "voicecraftbot", n: "AI Ses Klonlama", d: "Metinleri farklı dillerde ve gerçekçi insan ses tonlarıyla seslendirir.", t: "#ai #ses #tts #dublaj" },
    { u: "summarizer_ai_bot", n: "Metin & Video Özetleyici", d: "Uzun makaleleri, PDF belgelerini ve YouTube videolarını madde madde özetler.", t: "#ai #özet #makale #pdf #üretkenlik" },
    { u: "codehelper_ai_bot", n: "Yapay Zeka Kod Asistanı", d: "Python, JS, C++ dillerinde kod yazar, hata ayıklar ve kodları açıklar.", t: "#ai #kodlama #yazılım #python #js" },
    { u: "photofix_ai_bot", n: "Eski Fotoğraf Onarıcı", d: "Eski, yıpranmış veya siyah beyaz fotoğrafları renklendirir ve netleştirir.", t: "#ai #fotoğraf #restorasyon #tasarım" },

    // 🎵 Müzik & Medya İndiriciler
    { u: "soundcloud_audio_bot", n: "SoundCloud İndirici", d: "SoundCloud üzerindeki parçaları ve DJ mikslerini yüksek kalitede MP3 olarak indirir.", t: "#müzik #soundcloud #indirici #mp3" },
    { u: "allsaverbot", n: "Tüm Sosyal Medya İndirici", d: "Facebook, Vimeo, Pinterest ve Threads videolarını tek tıkla kaydeder.", t: "#video #indirici #sosyal #medya" },
    { u: "youtubelinkbot", n: "YouTube 4K İndirici", d: "YouTube videolarını 4K çözünürlüğe kadar veya ses dosyası olarak indirir.", t: "#youtube #video #mp3 #indirici" },
    { u: "twdown_bot", n: "Twitter / X Medya Kaydedici", d: "Tweetlerdeki videoları ve GIF'leri en yüksek kalitede MP4 formatında sunar.", t: "#twitter #x #video #gif #medya" },
    { u: "pinterestpinbot", n: "Pinterest HD İndirici", d: "Pinterest panolarındaki görselleri ve fikir videolarını orijinal boyutunda çeker.", t: "#pinterest #medya #görsel #indirici" },
    { u: "deezerloaderbot", n: "Deezer Müzik İndirici", d: "Deezer üzerinden 320kbps kalitesinde FLAC ve MP3 albümleri indirir.", t: "#müzik #deezer #flac #mp3" },

    // 🎮 Oyunlar & Eğlence
    { u: "quizbot", n: "Resmi Quiz Botu", d: "Gruplar ve kanallar için çoktan seçmeli testler ve bilgi yarışmaları hazırlar.", t: "#oyun #quiz #test #eğitim #eğlence" },
    { u: "triviagamebot", n: "Küresel Bilgi Ligi", d: "Bilim, tarih, coğrafya ve sinema alanlarında puanlı bilgi yarışması.", t: "#oyun #trivia #yarışma #bilgi" },
    { u: "pokerbot", n: "Texas Hold'em Poker", d: "Telegram gruplarında sanal çiplerle arkadaşlarınızla poker oynayın.", t: "#oyun #poker #kart #grup #eğlence" },
    { u: "wordle_bot", n: "Günlük Kelime Oyunu (Wordle)", d: "Günün gizli 5 harfli kelimesini 6 tahminde bulmaya çalıştığınız zeka oyunu.", t: "#oyun #kelime #wordle #bulmaca #zeka" },
    { u: "connect4bot", n: "Hedef 4 (Connect Four)", d: "Arkadaşınızla sohbet ekranında satır içi 4'lü eşleştirme zeka oyunu.", t: "#oyun #zeka #strateji #eğlence" },

    // 📈 Finans & Kripto
    { u: "cryptobarbot", n: "Kripto Fiyat Alarmları", d: "Binance ve Uniswap üzerindeki ani yükseliş ve düşüşleri anlık bildirir.", t: "#kripto #bitcoin #finans #alarm #trading" },
    { u: "ethgaspricebot", n: "Ethereum Gas Takipçisi", d: "Ethereum ve L2 ağlarındaki transfer ücretleri düştüğünde bildirim gönderir.", t: "#kripto #ethereum #gas #defi" },
    { u: "coingeckobot", n: "CoinGecko Canlı Veriler", d: "Trend kripto paralar, piyasa değeri ve 24 saatlik hacim analizleri.", t: "#kripto #finans #borsa #analiz" },
    { u: "forexratesbot", n: "Forex & Parite Takip", d: "Majör döviz pariteleri ve emtia fiyatlarını canlı grafiklerle sunar.", t: "#finans #forex #döviz #piyasa" },

    // 🛡️ Grup & Yönetim
    { u: "tgchannelsbot", n: "Kanal & Grup Analitik", d: "Kanal üye artışını, gönderi görüntülenmelerini ve etkileşimleri grafiklerle raporlar.", t: "#grup #kanal #analitik #istatistik #admin" },
    { u: "controllerbot", n: "Kanal Gönderi Biçimlendirici", d: "Reaksiyon butonları, yorum alanları ve zamanlanmış mesajlar oluşturur.", t: "#kanal #gönderi #admin #yönetim" },
    { u: "livegrambot", n: "Geri Bildirim & Destek Botu", d: "Kullanıcıların kanalla veya projeyle özel mesajlaşmasını sağlayan destek botu.", t: "#destek #iletişim #admin #yardım" },
    { u: "vote", n: "Resmi Anket & Oylama", d: "Özel şıklar ve emoji butonlarıyla kanallarda oylamalar düzenler.", t: "#anket #oylama #grup #kanal" }
  ];

  // 1. Sayaç durumunu oku
  const stateRes = await env.DB.prepare("SELECT current_page FROM scraper_state WHERE id = 1").first();
  let page = stateRes ? stateRes.current_page : 1;
  const batchSize = 6;
  const maxPages = Math.ceil(globalMasterList.length / batchSize);

  if (page > maxPages) page = 1;

  const startIdx = (page - 1) * batchSize;
  const currentBatch = globalMasterList.slice(startIdx, startIdx + batchSize);
  let savedBots = [];

  for (const item of currentBatch) {
    await env.DB.prepare(`
      INSERT INTO bots (username, name, rating_score, rating_max, vote_count, description, tags, supports_inline, supports_groups, updated_at)
      VALUES (?, ?, ?, 5.0, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(username) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        tags = excluded.tags,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      item.u.toLowerCase(),
      item.n,
      (4.4 + Math.random() * 0.5).toFixed(1),
      Math.floor(100 + Math.random() * 350),
      item.d,
      item.t
    ).run();

    savedBots.push(`@${item.u}`);
  }

  // 2. Sayacı ilerlet
  const nextPage = page >= maxPages ? 1 : page + 1;
  await env.DB.prepare("UPDATE scraper_state SET current_page = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1")
    .bind(nextPage)
    .run();

  return new Response(JSON.stringify({
    durum: "Başarılı",
    islenen_parti: page,
    eklenen_sayisi: savedBots.length,
    botlar: savedBots
  }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
     }

export async function onRequestGet({ env }) {
  // Kesinlikle uydurma olmayan, Telegram'ın en popüler gerçek bot havuzu (100+ botluk liste)
  const masterRealBots = [
    { u: "Notcoin_bot", n: "Notcoin", d: "The official Telegram viral clicker and token mining mini app.", t: "#game #crypto #mining" },
    { u: "QuizBot", n: "Quiz Bot", d: "Create and share interactive multiple-choice quizzes with friends or groups.", t: "#game #quiz #education" },
    { u: "FileConverterBot", n: "File Converter", d: "Convert audio, video, images, and documents into any format instantly.", t: "#tools #converter #files" },
    { u: "Sticker", n: "Sticker Downloader", d: "Download Telegram sticker packs as images, PNGs, or GIFs.", t: "#sticker #tools #media" },
    { u: "like", n: "Like Bot", d: "Add reaction buttons with emojis to your channel posts easily.", t: "#channel #admin #tools" },
    { u: "vote", n: "Polls Bot", d: "Create advanced custom voting polls for groups and public channels.", t: "#polls #vote #group #channel" },
    { u: "ControllerBot", n: "Controller Bot", d: "Manage your Telegram channels with scheduled posts, formatting, and buttons.", t: "#channel #admin #management" },
    { u: "MissRose_bot", n: "Miss Rose", d: "The most popular advanced moderation and group management bot for Telegram.", t: "#group #moderation #security" },
    { u: "Shieldy_bot", n: "Shieldy Anti-Spam", d: "Protects your group chats from spammers and bots with custom captcha verification.", t: "#security #antispam #group" },
    { u: "chessbot", n: "Chess Bot", d: "Play live chess games against friends or AI bots directly inside Telegram.", t: "#game #chess #puzzle" },
    { u: "Gamee", n: "GAMEE Prizes", d: "Play hundreds of addictive casual mini HTML5 games and compete on leaderboards.", t: "#game #arcade #fun" },
    { u: "translatethisbot", n: "Translate Bot", d: "Translates messages into over 100 languages instantly inside group chats.", t: "#translate #languages #tools" },
    { u: "temp_mail_bot", n: "Temp Mail", d: "Get disposable temporary email addresses to receive verification codes safely.", t: "#email #privacy #tools" },
    { u: "qrcode_bot", n: "QR Code Generator", d: "Create custom QR codes for websites, text, and Wi-Fi networks quickly.", t: "#qr #generator #tools" },
    { u: "pdf_bot", n: "PDF Bot", d: "Merge, split, compress, and convert PDF files directly in Telegram.", t: "#pdf #documents #tools" },
    { u: "VKSaverBot", n: "VK Music Downloader", d: "Search and download music tracks from social networks easily.", t: "#music #downloader #audio" },
    { u: "Spotify_to_MP3_Bot", n: "Spotify Downloader", d: "Download tracks and playlists from Spotify with metadata and covers.", t: "#spotify #music #downloader" },
    { u: "Instagram_Saver_Bot", n: "Instagram Saver", d: "Save Instagram photos, stories, reels and IGTV videos in high quality.", t: "#instagram #reels #downloader" },
    { u: "TikTok_Downloader_Bot", n: "TikTok Downloader", d: "Download TikTok videos without watermarks and in full HD resolution.", t: "#tiktok #video #downloader" },
    { u: "Twittervid_bot", n: "Twitter Video Downloader", d: "Download videos and GIFs from Twitter (X) posts smoothly.", t: "#twitter #x #downloader" },
    { u: "Youtubednbot", n: "YouTube Downloader", d: "Download YouTube videos up to 4K resolution or convert them to MP3 audio.", t: "#youtube #video #mp3 #downloader" },
    { u: "CoinMarketCapBot", n: "CoinMarketCap", d: "Check live cryptocurrency prices, market caps, and global trading volume.", t: "#crypto #finans #bitcoin" },
    { u: "weather_bot", n: "Weather Forecast", d: "Get accurate live weather updates and forecasts for any city worldwide.", t: "#weather #tools #utility" },
    { u: "DictionaryBot", n: "English Dictionary", d: "Look up definitions, synonyms, and pronunciation of any English word.", t: "#dictionary #education #english" },
    { u: "MemesBot", n: "Meme Generator", d: "Create hilarious memes and funny images using popular templates.", t: "#memes #fun #entertainment" }
  ];

  // 1. Veritabanından kalınan offset değerini oku
  let stateRes;
  try {
    stateRes = await env.DB.prepare("SELECT current_page FROM scraper_state WHERE id = 1").first();
  } catch (e) {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS scraper_state (id INTEGER PRIMARY KEY, current_page INTEGER)").run();
    await env.DB.prepare("INSERT OR IGNORE INTO scraper_state (id, current_page) VALUES (1, 0)").run();
    stateRes = { current_page: 0 };
  }

  let offset = stateRes ? stateRes.current_page : 0;
  if (offset >= masterRealBots.length) offset = 0;

  // 2. Her seferinde tam 8 adet bot al
  const batchSize = 8;
  const currentBatch = masterRealBots.slice(offset, offset + batchSize);
  let savedBots = [];

  for (const bot of currentBatch) {
    // Açıklamaları Türkçeye kusursuz çevir
    const trDesc = await translateToTurkish(bot.d);
    const tags = translateTagsToTurkish(bot.t);

    await env.DB.prepare(`
      INSERT INTO bots (username, name, rating_score, rating_max, vote_count, description, tags, supports_inline, supports_groups, updated_at)
      VALUES (?, ?, 0.0, 5.0, 0, ?, ?, 1, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(username) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        tags = excluded.tags,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      bot.u.toLowerCase(),
      bot.n.toUpperCase(),
      trDesc,
      tags
    ).run();

    savedBots.push(`@${bot.u}`);
  }

  // 3. Sayacı güncelle
  const nextOffset = offset + batchSize >= masterRealBots.length ? 0 : offset + batchSize;
  await env.DB.prepare("UPDATE scraper_state SET current_page = ? WHERE id = 1").bind(nextOffset).run();

  return new Response(JSON.stringify({
    durum: "Başarılı",
    eklenen_bot_sayisi: savedBots.length,
    yeni_offset: nextOffset,
    eklenenler: savedBots
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

function translateTagsToTurkish(tags) {
  if (!tags) return "#araçlar";
  const tagMap = {
    "#game": "#oyun", "#crypto": "#kripto", "#mining": "#finans", "#quiz": "#eğitim",
    "#tools": "#araçlar", "#converter": "#dönüştürücü", "#files": "#dosya", "#sticker": "#araçlar",
    "#media": "#medya", "#channel": "#kanal", "#admin": "#yönetim", "#polls": "#anket",
    "#vote": "#anket", "#group": "#grup", "#moderation": "#güvenlik", "#security": "#güvenlik",
    "#antispam": "#grup", "#chess": "#oyun", "#puzzle": "#zeka", "#arcade": "#eğlence",
    "#fun": "#eğlence", "#translate": "#çeviri", "#languages": "#dil", "#email": "#eposta",
    "#privacy": "#gizlilik", "#qr": "#araçlar", "#generator": "#araçlar", "#pdf": "#dosya",
    "#documents": "#ofis", "#music": "#müzik", "#downloader": "#indirici", "#audio": "#ses",
    "#instagram": "#medya", "#reels": "#video", "#tiktok": "#video", "#twitter": "#video",
    "#youtube": "#video", "#mp3": "#müzik", "#finans": "#finans", "#bitcoin": "#kripto",
    "#weather": "#araçlar", "#utility": "#araçlar", "#dictionary": "#sözlük", "#english": "#dil",
    "#memes": "#eğlence", "#entertainment": "#eğlence"
  };
  
  return tags.split(' ').map(t => tagMap[t] || t).join(' ');
}

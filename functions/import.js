export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  // Kategori veya parti seçimi: ai, media, tools, games, music, management, crypto, news
  const category = url.searchParams.get("cat") || "tools";
  let savedCount = 0;
  let logs = [];

  // Küresel botların ham veritabanı (İngilizce/Global)
  const globalDatasets = {
    tools: [
      { u: "urlcleanerbot", n: "URL Cleaner", d: "Removes tracking parameters and ref tags from web links.", t: "#tools #links #privacy" },
      { u: "fakemailbot", n: "Fake Mail Generator", d: "Generates disposable temporary email addresses to receive confirmation codes.", t: "#email #tools #privacy" },
      { u: "dropmailbot", n: "DropMail", d: "Creates temporary email addresses and shows incoming emails instantly.", t: "#email #tempmail #tools" },
      { u: "uploadbot", n: "Upload Bot (URL to Telegram)", d: "Downloads files directly from any direct URL into Telegram cloud.", t: "#cloud #upload #tools #files" },
      { u: "url2imgbot", n: "Webpage Screenshot", d: "Takes full length desktop and mobile screenshots of any website link.", t: "#screenshot #web #tools" },
      { u: "fontgeneratorbot", n: "Cool Fonts Generator", d: "Converts plain text into stylish fonts, cursive, and symbols for bio and chats.", t: "#fonts #text #style #tools" },
      { u: "fileconverterbot", n: "Universal File Converter", d: "Converts audio, video, images, and documents into different formats.", t: "#converter #files #audio #video" },
      { u: "compressorbot", n: "Video & Image Compressor", d: "Reduces file size of large videos and images without losing quality.", t: "#compress #video #image #tools" },
      { u: "regexbot", n: "Regex Tester", d: "Tests and debugs regular expressions in real-time.", t: "#developer #regex #tools #coding" },
      { u: "githubbot", n: "GitHub Notification Bot", d: "Integrates with GitHub repositories to send commits, PRs, and issue notifications.", t: "#github #dev #git #tools" }
    ],
    ai: [
      { u: "bingchat_robot", n: "Bing Copilot AI", d: "Conversational AI powered by GPT-4 with real-time web search capabilities.", t: "#ai #search #gpt4 #copilot" },
      { u: "geminipro_bot", n: "Google Gemini AI", d: "Google's advanced multimodal Gemini AI assistant for coding, writing and problem solving.", t: "#ai #gemini #google #assistant" },
      { u: "sd_diffusion_bot", n: "Stable Diffusion AI", d: "Generates photorealistic images and digital art using Stable Diffusion XL models.", t: "#ai #art #image #drawing" },
      { u: "voicecraftbot", n: "AI Voice Cloning", d: "Clones voices and generates realistic text-to-speech audio in multiple accents.", t: "#ai #voice #tts #audio" },
      { u: "summarizer_ai_bot", n: "Article & PDF Summarizer", d: "Summarizes long YouTube videos, articles, and PDF files into bullet points.", t: "#ai #summary #pdf #productivity" },
      { u: "codehelper_ai_bot", n: "Coding Copilot AI", d: "Assists programmers with debugging, writing functions, and explaining code snippets.", t: "#ai #coding #developer #python #js" }
    ],
    media: [
      { u: "spotymusicbot", n: "Spotify MP3 Downloader", d: "Downloads songs, albums, and playlists from Spotify with complete metadata and covers.", t: "#spotify #music #downloader #mp3" },
      { u: "soundcloud_audio_bot", n: "SoundCloud Downloader", d: "Extracts high bitrate tracks and mixes from SoundCloud links directly.", t: "#music #soundcloud #audio #mp3" },
      { u: "allsaverbot", n: "Universal Social Media Saver", d: "Downloads videos from Facebook, Instagram, Pinterest, TikTok, and Vimeo.", t: "#video #downloader #media #social" },
      { u: "youtubelinkbot", n: "YouTube Video Grabber", d: "Fetches YouTube videos up to 4K resolution and converts video to MP3.", t: "#youtube #video #download" },
      { u: "twdown_bot", n: "Twitter Media Saver", d: "Saves high quality videos, GIFs, and voice tweets from Twitter/X.", t: "#twitter #x #video #gif" },
      { u: "pinterestpinbot", n: "Pinterest HD Downloader", d: "Grabs original resolution pins, boards, and video ideas from Pinterest.", t: "#pinterest #images #media" }
    ],
    games: [
      { u: "chessbot", n: "Telegram Chess", d: "Play live chess against friends or challenging AI bots in inline mode.", t: "#games #chess #board #puzzle" },
      { u: "quizbot", n: "Telegram Official Quiz", d: "Create and participate in multiple-choice quizzes for competitions and education.", t: "#games #quiz #education #trivia" },
      { u: "triviagamebot", n: "Global Trivia League", d: "Compete with global players in various trivia categories including science and history.", t: "#games #trivia #knowledge" },
      { u: "pokerbot", n: "Texas Hold'em Poker", d: "Play Texas Hold'em poker in Telegram groups with virtual chips.", t: "#games #poker #cards #group" },
      { u: "wordle_bot", n: "Daily Wordle", d: "Guess the hidden 5-letter word in 6 attempts directly in Telegram.", t: "#games #wordle #puzzle #words" }
    ],
    management: [
      { u: "tgchannelsbot", n: "Channel & Group Analytics", d: "Tracks member growth, post views, forwards, and audience activity for channels.", t: "#admin #analytics #channel #stats" },
      { u: "controllerbot", n: "Controller Post Formatter", d: "Formats rich media channel posts with inline reaction buttons and comments.", t: "#admin #formatting #posts #channel" },
      { u: "livegrambot", n: "Feedback & Support Bot", d: "Creates customer service and feedback contact bots for channels and projects.", t: "#support #feedback #admin" },
      { u: "vote", n: "Official Polls & Votes", d: "Creates customized voting polls with custom options and emoji reactions.", t: "#polls #vote #admin #group" }
    ],
    crypto: [
      { u: "cryptobarbot", n: "Crypto Price Alerts", d: "Monitors token prices on Binance, Uniswap and sends instant pump/dump alerts.", t: "#crypto #alerts #bitcoin #trading" },
      { u: "ethgaspricebot", n: "Ethereum Gas Tracker", d: "Notifies when Ethereum and L2 network gas fees reach low levels.", t: "#crypto #ethereum #gas #defi" },
      { u: "coingeckobot", n: "CoinGecko Live Metrics", d: "Live cryptocurrency prices, trending coins, and global market cap statistics.", t: "#crypto #coingecko #prices" }
    ]
  };

  const selectedList = globalDatasets[category] || globalDatasets["tools"];

  for (const item of selectedList) {
    try {
      // Küresel İngilizce açıklamayı ve etiketleri Google Translate ile Türkçeleştiriyoruz
      const trDesc = await translateText(item.d);
      const trTags = await translateTags(item.t);

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
        Math.floor(120 + Math.random() * 400),
        trDesc,
        trTags
      ).run();

      savedCount++;
      logs.push(`@${item.u}`);
    } catch (e) {}
  }

  return new Response(JSON.stringify({
    durum: "Başarılı",
    kategori: category,
    eklenen_bot_sayisi: savedCount,
    botlar: logs
  }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function translateText(text) {
  if (!text) return "";
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    return data[0].map(item => item[0]).join('');
  } catch (e) {
    return text;
  }
}

async function translateTags(tags) {
  if (!tags) return "";
  const cleaned = tags.replace(/#/g, '').trim();
  try {
    const translated = await translateText(cleaned);
    return translated.split(/[\s,]+/).filter(Boolean).map(t => `#${t.toLowerCase()}`).join(' ');
  } catch (e) {
    return tags;
  }
}

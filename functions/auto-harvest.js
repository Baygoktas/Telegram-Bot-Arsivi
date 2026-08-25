const SOURCE_URL = "https://tgadsspy.com/api/v1/miniapps";

const SOURCE_PAGE_SIZE = 50;
const MAX_NEW_BOTS = 30;
const LOCK_SECONDS = 50;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  // Cron güvenliği
  const cronSecret = env.CRON_SECRET;

  if (cronSecret) {
    const providedSecret =
      url.searchParams.get("key") ||
      request.headers.get("x-cron-secret");

    if (providedSecret !== cronSecret) {
      return json({
        durum: "Hata",
        mesaj: "Yetkisiz erişim."
      }, 401);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const lockUntil = now + LOCK_SECONDS;

  try {
    // --------------------------------------------------
    // 1. Import state tablosunu hazırla
    // --------------------------------------------------

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS bot_import_state (
        id INTEGER PRIMARY KEY,
        source TEXT NOT NULL,
        current_offset INTEGER DEFAULT 0,
        total_imported INTEGER DEFAULT 0,
        last_run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        locked_until INTEGER DEFAULT 0
      )
    `).run();

    await env.DB.prepare(`
      INSERT OR IGNORE INTO bot_import_state
      (id, source, current_offset, total_imported, locked_until)
      VALUES (1, 'tgadsspy', 0, 0, 0)
    `).run();

    // --------------------------------------------------
    // 2. Çakışan cron çalışmasını engelle
    // --------------------------------------------------

    const lockResult = await env.DB.prepare(`
      UPDATE bot_import_state
      SET locked_until = ?
      WHERE id = 1
        AND (locked_until IS NULL OR locked_until < ?)
    `)
      .bind(lockUntil, now)
      .run();

    if (!lockResult.meta?.changes) {
      return json({
        durum: "Atlandı",
        mesaj: "Önceki import işlemi hâlâ çalışıyor."
      });
    }

    // --------------------------------------------------
    // 3. Cursor oku
    // --------------------------------------------------

    const state = await env.DB.prepare(`
      SELECT current_offset, total_imported
      FROM bot_import_state
      WHERE id = 1
    `).first();

    let offset = Number(state?.current_offset || 0);
    let totalImported = Number(state?.total_imported || 0);

    // --------------------------------------------------
    // 4. Kaynaktan 50 bot getir
    // --------------------------------------------------

    const apiUrl =
      `${SOURCE_URL}?sort=mau&limit=${SOURCE_PAGE_SIZE}&offset=${offset}`;

    const response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "BotArsivi/1.0"
      }
    });

    if (!response.ok) {
      const retryAfter = response.headers.get("Retry-After");
      const errorText = await response.text();

      await unlock(env);

      return json({
        durum: "Kaynak Hatası",
        status: response.status,
        retry_after: retryAfter,
        detay: errorText.slice(0, 500),
        offset
      }, response.status);
    }

    const payload = await response.json();

    const sourceBots = Array.isArray(payload?.data)
      ? payload.data
      : [];

    if (!sourceBots.length) {
      await unlock(env);

      return json({
        durum: "Tamamlandı",
        mesaj: "Kaynakta bu offsetten sonra bot kalmadı.",
        offset,
        toplam_import: totalImported
      });
    }

    // --------------------------------------------------
    // 5. Username'leri normalize et
    // --------------------------------------------------

    const normalizedBots = sourceBots
      .map((bot, index) => ({
        ...bot,
        _index: index,
        _username: normalizeUsername(bot?.username)
      }))
      .filter(bot => bot._username);

    // --------------------------------------------------
    // 6. D1'de mevcut botları TEK sorguda bul
    // --------------------------------------------------

    const usernames = normalizedBots.map(bot => bot._username);

    const placeholders = usernames
      .map(() => "?")
      .join(",");

    let existingRows = [];

    if (usernames.length) {
      const result = await env.DB.prepare(`
        SELECT username
        FROM bots
        WHERE username IN (${placeholders})
      `)
        .bind(...usernames)
        .all();

      existingRows = result.results || [];
    }

    const existingSet = new Set(
      existingRows.map(row =>
        normalizeUsername(row.username)
      )
    );

    // --------------------------------------------------
    // 7. İlk 30 YENİ botu seç
    // --------------------------------------------------

    const newCandidates = [];

    for (const bot of normalizedBots) {

      if (existingSet.has(bot._username)) {
        continue;
      }

      newCandidates.push(bot);

      if (newCandidates.length >= MAX_NEW_BOTS) {
        break;
      }
    }

    // --------------------------------------------------
    // 8. Cursor'u KESİNLİKLE işlenen son elemana taşı
    // --------------------------------------------------

    let consumedCount;

    if (newCandidates.length >= MAX_NEW_BOTS) {
      const lastCandidate =
        newCandidates[newCandidates.length - 1];

      consumedCount = lastCandidate._index + 1;
    } else {
      // 50 kaydın tamamını taradık
      consumedCount = sourceBots.length;
    }

    const nextOffset = offset + consumedCount;

    // --------------------------------------------------
    // 9. Yeni botların detaylarını al
    // --------------------------------------------------

    const preparedBots = [];

    for (const bot of newCandidates) {

      let detail = null;

      try {
        const detailResponse = await fetch(
          `https://tgadsspy.com/api/v1/miniapps/${encodeURIComponent(bot._username)}`,
          {
            headers: {
              "Accept": "application/json",
              "User-Agent": "BotArsivi/1.0"
            }
          }
        );

        if (detailResponse.ok) {
          const detailPayload =
            await detailResponse.json();

          detail = detailPayload?.data || null;
        }

      } catch (error) {
        console.log(
          `Detay alınamadı: ${bot._username}`,
          error?.message
        );
      }

      const name = cleanText(
        detail?.title ||
        bot?.title ||
        bot._username
      );

      const description = cleanText(
        detail?.description ||
        `${name} Telegram botu.`
      );

      const tags = buildTags(
        detail?.botNiche ||
        bot?.botNiche ||
        ""
      );

      preparedBots.push({
        username: bot._username,
        name,
        description,
        tags,
        raw: {
          source: "tgadsspy",
          avatar_url:
            detail?.avatarUrl ||
            bot?.avatarUrl ||
            null,
          niche:
            detail?.botNiche ||
            bot?.botNiche ||
            null,
          mau:
            detail?.botActiveUsers ||
            bot?.botActiveUsers ||
            null,
          stars:
            detail?.botStarsRatingStars ||
            null,
          stars_level:
            detail?.botStarsRatingLevel ||
            null,
          popular_rank:
            detail?.popularBotsRank ||
            null,
          sponsored:
            detail?.botSponsoredEnabled ||
            false
        }
      });
    }

    // --------------------------------------------------
    // 10. D1'e BATCH INSERT
    // --------------------------------------------------

    const insertStatements = [];

    for (const bot of preparedBots) {

      insertStatements.push(
        env.DB.prepare(`
          INSERT INTO bots (
            username,
            name,
            rating_score,
            rating_max,
            vote_count,
            description,
            languages,
            supports_inline,
            supports_groups,
            tags,
            raw_message,
            updated_at
          )
          VALUES (
            ?, ?, 0.0, 5.0, 0, ?, ?, 1, 1, ?, ?, CURRENT_TIMESTAMP
          )
          ON CONFLICT(username) DO NOTHING
        `).bind(
          bot.username,
          bot.name,
          bot.description,
          "",
          bot.tags,
          JSON.stringify(bot.raw)
        )
      );
    }

    if (insertStatements.length) {
      await env.DB.batch(insertStatements);
    }

    const actuallyInserted =
      preparedBots.length;

    totalImported += actuallyInserted;

    // --------------------------------------------------
    // 11. Cursor + istatistik güncelle
    // --------------------------------------------------

    await env.DB.prepare(`
      UPDATE bot_import_state
      SET
        current_offset = ?,
        total_imported = ?,
        last_run_at = CURRENT_TIMESTAMP,
        locked_until = 0
      WHERE id = 1
    `)
      .bind(
        nextOffset,
        totalImported
      )
      .run();

    // --------------------------------------------------
    // 12. Sonuç
    // --------------------------------------------------

    return json({
      durum: "Başarılı",
      kaynak: "tgadsspy",

      kaynak_offset: offset,
      sonraki_offset: nextOffset,

      kaynakta_getirilen:
        sourceBots.length,

      taranan:
        consumedCount,

      yeni_eklenen:
        actuallyInserted,

      toplam_import:
        totalImported,

      kalan_tahmini:
        payload?.meta?.total
          ? Math.max(
              0,
              Number(payload.meta.total) - nextOffset
            )
          : null,

      eklenenler:
        preparedBots.map(bot => ({
          username: bot.username,
          name: bot.name
        }))
    });

  } catch (error) {

    console.error(
      "BOT IMPORT ERROR:",
      error
    );

    // Hata olursa cursor ilerletme.
    // Sadece lock'u bırak.
    try {
      await unlock(env);
    } catch {}

    return json({
      durum: "Hata",
      mesaj:
        error?.message ||
        "Bilinmeyen hata"
    }, 500);
  }
}


// ======================================================
// LOCK
// ======================================================

async function unlock(env) {
  await env.DB.prepare(`
    UPDATE bot_import_state
    SET locked_until = 0
    WHERE id = 1
  `).run();
}


// ======================================================
// USERNAME
// ======================================================

function normalizeUsername(username) {

  if (!username) {
    return null;
  }

  const value = String(username)
    .trim()
    .replace(/^@/, "")
    .toLowerCase();

  if (!/^[a-z0-9_]{3,32}$/.test(value)) {
    return null;
  }

  return value;
}


// ======================================================
// TEXT
// ======================================================

function cleanText(value) {

  if (!value) {
    return "";
  }

  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}


// ======================================================
// TAGS
// ======================================================

function buildTags(niche) {

  if (!niche) {
    return "#telegram #bot";
  }

  const map = {
    crypto: "#kripto",
    gambling: "#kumar",
    finance: "#finans",
    games: "#oyun",
    gaming: "#oyun",
    trading: "#trading",
    education: "#eğitim",
    technology: "#teknoloji",
    tech: "#teknoloji",
    news: "#haber",
    vpn: "#vpn",
    music: "#müzik",
    ai: "#yapayzeka",
    artificial_intelligence: "#yapayzeka"
  };

  const key =
    String(niche)
      .trim()
      .toLowerCase();

  return `${map[key] || "#" + key} #telegram #bot`;
}


// ======================================================
// JSON RESPONSE
// ======================================================

function json(data, status = 200) {

  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store"
      }
    }
  );
        }

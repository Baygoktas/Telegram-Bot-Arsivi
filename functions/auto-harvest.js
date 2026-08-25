const SOURCE_URL = "https://tgadsspy.com/api/v1/miniapps";

const SOURCE_PAGE_SIZE = 100;
const MAX_NEW_BOTS = 30;
const MAX_PAGES_PER_RUN = 3;
const LOCK_SECONDS = 50;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  // ==================================================
  // CRON GÜVENLİĞİ
  // ==================================================

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

  // API key kontrolü
  if (!env.TGADSSPY_API_KEY) {
    return json({
      durum: "Hata",
      mesaj: "TGADSSPY_API_KEY secret bulunamadı."
    }, 500);
  }

  const now = Math.floor(Date.now() / 1000);
  const lockUntil = now + LOCK_SECONDS;

  try {

    // ==================================================
    // 1. STATE TABLOSU
    // ==================================================

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
      (
        id,
        source,
        current_offset,
        total_imported,
        locked_until
      )
      VALUES
      (
        1,
        'tgadsspy',
        0,
        0,
        0
      )
    `).run();


    // ==================================================
    // 2. CRON ÇAKIŞMA KİLİDİ
    // ==================================================

    const lockResult = await env.DB.prepare(`
      UPDATE bot_import_state
      SET locked_until = ?
      WHERE id = 1
        AND (
          locked_until IS NULL
          OR locked_until < ?
        )
    `)
      .bind(lockUntil, now)
      .run();

    if (!lockResult.meta?.changes) {
      return json({
        durum: "Atlandı",
        mesaj: "Önceki import hâlâ çalışıyor."
      });
    }


    // ==================================================
    // 3. STATE OKU
    // ==================================================

    const state = await env.DB.prepare(`
      SELECT
        current_offset,
        total_imported
      FROM bot_import_state
      WHERE id = 1
    `).first();

    const startOffset =
      Number(state?.current_offset || 0);

    let offset = startOffset;

    let totalImported =
      Number(state?.total_imported || 0);


    // ==================================================
    // 4. 30 YENİ BOT BUL
    // ==================================================

    const selectedBots = [];

    // Aynı cron çalışmasında tekrar username seçilmesini
    // engeller.
    const runSeen = new Set();

    let pagesFetched = 0;
    let sourceRecordsScanned = 0;
    let sourceTotal = null;

    let cursorAfterRun = offset;

    while (
      selectedBots.length < MAX_NEW_BOTS &&
      pagesFetched < MAX_PAGES_PER_RUN
    ) {

      // ------------------------------------------------
      // API URL
      // ------------------------------------------------

      const apiUrl =
        `${SOURCE_URL}` +
        `?sort=mau` +
        `&limit=${SOURCE_PAGE_SIZE}` +
        `&offset=${offset}`;


      // ------------------------------------------------
      // API İSTEĞİ
      // ------------------------------------------------

      const response = await fetch(
        apiUrl,
        {
          headers: {
            "Accept": "application/json",
            "X-Api-Key": env.TGADSSPY_API_KEY,
            "User-Agent": "BotArsivi/1.0"
          }
        }
      );


      // ------------------------------------------------
      // RATE LIMIT
      // ------------------------------------------------

      if (response.status === 429) {

        const retryAfter =
          response.headers.get("Retry-After");

        await unlock(env);

        return json({
          durum: "Rate Limit",
          mesaj: "Kaynak API rate limit uyguladı.",
          retry_after: retryAfter,
          offset
        }, 429);
      }


      // ------------------------------------------------
      // API HATASI
      // ------------------------------------------------

      if (!response.ok) {

        const errorText =
          await response.text();

        await unlock(env);

        return json({
          durum: "Kaynak Hatası",
          status: response.status,
          detay: errorText.slice(0, 500),
          offset
        }, response.status);
      }


      const payload =
        await response.json();

      const sourceBots =
        Array.isArray(payload?.data)
          ? payload.data
          : [];

      sourceTotal =
        Number(payload?.meta?.total || 0);

      pagesFetched++;


      // ------------------------------------------------
      // KAYNAK BİTTİ
      // ------------------------------------------------

      if (!sourceBots.length) {
        break;
      }


      sourceRecordsScanned +=
        sourceBots.length;


      // ------------------------------------------------
      // USERNAME'LERİ TEMİZLE
      // ------------------------------------------------

      const normalizedBots = [];

      for (
        let i = 0;
        i < sourceBots.length;
        i++
      ) {

        const bot =
          sourceBots[i];

        const username =
          normalizeUsername(
            bot?.username
          );

        if (!username) {
          continue;
        }

        normalizedBots.push({
          ...bot,
          _username: username,
          _sourceIndex: i
        });
      }


      // ------------------------------------------------
      // AYNI SAYFADAKİ DUPLICATE'LERİ TEMİZLE
      // ------------------------------------------------

      const uniquePageBots = [];

      const pageSeen =
        new Set();

      for (
        const bot of normalizedBots
      ) {

        if (
          pageSeen.has(
            bot._username
          )
        ) {
          continue;
        }

        pageSeen.add(
          bot._username
        );

        uniquePageBots.push(bot);
      }


      // ------------------------------------------------
      // D1'DEN MEVCUT BOTLARI TEK SORGUDA BUL
      // ------------------------------------------------

      const pageUsernames =
        uniquePageBots.map(
          bot => bot._username
        );

      const existingSet =
        new Set();

      if (pageUsernames.length) {

        const placeholders =
          pageUsernames
            .map(() => "?")
            .join(",");

        const existing =
          await env.DB.prepare(`
            SELECT username
            FROM bots
            WHERE username IN (${placeholders})
          `)
          .bind(...pageUsernames)
          .all();

        for (
          const row of (
            existing.results || []
          )
        ) {

          const username =
            normalizeUsername(
              row.username
            );

          if (username) {
            existingSet.add(
              username
            );
          }
        }
      }


      // ------------------------------------------------
      // YENİ BOTLARI SEÇ
      // ------------------------------------------------

      for (
        const bot of uniquePageBots
      ) {

        const username =
          bot._username;


        // D1'de zaten var
        if (
          existingSet.has(username)
        ) {
          continue;
        }


        // Bu cron'da zaten seçildi
        if (
          runSeen.has(username)
        ) {
          continue;
        }


        runSeen.add(username);

        selectedBots.push(bot);


        if (
          selectedBots.length >=
          MAX_NEW_BOTS
        ) {
          break;
        }
      }


      // ------------------------------------------------
      // CURSOR
      // ------------------------------------------------

      if (
        selectedBots.length >=
        MAX_NEW_BOTS
      ) {

        const lastSelected =
          selectedBots[
            selectedBots.length - 1
          ];

        cursorAfterRun =
          offset +
          lastSelected._sourceIndex +
          1;

        break;
      }


      // Sayfanın tamamı tarandı
      offset +=
        sourceBots.length;

      cursorAfterRun =
        offset;


      // Kaynak bitti
      if (
        sourceTotal > 0 &&
        offset >= sourceTotal
      ) {
        break;
      }


      // FREE API offset sınırı
      if (
        offset >= 10000
      ) {
        break;
      }
    }


    // ==================================================
    // 5. DETAYLARI AL
    // ==================================================

    const preparedBots = [];

    for (
      const bot of selectedBots
    ) {

      let detail = null;

      try {

        const detailResponse =
          await fetch(
            `${SOURCE_URL}/${encodeURIComponent(
              bot._username
            )}`,
            {
              headers: {
                "Accept":
                  "application/json",
                "X-Api-Key":
                  env.TGADSSPY_API_KEY,
                "User-Agent":
                  "BotArsivi/1.0"
              }
            }
          );


        if (
          detailResponse.ok
        ) {

          const detailPayload =
            await detailResponse.json();

          detail =
            detailPayload?.data ||
            null;
        }

      } catch (error) {

        console.log(
          "Detay alınamadı:",
          bot._username,
          error?.message
        );
      }


      const name =
        cleanText(
          detail?.title ||
          bot?.title ||
          bot._username
        );


      const description =
        cleanText(
          detail?.description ||
          `${name} Telegram botu.`
        );


      const tags =
        buildTags(
          detail?.botNiche ||
          bot?.botNiche ||
          ""
        );


      preparedBots.push({

        username:
          bot._username,

        name,

        description,

        tags,

        raw: {

          source:
            "tgadsspy",

          avatar_url:
            detail?.avatarUrl ||
            bot?.avatarUrl ||
            null,

          niche:
            detail?.botNiche ||
            bot?.botNiche ||
            null,

          mau:
            detail?.botActiveUsers ??
            bot?.botActiveUsers ??
            null,

          stars:
            detail?.botStarsRatingStars ??
            null,

          stars_level:
            detail?.botStarsRatingLevel ??
            null,

          popular_rank:
            detail?.popularBotsRank ??
            null,

          growth_pct:
            detail?.growthPct ??
            bot?.growthPct ??
            null,

          sponsored:
            detail?.botSponsoredEnabled ??
            bot?.botSponsoredEnabled ??
            false,

          last_enrichment:
            detail?.lastBotEnrichmentAt ??
            bot?.lastBotEnrichmentAt ??
            null,

          source_profile:
            `https://tgadsspy.com/miniapps/${bot._username}`
        }
      });
    }


    // ==================================================
    // 6. D1 BATCH INSERT
    // ==================================================

    const statements = [];

    for (
      const bot of preparedBots
    ) {

      statements.push(

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
            ?,
            ?,
            0.0,
            5.0,
            0,
            ?,
            ?,
            1,
            1,
            ?,
            ?,
            CURRENT_TIMESTAMP
          )
          ON CONFLICT(username)
          DO NOTHING
        `)
        .bind(
          bot.username,
          bot.name,
          bot.description,
          "",
          bot.tags,
          JSON.stringify(bot.raw)
        )
      );
    }


    if (statements.length) {

      await env.DB.batch(
        statements
      );
    }


    // ==================================================
    // 7. GERÇEK TOPLAM
    // ==================================================

    totalImported +=
      preparedBots.length;


    // ==================================================
    // 8. CURSOR KAYDET
    // ==================================================

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
      cursorAfterRun,
      totalImported
    )
    .run();


    // ==================================================
    // 9. SONUÇ
    // ==================================================

    return json({

      durum:
        "Başarılı",

      kaynak:
        "tgadsspy",

      api_plan:
        "FREE",

      baslangic_offset:
        startOffset,

      sonraki_offset:
        cursorAfterRun,

      sayfa_sayisi:
        pagesFetched,

      taranan_kayit:
        sourceRecordsScanned,

      yeni_eklenen:
        preparedBots.length,

      hedef:
        MAX_NEW_BOTS,

      toplam_import:
        totalImported,

      kaynak_toplam:
        sourceTotal,

      tahmini_kalan:
        sourceTotal
          ? Math.max(
              0,
              sourceTotal -
              cursorAfterRun
            )
          : null,

      eklenenler:
        preparedBots.map(
          bot => ({
            username:
              bot.username,
            name:
              bot.name
          })
        )
    });


  } catch (error) {

    console.error(
      "BOT IMPORT ERROR:",
      error
    );

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
// LOCK AÇ
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

  const value =
    String(username)
      .trim()
      .replace(/^@/, "")
      .toLowerCase();

  if (
    !/^[a-z0-9_]{3,32}$/.test(value)
  ) {
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

    crypto:
      "#kripto",

    gambling:
      "#kumar",

    finance:
      "#finans",

    games:
      "#oyun",

    gaming:
      "#oyun",

    trading:
      "#trading",

    education:
      "#eğitim",

    technology:
      "#teknoloji",

    tech:
      "#teknoloji",

    news:
      "#haber",

    vpn:
      "#vpn",

    music:
      "#müzik",

    ai:
      "#yapayzeka",

    artificial_intelligence:
      "#yapayzeka"
  };

  const key =
    String(niche)
      .trim()
      .toLowerCase();

  return `${
    map[key] ||
    "#" + key
  } #telegram #bot`;
}


// ======================================================
// JSON
// ======================================================

function json(
  data,
  status = 200
) {

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

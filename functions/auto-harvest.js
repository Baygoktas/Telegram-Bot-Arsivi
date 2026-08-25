const SOURCE_URL = "https://tgadsspy.com/api/v1/miniapps";
const PAGE_SIZE = 50;
const MAX_NEW_BOTS = 10;

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);

    // Cron endpoint güvenliği
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

    try {
        // --------------------------------------------------
        // 1. Import state
        // --------------------------------------------------

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS bot_import_state (
                id INTEGER PRIMARY KEY,
                source TEXT NOT NULL,
                current_offset INTEGER DEFAULT 0,
                total_imported INTEGER DEFAULT 0,
                last_run_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();

        await env.DB.prepare(`
            INSERT OR IGNORE INTO bot_import_state
            (id, source, current_offset, total_imported)
            VALUES (1, 'tgadsspy', 0, 0)
        `).run();

        const state = await env.DB
            .prepare(`
                SELECT current_offset, total_imported
                FROM bot_import_state
                WHERE id = 1
            `)
            .first();

        let offset = Number(state?.current_offset || 0);
        let totalImported = Number(state?.total_imported || 0);

        // --------------------------------------------------
        // 2. Kaynaktan botları çek
        // --------------------------------------------------

        const apiUrl =
            `${SOURCE_URL}?sort=mau&limit=${PAGE_SIZE}&offset=${offset}`;

        const response = await fetch(apiUrl, {
            headers: {
                "Accept": "application/json",
                "User-Agent": "BotArsivi/1.0"
            }
        });

        if (!response.ok) {
            const errorText = await response.text();

            return json({
                durum: "Kaynak Hatası",
                status: response.status,
                detay: errorText.slice(0, 500),
                offset
            }, response.status);
        }

        const payload = await response.json();

        const sourceBots = Array.isArray(payload?.data)
            ? payload.data
            : [];

        if (!sourceBots.length) {
            return json({
                durum: "Tamamlandı",
                mesaj: "Bu offsette yeni bot bulunamadı.",
                offset,
                toplam_import: totalImported
            });
        }

        // --------------------------------------------------
        // 3. Maksimum 10 YENİ bot
        // --------------------------------------------------

        let added = [];
        let skipped = [];

        for (const bot of sourceBots) {

            if (added.length >= MAX_NEW_BOTS) {
                break;
            }

            const username = normalizeUsername(bot?.username);

            if (!username) {
                skipped.push({
                    username: null,
                    reason: "geçersiz_username"
                });
                continue;
            }

            // D1'de zaten var mı?
            const existing = await env.DB
                .prepare(`
                    SELECT id
                    FROM bots
                    WHERE username = ?
                    LIMIT 1
                `)
                .bind(username)
                .first();

            if (existing) {
                skipped.push({
                    username,
                    reason: "zaten_var"
                });
                continue;
            }

            // --------------------------------------------------
            // 4. Detay bilgisini çek
            // --------------------------------------------------

            let detail = null;

            try {
                const detailResponse = await fetch(
                    `https://tgadsspy.com/api/v1/miniapps/${encodeURIComponent(username)}`,
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
            } catch (detailError) {
                // Liste verisi yine de kullanılabilir.
            }

            const name =
                cleanText(
                    detail?.title ||
                    bot?.title ||
                    username
                );

            const description =
                cleanText(
                    detail?.description ||
                    `${name} Telegram botu.`
                );

            const tags = buildTags(
                detail?.botNiche ||
                bot?.botNiche ||
                ""
            );

            // --------------------------------------------------
            // 5. D1 INSERT
            // --------------------------------------------------

            try {

                await env.DB.prepare(`
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
                    VALUES (?, ?, 0.0, 5.0, 0, ?, ?, 0, 0, ?, ?, CURRENT_TIMESTAMP)
                `)
                .bind(
                    username,
                    name,
                    description,
                    "",
                    tags,
                    JSON.stringify({
                        source: "tgadsspy",
                        avatar_url: detail?.avatarUrl || bot?.avatarUrl || null,
                        niche: detail?.botNiche || bot?.botNiche || null,
                        mau: detail?.botActiveUsers || null,
                        stars: detail?.botStarsRatingStars || null,
                        stars_level: detail?.botStarsRatingLevel || null,
                        source_url:
                            `https://tgadsspy.com/miniapps/${username}`
                    })
                )
                .run();

                added.push({
                    username,
                    name
                });

                totalImported++;

            } catch (insertError) {

                // UNIQUE constraint nedeniyle yarış durumunda
                // tekrar kayıt oluşmaz.
                skipped.push({
                    username,
                    reason: "insert_hatasi"
                });
            }
        }

        // --------------------------------------------------
        // 6. Cursor ilerlet
        // --------------------------------------------------

        const nextOffset =
            offset + sourceBots.length;

        await env.DB.prepare(`
            UPDATE bot_import_state
            SET
                current_offset = ?,
                total_imported = ?,
                last_run_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `)
        .bind(
            nextOffset,
            totalImported
        )
        .run();

        return json({
            durum: "Başarılı",
            kaynak: "tgadsspy",
            kaynak_offset: offset,
            sonraki_offset: nextOffset,
            kaynakta_getirilen: sourceBots.length,
            yeni_eklenen: added.length,
            atlanan: skipped.length,
            toplam_import: totalImported,
            eklenenler: added,
            atlananlar: skipped
        });

    } catch (error) {

        console.error("BOT IMPORT ERROR:", error);

        return json({
            durum: "Hata",
            mesaj: error?.message || "Bilinmeyen hata"
        }, 500);
    }
}


// --------------------------------------------------
// Helpers
// --------------------------------------------------

function normalizeUsername(username) {

    if (!username) {
        return null;
    }

    let value = String(username)
        .trim()
        .replace(/^@/, "")
        .toLowerCase();

    // Telegram username formatı
    if (!/^[a-z0-9_]{3,32}$/.test(value)) {
        return null;
    }

    return value;
}


function cleanText(value) {

    if (!value) {
        return "";
    }

    return String(value)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2000);
}


function buildTags(niche) {

    const map = {
        crypto: "#kripto",
        trading: "#trading",
        finance: "#finans",
        games: "#oyun",
        gaming: "#oyun",
        education: "#eğitim",
        technology: "#teknoloji",
        tech: "#teknoloji",
        news: "#haber",
        vpn: "#vpn",
        bots: "#bot"
    };

    if (!niche) {
        return "#telegram #bot";
    }

    const key = String(niche).toLowerCase();

    return `${map[key] || "#" + key} #telegram #bot`;
}


function json(data, status = 200) {

    return new Response(
        JSON.stringify(data, null, 2),
        {
            status,
            headers: {
                "Content-Type":
                    "application/json; charset=utf-8",
                "Access-Control-Allow-Origin": "*"
            }
        }
    );
                  }

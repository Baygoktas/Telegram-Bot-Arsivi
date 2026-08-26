export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  const search = url.searchParams.get("search") || "";
  const tag = url.searchParams.get("tag") || "";

  /*
   * ANA KAYNAK:
   * Collector botları bot_archive tablosuna yazıyor.
   *
   * bots tablosu eski 144 kayıtlık yapıydı.
   * Bu endpoint artık bot_archive üzerinden çalışır.
   *
   * bots tablosundaki mevcut kullanıcı puanları varsa
   * username üzerinden korunur.
   */

  let query = `
    SELECT
      a.username,
      a.name,
      a.description,
      a.avatar_url,
      a.niche,
      a.mau,
      a.stars,
      a.stars_level,
      a.popular_rank,
      a.growth_pct,
      a.sponsored,
      a.source,
      a.first_seen_at,
      a.updated_at,

      COALESCE(b.rating_score, 0) AS rating_score,
      COALESCE(b.vote_count, 0) AS vote_count,
      COALESCE(b.supports_inline, 0) AS supports_inline,
      COALESCE(b.supports_groups, 0) AS supports_groups,
      COALESCE(b.tags, '') AS stored_tags

    FROM bot_archive a
    LEFT JOIN bots b
      ON LOWER(b.username) = LOWER(a.username)

    WHERE 1=1
  `;

  const params = [];

  /*
   * Arama:
   * bot adı + username + açıklama + niche
   */
  if (search) {
    query += `
      AND (
        a.name LIKE ?
        OR a.username LIKE ?
        OR a.description LIKE ?
        OR COALESCE(a.niche, '') LIKE ?
      )
    `;

    const value = `%${search}%`;

    params.push(
      value,
      value,
      value,
      value
    );
  }

  /*
   * Kategori / etiket filtresi.
   *
   * Hem collector'ın niche alanına
   * hem de eski bots.tags alanına bakıyoruz.
   */
  if (tag) {
    query += `
      AND (
        LOWER(COALESCE(a.niche, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(b.tags, '')) LIKE LOWER(?)
      )
    `;

    const value = `%${tag}%`;

    params.push(
      value,
      value
    );
  }

  /*
   * Öncelik:
   * 1. Mevcut kullanıcı puanı
   * 2. TG Ads Spy yıldız puanı
   * 3. Popular rank
   * 4. Son güncelleme
   *
   * Böylece eski 144 kayıt da tamamen kaybolmaz.
   */
  query += `
    ORDER BY
      rating_score DESC,
      vote_count DESC,
      COALESCE(a.stars, 0) DESC,
      CASE
        WHEN a.popular_rank IS NULL THEN 999999999
        ELSE a.popular_rank
      END ASC,
      a.updated_at DESC
  `;

  const { results } = await env.DB
    .prepare(query)
    .bind(...params)
    .all();

  /*
   * Toplam sayı filtrelerden bağımsız olarak
   * bot_archive üzerinden alınır.
   */
  const totalResult = await env.DB
    .prepare(`
      SELECT COUNT(*) AS total
      FROM bot_archive
    `)
    .first();

  const total = Number(
    totalResult?.total || 0
  );

  /*
   * Frontend'in mevcut yapısını bozmamak için
   * bot_archive verisini mevcut kart formatına dönüştürüyoruz.
   */
  const bots = (results || []).map(bot => {
    let tags = bot.stored_tags || "";

    /*
     * Eski tags yoksa niche'den basit etiket oluştur.
     */
    if (!tags && bot.niche) {
      const niche = String(bot.niche)
        .trim()
        .toLowerCase();

      if (niche) {
        tags = `#${niche.replace(/\s+/g, "-")}`;
      }
    }

    /*
     * Avatar collector'dan geliyorsa frontend bunu kullanabilir.
     */
    return {
      username: bot.username,
      name: bot.name || bot.username,
      description: bot.description || "",

      avatar_url: bot.avatar_url || null,

      niche: bot.niche || null,
      mau: bot.mau ?? null,
      stars: bot.stars ?? 0,
      stars_level: bot.stars_level ?? null,
      popular_rank: bot.popular_rank ?? null,
      growth_pct: bot.growth_pct ?? null,
      sponsored: bot.sponsored ? 1 : 0,
      source: bot.source || "tgadsspy",

      first_seen_at: bot.first_seen_at || null,
      updated_at: bot.updated_at || null,

      /*
       * Mevcut frontend uyumluluğu.
       */
      rating_score:
        Number(bot.rating_score || 0),

      vote_count:
        Number(bot.vote_count || 0),

      supports_inline:
        Number(bot.supports_inline || 0),

      supports_groups:
        Number(bot.supports_groups || 0),

      tags
    };
  });

  return new Response(
    JSON.stringify({
      bots,
      total
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}

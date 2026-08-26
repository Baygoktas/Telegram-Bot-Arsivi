export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const tag = url.searchParams.get("tag") || "";

  // Filtrelenmiş botları getir
  let query = "SELECT * FROM bots WHERE 1=1";
  const params = [];

  if (search) {
    query += " AND (name LIKE ? OR username LIKE ? OR description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (tag) {
    query += " AND tags LIKE ?";
    params.push(`%${tag}%`);
  }

  query += " ORDER BY rating_score DESC, vote_count DESC";

  const { results } = await env.DB
    .prepare(query)
    .bind(...params)
    .all();

  // D1'deki GERÇEK toplam bot sayısını ayrıca al.
  // Arama/kategori filtresinden bağımsızdır.
  const totalResult = await env.DB
    .prepare("SELECT COUNT(*) AS total FROM bots")
    .first();

  const total = Number(totalResult?.total || 0);

  return new Response(
    JSON.stringify({
      bots: results,
      total: total
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}

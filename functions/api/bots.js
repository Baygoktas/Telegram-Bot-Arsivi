export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const tag = url.searchParams.get("tag") || "";
  
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

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return new Response(JSON.stringify(results), {
    headers: { 
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*" 
    }
  });
}

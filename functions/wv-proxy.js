const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const url = decodeURIComponent(new URL(request.url).searchParams.get('url') || 'none');
    const authXml = request.headers.get('nv-authorizations') || '';
    return new Response(JSON.stringify({ ok: true, url: url.substring(0,80), hasAuth: !!authXml }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: CORS });
  }
}

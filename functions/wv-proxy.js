const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const NAGRA_URL = 'https://azy4sj9b.anycast.nagra.com/AZY4SJ9B/wvls/contentlicenseservice/v1/licenses';

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const url = decodeURIComponent(new URL(request.url).searchParams.get('url') || NAGRA_URL);
    const authXml = request.headers.get('nv-authorizations') || '';
    if (!authXml) {
      return new Response(JSON.stringify({ error: 'Missing nv-authorizations header' }), { status: 401, headers: CORS });
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'nv-authorizations': authXml,
        'Origin': 'https://web.azamtvmax.com',
        'Referer': 'https://web.azamtvmax.com/'
      },
      body: request.body
    });
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: {
        ...CORS,
        'Content-Type': resp.headers.get('content-type') || 'application/octet-stream'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: CORS });
  }
}

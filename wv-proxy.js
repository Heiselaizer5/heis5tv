export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  }
  const url = new URL(request.url).searchParams.get('url') || 'https://azy4sj9b.anycast.nagra.com/AZY4SJ9B/wvls/contentlicenseservice/v1/licenses';
  const authXmlToken = new URL(request.url).searchParams.get('authXmlToken') || '';
  const body = await request.arrayBuffer();
  if (!authXmlToken) console.log('[WV-PROXY] WARNING: No authXmlToken!');
  try {
    const resp = await fetch(decodeURIComponent(url), {
      method: 'POST',
      headers: {
        'nv-authorizations': authXmlToken,
        'Origin': 'https://web.azamtvmax.com',
        'Referer': 'https://web.azamtvmax.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': request.headers.get('content-type') || 'application/octet-stream'
      },
      body
    });
    const buf = await resp.arrayBuffer();
    return new Response(buf, {
      status: resp.status,
      headers: {
        'Content-Type': resp.headers.get('content-type') || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Widevine proxy error: ' + e.message }), { status: 502 });
  }
}

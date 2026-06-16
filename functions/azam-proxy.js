const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS' };

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const params = new URL(request.url).searchParams;
  let targetUrl = decodeURIComponent(params.get('url') || '');

  if (!targetUrl && request.method === 'POST') {
    targetUrl = await request.text();
  }
  if (!targetUrl) return new Response('Missing url param', { status: 400, headers: CORS });

  try {
    const cdnResp = await fetch(targetUrl, {
      headers: {
        'Referer': 'https://web.azamtvmax.com/',
        'Origin': 'https://web.azamtvmax.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (cdnResp.status === 200) {
      const body = await cdnResp.arrayBuffer();
      const contentType = cdnResp.headers.get('content-type') || 'application/octet-stream';
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache', ...CORS }
      });
    }

    const text = await cdnResp.text();
    return new Response(text, {
      status: cdnResp.status,
      headers: { 'Content-Type': 'application/json', ...CORS, 'X-CDN-Status': String(cdnResp.status) }
    });
  } catch (e) {
    return new Response('Proxy error: ' + e.message, { status: 500, headers: CORS });
  }
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS' };

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const params = new URL(request.url).searchParams;
  let targetUrl = decodeURIComponent(params.get('url') || '');
  const cdnTokenQuery = params.get('cdnTokenQuery') || '';

  if (!targetUrl && request.method === 'POST') {
    targetUrl = await request.text();
  }
  if (!targetUrl) return new Response('Missing url param', { status: 400, headers: CORS });

  try {
    let fetchUrl = targetUrl;
    let cookies = '';
    if (cdnTokenQuery) {
      // Use cdntoken as query param
      const cdntokMatch = cdnTokenQuery.match(/cdntoken=([^&]+)/);
      if (cdntokMatch) {
        const sep = fetchUrl.includes('?') ? '&' : '?';
        fetchUrl += sep + 'cdntoken=' + cdntokMatch[1];
      }
      // Send hdnts as cookie (Akamai standard)
      const hdntsMatch = cdnTokenQuery.match(/hdnts=([^&]+)/);
      if (hdntsMatch) cookies = 'hdnts=' + hdntsMatch[1];
    }
    const headers = {
      'Referer': 'https://web.azamtvmax.com/',
      'Origin': 'https://web.azamtvmax.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    };
    if (cookies) headers['Cookie'] = cookies;

    const res = await fetch(fetchUrl, { headers });
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: { 'Content-Type': contentType, ...CORS, 'Cache-Control': 'no-cache' }
    });
  } catch (e) {
    return new Response('Proxy error: ' + e.message, { status: 500, headers: CORS });
  }
}

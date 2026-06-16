const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS' };

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const params = new URL(request.url).searchParams;
  let targetUrl = decodeURIComponent(params.get('url') || '');
  const cdntoken = params.get('cdntoken');
  const cdnTokenQuery = params.get('cdnTokenQuery') || '';

  if (!targetUrl && request.method === 'POST') {
    targetUrl = await request.text();
  }
  if (!targetUrl) return new Response('Missing url param', { status: 400, headers: CORS });

  try {
    let fetchUrl = targetUrl;

    // Extract cdntoken JWT and hdnts from cdnTokenQuery (?cdntoken=JWT&hdnts=...)
    let pathToken = cdntoken || '';
    let hdnts = '';
    if (cdnTokenQuery) {
      const cdntokMatch = cdnTokenQuery.match(/cdntoken=([^&]+)/);
      if (cdntokMatch && !pathToken) pathToken = cdntokMatch[1];
      const hdntsMatch = cdnTokenQuery.match(/hdnts=([^&]+)/);
      if (hdntsMatch) hdnts = hdntsMatch[1];
    }

    // Inject pathToken in URL path as /tok_<JWT>
    if (pathToken) {
      const u = new URL(fetchUrl);
      if (!u.pathname.includes('/tok_')) {
        u.pathname = '/tok_' + pathToken + u.pathname;
        fetchUrl = u.toString();
      }
    }

    // Append hdnts (Akamai token) as query param
    if (hdnts) {
      const sep = fetchUrl.includes('?') ? '&' : '?';
      fetchUrl += sep + 'hdnts=' + encodeURIComponent(hdnts);
    }
    const headers = {
      'Referer': 'https://web.azamtvmax.com/',
      'Origin': 'https://web.azamtvmax.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    };

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

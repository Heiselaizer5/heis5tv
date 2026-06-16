const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS' };

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const params = new URL(request.url).searchParams;
  let targetUrl = decodeURIComponent(params.get('url') || '');
  const cdnTokenQuery = params.get('cdnTokenQuery') || '';
  const authToken = params.get('auth') || '';

  if (!targetUrl && request.method === 'POST') {
    targetUrl = await request.text();
  }
  if (!targetUrl) return new Response('Missing url param', { status: 400, headers: CORS });

  try {
    let fetchUrl = targetUrl;
    let cookies = '';

    // Extract tokens from cdnTokenQuery
    let cdntok = '', hdnts = '';
    if (cdnTokenQuery) {
      const cm = cdnTokenQuery.match(/cdntoken=([^&]+)/);
      if (cm) cdntok = cm[1];
      const hm = cdnTokenQuery.match(/hdnts=([^&]+)/);
      if (hm) hdnts = hm[1];
    }

    let attempts = [];

    // Try 1: auth query param only
    if (authToken) {
      const u = fetchUrl + (fetchUrl.includes('?') ? '&' : '?') + 'auth=' + encodeURIComponent(authToken);
      const r = await fetch(u, { headers: { 'Referer': 'https://web.azamtvmax.com/', 'Origin': 'https://web.azamtvmax.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' } });
      attempts.push({ label: 'auth only', status: r.status });
      if (r.status === 200) {
        const b = await r.arrayBuffer();
        return new Response(b, { status: 200, headers: { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', ...CORS, 'Cache-Control': 'no-cache', 'X-Debug-Attempts': JSON.stringify(attempts) } });
      }
    }

    // Try 2: cdntoken query param only
    if (cdntok) {
      const u = fetchUrl + (fetchUrl.includes('?') ? '&' : '?') + 'cdntoken=' + cdntok;
      const r = await fetch(u, { headers: { 'Referer': 'https://web.azamtvmax.com/', 'Origin': 'https://web.azamtvmax.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' } });
      attempts.push({ label: 'cdntoken only', status: r.status });
      if (r.status === 200) {
        const b = await r.arrayBuffer();
        return new Response(b, { status: 200, headers: { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', ...CORS, 'Cache-Control': 'no-cache', 'X-Debug-Attempts': JSON.stringify(attempts) } });
      }
    }

    // Try 3: cdntoken query param + hdnts cookie
    if (cdntok || hdnts) {
      let u = fetchUrl;
      if (cdntok) u += (u.includes('?') ? '&' : '?') + 'cdntoken=' + cdntok;
      if (hdnts) cookies = 'hdnts=' + hdnts;
      const headers = { 'Referer': 'https://web.azamtvmax.com/', 'Origin': 'https://web.azamtvmax.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' };
      if (cookies) headers['Cookie'] = cookies;
      const r = await fetch(u, { headers });
      attempts.push({ label: 'cdntoken query + hdnts cookie', status: r.status, cookie: cookies });
      if (r.status === 200) {
        const b = await r.arrayBuffer();
        return new Response(b, { status: 200, headers: { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', ...CORS, 'Cache-Control': 'no-cache', 'X-Debug-Attempts': JSON.stringify(attempts) } });
      }
    }

    // All failed — return last attempt's body
    return new Response('All auth attempts failed: ' + JSON.stringify(attempts), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json', 'X-Debug-Attempts': JSON.stringify(attempts) } });
  } catch (e) {
    return new Response('Proxy error: ' + e.message, { status: 500, headers: CORS });
  }
}

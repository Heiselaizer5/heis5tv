const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'HEAD, GET, OPTIONS' };

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers: CORS });

  const params = new URL(request.url).searchParams;
  let targetUrl = decodeURIComponent(params.get('url') || '');
  const cdntoken = params.get('cdntoken');
  if (!targetUrl) return new Response('Missing url param', { status: 400 });

  // If cdntoken provided, prepend it to the URL path as tok_<cdntoken>/
  if (cdntoken && !targetUrl.includes('/tok_')) {
    const slashIdx = targetUrl.indexOf('/', 8);
    if (slashIdx > 0) {
      targetUrl = targetUrl.slice(0, slashIdx) + '/tok_' + cdntoken + targetUrl.slice(slashIdx);
    }
  }

  const hdrs = { 'Origin': 'https://web.azamtvmax.com', 'Referer': 'https://web.azamtvmax.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
  try {
    const res = await fetch(targetUrl, { headers: hdrs, redirect: 'manual' });
    if (!res.ok && res.status !== 200) {
      const body = await res.text();
      return new Response(body, { status: res.status, headers: { 'Content-Type': 'text/plain', ...CORS } });
    }
    const contentType = res.headers.get('content-type') || '';
    if (targetUrl.includes('.mpd') || contentType.includes('dash') || contentType.includes('xml')) {
      let mpd = await res.text();
      const cdnBase = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      const abs = (rel) => rel.startsWith('http') ? rel : cdnBase + rel;
      mpd = mpd.replace(/<BaseURL[^>]*>[^<]*<\/BaseURL>/g, '');
      mpd = mpd.replace(/(?:media|initialization)="([^"]+)"/g, (m, val) => m.replace(val, abs(val)));
      mpd = mpd.replace(/(?:media|initialization)='([^']+)'/g, (m, val) => m.replace(val, abs(val)));
      return new Response(mpd, { status: 200, headers: { 'Content-Type': 'application/dash+xml', ...CORS } });
    }
    const buf = await res.arrayBuffer();
    return new Response(buf, { status: 200, headers: { 'Content-Type': contentType || 'application/octet-stream', ...CORS, 'Cache-Control': 'no-cache' } });
  } catch (e) { return new Response('Proxy error: ' + e.message, { status: 500, headers: CORS }); }
}

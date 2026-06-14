const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'HEAD, GET, OPTIONS' };

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers: CORS });

  const url = new URL(request.url).searchParams.get('url');
  if (!url) return new Response('Missing url param', { status: 400 });
  const decoded = decodeURIComponent(url);
  const hdrs = { 'Origin': 'https://web.azamtvmax.com', 'Referer': 'https://web.azamtvmax.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
  try {
    const res = await fetch(decoded, { headers: hdrs });
    const contentType = res.headers.get('content-type') || '';
    if (decoded.includes('.mpd') || contentType.includes('dash') || contentType.includes('xml')) {
      let mpd = await res.text();
      const cdnBase = decoded.substring(0, decoded.lastIndexOf('/') + 1);
      const abs = (rel) => rel.startsWith('http') ? rel : cdnBase + rel;
      mpd = mpd.replace(/<BaseURL[^>]*>[^<]*<\/BaseURL>/g, '');
      mpd = mpd.replace(/(?:media|initialization)="([^"]+)"/g, (m, val) => m.replace(val, abs(val)));
      mpd = mpd.replace(/(?:media|initialization)='([^']+)'/g, (m, val) => m.replace(val, abs(val)));
      return new Response(mpd, { status: 200, headers: { 'Content-Type': 'application/dash+xml', ...CORS } });
    }
    const buf = await res.arrayBuffer();
    return new Response(buf, { status: 200, headers: { 'Content-Type': contentType || 'application/octet-stream', ...CORS, 'Cache-Control': 'public, max-age=3600' } });
  } catch (e) { return new Response('Proxy error: ' + e.message, { status: 500 }); }
}

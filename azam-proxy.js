const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'HEAD, GET, OPTIONS' };
const SUPABASE_PROXY_URL = 'https://yvztqzisrgqybapkdhcr.supabase.co/functions/v1/azam-proxy';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers: CORS });

  const params = new URL(request.url).searchParams;
  let targetUrl = decodeURIComponent(params.get('url') || '');
  const cdntoken = params.get('cdntoken');
  if (!targetUrl) return new Response('Missing url param', { status: 400 });

  // Try Supabase Edge Function relay first
  const proxyUrl = SUPABASE_PROXY_URL + '?url=' + encodeURIComponent(targetUrl) + (cdntoken ? '&cdntoken=' + encodeURIComponent(cdntoken) : '');

  try {
    const res = await fetch(proxyUrl, {
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      const buf = await res.arrayBuffer();
      return new Response(buf, { status: 200, headers: { 'Content-Type': contentType || 'application/octet-stream', ...CORS, 'Cache-Control': 'no-cache' } });
    }
    // Supabase relay failed — fall back to direct CDN fetch
    console.log('[Proxy] Supabase relay failed (' + res.status + '), falling back to direct');
  } catch (e) {
    console.log('[Proxy] Supabase relay error, falling back to direct:', e.message);
  }

  // ── Direct CDN fetch (fallback) ──
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

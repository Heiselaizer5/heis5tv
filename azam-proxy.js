const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'HEAD, GET, OPTIONS' };
const SUPABASE_PROXY_URL = 'https://yvztqzisrgqybapkdhcr.supabase.co/functions/v1/azam-proxy';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers: CORS });

  const params = new URL(request.url).searchParams;
  const targetUrl = decodeURIComponent(params.get('url') || '');
  const cdntoken = params.get('cdntoken');
  if (!targetUrl) return new Response('Missing url param', { status: 400 });

  const proxyUrl = SUPABASE_PROXY_URL + '?url=' + encodeURIComponent(targetUrl) + (cdntoken ? '&cdntoken=' + encodeURIComponent(cdntoken) : '');

  try {
    const res = await fetch(proxyUrl, {
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      return new Response(body, { status: res.status, headers: { 'Content-Type': 'text/plain', ...CORS } });
    }
    const contentType = res.headers.get('content-type') || '';
    const buf = await res.arrayBuffer();
    return new Response(buf, { status: 200, headers: { 'Content-Type': contentType || 'application/octet-stream', ...CORS, 'Cache-Control': 'no-cache' } });
  } catch (e) { return new Response('Proxy error: ' + e.message, { status: 500, headers: CORS }); }
}

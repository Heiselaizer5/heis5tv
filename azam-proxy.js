const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'HEAD, GET, OPTIONS' };
const RENDER_PROXY_URL = 'https://azam-render-proxy.onrender.com';

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers: CORS });

  const params = new URL(request.url).searchParams;
  const targetUrl = decodeURIComponent(params.get('url') || '');
  const cdntoken = params.get('cdntoken');
  if (!targetUrl) return new Response('Missing url param', { status: 400 });

  const proxyUrl = RENDER_PROXY_URL + '/proxy?url=' + encodeURIComponent(targetUrl) + (cdntoken ? '&cdntoken=' + encodeURIComponent(cdntoken) : '');

  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) {
      const body = await res.text();
      return new Response(body, { status: res.status, headers: { 'Content-Type': 'text/plain', ...CORS } });
    }
    const contentType = res.headers.get('content-type') || '';
    const buf = await res.arrayBuffer();
    return new Response(buf, { status: 200, headers: { 'Content-Type': contentType || 'application/octet-stream', ...CORS, 'Cache-Control': 'no-cache' } });
  } catch (e) { return new Response('Proxy error: ' + e.message, { status: 500, headers: CORS }); }
}

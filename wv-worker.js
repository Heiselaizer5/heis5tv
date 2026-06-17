const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      const url = new URL(request.url);
      const targetUrl = decodeURIComponent(url.searchParams.get('url'));
      const authXml = request.headers.get('nv-authorizations') || '';
      const body = await request.arrayBuffer();
      const resp = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'nv-authorizations': authXml,
          'Origin': 'https://web.azamtvmax.com',
          'Referer': 'https://web.azamtvmax.com/'
        },
        body
      });
      const buf = await resp.arrayBuffer();
      return new Response(buf, {
        status: resp.status,
        headers: {
          ...CORS,
          'Content-Type': resp.headers.get('content-type') || 'application/octet-stream'
        }
      });
    } catch (e) {
      return new Response(e.message, { status: 502, headers: CORS });
    }
  }
};

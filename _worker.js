// Cloudflare Worker — Azam CDN CORS proxy
// Deploy: Cloudflare Dashboard → Workers & Pages → Create Worker → Paste this → Deploy
// URL: https://azam-proxy.YOUR_SUBDOMAIN.workers.dev
// Then set AZAM_PROXY_URL in index.html to this URL and uncomment the proxy rewrite.

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response(JSON.stringify({ ok: true, message: 'Azam CDN proxy worker. Use ?url= parameter.' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const decoded = decodeURIComponent(targetUrl);
    const isSegment = decoded.includes('-init.mp4') || decoded.includes('-p=');
    const isMpd = decoded.includes('.mpd') && !isSegment;

    try {
      const response = await fetch(decoded, {
        headers: {
          'Origin': 'https://web.azamtvmax.com',
          'Referer': 'https://web.azamtvmax.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Headers', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      newHeaders.set('Access-Control-Expose-Headers', 'Content-Type, Content-Length, Content-Range');

      if (isMpd) {
        let mpd = await response.text();
        const baseUrl = decoded.substring(0, decoded.lastIndexOf('/') + 1);
        mpd = mpd.replace(/<BaseURL>.*?<\/BaseURL>/g, '');
        mpd = mpd.replace('</MPD>', `<BaseURL>${baseUrl}</BaseURL>\n</MPD>`);
        return new Response(mpd, {
          status: response.status,
          headers: newHeaders,
        });
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (e) {
      return new Response('Proxy error: ' + e.message, {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
      });
    }
  },
};

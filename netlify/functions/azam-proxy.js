exports.handler = async (event) => {
  const url = event.queryStringParameters?.url;
  if (!url) return { statusCode: 400, body: 'Missing url param' };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } };
  }
  const decoded = decodeURIComponent(url);
  const isMpd = decoded.includes('.mpd');
  try {
    const hdrs = { 'Origin': 'https://web.azamtvmax.com', 'Referer': 'https://web.azamtvmax.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
    const res = await fetch(decoded, { headers: hdrs });
    if (isMpd) {
      let mpd = await res.text();
      const proxy = `/.netlify/functions/azam-proxy?url=`;
      const base = decoded.substring(0, decoded.lastIndexOf('/') + 1);
      mpd = mpd.replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (m, o) => `<BaseURL>${proxy}${encodeURIComponent(o.startsWith('http')?o:base+o.replace(/^\//,''))}</BaseURL>`);
      mpd = mpd.replace(/(media=")([^"]+)(")/g, (m, p, s, q) => `${p}${proxy}${encodeURIComponent(s.startsWith('http')?s:base+s.replace(/^\//,''))}${q}`);
      return { statusCode: 200, headers: { 'Content-Type': 'application/dash+xml', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: mpd };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { statusCode: 200, headers: { 'Content-Type': res.headers.get('content-type')||'video/MP4', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Cache-Control': 'public, max-age=3600' }, body: buf.toString('base64'), isBase64Encoded: true };
  } catch (e) { return { statusCode: 500, body: 'Proxy error: ' + e.message }; }
};

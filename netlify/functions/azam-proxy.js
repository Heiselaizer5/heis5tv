exports.handler = async (event) => {
  const url = event.queryStringParameters?.url;
  if (!url) return { statusCode: 400, body: 'Missing url param' };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } };
  }
  const decoded = decodeURIComponent(url);
  const hdrs = { 'Origin': 'https://web.azamtvmax.com', 'Referer': 'https://web.azamtvmax.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
  try {
    const res = await fetch(decoded, { headers: hdrs });
    const contentType = res.headers.get('content-type') || '';
    if (decoded.includes('.mpd') || contentType.includes('dash') || contentType.includes('xml')) {
      let mpd = await res.text();
      const baseUrlSlash = decoded.substring(0, decoded.lastIndexOf('/') + 1);
      const baseUrl = '<BaseURL>' + baseUrlSlash + '</BaseURL>';
      if (mpd.includes('<BaseURL>')) {
        mpd = mpd.replace(/<BaseURL>[^<]*<\/BaseURL>/, baseUrl);
      } else {
        mpd = mpd.replace(/(<MPD[^>]*>)/, '$1\n  ' + baseUrl);
      }
      return { statusCode: 200, headers: { 'Content-Type': 'application/dash+xml', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: mpd };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { statusCode: 200, headers: { 'Content-Type': contentType || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Cache-Control': 'public, max-age=3600' }, body: buf.toString('base64'), isBase64Encoded: true };
  } catch (e) { return { statusCode: 500, body: 'Proxy error: ' + e.message }; }
};
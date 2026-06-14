exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }
  const licenseUrl = decodeURIComponent(event.queryStringParameters?.url || 'https://azy4sj9b.anycast.nagra.com/AZY4SJ9B/wvls/contentlicenseservice/v1/licenses');
  const authXmlToken = event.queryStringParameters?.authXmlToken || '';
  const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body || '', 'utf8');
  if (!authXmlToken) {
    console.log('[WV-PROXY] WARNING: No authXmlToken!');
  }
  try {
    const resp = await fetch(licenseUrl, {
      method: 'POST',
      headers: {
        'nv-authorizations': authXmlToken,
        'Origin': 'https://web.azamtvmax.com',
        'Referer': 'https://web.azamtvmax.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': event.headers['content-type'] || 'application/octet-stream'
      },
      body
    });
    const buf = Buffer.from(await resp.arrayBuffer());
    return {
      statusCode: resp.status,
      headers: {
        'Content-Type': resp.headers.get('content-type') || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*'
      },
      body: buf.toString('base64'),
      isBase64Encoded: true
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Widevine proxy error: ' + e.message }) };
  }
};
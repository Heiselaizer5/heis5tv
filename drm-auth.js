exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }
  try {
    const { bearer, contentDtl, subscriptionDtl, profileId } = JSON.parse(event.body || '{}');
    if (!bearer) return { statusCode: 400, body: JSON.stringify({ status: false, message: 'Missing bearer token' }) };
    const finalBearer = bearer.replace(/^Bearer\s+/i, '');
    const AZAM_DRM_AUTH_URL = 'https://api.aztv.videoready.tv/drm-auth-integration/v1/drm/authToken';
    const resp = await fetch(AZAM_DRM_AUTH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${finalBearer}`,
        'Content-Type': 'application/json',
        'tenant_identifier': 'master',
        'platform': 'WEB',
        'device_id': 'undefined',
        'languageCode': 'eng',
        'language': 'eng',
        'local': 'TZ',
        'profileId': profileId || '25222709',
        'requestCount': '0',
        'Origin': 'https://web.azamtvmax.com',
        'Referer': 'https://web.azamtvmax.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        offlineDownload: false,
        subscriptionDtl,
        contentDtl
      })
    });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text, status: false }; }
    json._debug = { statusCode: resp.status };
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
      body: JSON.stringify(json)
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ status: false, message: e.message }) };
  }
};
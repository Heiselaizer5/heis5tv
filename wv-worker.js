const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const AZAM_DRM_AUTH_URL = 'https://api.aztv.videoready.tv/drm-auth-integration/v1/drm/authToken';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Route: POST /drm-auth — proxies Azam DRM auth API
    if (url.pathname === '/drm-auth' && request.method === 'POST') {
      return handleDrmAuth(request);
    }
    if (url.pathname === '/drm-auth' && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Route: POST /azam-login — login to Azam TV with Google OAuth token
    if (url.pathname === '/azam-login' && request.method === 'POST') {
      return handleAzamLogin(request);
    }
    if (url.pathname === '/azam-login' && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Route: POST /azam-refresh — refresh bearer token using refresh_token
    if (url.pathname === '/azam-refresh' && request.method === 'POST') {
      return handleAzamRefresh(request);
    }
    if (url.pathname === '/azam-refresh' && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Route: GET /load-tok — proxies Supabase for saved tokens
    if (url.pathname === '/load-tok') {
      return handleLoadTok(request);
    }

    // Default: Widevine license proxy via ?url= param
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
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
        headers: { ...CORS, 'Content-Type': resp.headers.get('content-type') || 'application/octet-stream' }
      });
    } catch (e) {
      return new Response(e.message, { status: 502, headers: CORS });
    }
  }
};

async function handleLoadTok(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const SUPABASE_URL = 'https://yvztqzisrgqybapkdhcr.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';
    const queries = [
      '/rest/v1/stream_tokens?select=tok_url,channel_key,expires_at&order=expires_at.desc&limit=1',
      '/rest/v1/stream_tokens?select=*&order=expires_at.desc&limit=1',
      '/rest/v1/azam_config?select=*&limit=1',
      '/rest/v1/azam_config?select=value&name=eq.global_tok&limit=1',
    ];
    for (const path of queries) {
      const resp = await fetch(SUPABASE_URL + path, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
      });
      const json = await resp.json();
      if (Array.isArray(json) && json.length > 0) {
        const row = json[0];
        const tok = row.tok_url || row.tok || row.value || null;
        if (tok) return respond({ success: true, tok, source: path });
      }
    }
    return respond({ success: false, error: 'No token found in any Supabase table' });
  } catch (e) {
    return respond({ success: false, error: e.message });
  }
  function respond(body) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
}

async function handleAzamLogin(request) {
  try {
    const { socialLoginAccessToken, socialLoginType } = await request.json();
    if (!socialLoginAccessToken || !socialLoginType) {
      return new Response(JSON.stringify({ status: false, message: 'Missing socialLoginAccessToken or socialLoginType' }), { status: 400, headers: CORS });
    }
    const deviceId = crypto.randomUUID();
    const deviceDetails = {
      platform: 'WEB', operating_system: 'Windows', locale: 'en-US',
      app_version: '1.0.0', device_name: 'Windows PC', browser_version: 150,
      browser_name: 'Firefox', device_id: deviceId, device_type: 'open',
      device_platform: 'WEB', device_category: 'large',
      manufacturer: 'PC_Other', model: 'PC', sname: 'Windows PC',
      last_usage: Date.now()
    };
    const resp = await fetch('https://api.aztv.videoready.tv/login/pub/v1/social/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'device_details': JSON.stringify(deviceDetails),
        'platform': 'WEB', 'tenant_identifier': 'master',
        'language': 'eng', 'languageCode': 'eng', 'local': 'TZ',
        'profileId': '0', 'requestCount': '0',
        'Origin': 'https://web.azamtvmax.com',
        'Referer': 'https://web.azamtvmax.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ socialLoginAccessToken, socialLoginType })
    });
    const text = await resp.text();
    const json = JSON.parse(text);
    return new Response(JSON.stringify(json), {
      status: 200, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: false, message: e.message }), { status: 502, headers: CORS });
  }
}

async function handleAzamRefresh(request) {
  try {
    const { refreshToken } = await request.json();
    if (!refreshToken) {
      return new Response(JSON.stringify({ status: false, message: 'Missing refreshToken' }), { status: 400, headers: CORS });
    }
    // Try common refresh endpoint patterns
    const endpoints = [
      // Try same login endpoint but with refresh_token as socialLoginAccessToken
      { url: 'https://api.aztv.videoready.tv/login/pub/v1/social/login', body: { socialLoginAccessToken: refreshToken, socialLoginType: 'REFRESH_TOKEN' } },
      { url: 'https://api.aztv.videoready.tv/login/pub/v1/token/refresh', body: { refreshToken } },
      { url: 'https://api.aztv.videoready.tv/login/pub/v1/refresh-token', body: { refreshToken } },
      { url: 'https://api.aztv.videoready.tv/login/pub/v1/refresh', body: { refreshToken } },
    ];
    for (const ep of endpoints) {
      const resp = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://web.azamtvmax.com',
          'Referer': 'https://web.azamtvmax.com/'
        },
        body: JSON.stringify(ep.body)
      }).catch(() => null);
      if (resp && resp.ok) {
        const text = await resp.text();
        const json = JSON.parse(text);
        return new Response(JSON.stringify({ status: true, data: json, endpoint: ep.url }), {
          status: 200, headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
    }
    return new Response(JSON.stringify({ status: false, message: 'No refresh endpoint matched' }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (e) {
    return new Response(JSON.stringify({ status: false, message: e.message }), { status: 502, headers: CORS });
  }
}

async function handleDrmAuth(request) {
  try {
    const { bearer, contentDtl, subscriptionDtl, profileId } = await request.json();
    if (!bearer) {
      return new Response(JSON.stringify({ status: false, message: 'Missing bearer token' }), { status: 400, headers: CORS });
    }
    const finalBearer = bearer.replace(/^Bearer\s+/i, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(AZAM_DRM_AUTH_URL, {
      signal: controller.signal,
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
    clearTimeout(timeout);
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200), status: false }; }
    json._debug = { statusCode: resp.status, ts: Date.now() };
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Azam DRM API timed out (10s)' : e.message;
    return new Response(JSON.stringify({ status: false, message: msg }), { status: 502, headers: CORS });
  }
}
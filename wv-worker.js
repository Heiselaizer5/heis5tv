const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const AZAM_DRM_AUTH_URL = 'https://api.aztv.videoready.tv/drm-auth-integration/v1/drm/authToken';
const AZAM_SESSION_URL = 'https://api.aztv.videoready.tv/stream-concurrency/v1/session/initialize';
const PERSISTENT_DEVICE_ID = '8b303c13-d7a3-4b39-9579-a89ac703765c';
function azamHeaders(bearer) {
  return {
    'Authorization': `Bearer ${bearer.replace(/^Bearer\s+/i, '')}`,
    'Content-Type': 'application/json',
    'tenant_identifier': 'master', 'platform': 'WEB',
    'device_id': PERSISTENT_DEVICE_ID,
    'languageCode': 'eng', 'language': 'eng', 'local': 'TZ',
    'profileId': '25222709', 'requestCount': '0',
    'Origin': 'https://web.azamtvmax.com',
    'Referer': 'https://web.azamtvmax.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };
}
async function callAzamRefresh(refreshToken, currentBearer) {
  try {
    const deviceDetails = {
      platform: 'WEB', operating_system: 'Windows', locale: 'en-US',
      app_version: '1.0.0', device_name: 'Windows PC', browser_version: 150,
      browser_name: 'Firefox', device_id: PERSISTENT_DEVICE_ID, device_type: 'open',
      device_platform: 'WEB', device_category: 'large',
      manufacturer: 'PC_Other', model: 'PC', sname: 'Windows PC',
      last_usage: Date.now()
    };
    const finalBearer = (currentBearer || '').replace(/^Bearer\s+/i, '');
    const resp = await fetch('https://api.aztv.videoready.tv/login/auth/v1/pub/refresh-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + finalBearer,
        'device_details': JSON.stringify(deviceDetails),
        'platform': 'WEB', 'tenant_identifier': 'master',
        'language': 'eng', 'languageCode': 'eng', 'local': 'TZ',
        'profileId': '0', 'requestCount': '0',
        'Origin': 'https://web.azamtvmax.com',
        'Referer': 'https://web.azamtvmax.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ refreshToken })
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { return null; }
    const data = json.data || json;
    const newBearer = data.accessToken || data.jwt_token || data.access_token || null;
    if (!newBearer) return null;
    return {
      bearer: newBearer,
      refreshToken: data.refreshToken || data.refresh_token || null,
      contentDtl: data.contentDtl || data.encryptedData || null,
      subscriptionDtl: data.subscriberDtl || data.subscriptionDtl || null
    };
  } catch (_) { return null; }
}
async function tryAllFallbacks(finalBearer, contentDtl) {
  const fallbackBodies = [
    // Strategy 1: session/initialize → session token → use as both
    async () => {
      const sessResp = await fetch(AZAM_SESSION_URL, {
        method: 'POST', headers: azamHeaders(finalBearer),
        body: JSON.stringify({ contentDtl: '', subscriberDtl: '', deviceId: PERSISTENT_DEVICE_ID })
      });
      const sessText = await sessResp.text();
      for (const part of sessText.split('\n')) {
        try {
          const obj = JSON.parse(part.trim());
          if (obj?.data?.token) return obj.data.token;
        } catch (_) {}
      }
      return null;
    },
    // Strategy 2: contentDtl as subscriptionDtl
    async () => {
      if (!contentDtl) return null;
      return { contentDtl, subscriptionDtl: contentDtl };
    },
    // Strategy 3: bearer JWT as both
    async () => {
      return { contentDtl: finalBearer, subscriptionDtl: finalBearer };
    }
  ];
  for (const strat of fallbackBodies) {
    try {
      const result = await strat();
      if (!result) continue;
      let sub, ctl;
      if (typeof result === 'string') {
        sub = ctl = result;
      } else {
        ctl = result.contentDtl;
        sub = result.subscriptionDtl;
      }
      const drmResp = await fetch(AZAM_DRM_AUTH_URL, {
        method: 'POST', headers: azamHeaders(finalBearer),
        body: JSON.stringify({ offlineDownload: false, subscriptionDtl: sub, contentDtl: ctl })
      });
      if (drmResp.status === 200) {
        const drmJson = await drmResp.json();
        if (drmJson?.data?.authXmlToken) return drmJson.data.authXmlToken;
      }
    } catch (_) {}
  }
  return null;
}

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

    // Route: POST /azam-content — refresh content_dtl/subscription_dtl from Azam API
    if (url.pathname === '/azam-content' && request.method === 'POST') {
      return handleAzamContent(request);
    }
    if (url.pathname === '/azam-content' && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Route: POST /azam-channel-content — get fresh contentDtl for a channel via content-detail-service
    if (url.pathname === '/azam-channel-content' && request.method === 'POST') {
      return handleAzamChannelContent(request);
    }
    if (url.pathname === '/azam-channel-content' && request.method === 'OPTIONS') {
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
      let authXml = request.headers.get('nv-authorizations') || '';
      // Internal token refresh: worker gets fresh authXmlToken from DRM API
      let bearer = request.headers.get('x-bearer');
      let contentDtl = request.headers.get('x-content-dtl');
      let subscriptionDtl = request.headers.get('x-subscription-dtl');
      const refreshToken = request.headers.get('x-refresh-token');
      if (bearer) {
        try {
          // Phase 0: If refreshToken provided, refresh bearer + contentDtl/subscriptionDtl first
          if (refreshToken) {
            try {
              const refResult = await callAzamRefresh(refreshToken, bearer);
              if (refResult) {
                bearer = refResult.bearer;
                if (refResult.contentDtl) contentDtl = refResult.contentDtl;
                if (refResult.subscriptionDtl) subscriptionDtl = refResult.subscriptionDtl;
              }
            } catch (_) {}
          }
          const finalBearer = bearer.replace(/^Bearer\s+/i, '');
          // Phase 1: Try session/initialize first → gets fresh contentDtl + subscriberDtl from session
          const sessResp = await fetch(AZAM_SESSION_URL, {
            method: 'POST',
            headers: azamHeaders(finalBearer),
            body: JSON.stringify({ contentDtl: contentDtl || '', subscriberDtl: subscriptionDtl || '', deviceId: PERSISTENT_DEVICE_ID })
          });
          let freshContentDtl = null, freshSubDtl = null;
          const sessText = await sessResp.text();
          for (const part of sessText.split('\n')) {
            try {
              const obj = JSON.parse(part.trim());
              const d = obj.data || obj;
              if (d.contentDtl) freshContentDtl = d.contentDtl;
              if (d.subscriberDtl || d.subscriptionDtl) freshSubDtl = d.subscriberDtl || d.subscriptionDtl;
            } catch (_) {}
          }
          const useContentDtl = freshContentDtl || contentDtl || '';
          const useSubDtl = freshSubDtl || subscriptionDtl || '';
          // Phase 2: Call DRM auth with fresh (or original) tokens
          const drmResp = await fetch(AZAM_DRM_AUTH_URL, {
            method: 'POST',
            headers: azamHeaders(finalBearer),
            body: JSON.stringify({ offlineDownload: false, subscriptionDtl: useSubDtl, contentDtl: useContentDtl })
          });
          if (drmResp.status === 200) {
            const drmJson = await drmResp.json();
            if (drmJson.data?.authXmlToken) {
              authXml = drmJson.data.authXmlToken;
            }
          } else {
            // Phase 3: Fallbacks
            const fallbackXml = await tryAllFallbacks(finalBearer, contentDtl);
            if (fallbackXml) authXml = fallbackXml;
          }
        } catch (_) {}
      }
      const body = await request.arrayBuffer();
      const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
      const resp = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'nv-authorizations': authXml,
          'Content-Type': contentType,
          'Origin': 'https://web.azamtvmax.com',
          'Referer': 'https://web.azamtvmax.com/'
        },
        body
      });
      const buf = await resp.arrayBuffer();
      const respHeaders = { ...CORS, 'Content-Type': resp.headers.get('content-type') || 'application/octet-stream' };
      if (resp.status !== 200) {
        const bodyPreview = new TextDecoder().decode(buf.slice(0, 300));
        respHeaders['X-Nagra-Status'] = String(resp.status);
        respHeaders['X-Nagra-Body'] = bodyPreview.replace(/["\n\r]/g, ' ').slice(0, 250);
      }
      return new Response(buf, { status: resp.status, headers: respHeaders });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } });
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
    const { socialLoginAccessToken, socialLoginType, deviceId } = await request.json();
    if (!socialLoginAccessToken || !socialLoginType) {
      return new Response(JSON.stringify({ status: false, message: 'Missing socialLoginAccessToken or socialLoginType' }), { status: 400, headers: CORS });
    }
    const finalDeviceId = deviceId || crypto.randomUUID();
    const deviceDetails = {
      platform: 'WEB', operating_system: 'Windows', locale: 'en-US',
      app_version: '1.0.0', device_name: 'Windows PC', browser_version: 150,
      browser_name: 'Firefox', device_id: finalDeviceId, device_type: 'open',
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
    const { refreshToken, currentBearer } = await request.json();
    if (!refreshToken) {
      return new Response(JSON.stringify({ status: false, message: 'Missing refreshToken' }), { status: 400, headers: CORS });
    }
    const deviceDetails = {
      platform: 'WEB', operating_system: 'Windows', locale: 'en-US',
      app_version: '1.0.0', device_name: 'Windows PC', browser_version: 150,
      browser_name: 'Firefox', device_id: PERSISTENT_DEVICE_ID, device_type: 'open',
      device_platform: 'WEB', device_category: 'large',
      manufacturer: 'PC_Other', model: 'PC', sname: 'Windows PC',
      last_usage: Date.now()
    };
    const finalBearer = (currentBearer || '').replace(/^Bearer\s+/i, '');
    const resp = await fetch('https://api.aztv.videoready.tv/login/auth/v1/pub/refresh-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + finalBearer,
        'device_details': JSON.stringify(deviceDetails),
        'platform': 'WEB', 'tenant_identifier': 'master',
        'language': 'eng', 'languageCode': 'eng', 'local': 'TZ',
        'profileId': '0', 'requestCount': '0',
        'Origin': 'https://web.azamtvmax.com',
        'Referer': 'https://web.azamtvmax.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ refreshToken })
    });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
    // Extract contentDtl/subscriberDtl if present in refresh response
    const data = json.data || json;
    const freshContentDtl = data.contentDtl || data.encryptedData || null;
    const freshSubDtl = data.subscriberDtl || data.subscriptionDtl || null;
    const payload = {
      status: json.status !== false,
      data: {
        accessToken: data.accessToken || data.jwt_token || data.access_token || null,
        refreshToken: data.refreshToken || data.refresh_token || null,
        ...(freshContentDtl ? { contentDtl: freshContentDtl } : {}),
        ...(freshSubDtl ? { subscriptionDtl: freshSubDtl } : {})
      }
    };
    return new Response(JSON.stringify(payload), {
      status: 200, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: false, message: e.message }), { status: 502, headers: CORS });
  }
}

function channelKeyToDisplayName(key) {
  // AzamSport2 → Azam Sport 2, SinemaZetu → Sinema Zetu
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
}
function channelKeyToSlug(key) {
  // AzamSport2 → azam-sport-2
  return channelKeyToDisplayName(key).toLowerCase().replace(/\s+/g, '-');
}
async function tryFetchCds(bearer, channelName) {
  const names = [channelName, channelKeyToDisplayName(channelName), channelKeyToSlug(channelName)];
  const versions = [2, 1];
  const suffixes = ['', '?include=encryptedData', '?fields=encryptedData'];
  const profileIds = ['1', '2', '25222709'];
  for (const ver of versions) {
    for (const name of names) {
      for (const suffix of suffixes) {
        for (const pid of profileIds) {
          const url = `https://api.aztv.videoready.tv/content-detail-service/pub/v${ver}/channel/${encodeURIComponent(name)}${suffix}`;
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const resp = await fetch(url, {
              signal: controller.signal,
              headers: {
                'Authorization': 'Bearer ' + bearer,
                'tenant_identifier': 'master', 'platform': 'WEB',
                'languageCode': 'eng', 'language': 'eng', 'local': 'TZ',
                'profileId': pid, 'requestCount': '0',
                'Origin': 'https://web.azamtvmax.com',
                'Referer': 'https://web.azamtvmax.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            clearTimeout(timeout);
            const text = await resp.text();
            let json;
            try { json = JSON.parse(text); } catch { continue; }
            const data = json.data || json;
            const encryptedData = data.encryptedData || data.encrypted_data || data.contentDtl || null;
            if (encryptedData) return encryptedData;
          } catch (_) {}
        }
      }
    }
  }
  return null;
}
async function handleAzamChannelContent(request) {
  const azamDrmHeaders = (bearer, pid) => ({
    'Authorization': 'Bearer ' + bearer,
    'Content-Type': 'application/json',
    'tenant_identifier': 'master', 'platform': 'WEB',
    'device_id': 'undefined',
    'languageCode': 'eng', 'language': 'eng', 'local': 'TZ',
    'profileId': pid || '25222709', 'requestCount': '0',
    'Origin': 'https://web.azamtvmax.com',
    'Referer': 'https://web.azamtvmax.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  try {
    const { bearer, channelName } = await request.json();
    if (!bearer || !channelName) {
      return new Response(JSON.stringify({ status: false, message: 'Missing bearer or channelName' }), { status: 400, headers: CORS });
    }
    const finalBearer = bearer.replace(/^Bearer\s+/i, '');
    // Try content-detail-service first
    let encryptedData = await tryFetchCds(finalBearer, channelName);
    if (encryptedData) {
      return new Response(JSON.stringify({ status: true, data: { contentDtl: encryptedData } }), { status: 200, headers: CORS });
    }
    // Fallback: call session/initialize → get session token → call DRM auth with session token as both
    try {
      const deviceId = '8b303c13-d7a3-4b39-9579-a89ac703765c';
      const sessResp = await fetch('https://api.aztv.videoready.tv/stream-concurrency/v1/session/initialize', {
        method: 'POST',
        headers: { ...azamDrmHeaders(finalBearer), 'device_id': deviceId },
        body: JSON.stringify({ contentDtl: '', subscriberDtl: '', deviceId })
      });
      const sessText = await sessResp.text();
      let sessionToken = null;
      for (const part of sessText.split('\n')) {
        try {
          const obj = JSON.parse(part.trim());
          if (obj?.data?.token) sessionToken = obj.data.token;
        } catch (_) {}
      }
      if (sessionToken) {
        // Try DRM auth with session token as both contentDtl and subscriptionDtl
        const drmResp = await fetch(AZAM_DRM_AUTH_URL, {
          method: 'POST',
          headers: azamDrmHeaders(finalBearer),
          body: JSON.stringify({ offlineDownload: false, subscriptionDtl: sessionToken, contentDtl: sessionToken })
        });
        const drmJson = await drmResp.json();
        if (drmJson?.data?.authXmlToken) {
          const freshCtl = drmJson.data.contentDtl || drmJson.data.encryptedData || null;
          const freshSub = drmJson.data.subscriptionDtl || drmJson.data.subscriberDtl || null;
          if (freshCtl) {
            return new Response(JSON.stringify({ status: true, data: { contentDtl: freshCtl, authXmlToken: drmJson.data.authXmlToken, subscriptionDtl: freshSub } }), { status: 200, headers: CORS });
          }
        }
      }
    } catch (_) {}
    return new Response(JSON.stringify({ status: false, message: 'No encryptedData found' }), { status: 200, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ status: false, message: e.message }), { status: 502, headers: CORS });
  }
}

async function handleAzamContent(request) {
  try {
    const { bearer, contentDtl, subscriptionDtl } = await request.json();
    if (!bearer) {
      return new Response(JSON.stringify({ status: false, message: 'Missing bearer' }), { status: 400, headers: CORS });
    }
    const finalBearer = bearer.replace(/^Bearer\s+/i, '');
    const resp = await fetch(AZAM_SESSION_URL, {
      method: 'POST',
      headers: azamHeaders(finalBearer),
      body: JSON.stringify({ contentDtl: contentDtl || '', subscriberDtl: subscriptionDtl || '', deviceId: PERSISTENT_DEVICE_ID })
    });
    const text = await resp.text();
    let freshContentDtl = null, freshSubscriberDtl = null;
    for (const part of text.split('\n')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        const data = obj.data || obj;
        if (data.contentDtl) freshContentDtl = data.contentDtl;
        if (data.subscriberDtl) freshSubscriberDtl = data.subscriberDtl;
      } catch (_) {}
    }
    if (freshContentDtl && freshSubscriberDtl) {
      return new Response(JSON.stringify({ status: true, data: { contentDtl: freshContentDtl, subscriptionDtl: freshSubscriberDtl } }), { status: 200, headers: CORS });
    }
    return new Response(JSON.stringify({ status: false, message: 'Could not extract contentDtl/subscriberDtl', raw: text.slice(0, 500) }), { status: 200, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ status: false, message: e.message }), { status: 502, headers: CORS });
  }
}

async function handleDrmAuth(request) {
  try {
    let { bearer, contentDtl, subscriptionDtl, refreshToken } = await request.json();
    if (!bearer) {
      return new Response(JSON.stringify({ status: false, message: 'Missing bearer token' }), { status: 400, headers: CORS });
    }
    // Phase 0: If refreshToken provided, refresh bearer + contentDtl/subscriptionDtl first
    if (refreshToken) {
      try {
        const refResult = await callAzamRefresh(refreshToken, bearer);
        if (refResult) {
          bearer = refResult.bearer;
          if (refResult.contentDtl) contentDtl = refResult.contentDtl;
          if (refResult.subscriptionDtl) subscriptionDtl = refResult.subscriptionDtl;
        }
      } catch (_) {}
    }
    const finalBearer = bearer.replace(/^Bearer\s+/i, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    // Phase 1: Try session/initialize first for fresh contentDtl + subscriberDtl
    let freshContentDtl = null, freshSubDtl = null;
    try {
      const sessResp = await fetch(AZAM_SESSION_URL, {
        signal: controller.signal,
        method: 'POST',
        headers: azamHeaders(finalBearer),
        body: JSON.stringify({ contentDtl: contentDtl || '', subscriberDtl: subscriptionDtl || '', deviceId: PERSISTENT_DEVICE_ID })
      });
      const sessText = await sessResp.text();
      for (const part of sessText.split('\n')) {
        try {
          const obj = JSON.parse(part.trim());
          const d = obj.data || obj;
          if (d.contentDtl) freshContentDtl = d.contentDtl;
          if (d.subscriberDtl || d.subscriptionDtl) freshSubDtl = d.subscriberDtl || d.subscriptionDtl;
        } catch (_) {}
      }
    } catch (_) {}
    const useContentDtl = freshContentDtl || contentDtl || '';
    const useSubDtl = freshSubDtl || subscriptionDtl || '';
    let resp = await fetch(AZAM_DRM_AUTH_URL, {
      signal: controller.signal,
      method: 'POST',
      headers: azamHeaders(finalBearer),
      body: JSON.stringify({ offlineDownload: false, subscriptionDtl: useSubDtl, contentDtl: useContentDtl })
    });
    let text = '';
    if (resp.status === 200) {
      text = await resp.text();
    } else {
      // Phase 3: Fallback — session token as both contentDtl and subscriptionDtl
      text = await resp.text();
      let fallbackXml = null;
      try {
        const fallbackResp = await tryAllFallbacks(finalBearer, useContentDtl);
        if (fallbackResp) fallbackXml = fallbackResp;
      } catch (_) {}
      if (fallbackXml) {
        const fallbackJson = { status: true, data: { authXmlToken: fallbackXml }, _debug: { statusCode: 200, ts: Date.now(), retry: 'session-fallback' } };
        clearTimeout(timeout);
        return new Response(JSON.stringify(fallbackJson), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }
    clearTimeout(timeout);
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
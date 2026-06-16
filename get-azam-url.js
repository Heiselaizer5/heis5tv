const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const SUPABASE_URL = 'https://yvztqzisrgqybapkdhcr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    let bearer, contentDtl, subscriptionDtl, channelName;
    if (request.method === 'GET') {
      const url = new URL(request.url);
      bearer = url.searchParams.get('bearer');
      channelName = url.searchParams.get('channel');
      const cd = url.searchParams.get('contentDtl');
      if (cd) { try { contentDtl = JSON.parse(cd); } catch { contentDtl = cd; } }
      const sd = url.searchParams.get('subscriptionDtl');
      if (sd) { try { subscriptionDtl = JSON.parse(sd); } catch { subscriptionDtl = sd; } }
    } else {
      const body = await request.json();
      bearer = body.bearer;
      contentDtl = body.contentDtl;
      subscriptionDtl = body.subscriptionDtl;
      channelName = body.channelName;
    }
    if (!bearer) return new Response(JSON.stringify({ success: false, error: 'Missing bearer' }), { status: 400, headers: CORS });
    const finalBearer = bearer.replace(/^Bearer\s+/i, '');

    let cdnBase = null;
    let cdntoken = null;
    let authXmlToken = null;
    let expiresAt = null;
    let cdnTokenQuery = null;

    let debugDrmResp = null;
    // --- Strategy 1: Call Azam DRM Auth API ---
    const AZAM_DRM_AUTH = 'https://api.aztv.videoready.tv/drm-auth-integration/v1/drm/authToken';
    try {
      const drmResp = await fetch(AZAM_DRM_AUTH, {
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
          'profileId': '25222709',
          'requestCount': '0',
          'Origin': 'https://web.azamtvmax.com',
          'Referer': 'https://web.azamtvmax.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ offlineDownload: false, subscriptionDtl, contentDtl })
      });
      const drmText = await drmResp.text();
      let drmJson;
      try { drmJson = JSON.parse(drmText); } catch { drmJson = null; }
      if (drmJson?.data?.authXmlToken) authXmlToken = drmJson.data.authXmlToken;
      // Use cdnToken (query string format) from DRM API
      if (drmJson?.data?.cdnToken) {
        cdnTokenQuery = drmJson.data.cdnToken.startsWith('?') ? drmJson.data.cdnToken : '?' + drmJson.data.cdnToken;
      }
      const rawTok = drmJson?.data?.tok_prefix || drmJson?.data?.cdn_url || null;
      if (rawTok) parseTokPrefix(rawTok, (base, token, exp) => { cdnBase = base; cdntoken = token; expiresAt = exp; });
      if (!cdnBase && drmJson?.data?.cdns && Array.isArray(drmJson.data.cdns) && drmJson.data.cdns.length > 0) {
        for (const c of drmJson.data.cdns) {
          parseTokPrefix(c, (base, token, exp) => { cdnBase = base; cdntoken = token; if (exp) expiresAt = exp; });
          if (cdnBase) break;
        }
      }
      debugDrmResp = { status: drmResp.status, body: drmText.substring(0, 2000) };
    } catch (e) { console.warn('DRM auth failed:', e.message); debugDrmResp = { error: e.message }; }

    // --- Strategy 2: Try Supabase as fallback ---
    if (!cdnBase) {
      try {
        const queries = [
          '/rest/v1/stream_tokens?select=tok_url,channel_key,expires_at&order=expires_at.desc&limit=1',
          '/rest/v1/stream_tokens?select=*&order=expires_at.desc&limit=1',
          '/rest/v1/azam_config?select=*&limit=1',
          '/rest/v1/azam_config?select=value&name=eq.global_tok&limit=1',
        ];
        for (const path of queries) {
          const supResp = await fetch(SUPABASE_URL + path, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
          });
          const supJson = await supResp.json();
          if (Array.isArray(supJson) && supJson.length > 0) {
            const row = supJson[0];
            const raw = row.tok_url || row.tok || row.value || null;
            if (raw) parseTokPrefix(raw, (base, token, exp) => { cdnBase = base; cdntoken = token; if (exp) expiresAt = exp; });
            if (cdnBase) break;
            // Try raw as full prefix
            const m = String(raw).match(/^https?:\/\/[^/]+\/tok_[A-Za-z0-9_.=-]+/);
            if (m) parseTokPrefix(m[0], (base, token, exp) => { cdnBase = base; cdntoken = token; if (exp) expiresAt = exp; });
            if (cdnBase) break;
          }
        }
      } catch (e) { console.warn('Supabase fallback failed:', e.message); }
    }

    // --- Extract expiry from cdntoken JWT if not already set ---
    if (!expiresAt && cdntoken) {
      try {
        const parts = cdntoken.split('.');
        if (parts.length >= 2) {
          let p = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (p.length % 4) p += '=';
          const payload = JSON.parse(atob(p));
          if (payload.exp) expiresAt = parseInt(payload.exp);
        }
      } catch {}
    }

    // --- Build responses ---
    let mpdPath = null;
    if (channelName) mpdPath = '/live/eds/' + channelName + '/DASH/' + channelName + '.mpd';
    const mpdUrl = (cdnBase && mpdPath) ? cdnBase + mpdPath : null;

    return new Response(JSON.stringify({
      success: !!(authXmlToken && cdnBase && (cdntoken || cdnTokenQuery)),
      cdnBase,
      cdntoken,
      cdnTokenQuery,
      authXmlToken,
      expiresAt,
      mpdPath,
      mpdUrl,
      _debug: debugDrmResp
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 502, headers: CORS });
  }
}

function parseTokPrefix(raw, cb) {
  if (!raw) return;
  const s = String(raw);
  const m = s.match(/^(https?:\/\/[^/]+)\/tok_([A-Za-z0-9_.=-]+)/);
  if (!m) return;
  const base = m[1];
  const token = m[2];
  let exp = null;
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      let p = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      const payload = JSON.parse(atob(p));
      if (payload.exp) exp = parseInt(payload.exp);
    }
  } catch {}
  cb(base, token, exp);
}

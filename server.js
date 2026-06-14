const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());

let storedTok = '';
let storedContentDtl = '';
let storedSubscriptionDtl = '';
let storedBearer = '';
let storedProfileId = '25222709';

const SUPABASE_URL = 'https://yvztqzisrgqybapkdhcr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';
const WIDEVINE_LICENSE_URL = 'https://azy4sj9b.anycast.nagra.com/AZY4SJ9B/wvls/contentlicenseservice/v1/licenses';
const AZAM_DRM_AUTH_URL = 'https://api.aztv.videoready.tv/drm-auth-integration/v1/drm/authToken';

function sbFetch(path, options = {}) {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Accept': 'application/json'
  };
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(SUPABASE_URL + path, { ...options, headers: { ...headers, ...options.headers } });
}

app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing url param' });

  const decoded = decodeURIComponent(url);
  const isSegment = decoded.includes('-init.mp4') || decoded.includes('-p=');
  const isMpd = decoded.includes('.mpd') && !isSegment;

  try {
    const response = await fetch(decoded, {
      headers: {
        'Origin': 'https://web.azamtvmax.com',
        'Referer': 'https://web.azamtvmax.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (isMpd) {
      let mpd = await response.text();
      console.log('[PROXY] MPD fetched, size:', mpd.length);
      console.log('[PROXY] MPD first 800 chars:', mpd.substring(0, 800));

      const baseUrl = decoded.substring(0, decoded.lastIndexOf('/') + 1);
      mpd = mpd.replace(/<BaseURL>.*?<\/BaseURL>/g, '');
      mpd = mpd.replace('</MPD>', `<BaseURL>${baseUrl}</BaseURL>\n</MPD>`);

      const authTokenParam = req.query.auth || '';
      console.log('[PROXY] authXmlToken provided:', !!authTokenParam);

      // Log original ContentProtection elements for debugging
      const origCp = mpd.match(/<ContentProtection[\s\S]*?<\/ContentProtection>/gi);
      console.log('[PROXY] Original ContentProtection count:', origCp ? origCp.length : 0);

      // DO NOT rewrite any URLs or strip any DRM — Shaka gets drm.servers from the init config
      // Just pass the MPD through with only BaseURL rewritten

      res.set('Content-Type', 'application/dash+xml');
      res.set('Access-Control-Allow-Origin', '*');
      return res.send(mpd);
    }

    if (decoded.includes('.m3u8')) {
      let m3u8 = await response.text();
      const baseUrl = decoded.substring(0, decoded.lastIndexOf('/') + 1);
      const lines = m3u8.split('\n').map(line => {
        const t = line.trim();
        if (t && !t.startsWith('#') && !t.startsWith('http')) {
          return `/proxy?url=${encodeURIComponent(baseUrl + t)}`;
        }
        return line;
      }).join('\n');
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.set('Access-Control-Allow-Origin', '*');
      return res.send(lines);
    }

    const buf = await response.buffer();
    res.set('Content-Type', response.headers.get('content-type') || 'video/MP4');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: 'Proxy error: ' + e.message });
  }
});

app.get('/tok', (req, res) => {
  res.json({ tok: storedTok || null, exp: null, message: 'Token from server memory' });
});

app.post('/set-tok', express.json(), (req, res) => {
  const { tok } = req.body;
  if (!tok) return res.status(400).json({ success: false, error: 'Missing tok' });
  storedTok = tok;
  res.json({ success: true, exp: null });
});

app.post('/set-content-dtl', express.json(), (req, res) => {
  const { contentDtl, subscriptionDtl, bearer, profileId } = req.body;
  if (contentDtl) storedContentDtl = contentDtl;
  if (subscriptionDtl) storedSubscriptionDtl = subscriptionDtl;
  if (bearer) storedBearer = bearer.replace(/^Bearer\s+/i, '');
  if (profileId) storedProfileId = profileId;
  res.json({ success: true });
});

app.get('/load-tok-from-supabase', async (req, res) => {
  try {
    const resp = await sbFetch('/rest/v1/azam_config?select=*&limit=1');
    const data = await resp.json();
    if (data && data.length > 0 && data[0].tok) {
      storedTok = data[0].tok;
      res.json({ success: true, tok: data[0].tok });
    } else {
      res.json({ success: false, error: 'No token found in Supabase' });
    }
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.post('/drm-auth', express.json(), async (req, res) => {
  const { bearer, contentDtl, subscriptionDtl, profileId } = req.body;
  let finalBearer = (bearer || storedBearer || '').replace(/^Bearer\s+/i, '');
  const finalContentDtl = contentDtl || storedContentDtl;
  const finalSubscriptionDtl = subscriptionDtl || storedSubscriptionDtl;
  const finalProfileId = profileId || storedProfileId;

  if (!finalBearer) {
    return res.status(400).json({ status: false, message: 'Missing bearer token' });
  }
  if (!finalContentDtl || !finalSubscriptionDtl) {
    return res.status(400).json({ status: false, message: 'Missing contentDtl or subscriptionDtl' });
  }

  try {
    const bodyStr = JSON.stringify({
      offlineDownload: false,
      subscriptionDtl: finalSubscriptionDtl,
      contentDtl: finalContentDtl
    });
    console.log('[DRM-AUTH] Sending to Azam:');
    console.log('  URL:', AZAM_DRM_AUTH_URL);
    console.log('  Bearer (first 50):', finalBearer.substring(0, 50) + '...');
    console.log('  Body:', bodyStr.substring(0, 200) + '...');
    console.log('  Headers profileId:', finalProfileId, 'device_id: undefined');

    const azamResp = await fetch(AZAM_DRM_AUTH_URL, {
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
        'profileId': finalProfileId,
        'requestCount': '0',
        'Origin': 'https://web.azamtvmax.com',
        'Referer': 'https://web.azamtvmax.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: bodyStr
    });

    const status = azamResp.status;
    const text = await azamResp.text();
    console.log('[DRM-AUTH] Response status:', status);
    console.log('[DRM-AUTH] Response body:', text.substring(0, 500));
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text, status: false }; }
    json._debug = { statusCode: status, sentBearerPrefix: finalBearer.substring(0, 20) + '...' };
    res.json(json);
  } catch (e) {
    res.status(502).json({ status: false, message: e.message });
  }
});

app.post('/wv-proxy', async (req, res) => {
  const licenseUrl = decodeURIComponent(req.query.url || WIDEVINE_LICENSE_URL);
  const authXmlToken = req.headers['nv-authorizations'] || req.query.authXmlToken || '';

  // Read raw body from stream (no body-parser middleware before this route)
  const rawBody = await new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  const bodyType = req.headers['content-type'] || 'none';
  const bodySize = rawBody.length;
  const allHeaders = JSON.stringify(req.headers);

  console.log('[WV-PROXY] === REQUEST ===');
  console.log('[WV-PROXY] URL:', licenseUrl.substring(0, 120));
  console.log('[WV-PROXY] Content-Type:', bodyType);
  console.log('[WV-PROXY] Content-Length:', req.headers['content-length']);
  console.log('[WV-PROXY] All headers:', allHeaders.substring(0, 500));
  console.log('[WV-PROXY] Body size:', bodySize);
  console.log('[WV-PROXY] Body first 40 hex:', rawBody.slice(0, Math.min(40, bodySize)).toString('hex'));
  console.log('[WV-PROXY] Body first 200 utf8:', rawBody.slice(0, Math.min(200, bodySize)).toString('utf8'));
  console.log('[WV-PROXY] authXmlToken present:', !!authXmlToken);

  if (!authXmlToken) {
    console.log('[WV-PROXY] WARNING: No authXmlToken!');
  }

  if (bodySize <= 2) {
    console.log('[WV-PROXY] ERROR: Body too small! This is likely wrong.');
  }

  try {
    const fetchOpts = {
      method: 'POST',
      headers: {
        'nv-authorizations': authXmlToken,
        'Origin': 'https://web.azamtvmax.com',
        'Referer': 'https://web.azamtvmax.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': bodyType && bodyType !== 'none' ? bodyType : 'application/octet-stream'
      },
      body: rawBody
    };

    const licenseResp = await fetch(licenseUrl, fetchOpts);
    console.log('[WV-PROXY] Nagra status:', licenseResp.status);

    const buf = await licenseResp.buffer();
    console.log('[WV-PROXY] Nagra response size:', buf.length);

    const nagraContentType = licenseResp.headers.get('content-type') || 'application/octet-stream';
    const nagraText = buf.toString('utf8');
    if (nagraText.includes('"code"') || nagraText.includes('Invalid request')) {
      console.log('[WV-PROXY] Nagra returned JSON error:', nagraText);
    } else {
      console.log('[WV-PROXY] Nagra returned binary, size:', buf.length);
    }

    res.set('Content-Type', nagraContentType);
    res.set('Access-Control-Allow-Origin', '*');
    res.send(buf);
  } catch (e) {
    console.log('[WV-PROXY] Error:', e.message);
    res.status(502).json({ error: 'Widevine proxy error: ' + e.message });
  }
});

// Extract Widevine PSSH from a channel MPD
app.get('/pssh', async (req, res) => {
  const mpdUrl = req.query.url;
  if (!mpdUrl) return res.status(400).json({ error: 'Missing url param' });

  try {
    const decoded = decodeURIComponent(mpdUrl);
    const resp = await fetch(decoded, {
      headers: {
        'Origin': 'https://web.azamtvmax.com',
        'Referer': 'https://web.azamtvmax.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const mpd = await resp.text();
    // Find Widevine PSSH
    const match = mpd.match(/<ContentProtection[^>]*schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"[^>]*>[\s\S]*?<cenc:pssh>([^<]+)<\/cenc:pssh>[\s\S]*?<\/ContentProtection>/i);
    if (match) {
      res.json({ success: true, pssh: match[1], systemId: 'com.widevine.alpha' });
    } else {
      // Try finding PSSH in generic ContentProtection
      const genericMatch = mpd.match(/<cenc:pssh>([^<]+)<\/cenc:pssh>/i);
      if (genericMatch) {
        res.json({ success: true, pssh: genericMatch[1], systemId: 'com.widevine.alpha', note: 'found generic pssh' });
      } else {
        res.json({ success: false, error: 'No Widevine PSSH found in MPD' });
      }
    }
  } catch (e) {
    res.status(502).json({ error: 'PSSH fetch error: ' + e.message });
  }
});

app.get('/debug-drm', (req, res) => {
  res.json({
    bearerPrefix: storedBearer ? storedBearer.substring(0, 20) + '...' : null,
    hasContentDtl: !!storedContentDtl,
    contentDtlPrefix: storedContentDtl ? storedContentDtl.substring(0, 30) + '...' : null,
    hasSubscriptionDtl: !!storedSubscriptionDtl,
    subscriptionDtlPrefix: storedSubscriptionDtl ? storedSubscriptionDtl.substring(0, 30) + '...' : null,
    profileId: storedProfileId
  });
});

app.get('/vlc', (req, res) => {
  const channel = req.query.channel || 'AzamTwo';
  const mpdUrl = storedTok
    ? `${storedTok}/live/eds/${channel}/DASH/${channel}.mpd`
    : `https://cdnblncr.azamtvltd.co.tz/live/eds/${channel}/DASH/${channel}.mpd`;
  res.json({ url: mpdUrl, note: 'Paste in VLC: Media → Open Network Stream' });
});

app.use(express.static(path.join(__dirname)));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HEIS5 TV Server running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});

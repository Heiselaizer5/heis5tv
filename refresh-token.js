// refresh-token.js — Azam TV token refresh script (xploitechstv approach)
// Run this on a machine with Tanzanian IP every 30 minutes:
//   node refresh-token.js
// Saves fresh tok_ token to Supabase stream_tokens table.
// The proxy (local/Cloudflare/Supabase) uses the fresh token.

const https = require('https');
const http = require('http');
const url = require('url');
const SUPABASE_URL = 'https://yvztqzisrgqybapkdhcr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';
const CHANNELS = ['AzamTwo', 'AzamSport1', 'AzamSport2', 'AzamSport3', 'AzamSport4', 'AzamOne', 'SinemaZetu', 'WasafiTV', 'KIXMovies', 'CrownTv', 'ZBC', 'UTV', 'ZamaradiTV', 'ChekaPlusTV'];

async function fetchWithRedirect(urlStr) {
    return new Promise((resolve, reject) => {
        const opts = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, rejectUnauthorized: false };
        const proto = urlStr.startsWith('https') ? https : http;
        proto.get(urlStr, opts, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const loc = res.headers.location;
                const m = loc.match(/(https:\/\/[^/]+\/tok_[A-Za-z0-9_.-]+)/);
                if (m) return resolve({ tok: m[1], loc });
                return fetchWithRedirect(new url.URL(loc, urlStr).href).then(resolve).catch(reject);
            }
            resolve({ status: res.statusCode, location: res.headers.location });
        }).on('error', reject);
    });
}

async function saveToSupabase(channelKey, tokUrl) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ channel_key: channelKey, tok_url: tokUrl, expires_at: new Date(Date.now() + 86400000).toISOString(), updated_at: new Date().toISOString() });
        const u = new url.URL(`${SUPABASE_URL}/rest/v1/stream_tokens`);
        const opts = { hostname: u.hostname, port: 443, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Prefer': 'resolution=merge-duplicates' } };
        const req = https.request(opts, (res) => { let body = ''; res.on('data', d => body += d); res.on('end', () => resolve({ status: res.statusCode, body })); });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function refreshOne(channel) {
    const cdnUrl = `https://cdnblncr.azamtvltd.co.tz/live/eds/${channel}/DASH/${channel}.mpd`;
    try {
        const result = await fetchWithRedirect(cdnUrl);
        if (result.tok) {
            console.log(`[OK] ${channel}: ${result.tok.substring(0, 60)}...`);
            const sb = await saveToSupabase(channel, result.tok);
            if (sb.status >= 200 && sb.status < 300) console.log(`[SAVED] ${channel}`);
            else console.log(`[SB ERR] ${channel}: ${sb.status}`);
            return result.tok;
        }
        console.log(`[NO TOK] ${channel}: status=${result.status} location=${result.location || 'none'}`);
    } catch (e) {
        console.log(`[ERR] ${channel}: ${e.message}`);
    }
}

async function refreshAll() {
    console.log('=== Token Refresh Started ===', new Date().toISOString());
    for (const ch of CHANNELS) await refreshOne(ch);
    console.log('=== Token Refresh Complete ===', new Date().toISOString());
}

refreshAll();

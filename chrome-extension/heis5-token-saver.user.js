// ==UserScript==
// @name         HEIS5 Azam Token Saver
// @namespace    https://heis5tv.pages.dev
// @version      1.1.0
// @description  Auto-save Azam TV tokens from web.azamtvmax.com to Supabase (reads from cookies)
// @author       HEIS5
// @match        https://web.azamtvmax.com/*
// @icon         https://heis5tv.pages.dev/logo.jpg
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @connect      yvztqzisrgqybapkdhcr.supabase.co
// ==/UserScript==

(function() {
    'use strict';

    const SUPABASE_URL = 'https://yvztqzisrgqybapkdhcr.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';

    let lastSaveTime = 0;
    const SAVE_COOLDOWN = 10000;

    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    function getAzamTokens() {
        const tokens = {};
        const jwt = getCookie('jwt_token');
        const ref = getCookie('refresh_token');
        if (jwt) tokens.global_tok = jwt;
        if (ref) tokens.azam_refresh_token = ref;
        return tokens;
    }

    function hasTokens(tokens) {
        return !!tokens.global_tok || !!tokens.azam_refresh_token;
    }

    function saveToSupabase(name, value) {
        return new Promise((resolve) => {
            const json = typeof value === 'string' ? value : JSON.stringify(value);
            GM_xmlhttpRequest({
                method: 'POST',
                url: SUPABASE_URL + '/rest/v1/azam_config',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                    'Prefer': 'resolution=merge-duplicates'
                },
                data: JSON.stringify({ name, value: json }),
                onload: (res) => resolve(res.status >= 200 && res.status < 300),
                onerror: () => resolve(false)
            });
        });
    }

    async function saveAll(tokens) {
        let saved = 0;
        for (const [key, val] of Object.entries(tokens)) {
            const ok = await saveToSupabase(key, val);
            if (ok) saved++;
        }
        return saved;
    }

    function notify(msg, type) {
        try {
            GM_notification({
                title: 'HEIS5 Azam Token Saver',
                text: msg,
                timeout: 4000
            });
        } catch (_) {}
        const div = document.createElement('div');
        div.textContent = msg;
        Object.assign(div.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: 999999,
            padding: '12px 20px', borderRadius: '8px', fontFamily: 'Arial, sans-serif',
            fontSize: '14px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            background: type === 'ok' ? '#2ecc71' : type === 'err' ? '#e74c3c' : '#3498db',
            color: '#fff', maxWidth: '400px'
        });
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 4000);
    }

    async function checkAndSave() {
        if (Date.now() - lastSaveTime < SAVE_COOLDOWN) return;
        const tokens = getAzamTokens();
        if (!hasTokens(tokens)) return;

        lastSaveTime = Date.now();
        const saved = await saveAll(tokens);
        if (saved > 0) {
            notify('HEIS5: Saved ' + saved + ' token entries to Supabase', 'ok');
        }
    }

    setTimeout(checkAndSave, 3000);

    let pageUrl = location.href;
    setInterval(() => {
        if (location.href !== pageUrl) {
            pageUrl = location.href;
            checkAndSave();
        }
    }, 5000);

    console.log('[HEIS5] Azam Token Saver userscript loaded (cookie mode)');
})();

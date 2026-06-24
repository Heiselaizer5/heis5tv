const SUPABASE_URL = 'https://yvztqzisrgqybapkdhcr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';

const statusEl = document.getElementById('status');
const detailEl = document.getElementById('detail');
const saveBtn = document.getElementById('saveBtn');
const tokenListEl = document.getElementById('tokenList');

function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = 'status ' + type;
}

async function saveToSupabase(name, value) {
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/azam_config`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ name, value: json })
    });
    return res.ok;
}

async function saveAll(tokens) {
    let saved = 0;
    for (const [key, val] of Object.entries(tokens)) {
        const ok = await saveToSupabase(key, val);
        if (ok) saved++;
    }
    return saved;
}

async function refresh() {
    tokenListEl.innerHTML = '';

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('web.azamtvmax.com')) {
        setStatus('Not on web.azamtvmax.com', 'info');
        detailEl.textContent = 'Open web.azamtvmax.com and login first';
        saveBtn.disabled = true;
        return;
    }

    setStatus('Connected to Azam web', 'ok');
    detailEl.textContent = 'Reading tokens from cookies...';

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                function getCookie(name) {
                    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
                    return match ? decodeURIComponent(match[2]) : null;
                }
                const tokens = {};
                const jwt = getCookie('jwt_token');
                const ref = getCookie('refresh_token');
                if (jwt) tokens.global_tok = jwt;
                if (ref) tokens.azam_refresh_token = ref;
                return tokens;
            }
        });

        const tokens = results?.[0]?.result || {};
        const keys = Object.keys(tokens);

        if (keys.length > 0) {
            setStatus(`Found ${keys.length} global token(s)`, 'ok');
            detailEl.textContent = 'jwt_token + refresh_token from cookies';
            saveBtn.disabled = false;

            for (const key of keys) {
                const item = document.createElement('div');
                item.className = 'token-item';
                const val = tokens[key];
                const preview = val.length > 50 ? val.substring(0, 50) + '...' : val;
                item.innerHTML = `<span class="token-key">${key}</span>: ${preview}`;
                tokenListEl.appendChild(item);
            }

            saveBtn.onclick = async () => {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
                const saved = await saveAll(tokens);
                if (saved > 0) {
                    setStatus(`Saved ${saved}/${keys.length} entries`, 'ok');
                    detailEl.textContent = 'Tokens synced to Supabase';
                } else {
                    setStatus('Save failed', 'err');
                    detailEl.textContent = 'Check console for errors';
                }
                saveBtn.textContent = 'Save Now';
                saveBtn.disabled = false;
            };
        } else {
            setStatus('No tokens found', 'info');
            detailEl.textContent = 'Login to Azam web first';
            saveBtn.disabled = true;
        }
    } catch (e) {
        setStatus('Error reading tokens', 'err');
        detailEl.textContent = e.message;
        saveBtn.disabled = true;
    }
}

document.addEventListener('DOMContentLoaded', refresh);

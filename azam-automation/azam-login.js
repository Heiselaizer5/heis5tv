const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const AZAM_URL = 'https://web.azamtvmax.com';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yvztqzisrgqybapkdhcr.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';
const AZAM_USERNAME = process.env.AZAM_USERNAME || '';
const AZAM_PASSWORD = process.env.AZAM_PASSWORD || '';
const TIMEOUT = 60000;
const SAVE_INTERVAL_MIN = 6 * 60 * 60 * 1000;

async function sbSave(name, value) {
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
    if (!res.ok) console.log(`[SB ERR] ${name}: ${res.status}`);
    else console.log(`[SB OK] ${name}`);
}

async function readAzamTokens(page) {
    const tokens = await page.evaluate(() => {
        const result = {};
        const globalKeys = ['global_tok', 'azam_refresh_token'];
        for (const key of globalKeys) {
            const val = localStorage.getItem(key);
            if (val) result[key] = val;
        }
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('azam_ch:')) {
                const val = localStorage.getItem(key);
                if (val) result[key] = val;
            }
        }
        return result;
    });
    return tokens;
}

function hasRequiredTokens(tokens) {
    for (const key of Object.keys(tokens)) {
        if (key.startsWith('azam_ch:')) {
            try {
                const data = JSON.parse(tokens[key]);
                if (data.jwt_token && data.refreshToken) return true;
            } catch (_) {}
        }
    }
    return false;
}

async function main() {
    console.log('[START] Azam token automation');
    const missing = [];
    if (!AZAM_USERNAME) missing.push('AZAM_USERNAME');
    if (!AZAM_PASSWORD) missing.push('AZAM_PASSWORD');
    if (missing.length) {
        console.log('[ERROR] Missing env vars:', missing.join(', '));
        process.exit(1);
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox', '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', '--disable-gpu',
                '--window-size=1280,800'
            ]
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });

        console.log('[NAV] Loading', AZAM_URL);
        await page.goto(AZAM_URL, { waitUntil: 'networkidle0', timeout: TIMEOUT });
        console.log('[NAV] Page loaded, checking localStorage...');

        let tokens = await readAzamTokens(page);
        if (hasRequiredTokens(tokens)) {
            console.log('[OK] Tokens already present, saving...');
            for (const [key, val] of Object.entries(tokens)) {
                await sbSave(key, val);
            }
            await browser.close();
            return;
        }

        console.log('[LOGIN] No tokens found, attempting login...');
        await page.waitForTimeout(3000);

        const loginResult = await page.evaluate(() => {
            const loginBtn = document.querySelector('button, [class*="login"], [class*="signin"], [class*="sign-in"], a[href*="login"]');
            if (loginBtn) { loginBtn.click(); return 'clicked'; }
            return 'not-found';
        });
        console.log('[LOGIN] Button click result:', loginResult);

        await page.waitForTimeout(2000);

        const usernameInput = await page.$('input[type="email"], input[type="text"][name*="email"], input[type="text"][name*="user"], input[placeholder*="email" i], input[placeholder*="user" i], input[placeholder*="phone" i]');
        const passwordInput = await page.$('input[type="password"]');

        if (usernameInput && passwordInput) {
            console.log('[LOGIN] Found input fields, filling credentials...');
            await usernameInput.click({ clickCount: 3 });
            await usernameInput.type(AZAM_USERNAME, { delay: 50 });
            await passwordInput.click({ clickCount: 3 });
            await passwordInput.type(AZAM_PASSWORD, { delay: 50 });
            await page.waitForTimeout(1000);

            const submitBtn = await page.$('button[type="submit"], button:has-text("Sign In"), button:has-text("Login"), button:has-text("Sign in"), input[type="submit"]');
            if (submitBtn) {
                await submitBtn.click();
                console.log('[LOGIN] Submitted login form');
            } else {
                await page.keyboard.press('Enter');
                console.log('[LOGIN] Pressed Enter to submit');
            }

            await page.waitForTimeout(5000);
            try {
                await page.waitForFunction(() => {
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && k.startsWith('azam_ch:')) return true;
                    }
                    return false;
                }, { timeout: 30000 });
                console.log('[LOGIN] Login successful, tokens detected');
            } catch {
                console.log('[LOGIN] Timeout waiting for tokens after login, checking current state...');
            }

            await page.waitForTimeout(3000);
            tokens = await readAzamTokens(page);
            console.log('[TOKENS] Found', Object.keys(tokens).length, 'token entries');
            for (const key of Object.keys(tokens)) {
                console.log(`  ${key}: ${tokens[key].substring(0, 60)}...`);
            }

            for (const [key, val] of Object.entries(tokens)) {
                try { JSON.parse(val); } catch { continue; }
                await sbSave(key, val);
            }
        } else {
            console.log('[LOGIN] Could not find login form fields');
            const html = await page.content();
            console.log('[PAGE] HTML snippet:', html.substring(0, 2000));
        }

        await browser.close();
        console.log('[DONE] Automation complete');
    } catch (e) {
        console.log('[FATAL]', e.message);
        if (browser) await browser.close();
        process.exit(1);
    }
}

main();

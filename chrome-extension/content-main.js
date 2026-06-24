(function() {
    const seen = new Set();

    function captureUrl(urlStr) {
        if (!urlStr || seen.has(urlStr)) return;
        try {
            const url = new URL(urlStr, location.origin);
            if (!url.hostname.includes('cdnblncr') && !url.pathname.endsWith('.mpd')) return;
            seen.add(urlStr);
            const cdntoken = url.searchParams.get('cdntoken');
            const pathMatch = url.pathname.match(/\/([A-Za-z0-9_-]+)\.mpd$/);
            const channelName = pathMatch ? pathMatch[1] : null;
            if (cdntoken && channelName) {
                console.log('[HEIS5] Captured cdntoken for', channelName);
                window.postMessage({
                    type: 'HEIS5_CDN_TOKEN',
                    channelName,
                    cdntoken,
                    cdnBase: url.origin,
                    fullUrl: urlStr
                }, '*');
                window.postMessage({
                    type: 'HEIS5_CDN_TOKEN_GLOBAL',
                    cdntoken,
                    cdnBase: url.origin,
                    fullUrl: urlStr
                }, '*');
            }
        } catch(e) {}
    }

    const origFetch = window.fetch;
    window.fetch = function(input, init) {
        const url = typeof input === 'string' ? input : (input && input.url ? input.url : null);
        if (url) captureUrl(url);
        return origFetch.call(this, input, init);
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        const urlStr = typeof url === 'string' ? url : (url ? url.toString() : null);
        if (urlStr) captureUrl(urlStr);
        return origOpen.apply(this, arguments);
    };

    console.log('[HEIS5] MAIN-world CDN observer loaded');
})();

self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    if (url.includes('azamtvltd.co.tz')) {
        event.respondWith(handleCorsProxy(event.request));
    }
});

async function handleCorsProxy(request) {
    try {
        const response = await fetch(request, {
            mode: 'cors',
            credentials: 'omit',
            headers: {
                'Referer': 'https://web.azamtvmax.com/',
            },
        });
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Allow-Headers', '*');
        newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        newHeaders.set('Access-Control-Expose-Headers', 'Content-Type, Content-Length, Content-Range');
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
        });
    } catch (e) {
        return new Response('SW proxy error: ' + e.message, { status: 502 });
    }
}

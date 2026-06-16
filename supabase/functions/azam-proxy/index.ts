const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method === 'HEAD') return new Response(null, { status: 200, headers: CORS })

  const url = new URL(req.url)
  const targetUrl = decodeURIComponent(url.searchParams.get('url') || '')
  const cdntoken = url.searchParams.get('cdntoken')
  if (!targetUrl) return new Response('Missing url param', { status: 400, headers: CORS })

  let finalUrl = targetUrl
  if (cdntoken && !targetUrl.includes('/tok_')) {
    const slashIdx = targetUrl.indexOf('/', 8)
    if (slashIdx > 0) {
      finalUrl = targetUrl.slice(0, slashIdx) + '/tok_' + cdntoken + targetUrl.slice(slashIdx)
    }
  }

  const hdrs = {
    'Origin': 'https://web.azamtvmax.com',
    'Referer': 'https://web.azamtvmax.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }

  try {
    const res = await fetch(finalUrl, { headers: hdrs, redirect: 'manual' })
    if (!res.ok && res.status !== 200) {
      const body = await res.text()
      return new Response(body, { status: res.status, headers: { 'Content-Type': 'text/plain', ...CORS } })
    }
    const contentType = res.headers.get('content-type') || ''
    if (finalUrl.includes('.mpd') || contentType.includes('dash') || contentType.includes('xml')) {
      let mpd = await res.text()
      const cdnBase = finalUrl.substring(0, finalUrl.lastIndexOf('/') + 1)
      const abs = (rel) => rel.startsWith('http') ? rel : cdnBase + rel
      mpd = mpd.replace(/<BaseURL[^>]*>[^<]*<\/BaseURL>/g, '')
      mpd = mpd.replace(/(?:media|initialization)="([^"]+)"/g, (m, val) => m.replace(val, abs(val)))
      mpd = mpd.replace(/(?:media|initialization)='([^']+)'/g, (m, val) => m.replace(val, abs(val)))
      return new Response(mpd, { status: 200, headers: { 'Content-Type': 'application/dash+xml', ...CORS } })
    }
    const buf = await res.arrayBuffer()
    return new Response(buf, { status: 200, headers: { 'Content-Type': contentType || 'application/octet-stream', ...CORS, 'Cache-Control': 'no-cache' } })
  } catch (e) {
    return new Response('Proxy error: ' + (e instanceof Error ? e.message : String(e)), { status: 500, headers: CORS })
  }
})

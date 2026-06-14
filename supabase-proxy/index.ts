// Supabase Edge Function — Azam CDN CORS proxy
// Deploy: supabase functions deploy azam-proxy --no-verify-jwt
// URL: https://yvztqzisrgqybapkdhcr.supabase.co/functions/v1/azam-proxy
// Then set AZAM_PROXY_URL in index.html to this URL

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req: Request) => {
  const url = new URL(req.url)
  const targetUrl = url.searchParams.get('url')

  if (!targetUrl) {
    return new Response(JSON.stringify({ ok: true, message: 'Azam CDN proxy. Use ?url= parameter.' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const decoded = decodeURIComponent(targetUrl)
  const isSegment = decoded.includes('-init.mp4') || decoded.includes('-p=')
  const isMpd = decoded.includes('.mpd') && !isSegment

  try {
    const response = await fetch(decoded, {
      headers: {
        'Origin': 'https://web.azamtvmax.com',
        'Referer': 'https://web.azamtvmax.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    const newHeaders = new Headers(response.headers)
    newHeaders.set('Access-Control-Allow-Origin', '*')
    newHeaders.set('Access-Control-Allow-Headers', '*')
    newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    newHeaders.set('Access-Control-Expose-Headers', 'Content-Type, Content-Length, Content-Range')

    if (isMpd) {
      let mpd = await response.text()
      const baseUrl = decoded.substring(0, decoded.lastIndexOf('/') + 1)
      mpd = mpd.replace(/<BaseURL>.*?<\/BaseURL>/g, '')
      mpd = mpd.replace('</MPD>', `<BaseURL>${baseUrl}</BaseURL>\n</MPD>`)
      return new Response(mpd, {
        status: response.status,
        headers: newHeaders,
      })
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  } catch (e) {
    return new Response('Proxy error: ' + (e instanceof Error ? e.message : String(e)), {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
    })
  }
})

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

const XPL_URL = 'https://ihmpjsjkcqkqzeespnna.supabase.co';
const XPL_ANON_KEY = 'sb_publishable_5wVkjVYttgIKf_3Hby2x8g_6_gSCnXi';
const XPL_PROXY_KEY = 'xt_proxy_2k25_xp10!t3ch5_tz';

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405, headers: CORS });

  try {
    const body = await request.json();
    const { channel_id, session_token, jwt } = body;
    if (!channel_id || !session_token || !jwt) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing channel_id, session_token, or jwt' }), { status: 400, headers: CORS });
    }

    const cleanJwt = jwt.replace(/^Bearer\s+/i, '');
    const resp = await fetch(XPL_URL + '/functions/v1/get-stream', {
      method: 'POST',
      headers: {
        'apikey': XPL_ANON_KEY,
        'Authorization': 'Bearer ' + cleanJwt,
        'X-Proxy-Key': XPL_PROXY_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ channel_id, session_token })
    });

    const data = await resp.json();
    return new Response(JSON.stringify(data), { status: resp.status, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: CORS });
  }
}

const SUPABASE_URL = 'https://yvztqzisrgqybapkdhcr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';

async function tryQuery(path) {
  const resp = await fetch(SUPABASE_URL + path, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Accept': 'application/json' }
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: resp.status, ok: resp.ok, text: text.slice(0, 500), json };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } };
  }
  try {
    // Try stream_tokens table first (populated by refresh-token.js)
    const queries = [
      '/rest/v1/stream_tokens?select=tok_url,channel_key,expires_at&order=expires_at.desc&limit=1',
      '/rest/v1/stream_tokens?select=*&order=expires_at.desc&limit=1',
      '/rest/v1/azam_config?select=*&limit=1',
      '/rest/v1/azam_config?select=value&name=eq.global_tok&limit=1',
    ];
    for (const path of queries) {
      const result = await tryQuery(path);
      if (result.json && Array.isArray(result.json) && result.json.length > 0) {
        const row = result.json[0];
        const tok = row.tok_url || row.tok || row.value || null;
        if (tok) return respond({ success: true, tok, source: path });
      }
    }
    return respond({ success: false, error: 'No token found in any Supabase table' });
  } catch (e) {
    return respond({ success: false, error: e.message });
  }
};

function respond(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body)
  };
}
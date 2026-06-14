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
    const paths = ['/rest/v1/azam_config?select=*&limit=1', '/rest/v1/azam_config?select=value&name=eq.global_tok&limit=1'];
    const results = {};
    for (const p of paths) {
      results[p] = await tryQuery(p);
      if (results[p].json && Array.isArray(results[p].json) && results[p].json.length > 0) {
        const row = results[p].json[0];
        const tok = row.tok || row.value || null;
        if (tok) return respond({ success: true, tok, row });
      }
    }
    // Try listing tables
    const schema = await tryQuery('/rest/v1/?query=select+table_name+from+information_schema.tables+where+table_schema=%27public%27');
    return respond({ success: false, error: 'No token found', debug: results, schema: schema.json || schema.text });
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
const SUPABASE_URL = 'https://yvztqzisrgqybapkdhcr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';

async function tryQuery(path) {
  const resp = await fetch(SUPABASE_URL + path, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Accept': 'application/json' }
  });
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } };
  }
  try {
    // Try various query approaches
    const q1 = await tryQuery('/rest/v1/azam_config?select=*&limit=1');
    if (q1 && q1.length > 0) {
      const row = q1[0];
      if (row.tok) return respond({ success: true, tok: row.tok });
      if (row.value) return respond({ success: true, tok: row.value });
      return respond({ success: false, error: 'Row found but no tok/value column', raw: JSON.stringify(row) });
    }

    const q2 = await tryQuery('/rest/v1/azam_config?select=value&name=eq.global_tok&limit=1');
    if (q2 && q2.length > 0 && q2[0].value) {
      return respond({ success: true, tok: q2[0].value });
    }

    return respond({ success: false, error: 'No token found in Supabase. q1=' + JSON.stringify(q1) + ' q2=' + JSON.stringify(q2) });
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
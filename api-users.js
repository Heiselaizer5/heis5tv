const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const SUPABASE_URL = 'https://yvztqzisrgqybapkdhcr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';

function sbFetch(path, options = {}) {
  return fetch(SUPABASE_URL + path, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    }
  }).then(r => r.json());
}

function sbFetchRaw(path, options = {}) {
  return fetch(SUPABASE_URL + path, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    }
  });
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    if (request.method === 'POST') {
      const body = await request.json();

      if (action === 'signup') {
        const { name, username, email, password } = body;
        if (!name || !username || !email || !password) {
          return new Response(JSON.stringify({ success: false, error: 'All fields required' }), { status: 400, headers: CORS });
        }
        if (password.length < 6) {
          return new Response(JSON.stringify({ success: false, error: 'Password min 6 characters' }), { status: 400, headers: CORS });
        }
        const existing = await sbFetch('/rest/v1/azam_config?name=eq.' + encodeURIComponent('user:' + username) + '&select=name&limit=1');
        if (Array.isArray(existing) && existing.length > 0) {
          return new Response(JSON.stringify({ success: false, error: 'Username already taken' }), { status: 409, headers: CORS });
        }
        const all = await sbFetch('/rest/v1/azam_config?name=like.user:*&select=name,value');
        if (Array.isArray(all) && Object.values(all).some(u => { try { return JSON.parse(u.value).email === email; } catch { return false; } })) {
          return new Response(JSON.stringify({ success: false, error: 'Email already used' }), { status: 409, headers: CORS });
        }
        const userData = { name, email, password, role: 'user', createdAt: new Date().toISOString() };
        const resp = await sbFetchRaw('/rest/v1/azam_config', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({ name: 'user:' + username, value: JSON.stringify(userData) })
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          return new Response(JSON.stringify({ success: false, error: err.message || 'Failed to create user' }), { status: 500, headers: CORS });
        }
        return new Response(JSON.stringify({ success: true, user: { username, name, email, role: 'user' } }), { status: 200, headers: CORS });
      }

      if (action === 'login') {
        const { username, password } = body;
        if (!username || !password) {
          return new Response(JSON.stringify({ success: false, error: 'Username and password required' }), { status: 400, headers: CORS });
        }
        if (username === 'Admin' && password === 'Admin123') {
          return new Response(JSON.stringify({ success: true, user: { username: 'Admin', name: 'Admin', email: 'erastokasoga5@gmail.com', role: 'admin' } }), { status: 200, headers: CORS });
        }
        const data = await sbFetch('/rest/v1/azam_config?name=eq.' + encodeURIComponent('user:' + username) + '&select=value&limit=1');
        if (!Array.isArray(data) || data.length === 0) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid username or password' }), { status: 401, headers: CORS });
        }
        let found;
        try { found = JSON.parse(data[0].value); } catch {}
        if (!found || found.password !== password) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid username or password' }), { status: 401, headers: CORS });
        }
        return new Response(JSON.stringify({ success: true, user: { username, name: found.name, email: found.email, role: found.role } }), { status: 200, headers: CORS });
      }

      if (action === 'delete') {
        const { id } = body;
        if (!id) return new Response(JSON.stringify({ success: false, error: 'Missing username' }), { status: 400, headers: CORS });
        if (id === 'Admin') return new Response(JSON.stringify({ success: false, error: 'Cannot delete system admin' }), { status: 403, headers: CORS });
        await sbFetchRaw('/rest/v1/azam_config?name=eq.' + encodeURIComponent('user:' + id), { method: 'DELETE' });
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
      }
    }

    if (request.method === 'GET' && action === 'list') {
      const users = {};
      const data = await sbFetch('/rest/v1/azam_config?name=like.user:*&select=name,value');
      if (Array.isArray(data)) {
        data.forEach(row => {
          const username = row.name.replace('user:', '');
          try {
            const u = JSON.parse(row.value);
            users[username] = { name: u.name, username, email: u.email, role: u.role, createdAt: u.createdAt };
          } catch {}
        });
      }
      return new Response(JSON.stringify({ success: true, users }), { status: 200, headers: CORS });
    }

    return new Response(JSON.stringify({ success: false, error: 'Invalid action' }), { status: 400, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: CORS });
  }
}

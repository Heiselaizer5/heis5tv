const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const SUPABASE_URL = 'https://yvztqzisrgqybapkdhcr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2enRxemlzcmdxeWJhcGtkaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTA1NjAsImV4cCI6MjA5NTk4NjU2MH0.Zx591ai9OQOAfV45PRX2ekcNubdj0tMWJhRakrWOIeU';

async function sbFetch(path, options = {}) {
  const res = await fetch(SUPABASE_URL + path, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    }
  });
  return res.json();
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    async function getUsersBlob() {
      const data = await sbFetch('/rest/v1/azam_config?name=eq.heis5_users&select=value&limit=1');
      if (Array.isArray(data) && data.length > 0) {
        try { return JSON.parse(data[0].value || '{}'); } catch { return {}; }
      }
      return {};
    }

    async function saveUsersBlob(users) {
      await sbFetch('/rest/v1/azam_config', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ name: 'heis5_users', value: JSON.stringify(users) })
      });
    }

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
        const users = await getUsersBlob();
        if (Object.values(users).some(u => u.username === username)) {
          return new Response(JSON.stringify({ success: false, error: 'Username already taken' }), { status: 409, headers: CORS });
        }
        if (Object.values(users).some(u => u.email === email)) {
          return new Response(JSON.stringify({ success: false, error: 'Email already used' }), { status: 409, headers: CORS });
        }
        const id = Date.now().toString();
        users[id] = { name, username, email, password, role: 'user', createdAt: new Date().toISOString() };
        await saveUsersBlob(users);
        return new Response(JSON.stringify({ success: true, user: { id, name, username, email, role: 'user' } }), { status: 200, headers: CORS });
      }

      if (action === 'login') {
        const { username, password } = body;
        if (!username || !password) {
          return new Response(JSON.stringify({ success: false, error: 'Username and password required' }), { status: 400, headers: CORS });
        }
        if (username === 'Admin' && password === 'Admin123') {
          return new Response(JSON.stringify({ success: true, user: { username: 'Admin', name: 'Admin', email: 'erastokasoga5@gmail.com', role: 'admin' } }), { status: 200, headers: CORS });
        }
        const users = await getUsersBlob();
        const found = Object.values(users).find(u => u.username === username);
        if (!found || found.password !== password) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid username or password' }), { status: 401, headers: CORS });
        }
        return new Response(JSON.stringify({ success: true, user: { username: found.username, name: found.name, email: found.email, role: found.role } }), { status: 200, headers: CORS });
      }

      if (action === 'delete') {
        const { id } = body;
        if (!id) return new Response(JSON.stringify({ success: false, error: 'Missing user id' }), { status: 400, headers: CORS });
        const users = await getUsersBlob();
        if (!users[id]) return new Response(JSON.stringify({ success: false, error: 'User not found' }), { status: 404, headers: CORS });
        delete users[id];
        await saveUsersBlob(users);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
      }
    }

    if (request.method === 'GET' && action === 'list') {
      const users = await getUsersBlob();
      const safe = Object.fromEntries(
        Object.entries(users).map(([id, u]) => [id, { name: u.name, username: u.username, email: u.email, role: u.role, createdAt: u.createdAt || u.created_at }])
      );
      return new Response(JSON.stringify({ success: true, users: safe }), { status: 200, headers: CORS });
    }

    return new Response(JSON.stringify({ success: false, error: 'Invalid action' }), { status: 400, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: CORS });
  }
}
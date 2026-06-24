const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/revontech-6c62d/databases/(default)/documents';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

async function fetchFirestore(path, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(FIRESTORE_BASE + path, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (resp.status === 429 && attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      return null;
    }
  }
  return null;
}

function mapCategory(cat) {
  const map = { 'Sport': 'Sports', 'Habari': 'News', 'Movie': 'Movies', 'Cartoon': 'Kids', 'Music': 'Music', 'Wild': 'Entertainment', 'Religion': 'Religion', 'Local': 'Local' };
  return map[cat?.trim()] || cat || 'General';
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const tokJson = await fetchFirestore('/tokens');
    let cdntoken = '';
    if (tokJson?.documents) {
      for (const doc of tokJson.documents) {
        const f = doc.fields || {};
        cdntoken = f.token?.stringValue || f.cdntoken?.stringValue || f.value?.stringValue || '';
        if (cdntoken) break;
      }
    }

    const chJson = await fetchFirestore('/channels');
    if (!chJson?.documents) {
      return new Response(JSON.stringify({ success: false, error: 'No channels found' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const channels = chJson.documents.map(doc => {
      const f = doc.fields || {};
      const name = (f.name?.stringValue || '').trim();
      let url = (f.url?.stringValue || '').trim();
      if (!name || !url) return null;

      const type = (f.type?.stringValue || f.linkType?.stringValue || '').toLowerCase();
      const cat = mapCategory(f.category?.stringValue);
      const isAzamCdn = url.includes('azamtvltd.co.tz');
      const key = f.key?.stringValue || '';
      const kid = f.kid?.stringValue || '';
      const ch = { name, category: cat, stream_url: url, logo: f.iconUrl?.stringValue || '' };

      if (type === 'dash' && cdntoken && isAzamCdn) {
        ch.stream_url = url + (url.includes('?') ? '&' : '?') + 'cdntoken=' + encodeURIComponent(cdntoken);
        if (key && kid) ch.drm = { clearKeys: { [kid]: key } };
      } else if (type === 'dash' && !isAzamCdn && key && kid) {
        ch.drm = { clearKeys: { [kid]: key } };
      }
      return ch;
    }).filter(Boolean);

    return new Response(JSON.stringify({ success: true, channels, cdntoken }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
}

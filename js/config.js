// ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
const SB_URL = 'https://cquepvalcyfmyfudcwsa.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxdWVwdmFsY3lmbXlmdWRjd3NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NzE5MjQsImV4cCI6MjA5MzI0NzkyNH0._BDBdh27xIW5JBnQzUoXUN4cWJCgDMT0uB6vqvm6ZJs';
const SB_HEADERS = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function sbRequest(method, filter = '', body = null, table = 'stock') {
  const res = await fetch(`${SB_URL}/rest/v1/${table}${filter}`, {
    method,
    headers: SB_HEADERS,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status}`);
  }
  if (method === 'DELETE') return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

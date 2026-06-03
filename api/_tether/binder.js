// Cross-app reads into Binder's wiki, which lives in the SHARED Supabase `pages`
// table. Lets Tether (in BlockOut) reference the user's Binder notes — e.g. read
// a Cardiology revision page and turn it into a Task Chain. Read-only and ALWAYS
// owner-scoped (service-role bypasses RLS). DB-backed, so these run in the route
// (with the Supabase client), not over the client snapshot.

const BINDER_READ_TOOLS = new Set(['list_binder_wiki', 'read_binder_wiki']);

// Strip characters that would break a PostgREST ilike/or filter.
function sanitize(q) {
  return String(q || '').replace(/[%,()*]/g, ' ').trim().slice(0, 100);
}

async function listBinderWiki(supabase, ownerId, input) {
  const q = sanitize(input && input.query);
  let query = supabase
    .from('pages')
    .select('id, title, path, icon, updated_at')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })
    .limit(40);
  if (q) query = query.or(`title.ilike.%${q}%,content_md.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) throw new Error(`Binder wiki list failed: ${error.message}`);
  return { pages: (data || []).map((p) => ({ id: p.id, title: p.title, path: p.path, icon: p.icon || undefined })) };
}

async function readBinderWiki(supabase, ownerId, input) {
  const byPath = input && input.path ? String(input.path) : null;
  const byId = input && input.id ? String(input.id) : null;
  if (!byPath && !byId) throw new Error('Provide a path or id (from list_binder_wiki).');
  let query = supabase
    .from('pages')
    .select('id, title, path, content_md, updated_at')
    .eq('owner_id', ownerId);
  query = byId ? query.eq('id', byId) : query.eq('path', byPath);
  const { data, error } = await query.single();
  if (error || !data) return { found: false };
  // Cap the content so a huge page can't blow the model's context.
  const content = String(data.content_md || '');
  return {
    found: true,
    id: data.id,
    title: data.title,
    path: data.path,
    content: content.length > 8000 ? content.slice(0, 8000) + '\n…(truncated)' : content,
  };
}

async function executeBinderRead(supabase, ownerId, name, input) {
  if (name === 'list_binder_wiki') return listBinderWiki(supabase, ownerId, input || {});
  if (name === 'read_binder_wiki') return readBinderWiki(supabase, ownerId, input || {});
  throw new Error(`Unknown Binder tool: ${name}`);
}

const binderToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'list_binder_wiki',
      description: "List or search the user's Binder wiki pages (Binder is the user's notes/wiki app, sibling to BlockOut). Optional query filters by title/content. Returns ids and paths to then read with read_binder_wiki.",
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Filter pages by title/content (optional).' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_binder_wiki',
      description: 'Read the markdown content of one Binder wiki page (by path or id from list_binder_wiki). Use it to inform BlockOut actions — e.g. turn a revision page into a Task Chain or tasks.',
      parameters: { type: 'object', properties: { path: { type: 'string' }, id: { type: 'string' } } },
    },
  },
];

module.exports = { BINDER_READ_TOOLS, binderToolDefinitions, executeBinderRead };

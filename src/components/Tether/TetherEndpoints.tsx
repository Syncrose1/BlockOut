// Full BYOK endpoint manager (ported from Binder). ALWAYS reads the server
// (shared model_endpoints) first so the list reflects what's actually stored —
// including endpoints created in other Syncratic apps. List / add / edit /
// delete / set-default. The api_key is write-only (never returned), so edit
// leaves it blank to keep the current key.

import { useState, useEffect, useCallback } from 'react';
import {
  listEndpoints, createEndpoint, updateEndpoint, deleteEndpoint, setDefaultEndpoint,
  refreshTetherStatus, type ModelEndpoint,
} from '../../utils/tether';

const PRESETS = [
  { label: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1', model_id: 'nvidia/nemotron-3-super-120b-a12b:free' },
  { label: 'OpenAI', base_url: 'https://api.openai.com/v1', model_id: 'gpt-4o' },
  { label: 'Anthropic', base_url: 'https://api.anthropic.com/v1', model_id: 'claude-sonnet-4-6' },
  { label: 'Gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai', model_id: 'gemini-2.0-flash' },
  { label: 'Groq', base_url: 'https://api.groq.com/openai/v1', model_id: 'llama-3.3-70b-versatile' },
  { label: 'Ollama (local)', base_url: 'http://localhost:11434/v1', model_id: 'llama3.2' },
];

const field: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, marginTop: 4,
  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
  background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'inherit',
};
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' };

export function TetherEndpoints({ onChanged }: { onChanged?: () => void }) {
  const [endpoints, setEndpoints] = useState<ModelEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'hidden' | 'create' | 'edit'>('hidden');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // Server-first: always fetch the canonical list before rendering.
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setEndpoints(await listEndpoints()); } finally { setLoading(false); }
    refreshTetherStatus();
    onChanged?.();
  }, [onChanged]);

  useEffect(() => { refresh(); }, [refresh]);

  const reset = () => { setName(''); setBaseUrl(''); setApiKey(''); setModelId(''); setIsDefault(false); setErr(null); setEditingId(null); };
  const startCreate = () => { reset(); setMode('create'); };
  const startEdit = (ep: ModelEndpoint) => {
    setName(ep.name); setBaseUrl(ep.base_url); setApiKey(''); setModelId(ep.model_id);
    setIsDefault(ep.is_default); setEditingId(ep.id); setErr(null); setMode('edit');
  };

  const save = async () => {
    setErr(null);
    if (!name.trim() || !baseUrl.trim() || !modelId.trim() || (mode === 'create' && !apiKey.trim())) {
      setErr('Fill in all fields.'); return;
    }
    setSaving(true);
    try {
      if (mode === 'create') {
        const r = await createEndpoint({ name: name.trim(), base_url: baseUrl.trim(), api_key: apiKey.trim(), model_id: modelId.trim(), is_default: isDefault || endpoints.length === 0 });
        if (!r.ok) { setErr(r.error || 'Failed to add.'); return; }
      } else if (editingId) {
        const patch: Parameters<typeof updateEndpoint>[1] = { name: name.trim(), base_url: baseUrl.trim(), model_id: modelId.trim(), is_default: isDefault };
        if (apiKey.trim()) patch.api_key = apiKey.trim();
        const r = await updateEndpoint(editingId, patch);
        if (!r.ok) { setErr(r.error || 'Failed to save.'); return; }
      }
      reset(); setMode('hidden'); await refresh();
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => { await deleteEndpoint(id); await refresh(); };
  const makeDefault = async (id: string) => { await setDefaultEndpoint(id); await refresh(); };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
        Tether is <strong>bring-your-own-key</strong>. Connect any OpenAI-compatible model — endpoints are shared across Syncratic apps, and your keys are stored server-side only.
      </div>

      {loading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {endpoints.length === 0 && mode === 'hidden' && (
            <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No models connected yet.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {endpoints.map((ep) => (
              <div key={ep.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 8,
                border: `1px solid ${ep.is_default ? 'var(--accent)' : 'var(--border)'}`,
                background: ep.is_default ? 'hsla(210,80%,55%,0.06)' : 'transparent',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.name}</span>
                    {ep.is_default && <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--accent)', fontWeight: 700, background: 'hsla(210,80%,55%,0.12)', padding: '2px 6px', borderRadius: 4 }}>Default</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.model_id}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.base_url}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => startEdit(ep)} style={{ padding: '2px 6px' }}>✎</button>
                  {!ep.is_default && <button className="btn btn-ghost btn-sm" title="Set as default" onClick={() => makeDefault(ep.id)} style={{ padding: '2px 6px' }}>★</button>}
                  <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => remove(ep.id)} style={{ padding: '2px 6px', color: 'hsl(0,72%,55%)' }}>🗑</button>
                </div>
              </div>
            ))}
          </div>

          {mode !== 'hidden' ? (
            <div style={{ borderRadius: 8, border: '1px solid var(--border)', padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{mode === 'edit' ? 'Edit model' : 'New model'}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => { setMode('hidden'); reset(); }}>Cancel</button>
              </div>
              {mode === 'create' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {PRESETS.map((p) => (
                    <button key={p.label} className="btn btn-ghost btn-sm" onClick={() => { setBaseUrl(p.base_url); setModelId(p.model_id); if (!name) setName(p.label); }}>{p.label}</button>
                  ))}
                </div>
              )}
              <label style={label}>Name<input style={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GPT-4o via OpenRouter" /></label>
              <div style={{ height: 8 }} />
              <label style={label}>Base URL<input style={field} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://openrouter.ai/api/v1" /></label>
              <div style={{ height: 8 }} />
              <label style={label}>Model ID<input style={field} value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="gpt-4o" /></label>
              <div style={{ height: 8 }} />
              <label style={label}>{mode === 'edit' ? 'API key (blank = keep current)' : 'API key'}<input style={field} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={mode === 'edit' ? 'Leave blank to keep current key' : 'sk-…'} autoComplete="off" /></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                Use as default
              </label>
              {err && <div style={{ fontSize: 12, color: 'hsl(0,72%,55%)', marginTop: 8 }}>{err}</div>}
              <button className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} onClick={save} disabled={saving}>
                {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add model'}
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost" style={{ width: '100%', border: '2px dashed var(--border)' }} onClick={startCreate}>+ Add a model</button>
          )}
        </>
      )}
    </div>
  );
}

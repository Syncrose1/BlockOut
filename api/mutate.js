// Cross-app MUTATION endpoint — the write half the ecosystem was missing.
//
// Until now nobody wrote to BlockOut. Binder reads it (`src/lib/ai/tools/blockout.ts`, headed
// "Read-only."), and BlockOut writes to Binder through Binder's own API (`api/tether-binder.js`, "Binder
// owns its own writes"). This is the symmetric piece: BlockOut owning its own writes, so a sibling app —
// Finalist first — can complete a task or edit a chain without leaving.
//
// The logic lives in api/_mutate/apply.js, self-contained and droppable in the style of
// api/_syncra/tunnel.js. Nothing here is domain-specific: the operations are BlockOut's own vocabulary,
// so this serves any caller and BlockOut stays a general-purpose planner.
//
// Prod: https://syncratic.app/blockout/api/mutate
//
//   POST { ops: [{ op, ...payload }], expectedLastModified? }
//   → 200 { ok, results[], lastModified, version }
//   → 409 conflict | no-snapshot | empty-snapshot | would-empty
//   → 400 unknown or invalid operation (nothing is written)
//
// ★ GATED ON TETHER_CROSS_APP, like every other cross-app path in the ecosystem — api/tether.js and
// api/tether-binder.js here, crossAppEnabled() in Binder. Cross-app may become a Syncratic Pro feature
// and this must go dark with the rest.

const { applyMutations, userFromToken, isConfigured, OP_NAMES } = require('./_mutate/apply');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (process.env.TETHER_CROSS_APP === 'off') {
    return res.status(403).json({ error: 'cross-app-disabled', message: 'Cross-app access is disabled.' });
  }
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Server not configured for cross-app writes.' });
  }

  // A discovery GET, so a caller can check the contract without guessing at operation names.
  if (req.method === 'GET') return res.status(200).json({ ops: OP_NAMES });

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await userFromToken(req.headers.authorization || '');
  if (!user) return res.status(401).json({ error: 'Invalid or expired session.' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { status, body: out } = await applyMutations({
    userId: user.id,
    ops: body.ops,
    expectedLastModified: body.expectedLastModified,
  });
  return res.status(status).json(out);
};

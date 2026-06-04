// Syncra secure tunnel, exposed on BlockOut's backend. Thin wrapper — all logic
// lives in the droppable compatibility module so every Syncratic app exposes the
// identical endpoint. Authenticated chat-completion proxy; the agent loop runs in
// Syncra (the client), not here. See api/_syncra/tunnel.js.
module.exports = require('./_syncra/tunnel').handleTunnel;

// Allow time for a slow streamed completion (the client drives the multi-step loop,
// one tunnel call per hop).
module.exports.config = { maxDuration: 60 };

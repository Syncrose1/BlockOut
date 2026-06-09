// Syncra image-generation proxy, exposed on BlockOut's backend. Thin wrapper around the droppable
// compatibility module so every Syncratic app exposes the identical endpoint. Authenticated, BYOK,
// owner-scoped image generation; the api_key lives only server-side. See api/_syncra/tunnel.js.
module.exports = require('./_syncra/tunnel').handleImage;

// Image generation can be slow on some providers.
module.exports.config = { maxDuration: 60 };

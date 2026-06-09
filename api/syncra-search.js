// Syncra search proxy, exposed on BlockOut's backend. Thin wrapper — all logic lives in
// the droppable compatibility module so every Syncratic app exposes the identical endpoint.
// Authenticated web/image search proxy; the search api_key stays server-side. See
// api/_syncra/search.js.
module.exports = require('./_syncra/search').handleSearch;

// 60s: the scrape fallback can spin up Jina's headless-browser engine, which is slower.
module.exports.config = { maxDuration: 60 };

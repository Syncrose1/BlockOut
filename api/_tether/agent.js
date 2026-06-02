// Tether agent loop (phase 1: read-only, streaming).
// Provider-agnostic via the OpenAI SDK pointed at the user's BYOK base_url.
// Emits events through onEvent: thinking | tool_call | tool_result | complete | error.
// (needs_continuation / staged_action arrive with the resumable loop + write tools.)

const OpenAI = require('openai');
const { SYSTEM_PROMPT } = require('./prompt');
const { toolDefinitions, executeReadTool, writeToolDefinitions, buildStagedAction, WRITE_TOOLS } = require('./tools');

const ALL_TOOLS = [...toolDefinitions, ...writeToolDefinitions];

// Low cap: read-only turns are short, and this is one invocation's budget.
const MAX_ITERATIONS = 8;
const MAX_TOKENS = 2048;

function createClient(endpoint) {
  return new OpenAI({ apiKey: endpoint.api_key, baseURL: endpoint.base_url });
}

// Inject the data snapshot summary once, before the first user message, so the
// model knows the shape/scale without us dumping every record.
function snapshotPreamble(snapshot) {
  const taskCount = Object.keys(snapshot.tasks || {}).length;
  const catCount = Object.keys(snapshot.categories || {}).length;
  const blockCount = Object.keys(snapshot.timeBlocks || {}).length;
  const chainCount = Object.keys(snapshot.taskChains || {}).length;
  const today = new Date().toISOString().slice(0, 10);
  return `Context: today is ${today}. The user currently has ${taskCount} task(s) across ${catCount} categor(ies), ${blockCount} time block(s), and ${chainCount} day(s) of Task Chains. Use the read tools to inspect specifics.`;
}

async function runAgentLoopStreaming(snapshot, endpoint, conversationHistory, onEvent) {
  const client = createClient(endpoint);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: snapshotPreamble(snapshot) },
    ...conversationHistory
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response;
    try {
      response = await client.chat.completions.create({
        model: endpoint.model_id,
        max_tokens: MAX_TOKENS,
        tools: ALL_TOOLS,
        messages,
      });
    } catch (err) {
      onEvent({ type: 'error', data: { error: modelError(err) } });
      return;
    }

    const choice = response.choices && response.choices[0];
    if (!choice) {
      onEvent({ type: 'error', data: { error: 'No response from model.' } });
      return;
    }

    const assistant = choice.message;
    messages.push(assistant);

    if (assistant.content) onEvent({ type: 'thinking', data: assistant.content });

    const toolCalls = assistant.tool_calls;
    if (!toolCalls || toolCalls.length === 0 || choice.finish_reason === 'stop') {
      onEvent({ type: 'complete', data: { response: assistant.content || '' } });
      return;
    }

    for (const call of toolCalls) {
      if (call.type !== 'function') continue;
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* malformed */ }

      onEvent({ type: 'tool_call', data: { name: call.function.name, input: args } });

      let result, isError = false;
      if (WRITE_TOOLS.has(call.function.name)) {
        // Write tools NEVER mutate — they stage a proposal for the user to approve.
        try {
          const action = buildStagedAction(call.function.name, args);
          onEvent({ type: 'staged_action', data: action });
          // Immediate (reversible UI/settings) actions apply right away; data
          // mutations are queued for the user's tickbox approval.
          result = action.immediate
            ? { applied: true, summary: action.summary }
            : {
                staged: true,
                summary: action.summary,
                note: action.destructive
                  ? 'Queued — the user must confirm this DELETION by typing a confirmation phrase. Not yet applied.'
                  : 'Queued for the user to approve. Not yet applied.',
              };
        } catch (e) {
          isError = true;
          result = { error: e instanceof Error ? e.message : 'Invalid proposal' };
        }
      } else {
        try {
          result = executeReadTool(snapshot, call.function.name, args);
        } catch (e) {
          isError = true;
          result = { error: e instanceof Error ? e.message : 'Tool error' };
        }
      }

      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      onEvent({ type: 'tool_result', data: { tool: call.function.name, error: isError ? result.error : undefined } });
    }
  }

  onEvent({ type: 'complete', data: { response: 'Reached the step limit for one turn. Ask me to continue or narrow the request.' } });
}

// Surface BYOK/model failures clearly WITHOUT leaking the key.
function modelError(err) {
  const status = err && (err.status || err.statusCode);
  if (status === 401 || status === 403) return 'Your model endpoint rejected the API key (401/403). Check the key in your Tether settings.';
  if (status === 404) return 'The model or endpoint URL was not found (404). Check the model id and base URL.';
  if (status === 429) return 'Your model endpoint is rate-limited (429). Try again shortly.';
  const msg = err && err.message ? String(err.message) : 'Model request failed.';
  // Defensive: never echo anything key-shaped.
  return msg.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***');
}

module.exports = { runAgentLoopStreaming };

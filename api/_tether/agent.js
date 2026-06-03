// Tether agent loop (phase 1: read-only, streaming).
// Provider-agnostic via the OpenAI SDK pointed at the user's BYOK base_url.
// Emits events through onEvent: thinking | tool_call | tool_result | complete | error.
// (needs_continuation / staged_action arrive with the resumable loop + write tools.)

const OpenAI = require('openai');
const { SYSTEM_PROMPT } = require('./prompt');
const { toolDefinitions, executeReadTool, writeToolDefinitions, binderWriteToolDefinitions, buildStagedAction, WRITE_TOOLS, recordRead, requireReadBeforeWrite } = require('./tools');
const { BINDER_READ_TOOLS, binderToolDefinitions, executeBinderRead } = require('./binder');

const BASE_TOOLS = [...toolDefinitions, ...writeToolDefinitions];
// Cross-app write tool names — rejected at staging time when cross-app is off.
const CROSS_APP_WRITE_TOOLS = new Set(['propose_create_binder_page']);
// Cross-app (Binder) tools are exposed ONLY when binderCtx is supplied — the
// single gate (the route decides via crossAppEnabled, ready to become a Pro flag).
function toolsFor(binderCtx) {
  return binderCtx ? [...BASE_TOOLS, ...binderToolDefinitions, ...binderWriteToolDefinitions] : BASE_TOOLS;
}

// Per-hop tool-iteration budget — kept MODEST on purpose: a weak BYOK model can
// flail, and a tight cap bounds the damage per invocation. Genuine long work
// isn't lost — when the cap (or the soft time deadline) is hit mid-task we hand
// off a checkpoint and the client resumes in a fresh invocation (continuation).
const MAX_ITERATIONS = 10;
// Hard ceiling across ALL hops of one turn — stops a looping model from running
// away over the user's BYOK budget.
const MAX_TOTAL_ITERATIONS = 30;
// Hand off before Vercel's ~60s wall clock, leaving margin for one more model
// round-trip. (A single model call can't be split, so the per-hop budget must
// exceed expected call latency.)
const SOFT_DEADLINE_MS = 45000;
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

// `resume` (optional) carries a checkpoint from a previous hop so a long turn
// can continue in a fresh invocation: { messages, seen, totalIterations }.
// `binderCtx` (optional) = { supabase, ownerId } enables cross-app Binder reads.
async function runAgentLoopStreaming(snapshot, endpoint, conversationHistory, onEvent, resume, binderCtx) {
  const client = createClient(endpoint);

  let messages, seen, priorIterations;
  if (resume && Array.isArray(resume.messages)) {
    // Continuation — pick up exactly where the prior hop left off.
    messages = resume.messages;
    seen = {
      chainDates: new Set((resume.seen && resume.seen.chainDates) || []),
      chainAll: !!(resume.seen && resume.seen.chainAll),
      week: !!(resume.seen && resume.seen.week),
    };
    priorIterations = resume.totalIterations || 0;
  } else {
    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: snapshotPreamble(snapshot) },
      ...conversationHistory
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content })),
    ];
    // Tracks which chains/weekview the model has READ this turn — enforces
    // read-before-edit for date/title/day-addressed writes.
    seen = { chainDates: new Set(), chainAll: false, week: false };
    priorIterations = 0;
  }

  // Serialise the checkpoint for the client to send back on the next hop.
  const checkpoint = (totalIterations) => ({
    messages,
    seen: { chainDates: [...seen.chainDates], chainAll: seen.chainAll, week: seen.week },
    totalIterations,
  });

  const hopStart = Date.now();

  for (let local = 0; local < MAX_ITERATIONS; local++) {
    const total = priorIterations + local;

    // Hard ceiling across all hops — stop a runaway/looping model.
    if (total >= MAX_TOTAL_ITERATIONS) {
      onEvent({ type: 'complete', data: { response: 'I went back and forth several times without finishing — let me know a narrower next step and I\'ll continue.' } });
      return;
    }
    // Soft time deadline: hand off before the invocation is killed, leaving room
    // for the client to resume seamlessly. (Checkpoint only BETWEEN iterations.)
    if (local > 0 && (Date.now() - hopStart) > SOFT_DEADLINE_MS) {
      onEvent({ type: 'needs_continuation', data: checkpoint(total) });
      return;
    }

    let response;
    try {
      response = await client.chat.completions.create({
        model: endpoint.model_id,
        max_tokens: MAX_TOKENS,
        tools: toolsFor(binderCtx),
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
        // Cross-app writes are off unless cross-app is enabled — don't stage even
        // if a model hallucinates the (un-exposed) tool name.
        if (CROSS_APP_WRITE_TOOLS.has(call.function.name) && !binderCtx) {
          isError = true;
          result = { error: 'Cross-app (Binder) actions are not enabled for this user.' };
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
          onEvent({ type: 'tool_result', data: { tool: call.function.name, error: result.error } });
          continue;
        }
        // Read-before-edit: chain/Weekview writes must follow the matching read.
        const gate = requireReadBeforeWrite(seen, call.function.name, args);
        if (gate) {
          isError = true;
          result = { error: gate };
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
          onEvent({ type: 'tool_result', data: { tool: call.function.name, error: gate } });
          continue;
        }
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
                  : action.crossApp
                    ? 'Queued — this is a CROSS-APP write to Binder; the user must confirm a cross-site action before it happens. Not yet applied.'
                    : 'Queued for the user to approve. Not yet applied.',
              };
        } catch (e) {
          isError = true;
          result = { error: e instanceof Error ? e.message : 'Invalid proposal' };
        }
      } else if (BINDER_READ_TOOLS.has(call.function.name)) {
        // Cross-app read into Binder's wiki (shared Supabase, owner-scoped).
        if (!binderCtx) {
          isError = true;
          result = { error: 'Binder access is unavailable here.' };
        } else {
          try {
            result = await executeBinderRead(binderCtx.supabase, binderCtx.ownerId, call.function.name, args);
          } catch (e) {
            isError = true;
            result = { error: e instanceof Error ? e.message : 'Binder read failed' };
          }
        }
      } else {
        try {
          result = executeReadTool(snapshot, call.function.name, args);
          recordRead(seen, call.function.name, args); // unlock matching writes
        } catch (e) {
          isError = true;
          result = { error: e instanceof Error ? e.message : 'Tool error' };
        }
      }

      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      onEvent({ type: 'tool_result', data: { tool: call.function.name, error: isError ? result.error : undefined } });
    }
  }

  // Spent this hop's iteration budget and the model still wants to act — hand off
  // a checkpoint; the client resumes in a fresh invocation (transparent to the user).
  onEvent({ type: 'needs_continuation', data: checkpoint(priorIterations + MAX_ITERATIONS) });
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

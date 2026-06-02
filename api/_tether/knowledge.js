// On-demand context packages for the `recall` tool. Kept OUT of the system
// prompt so they don't burn context on every turn — the agent pulls a package
// only when a topic is actually relevant.

const KNOWLEDGE = {
  synamon: `SYNAMON — the companion.
A tamagotchi-style creature companion, a first-class BlockOut feature. Each Synamon GROWS FROM THE USER'S REAL PRODUCTIVITY: focus time (Pomodoro / timer / stopwatch attributed to a task) and task completion earn XP, which levels the creature up and eventually EVOLVES it through stages. Idle decay means a neglected companion slips, so it rewards regular, genuine engagement.
- Care actions (feed, pet, play) are things the USER does in the companion panel. The user picks a starter from a few options.
- The broader Synamon experience (battles, exploration, the full dex) is a SEPARATE Syncratic app sharing the same account, so the same creatures persist across both.
- It can be hidden entirely (Settings → "Show Synamon companion"); hiding preserves all data.

YOUR ROLE with Synamon: be a coach, not a caretaker.
- ENCOURAGE the user to focus and finish tasks because that is what nurtures their companion — tie it to motivation ("a focused session also feeds your companion").
- Do NOT feed/pet/play for them, and never shortcut or fake its progress — the growth is meant to be earned.
- set_synamon_companion only shows/hides the companion (a display preference); it is not pet-care.
- If the companion is hidden/disabled, don't push it.`,

  'co-focus': `CO-FOCUS — social studying.
BlockOut's intentional, immersive way to study ALONGSIDE friends (body-doubling for accountability and motivation).
- Friend system: add friends and share invite codes.
- Live-synced focus sessions: a shared OR independent timer mode (Pomodoro / timer / stopwatch), live presence (you can see friends' timer state and how many sessions they've done today), pauses and laps, task-chain tick-offs visible to the room, and chat. Visibility permissions control what others see. It runs in real time.
- It lives in the Co-Focus view.

YOUR ROLE with Co-Focus: explain and point, don't intrude.
- If asked, explain what it is and WHY it helps — studying with others boosts accountability and focus.
- Point the user to the Co-Focus view (you can switch_view to 'cofocus').
- A live session is meant to be a human, immersive experience: do NOT try to automate it, run it, or inject yourself into an active session.`,
};

function recallTopics() {
  return Object.keys(KNOWLEDGE);
}

function recall(topic) {
  const key = String(topic || '').toLowerCase().trim();
  const info = KNOWLEDGE[key];
  if (!info) return { topic: key, info: null, available: recallTopics() };
  return { topic: key, info };
}

module.exports = { recall, recallTopics };

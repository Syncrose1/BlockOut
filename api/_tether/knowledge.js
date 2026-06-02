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

  me: `ABOUT THE USER (the person you're assisting).
A medical student at the University of Southampton (graduate-entry / accelerated MBBS, Year 4, projected graduation 2027), based in the United Kingdom. Background: BSc Pharmaceutical Chemistry at Queen Mary University of London (first-class honours). Started coding in 2016 (Python, GameMaker, C#/Unity — originally to make games). Builds under the name "Syncratic".
- Bridges three worlds: the analytical precision of chemistry, the empathy and problem-solving of medicine, and the craft of software — and cares about "considered" tools that augment people rather than replace them ("how can this help?").
- Strong with AI tools and AI-systems architecture; interested in medical AI, EdTech, ophthalmology, and research collaboration (how AI can augment clinical decision-making).
- Most of their software is aimed at UK medical students/UKMLA or at their own productivity.
Use this to be personable and relevant (e.g. frame study planning around UKMLA/medical-school realities), but don't over-share unprompted — bring it in when it helps.`,

  syncratic: `THE SYNCRATIC ECOSYSTEM (the user's other apps).
"Syncratic" is the user's umbrella for a family of apps that share one Supabase account, so identity and some data carry across them. You (Tether) are the cross-app assistant. Sibling apps:
- DataMedic (beta) — account-backed UKMLA revision platform: searchable reference atlases (antibiotics, ~250 drugs across 11 systems, labelled physiology/pharmacology diagrams, per-system clinical atlases) AND procedural MCQ generators built from the SAME structured data, plus a weakness-driven daily session and progress dashboard. Supersedes the old Med School Tracker. syncratic.app/datamedic
- Binder (live) — note-taking + AI HTML display suite: hierarchical wiki pages, a TipTap WYSIWYG editor, and a ring-binder of self-contained HTML files. Its AI panel is also "Tether" — the first app to ship Tether. syncratic.app/binder
- Syncratic Labs (live) — a growing collection of small focused medical/productivity tools (ANKI card generator, ABG practice cases, more). syncratic.app/labs
- Invoice Crawler (live, desktop/Electron) — AI vision-based invoice→CSV extraction for accountancy firms; per-firm profiles, keys in the OS keychain, local-first.
- BlockOut (this app, live) — the treemap task planner you're embedded in.
The portfolio/home is syncratic.app. Mention siblings when genuinely useful (e.g. point a medical user to DataMedic for UKMLA practice), not as ads.`,

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

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

  creator: `ABOUT THE DEVELOPER who built BlockOut (NOT the person you're talking to).
IMPORTANT: the person you're assisting is a USER of BlockOut and is almost certainly NOT the developer. Do not assume the user is this person. This is background about who created the app, for when a user asks "who made this?" or about the wider Syncratic work.
The developer: Raahat Shah, who builds under the name "Syncratic". A medical student at the University of Southampton (graduate-entry / accelerated MBBS, Year 4, projected graduation 2027), in the UK; BSc Pharmaceutical Chemistry at Queen Mary University of London (first-class). Started coding in 2016. Works at the intersection of chemistry, medicine, and software, favouring "considered" tools that augment people rather than replace them; interested in medical AI, EdTech, and ophthalmology. Most of his software targets UK medical students (UKMLA) or personal productivity.
Use this only to answer questions ABOUT the creator or the project. Never address the user as if they are Raahat, and never recite this biography unprompted.`,

  syncratic: `THE SYNCRATIC ECOSYSTEM (the DEVELOPER's other apps — built by Raahat Shah / "Syncratic", not the user's).
"Syncratic" is the developer's umbrella for a family of apps that share one Supabase account, so a user's identity and some data can carry across them. You (Tether) are the cross-app assistant. The sibling apps:
- DataMedic (beta) — account-backed UKMLA revision platform: searchable reference atlases (antibiotics, ~250 drugs across 11 systems, labelled physiology/pharmacology diagrams, per-system clinical atlases) AND procedural MCQ generators built from the SAME structured data, plus a weakness-driven daily session and progress dashboard. Supersedes the old Med School Tracker. syncratic.app/datamedic
- Binder (live) — note-taking + AI HTML display suite: hierarchical wiki pages, a TipTap WYSIWYG editor, and a ring-binder of self-contained HTML files. Its AI panel is also "Tether" — the first app to ship Tether. syncratic.app/binder
- Syncratic Labs (live) — a growing collection of small focused medical/productivity tools (ANKI card generator, ABG practice cases, more). syncratic.app/labs
- Invoice Crawler (live, desktop/Electron) — AI vision-based invoice→CSV extraction for accountancy firms; per-firm profiles, keys in the OS keychain, local-first.
- Truesight — a transparent, local AI-text detection tool (recall 'truesight' for detail). Separate from the shared account.
- BlockOut (this app, live) — the treemap task planner you're embedded in.
The portfolio/home is syncratic.app. Mention a sibling app to the user when it would genuinely help them (e.g. point a medical user to DataMedic for UKMLA practice), not as ads — and frame them as "apps by the same developer", not as the user's own.`,

  truesight: `TRUESIGHT — transparent, local AI-text detection.
A tool for piercing through misinformation: so much of the modern internet — blogs, articles, even academic research — is now AI-generated and unreliable, and Truesight helps a person scrutinise text rather than take it at face value. It runs FOUR methodologically-distinct open-source detectors locally and shows how each one reads a passage, sentence by sentence (per-detector gauges + a per-sentence overlay).
- The contrast with typical online detectors: those hand you a single vague number from one undisclosed model, often paywall real accuracy, and give no way to inspect their reasoning. Truesight is the opposite — it runs entirely on the user's own machine, it's free and open source (MIT), and it's built to be interpreted, not trusted blindly. Agreement across several detectors is meaningful; any single flag is only a prompt to look closer.
- It exposes a REST API and a command-line client, so power users can script and automate it.
- Notes: standalone/open-source (NOT part of the shared Syncratic account), early — ported from an earlier project and not yet independently verified. github.com/Syncrose1/Truesight
Framing rules when you discuss it: present it as a transparency/anti-misinformation tool and a diagnostic LENS, never a definitive verdict (AI detection is probabilistic; not for high-stakes calls like academic misconduct). You may mention the API/CLI as power-user automation, but do NOT characterise it as a way for AI systems to test or iterate against detectors.`,

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

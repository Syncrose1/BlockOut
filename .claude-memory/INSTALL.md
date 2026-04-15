# Claude Memory — Installation Instructions

These files are Claude Code's persistent memory for the BlockOut/Synamon project. They allow Claude to remember design decisions, feedback, and project context across conversations.

## What this is

Claude Code stores memory in a per-project directory on the local machine. These files were exported from:
```
~/.claude/projects/-home-raahats-BlockOut/memory/
```

On the recipient machine, they need to go in the equivalent path, which is derived from the absolute path of the repo on that machine.

## How to install

### Step 1 — Find your repo's absolute path
```bash
cd /path/to/BlockOut
pwd
# e.g. /home/youruser/BlockOut
```

### Step 2 — Derive the memory directory path
Claude converts the repo path to a directory name by replacing `/` with `-`. So:
- Repo at `/home/youruser/BlockOut` → memory at `~/.claude/projects/-home-youruser-BlockOut/memory/`
- Repo at `/Users/youruser/BlockOut` → memory at `~/.claude/projects/-Users-youruser-BlockOut/memory/`

### Step 3 — Create the directory and copy files
```bash
# Replace the path below with your actual derived path
MEMORY_DIR="$HOME/.claude/projects/-home-youruser-BlockOut/memory"

mkdir -p "$MEMORY_DIR"
cp /path/to/BlockOut/.claude-memory/*.md "$MEMORY_DIR/"
```

### Step 4 — Verify
```bash
ls "$MEMORY_DIR"
# Should show: MEMORY.md, project_synamon_*.md, feedback_animations.md, reference_pixellab.md
```

### Step 5 — Tell Claude
On your first message in the new session, say something like:
> "I've installed the memory files from the repo. Please read your memory and pick up where we left off."

Claude will read `MEMORY.md` (the index) and load context from the individual files.

---

## File index

| File | Type | Contents |
|---|---|---|
| `MEMORY.md` | Index | Master index — Claude reads this first |
| `project_synamon_firstgen.md` | Project | 31-species roster, type system, evo levels, region |
| `project_synamon_type_system.md` | Project | 14-type system, Arcanus/Spiritus split, type distribution |
| `project_synamon_personalities.md` | Project | All 31 personality archetypes + tamagotchi behaviour notes |
| `project_synamon_battle_system.md` | Project | BST targets, damage formula, speed model, move pools, sig moves, FX list |
| `project_synamon_constitutions.md` | Project | 16 constitution presets with stat modifiers |
| `project_synamon_sprites.md` | Project | Sprite generation notes, style decisions, species renames |
| `project_synamon_tamagotchi.md` | Project | Tamagotchi animation types, MVP set, BlockOut integration, legendary notes |
| `feedback_animations.md` | Feedback | Animation generation rules (no blinking, Umbra face-lock, etc.) |
| `reference_pixellab.md` | Reference | PixelLab API key and MCP server config |

---

## Note on staleness

These files were exported at a point in time. If you've made changes on the original machine since exporting, the memory may be slightly out of date. Cross-reference with `SYNAMON.md` in the repo root for the most current design state.

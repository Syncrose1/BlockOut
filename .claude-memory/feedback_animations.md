---
name: Animation Generation Feedback
description: Rules for Synamon idle/attack animation quality from Phase 3 Batch 1 review
type: feedback
---

No blinking in idle animations — eyes should never close. Blinking at a fixed 7-frame interval looks too unnatural and robotic.

**Why:** First batch review. Eye blinks every cycle feel mechanical and cheap.

**How to apply:** Add "eyes stay open, no blinking" to the idle action prompt. If a species has indistinct anatomy (e.g. Murkling), add "face does not change, [specific feature] stays [state]".

---

Idle animations should have minimal movement — subtle breathing or weight shift only. Too much bobbing/bouncing is bad.

**Why:** Cindrel stage1/2 bobbed too much. Pyrathon stage3 was cited as "perfect" — use it as the quality benchmark.

**How to apply:** Prompt should say "very subtle" or "minimal movement". Reference: Pyrathon idle = good. Cindrel/Scaldrix idle = too much movement.

---

Attack animations must be visually distinct from idle — they must show a clear offensive action.

**Why:** Pyrathon's attack was identical to its idle. User flagged immediately.

**How to apply:** Attack prompt should be more specific to the species type (e.g. fire lunge, water spin). If a result looks like idle, regenerate with a more aggressive/directional action.

---

For Umbra/shadow-type species with ambiguous anatomy (e.g. Murkling), add explicit face-lock instructions.

**Why:** Murkling's face deformed in idle because the generator doesn't understand its shadow anatomy.

**How to apply:** Prompt additions: "eyes stay open as two white dots, mouth stays closed, face does not change, only body sways slightly".

---

Small or low-detail sprites produce poor animations. Fix the base sprite first, then animate.

**Why:** Brezzet stage2 (Galekin) and stage3 (Stormveil) were too small/lacking detail — animations would inherit those flaws.

**How to apply:** Before animating a species, visually check the base sprite is large enough and detailed enough. Regenerate if needed, then animate.

/**
 * Synamon animation generation script
 * Generates idle and attack animations for all species using animate-with-text-v3 API.
 *
 * Usage:
 *   npx tsx scripts/generate-animations.ts
 *   npx tsx scripts/generate-animations.ts --resume         (skip already generated)
 *   npx tsx scripts/generate-animations.ts --species cindrel
 *   npx tsx scripts/generate-animations.ts --anim idle      (only idle)
 *   npx tsx scripts/generate-animations.ts --anim attack    (only attack)
 *   npx tsx scripts/generate-animations.ts --stage 1        (only stage 1 of each species)
 */

import * as fs from 'fs';
import * as path from 'path';

const API_KEY = 'f82b0da8-5d5f-45b3-a9c3-3bb53d725cea';
const API_BASE = 'https://api.pixellab.ai/v2';
const SPECIES_FILE = path.resolve('public/synamon/species.json');
const OUT_DIR = path.resolve('public/synamon');
const STATE_FILE = path.resolve('public/synamon/animation-state.json');

const FRAME_COUNT_DEFAULT = 6;   // frames for idle/attack
const FRAME_COUNT_LONG    = 16;  // frames for focused/celebrating and other expressive anims
const BATCH_SIZE = 2;            // concurrent background jobs (API limit is 8, but jobs linger after completion so keep low)

// Per-animation frame counts (overrides FRAME_COUNT_DEFAULT)
const ANIM_FRAME_COUNTS: Record<string, number> = {
  idle:        6,
  attack:      6,
  focused:     16,
  celebrating: 16,
  happy:       10,
  feed:        10,
  pet:         10,
  sleep:       16,
  play:        12,
  excited:     12,
  sad:         10,
  hungry:      10,
  sick:        10,
  levelup:     12,
};

// Tamagotchi animations only apply to stage 1 (base form).
// Any anim listed here will be skipped for stage 2+.
const TAMAGOTCHI_ANIMS = new Set([
  'focused', 'celebrating', 'happy', 'excited',
  'feed', 'pet', 'play', 'sleep',
  'sad', 'hungry', 'sick', 'levelup',
]);

// Base animation prompts — applied to all species unless overridden below
const ANIM_PROMPTS: Record<string, string> = {
  idle:        'very subtle breathing idle, minimal movement, tiny weight shift, eyes stay open no blinking, mouth stays closed',
  attack:      'attack animation, quick decisive strike or lunge forward, clearly different from idle, return to stance',
  focused:     'calm attentive pose, settle into stillness, eyes forward and alert, slight forward lean, breathing slows, clearly engaged with a task, purposeful and different from idle',
  celebrating: 'burst of joyful energy, jump or spin or shake with excitement, celebratory reaction, clearly triumphant, high energy contrast to idle, return to upright',
  happy:       'happy looping idle, cheerful gentle bounce, bright upbeat energy, smooth seamless loop',
  excited:     'excited looping idle, high energy, can barely keep still, bouncy and fast, smooth seamless loop',
  sad:         'sad looping idle, slumped posture, slow droopy movement, dejected weight, smooth seamless loop',
  sleep:       'sleeping loop, curled up resting, slow rhythmic breathing rise and fall, peaceful and still, smooth seamless loop',
  sick:        'sick looping idle, shivering hunched posture, weak and unsteady, slight wobble, smooth seamless loop',
  feed:        'eating animation, happy nibbling and chewing, gulping down food',
  pet:         'being petted reaction, pleased wiggle, leans into touch, content',
  play:        'playful bouncing animation, energetic and fun, chasing or spinning',
  hungry:      'hungry looping idle, droopy and listless, occasional stomach clutch or longing look, wanting food, smooth seamless loop',
};

// Per-species prompt overrides: speciesId → { idle?, attack?, focused?, celebrating?, ... }
// Use these when the default prompts produce bad results for a specific species
const SPECIES_OVERRIDES: Record<string, Partial<Record<string, string>>> = {
  cindrel: {
    idle:        'very subtle breathing, tiny belly and tail rise and fall, minimal movement, mouth stays closed',
    attack:      'quick bite lunge forward with open mouth, eyes stay round and open, return to stance, clearly aggressive action',
    focused:     'settles reluctantly into stillness, tail tip flickers with restrained energy, eyes lock forward intensely, slight crouch like coiled spring, clearly holding back',
    celebrating: 'happy celebratory bounce, joyful energy',
    happy:       'restless happy loop, tail swishing, shifting weight eagerly, feisty energy, smooth loop',
    excited:     'bouncing aggressively with excitement, tail flaring, barely contained fiery energy, smooth loop',
    sad:         'tail droops, body hunches low, angry-sad smolder, restless but defeated, smooth loop',
    sleep:       'curled up tight with tail wrapped around body, ember glow dimmed, slow breathing, smooth loop',
    sick:        'shivering with dimmed scales, hunched and sluggish, ember flickers weakly, smooth loop',
    feed:        'eager chomping, bites at food aggressively, happy gulping',
    pet:         'reluctant lean into touch, tries to look tough but clearly enjoys it',
    hungry:      'restless pacing, ember glow flickering with impatience, tail lashing, demanding food, smooth loop',
    play:        'pounces at something, feisty wrestling, scrappy and competitive',
  },
  aquill: {
    focused:     'sinks into a calm resting pose, flippers tucked, collar frill slows its pulse, eyes soft and forward, breathing visibly slows, peaceful and content',
    celebrating: 'wiggles whole body with delight, flippers clap together, collar frill flashes bright, bounces in place with joy',
    happy:       'gentle swaying with bright eyes, collar frill pulsing softly, content and relaxed, smooth loop',
    excited:     'flippers flapping rapidly, whole body wiggling, collar frill flashing, smooth loop',
    sad:         'collar frill drooped and dim, head lowered, slow gentle sway, smooth loop',
    sleep:       'nestled down with flippers tucked, collar frill dim, peaceful slow breathing, smooth loop',
    sick:        'droopy collar frill, shivering slightly, huddled posture, smooth loop',
    feed:        'happy nibbling with flippers tucked, gentle satisfied gulps',
    pet:         'leans into touch with whole body, collar frill brightens, happy wiggle',
    hungry:      'collar frill dim and droopy, nuzzling around searching for food, gentle pleading eyes, smooth loop',
    play:        'splashing and rolling, flippers flapping playfully, affectionate bumping',
  },
  brezzet: {
    focused:     'ears rotate forward and lock, body stills mid-fidget, eyes widen with sudden attention, tail wraps around body, poised and alert',
    celebrating: 'ears spin like propellers, leaps into the air, twirls, lands with a happy yip, tail wagging wildly',
    happy:       'ears twitching curiously, light bouncy movement, easily distracted energy, smooth loop',
    excited:     'ears spinning, body bouncing rapidly, tail wagging wildly, can barely hold still, smooth loop',
    sad:         'ears flat and droopy, tail limp, slow distracted shifting, smooth loop',
    sleep:       'curled up with ears folded down, tail over nose, light twitchy sleep, smooth loop',
    sick:        'ears drooping, body swaying unsteadily, sluggish movement, smooth loop',
    feed:        'quick distracted nibbles, looks around between bites, curious eating',
    pet:         'ears perk up and rotate toward touch, happy chirp, leans in briefly then gets distracted',
    hungry:      'ears rotating searching for food, sniffing around distractedly, fidgety and unfocused, smooth loop',
    play:        'chases own tail, ears spinning, gets distracted mid-game by something else',
  },
  glowick: {
    focused:     'abdomen glow steadies to a calm constant pulse, antennae lower gently, body settles close to ground, eyes half-close in peaceful concentration',
    celebrating: 'abdomen flares bright, hops in small excited circles, antennae wave rapidly, glow pulses in happy bursts',
    happy:       'gentle steady glow, body settled low, antennae swaying peacefully, calm contentment, smooth loop',
    excited:     'abdomen pulsing brightly, small hops, antennae waving, shy but happy energy, smooth loop',
    sad:         'glow very dim, body pressed close to ground, antennae drooped, withdrawn, smooth loop',
    sleep:       'body flat on ground, glow faded to a faint pulse, antennae resting, peaceful, smooth loop',
    sick:        'glow flickering unevenly, body low and still, antennae limp, smooth loop',
    feed:        'cautious tiny nibbles, glow brightens slightly with each bite',
    pet:         'glow warms slightly, body stays still but antennae curl inward contentedly',
    hungry:      'glow very faint, body low and still, antennae drooping toward ground, shy longing, smooth loop',
    play:        'cautious tiny hops, glow flickering shyly, peeks out then retreats',
  },
  murkling: {
    idle:        'very subtle body sway, eyes stay open as two white dots, mouth stays closed, face does not change, shadow wisps shift slightly',
    attack:      'quick lunge forward, eyes stay open as two white dots, face does not change, shadow wisps flare out, return to stance',
    focused:     'shadow wisps settle and still, eyes stay open as two white dots, body becomes slightly more defined and solid, eerie calm, face does not change',
    celebrating: 'shadow wisps explode outward in all directions, body flickers and reforms, eyes stay open as two white dots, unsettling joyful shimmer',
    happy:       'shadow wisps swirl playfully, body sways with mischievous energy, eyes as two white dots, smooth loop',
    excited:     'shadow form flickering rapidly, wisps spiraling outward, chaotic mischievous energy, eyes as two white dots, smooth loop',
    sad:         'shadow wisps hang limp and still, body barely visible, eyes dim, smooth loop',
    sleep:       'shadow form condensed into a small dark ball, wisps still, faint slow pulse, smooth loop',
    sick:        'shadow form unstable and flickering, wisps sputtering, body losing definition, eyes as two white dots, smooth loop',
    feed:        'shadow wisps pull food inward, body absorbs it with a satisfied pulse, eyes as two white dots',
    pet:         'shadow wisps curl toward the touch point, body shivers once then ignores it, eyes as two white dots',
    hungry:      'shadow wisps reaching outward searching, body flickering with cryptic need, eyes as two white dots, smooth loop',
    play:        'shadow form darts around mischievously, wisps grabbing at things, eyes as two white dots, cryptic game',
  },
  peblix: {
    focused:     'curls slightly inward, shell plates shift to a locked position, eyes half-close, body becomes very still and heavy, rock-solid concentration',
    celebrating: 'uncurls with a thud, stamps feet twice, shell plates clatter open briefly, shakes head with slow satisfaction',
    happy:       'slow steady rocking, shell plates slightly loose, stubborn contentment, smooth loop',
    excited:     'stamps feet in place, shell plates rattling, rare burst of enthusiasm, smooth loop',
    sad:         'completely still and withdrawn, shell plates sealed tight, heavy and immovable, smooth loop',
    sleep:       'tucked into shell like a boulder, barely visible breathing, extremely still, smooth loop',
    sick:        'shell plates slightly ajar, body listing to one side, sluggish, smooth loop',
    feed:        'slow deliberate crunching, unhurried methodical eating, stubborn satisfaction',
    pet:         'ignores touch at first, then very slowly leans in, grudging acceptance',
    hungry:      'shell plates slightly open, body rocking stubbornly in place, refusing to beg but clearly wanting food, smooth loop',
    play:        'slow headbutt, rolls forward stubbornly, steady determined bumping',
  },
  humtick: {
    focused:     'wing-cases clamp shut mid-vibration, antennae point straight forward, body freezes except for tiny leg taps, buzzing quiets to near-silence',
    celebrating: 'wing-cases blast open, body vibrates intensely, shoots upward briefly, lands with a triumphant chirp-buzz',
    happy:       'wing-cases buzzing rhythmically, antennae bobbing, chatty vibrating energy, smooth loop',
    excited:     'wing-cases wide open vibrating intensely, whole body buzzing, hyperactive, smooth loop',
    sad:         'wing-cases shut, antennae drooping, quiet and still for once, smooth loop',
    sleep:       'wing-cases folded shut, antennae curled, tiny intermittent buzz in sleep, smooth loop',
    sick:        'wing-cases half-open and weak, buzzing irregular and sputtering, smooth loop',
    feed:        'frantic excited eating, buzzing loudly between bites',
    pet:         'buzzes louder with delight, antennae wave happily, leans into every touch',
    hungry:      'wing-cases buzzing erratically, antennae drooping, hyper fidgeting wanting food, smooth loop',
    play:        'wing-cases vibrating wildly, zooming around chattering, bumping into things mid-game',
  },
  crystub: {
    focused:     'gem-eyes focus to a single bright point, quartz shards on back settle, sits very still with paws together, soft steady inner glow',
    celebrating: 'happy bounce, joyful sparkling celebration',
    happy:       'gentle sparkling, soft inner glow pulsing warmly, trusting calm energy, smooth loop',
    excited:     'quartz shards shimmering rapidly, bouncing with bright-eyed joy, smooth loop',
    sad:         'inner glow dim and dull, body hunched, gem-eyes downcast, gentle weeping energy, smooth loop',
    sleep:       'curled up with paws together, quartz shards dim, soft faint pulse of inner light, smooth loop',
    sick:        'inner glow flickering unevenly, body shivering, quartz shards dull, smooth loop',
    feed:        'gentle careful nibbles, glow brightens with each bite, trusting',
    pet:         'immediately leans in, glow brightens warmly, nuzzles into touch',
    hungry:      'inner glow dim and fading, quartz shards dull, gentle trusting eyes looking up hopefully, smooth loop',
    play:        'gentle bouncing, quartz shards sparkling, nuzzles a toy trustingly',
  },
  cloakrit: {
    focused:     'carapace seals flat, claws fold in, body goes preternaturally still and dark, only the tiny eyes visible, ambush-ready concentration',
    celebrating: 'claws spread wide, carapace briefly pulses visible, does a small sideways victory shuffle, returns to dark stillness with satisfied pause',
    happy:       'subtle carapace pulse, claws relaxed, quiet secretive contentment, smooth loop',
    excited:     'claws flexing open and closed, carapace flashing briefly, rare visible energy, smooth loop',
    sad:         'fully hidden under carapace, tiny eyes barely visible, completely withdrawn, smooth loop',
    sleep:       'carapace sealed flat, completely dark and still, ambush-sleep, smooth loop',
    sick:        'carapace slightly ajar, body shaking underneath, vulnerable and defensive, smooth loop',
    feed:        'claws pull food under carapace, eats hidden, occasional satisfied click',
    pet:         'freezes at touch, then one tiny claw reaches out briefly before retreating',
    hungry:      'carapace cracked slightly open, claws reaching out searching, defensive but needy, smooth loop',
    play:        'claws dart out to grab something, pulls it under carapace, secretive hoarding game',
  },
  ashpaw: {
    focused:     'drops into a low aggressive crouch, pawpads glow brighter, eyes narrow, ember glow steadies, restrained power, clearly ready',
    celebrating: 'rears up on hind legs, slams paws down releasing ember burst, roars with mouth open, stands tall and proud',
    happy:       'prowling proudly, pawpads glowing warm, confident swagger, smooth loop',
    excited:     'pawpads flaring bright, aggressive bouncing, wants to fight something, smooth loop',
    sad:         'ember glow dimmed, lying down with head on paws, sulking angry energy, smooth loop',
    sleep:       'curled tight with glowing pawpads fading, embers low, fierce even in sleep, smooth loop',
    sick:        'embers barely glowing, body low and shaking, weakened but defiant, smooth loop',
    feed:        'aggressive tearing bites, eats fast and possessively',
    pet:         'growls softly but leans into it, pawpads glow warmer, reluctant enjoyment',
    hungry:      'pawpads flaring hot, pacing aggressively, snarling at empty ground, demanding food, smooth loop',
    play:        'charges forward with a tackle, paws swiping, aggressive roughhousing',
  },
  driftull: {
    focused:     'sinks lower, eyes droop to a warm half-close, steam venting slows to a gentle wisp, body settles like a warm stone, deeply comfortable',
    celebrating: 'releases a big happy steam blast, body jiggles with laughter, rolls slightly side to side, settles back with a contented exhale',
    happy:       'warm gentle steam wisps, body slowly swaying, deeply content lazy energy, smooth loop',
    excited:     'bigger steam puffs, body rolling side to side, warm lazy excitement, smooth loop',
    sad:         'steam stops, body sinks very low, eyes half-closed, cold and heavy, smooth loop',
    sleep:       'completely settled, warm steam rising gently, like a hot rock, perfectly still, smooth loop',
    sick:        'steam cold and thin, body shivering despite warmth, uncomfortable, smooth loop',
    feed:        'slow lazy munching, steam puffs happily between bites, warm and content',
    pet:         'sinks lower with pleasure, warm steam rises, eyes close contentedly',
    hungry:      'steam thinning, body sinking low, eyes half-open, too lazy to complain but clearly wanting food, smooth loop',
    play:        'lazy slow roll, halfhearted batting at a toy, warm content nudging',
  },
  buzzlit: {
    focused:     'wings slow to a hover-still, body drops into a focused crouch, big eyes zoom forward, antennae lock on target, vibrating with contained energy',
    celebrating: 'wings blast to full speed, shoots upward in a loop, crashes back down in a happy tumble, gets back up wiggling',
    happy:       'wings buzzing unevenly, bumbling around cheerfully, clumsy happy energy, smooth loop',
    excited:     'wings at full speed, zooming erratically, crashing into things, chaotic joy, smooth loop',
    sad:         'wings barely moving, drooping low, big sad eyes, clumsy even in sadness, smooth loop',
    sleep:       'crash-landed on side, wings folded awkwardly, buzzing softly in sleep, smooth loop',
    sick:        'wings sputtering, listing to one side, trying to fly but failing, smooth loop',
    feed:        'dive-bombs food enthusiastically, messy eager eating',
    pet:         'bumps into hand clumsily, buzzes louder with delight, wobbles happily',
    hungry:      'wings buzzing weakly, drooping low, bumping into ground looking for food, clumsy desperation, smooth loop',
    play:        'zooms around crashing into things, tumbles and gets back up, clumsy energetic chase',
  },
  galecub: {
    focused:     'windsock tail wraps around body to stop it blowing, nostrils flare and lock forward, body drops low, focused pounce stance, barely contained',
    celebrating: 'excited happy jump, playful celebratory energy',
    happy:       'light prancing, tail streaming, playful wind energy, can barely stay still, smooth loop',
    excited:     'full zoomies, dashing back and forth, tail whipping, wild energy, smooth loop',
    sad:         'tail limp and dragging, body low, no wind energy, deflated, smooth loop',
    sleep:       'curled up with tail wrapped around, twitching in sleep, dreaming of running, smooth loop',
    sick:        'wobbly on legs, tail hanging, weak gusts, unsteady, smooth loop',
    feed:        'eats quickly between bursts of movement, can barely sit still to eat',
    pet:         'bounces into touch, nuzzles briefly then zooms away, comes back for more',
    hungry:      'tail drooping, prancing in circles, whimpering with impatient energy, smooth loop',
    play:        'dashes around at top speed, chasing something invisible, playful pounce and tumble',
  },
  sporik: {
    focused:     'cap lowers slightly, body sinks into an even deeper stillness, eyes close fully, spore release pauses entirely, meditative absorption',
    celebrating: 'releases a slow gentle puff of celebratory spores, sways once left then right, eyes open briefly with warm satisfaction, resettles',
    happy:       'very slow gentle sway, occasional tiny spore drift, deep calm contentment, smooth loop',
    excited:     'slightly faster sway, more spores drifting, calm excitement, smooth loop',
    sad:         'completely still, cap lowered, no spores, meditative withdrawal, smooth loop',
    sleep:       'rooted in place, cap fully lowered, deep ancient stillness, barely perceptible breathing, smooth loop',
    sick:        'cap wilting slightly, body listing, spores discolored, smooth loop',
    feed:        'absorbs food slowly through roots, cap lifts slightly with satisfaction',
    pet:         'barely reacts, one slow spore puff of acknowledgment',
    hungry:      'cap lowered and wilting, body sinking very slowly, philosophical acceptance of emptiness, smooth loop',
    play:        'a single slow deliberate lean, one spore puff, the most minimal play possible',
  },
  spectrix: {
    focused:     'crystal body brightens to a steady clear light, legs lock delicately in place, internal geometry slows to a calm rhythm, eyes forward and luminous',
    celebrating: 'internal crystal structure flashes in a cascade of light, prances lightly in a small joyful circle, chimes softly, stills with a warm glow',
    happy:       'prism light dancing inside crystal body, delicate graceful swaying, ethereal joy, smooth loop',
    excited:     'light cascading rapidly through crystal, delicate prancing, bright ethereal energy, smooth loop',
    sad:         'crystal dimmed almost opaque, body very still, fragile and fading, smooth loop',
    sleep:       'crystal softly glowing with slow internal light rotation, delicate stillness, smooth loop',
    sick:        'crystal flickering and cracking visually, light sputtering, fragile distress, smooth loop',
    feed:        'absorbs light from food, crystal brightens delicately with each morsel',
    pet:         'crystal chimes faintly at touch, body sways toward hand, luminous warmth',
    hungry:      'crystal nearly opaque, light fading, delicate fragile swaying, ethereal longing, smooth loop',
    play:        'delicate prancing, light refracting in gentle arcs, graceful spinning',
  },
  flintlet: {
    focused:     'scales click once and then go silent, body presses low to the surface, eyes narrow and lock, tail stills, scrappy readiness',
    celebrating: 'proud happy stomp, scrappy celebratory energy',
    happy:       'scales clicking rhythmically, scrappy confident strut, independent energy, smooth loop',
    excited:     'scales rattling fast, stomping and posturing, scrappy aggression turned to joy, smooth loop',
    sad:         'scales quiet and flat, body low, tail still, withdrawn independence, smooth loop',
    sleep:       'coiled up tight, scales locked, tough even in sleep, smooth loop',
    sick:        'scales dull and loose, body hunched, shivering, trying to tough it out, smooth loop',
    feed:        'snaps at food quickly, independent efficient eating',
    pet:         'holds still with quiet dignity, scales warm slightly, earned loyalty',
    hungry:      'scales clicking impatiently, scrappy restless pacing, independent but clearly needing food, smooth loop',
    play:        'scrappy wrestling, tackles and rolls, independent rough-and-tumble',
  },
  glintfin: {
    focused:     'glides to a graceful near-stop, fins arrange perfectly, iridescent underside dims to an elegant steady sheen, composed and regal',
    celebrating: 'iridescent underside flashes full spectrum, performs a graceful celebratory spin, fins spread wide, settles back with satisfied elegance',
    happy:       'graceful gliding, iridescent shimmer, vain elegant preening energy, smooth loop',
    excited:     'fins fully spread, iridescent display, graceful spiraling, beautiful showing off, smooth loop',
    sad:         'fins tucked, iridescence faded, dull and withdrawn, hates looking bad, smooth loop',
    sleep:       'fins folded elegantly, soft iridescent shimmer, poised even in sleep, smooth loop',
    sick:        'fins drooping, iridescence splotchy, deeply unhappy about appearance, smooth loop',
    feed:        'dainty precise bites, refuses to eat messily, elegant even while eating',
    pet:         'tilts to show best angle, fins spread for grooming, vain pleasure',
    hungry:      'fins drooping, iridescence fading, gliding listlessly, vain distress at looking dull, smooth loop',
    play:        'graceful showing off, iridescent display spin, elegant posing for attention',
  },
  runekit: {
    focused:     'sigils on fur slow and converge toward chest, eyes glow steady, sits upright with deliberate stillness, one paw raised slightly, thinking',
    celebrating: 'sigils scatter and spin outward in a burst, leaps once with all paws, lands neatly, sigils reform in a satisfied pattern',
    happy:       'sigils drifting in calm patterns, sitting upright, intellectual contentment, smooth loop',
    excited:     'sigils swirling faster, paws tapping, engaged and stimulated, aloof excitement, smooth loop',
    sad:         'sigils dim and still, body curled, disengaged and bored, smooth loop',
    sleep:       'sigils glow faintly in slow rotation, curled up neatly, dreaming of puzzles, smooth loop',
    sick:        'sigils flickering erratically, body hunched, disrupted patterns, smooth loop',
    feed:        'inspects food carefully before eating, methodical deliberate bites',
    pet:         'tolerates touch briefly, then moves away, engages only on its terms',
    hungry:      'sigils dim and slow, sitting upright with aloof impatience, one paw tapping, smooth loop',
    play:        'paw batting at something analytically, studying it more than playing, intellectual curiosity',
  },
  windmite: {
    focused:     'sail-fin folds flat, rolls into a partial ball, locks still, very slow measured breathing, patient and immovable',
    celebrating: 'sail-fin snaps open to full extension, rolls in a quick happy circle, unfurls completely and stands tall',
    happy:       'sail-fin gently extended, slow patient rocking, stoic quiet contentment, smooth loop',
    excited:     'sail-fin fully open, rolling slowly with rare enthusiasm, steady loyal energy, smooth loop',
    sad:         'sail-fin folded tight, rolled into partial ball, withdrawn and still, smooth loop',
    sleep:       'fully rolled into armored ball, sail-fin tucked, slow breathing, smooth loop',
    sick:        'sail-fin limp, body slightly unrolled, weak and exposed, smooth loop',
    feed:        'slow methodical eating, patient and unhurried',
    pet:         'holds very still, sail-fin relaxes slightly, quiet loyalty',
    hungry:      'sail-fin half-folded, body very still, patient stoic waiting, enduring without complaint, smooth loop',
    play:        'slow steady rolling back and forth, sail-fin catching air, patient calm game',
  },
  duskrat: {
    focused:     'big ears rotate forward and flatten slightly, body freezes mid-tremble, eyes wide and locked forward, shadow-fur steadies, anxious focus',
    celebrating: 'ears flap rapidly in excitement, hops three times in place, spins once, squeaks and stills with wide happy eyes',
    happy:       'ears up and twitching, body still slightly trembling, nervous but content, smooth loop',
    excited:     'ears flapping, hopping in place, nervous excitement, jittery joy, smooth loop',
    sad:         'ears flat, body hunched and trembling, eyes darting, anxious sadness, smooth loop',
    sleep:       'curled up tight in a corner, ears folded, fitful trembling sleep, smooth loop',
    sick:        'ears drooping, body shaking more than usual, wide frightened eyes, smooth loop',
    feed:        'quick nervous bites, ears swiveling for threats between mouthfuls',
    pet:         'startles at first touch, then freezes and slowly relaxes, needs calm steady contact',
    hungry:      'ears flat, body trembling, darting eyes searching anxiously for food, nervous pacing, smooth loop',
    play:        'skittish dash forward, freezes, peeks at toy, cautious nervous batting',
  },
  bassolt: {
    focused:     'chest cavity dims its resonance, body goes very still, eyes close to a grumpy squint, clearly concentrating but refuses to look enthusiastic',
    celebrating: 'delivers one enormous satisfied belly thump, the shockwave visible around it, grunts in approval, crosses arms with a gruff nod',
    happy:       'gruff slow rocking, arms crossed, refusing to look happy but clearly content, smooth loop',
    excited:     'thumping chest reluctantly, grumpy enthusiasm, can barely admit excitement, smooth loop',
    sad:         'hunched and grumbling, arms crossed tight, angry at being sad, smooth loop',
    sleep:       'slumped with arms still crossed, loud heavy breathing, grumpy even in sleep, smooth loop',
    sick:        'hunched and miserable, grumbling, hates being weak, smooth loop',
    feed:        'eats grumpily but obviously enjoys it, gruff satisfied grunts',
    pet:         'grumbles and turns away but secretly leans in, pretends to hate it',
    hungry:      'chest resonating low, arms crossed, grumpy impatient rocking, refuses to ask but clearly starving, smooth loop',
    play:        'one reluctant belly thump, gruff headbutt, pretends not to enjoy it',
  },
  glassling: {
    focused:     'drifting slows to a near-stop, tentacles arrange gently downward, body dims to a soft even glow, dreamily absorbed, perfectly calm',
    celebrating: 'tentacles spread wide and ripple with light, drifts upward slightly, glows brightly for a sustained moment, settles back softly',
    happy:       'drifting gently, tentacles trailing peacefully, soft warm glow, dreamy serenity, smooth loop',
    excited:     'drifting slightly higher, tentacles rippling with light, gentle dreamy excitement, smooth loop',
    sad:         'sinking low, tentacles hanging limp, glow very faint, drifting aimlessly, smooth loop',
    sleep:       'floating still, tentacles curled inward, soft pulsing glow, peaceful drift, smooth loop',
    sick:        'listing to one side, glow sputtering, tentacles tangled, disoriented, smooth loop',
    feed:        'tentacles gently wrap around food, absorbs with a soft brightening glow',
    pet:         'drifts toward touch, tentacles curl gently around hand, warm glow',
    hungry:      'drifting low, glow fading, tentacles reaching gently downward, dreamy longing, smooth loop',
    play:        'tentacles trailing through air, gentle drifting circles, dreamy floating game',
  },
  tidepup: {
    idle:        'gentle breathing, body rises and falls softly, resting pose',
    attack:      'quick lunge forward, return to stance',
    focused:     'brine crust settles, body stills in an eager locked pose, eyes wide and forward, stubby tail stops wagging, fully locked in',
    celebrating: 'tail wags furiously, whole back half wiggles, bounces forward and back, lets out a happy open-mouthed pant',
    happy:       'tail wagging steadily, bouncy eager energy, bright-eyed and ready, smooth loop',
    excited:     'whole body wiggling, tail a blur, bouncing around, pure puppy joy, smooth loop',
    sad:         'tail tucked, head lowered, sad puppy eyes, slow droopy movement, smooth loop',
    sleep:       'sprawled out flat, belly up, twitching in sleep, dreaming of the beach, smooth loop',
    sick:        'curled up small, shivering, sad whimpering energy, smooth loop',
    feed:        'gobbles food eagerly, tail wagging between bites, messy enthusiastic eating',
    pet:         'rolls over instantly, tail wagging, wiggles with pure delight',
    hungry:      'tail drooping, bouncing hopefully, big eager puppy eyes, whimpering for food, smooth loop',
    play:        'pounces on toy, shakes it around, tail wagging furiously, bouncy puppy energy',
  },
  fluxling: {
    idle:        'gentle breathing, body rises and falls softly, resting pose',
    attack:      'quick lunge forward, return to stance',
    focused:     'heat-shimmer aura briefly stabilises, erratic movements pause, eyes lock forward, one ear up one ear down, unpredictable stillness',
    celebrating: 'aura flares wildly, spins twice rapidly, bounces off the ground, lands in a random but delighted pose',
    happy:       'erratic shifting between poses, unpredictable but cheerful, aura flickering warmly, smooth loop',
    excited:     'rapid random movements, aura flaring, chaotic bursts of energy, smooth loop',
    sad:         'aura dampened, body switching between slumped poses, confused sadness, smooth loop',
    sleep:       'changes sleeping position randomly, aura sputtering in dreams, restless sleep, smooth loop',
    sick:        'aura unstable and cold, body twitching erratically, unwell chaos, smooth loop',
    feed:        'eats in random bursts, sometimes fast sometimes slow, unpredictable appetite',
    pet:         'reaction changes each time, sometimes leans in, sometimes pulls away, mood swing',
    hungry:      'aura sputtering cold, body twitching erratically, switching between begging and ignoring, smooth loop',
    play:        'unpredictable bursts of movement, changes direction randomly, chaotic erratic game',
  },
  lumenox: {
    focused:     'inner glow steadies to a warm constant light, body settles low, eyes close halfway, breathing slow and even, radiating calm focus',
    celebrating: 'inner glow surges bright, does a small happy wriggle, tail sweeps a full arc, glow pulses twice and settles warm',
    happy:       'warm bright steady glow, gentle swaying, radiating calm warmth, smooth loop',
    excited:     'glow pulsing brighter, gentle bouncing, warm steady excitement, smooth loop',
    sad:         'glow very dim, body low and still, light fading, smooth loop',
    sleep:       'body settled low, glow dimmed to a warm ember, slow breathing, peaceful, smooth loop',
    sick:        'glow flickering between warm and cold, body shivering, light unstable, smooth loop',
    feed:        'eats steadily, glow brightens with each bite, warm satisfaction',
    pet:         'glow warms and brightens, leans in gently, steady quiet pleasure',
    hungry:      'glow dimming slowly, body settled low, warm but fading, patient steady waiting, smooth loop',
    play:        'gentle steady nudging, glow pulsing warmly, calm reliable play',
  },
  scaldit: {
    idle:        'gentle breathing, body rises and falls softly, resting pose',
    attack:      'quick lunge forward, return to stance',
    focused:     'steam venting slows to a controlled trickle, body straightens with territorial pride, eyes narrow and lock, deliberate and self-assured',
    celebrating: 'releases a triumphant steam burst, stamps once, lifts head high with pride, settles back with territorial satisfaction',
    happy:       'proud posturing, steam venting steadily, territorial contentment, smooth loop',
    excited:     'bigger steam bursts, stamping proudly, territorial display of joy, smooth loop',
    sad:         'steam stopped, body lowered, pride wounded, sulking, smooth loop',
    sleep:       'body settled with steam venting slowly, proud posture even in sleep, smooth loop',
    sick:        'steam weak and sputtering, body hunched, pride broken by illness, smooth loop',
    feed:        'eats with territorial guarding posture, steam puffs between bites',
    pet:         'stiffens at touch, slowly relaxes as trust builds, steam settles',
    hungry:      'steam venting sharply, stamping in place, proud territorial demand for food, smooth loop',
    play:        'proud charging and stamping, territorial display turned to sport, steam bursts',
  },
  darkspore: {
    focused:     'spore release pauses entirely, shadow body becomes slightly more defined, drifts to a near-stop, watches with eerie quiet attention',
    celebrating: 'releases a cloud of dark celebratory spores, body bobs once, drifts in a slow happy spiral, resettles in eerie calm',
    happy:       'dark spores drifting lazily, body swaying in eerie contentment, independent, smooth loop',
    excited:     'spore cloud expanding, body bobbing, eerie alien excitement, smooth loop',
    sad:         'spores retracted, body compact and still, eerily quiet withdrawal, smooth loop',
    sleep:       'condensed into a dark cluster, spores still, dormant and eerie, smooth loop',
    sick:        'spores discolored and weak, body flickering, unstable, smooth loop',
    feed:        'absorbs food into shadow body, spores darken with satisfaction',
    pet:         'barely acknowledges touch, a single spore drifts toward hand and back',
    hungry:      'spores retracted tight, shadow body dimming, drifting in eerie searching circles, smooth loop',
    play:        'dark spore cloud expanding and contracting, body bobbing independently, eerie solitary game',
  },
  chuffin: {
    focused:     'ruffled feathers smooth down all at once, chest puffs out, beak points forward with purpose, performs a single dramatic focus pose',
    celebrating: 'feathers explode outward then settle, does a theatrical spin, bows, pops back up with a smug satisfied expression',
    happy:       'chest puffed out, strutting proudly, feathers ruffled with showmanship, smooth loop',
    excited:     'feathers fully fluffed, dramatic posing, theatrical excitement, performing for attention, smooth loop',
    sad:         'feathers deflated, chest sunken, dramatic pouting, overdoing the sadness, smooth loop',
    sleep:       'feathers puffed into a round ball, head tucked under wing, dramatic snoring, smooth loop',
    sick:        'feathers ruffled and messy, wobbling dramatically, milking the sympathy, smooth loop',
    feed:        'eats with theatrical gusto, performs gratitude after each bite',
    pet:         'puffs up with delight, poses for optimal petting angle, dramatic pleasure',
    hungry:      'feathers deflated, chest heaving with dramatic sighs, performing starvation, smooth loop',
    play:        'theatrical strutting and posing, dramatic feather display, performing for an audience',
  },
  tremlet: {
    focused:     'stone-plate horns lower slightly, body shrinks into a careful still crouch, eyes wide and gentle, breathing very quiet, delicate focus',
    celebrating: 'gentle shy happy hop, timid joyful reaction',
    happy:       'very gentle swaying, horns slightly raised, shy quiet contentment, smooth loop',
    excited:     'small timid hops, horns clinking gently, shy barely-contained joy, smooth loop',
    sad:         'body pressed to ground, horns lowered flat, trembling gently, meek sadness, smooth loop',
    sleep:       'curled up very small, horns tucked, gentle quiet breathing, vulnerable, smooth loop',
    sick:        'body shaking, horns drooping, looking up with wide scared eyes, smooth loop',
    feed:        'tiny careful bites, looks around nervously between mouthfuls',
    pet:         'flinches at first, then slowly leans in, eyes closing with trust',
    hungry:      'body pressed low, horns tucked, trembling gently, timid hopeful glances upward, smooth loop',
    play:        'shy tiny hops, horns clinking softly, gentle cautious batting at a toy',
  },
  omenix: {
    focused:     'becomes completely still, the half-lit half-dark face locks forward, presence feels heavier, neither side of the face changes expression, unsettling absolute attention',
    celebrating: 'a slow deliberate single nod, the moon-face shifts almost imperceptibly, a faint luminous ripple passes through the body, returns to stillness — regal acknowledgement',
    happy:       'imperceptibly slow sway, moon-face steady, composed ancient contentment, barely distinguishable from idle, smooth loop',
    excited:     'faint luminous ripple across body, very subtle shift in weight, regal composed interest, smooth loop',
    sad:         'presence feels heavier, moon-face unchanged, light side dims very slightly, smooth loop',
    sleep:       'standing perfectly still, moon-face half-dimmed, ancient meditative rest, smooth loop',
    sick:        'light and dark halves flickering out of sync, unsettling imbalance, smooth loop',
    feed:        'observes food, a faint ripple as it absorbs nourishment, barely any visible change',
    pet:         'no visible reaction, a faint warmth radiates, acknowledges through presence only',
    hungry:      'moon-face unchanged, presence slightly heavier, imperceptible dimming, aloof waiting, smooth loop',
    play:        'a single slow deliberate shift in weight, regal minimal acknowledgment of play',
  },
  lunveil: {
    focused:     'obsidian armour plates settle and lock, wings fold completely still, eyes open to full luminous slits, the dark side of the moon utterly present, vast quiet power',
    celebrating: 'a single slow wing extension to full span, held for a beat, then folds back, one low resonant exhale visible as a shimmer in the air — ancient satisfaction',
    happy:       'obsidian plates barely shifting, eyes slightly brighter, ancient quiet satisfaction, barely visible, smooth loop',
    excited:     'one wing shifts slightly, eyes glow fractionally brighter, the most subtle possible response, smooth loop',
    sad:         'obsidian plates sealed, eyes dimmed to slits, withdrawing into darkness, smooth loop',
    sleep:       'wings wrapped around body like a dark cocoon, eyes closed, ancient stillness, smooth loop',
    sick:        'obsidian plates rattling faintly, eyes flickering, ancient being showing vulnerability, smooth loop',
    feed:        'observes offering, absorbs with a shimmer of dark energy, no movement',
    pet:         'allows touch with supreme indifference, a single scale warms almost imperceptibly',
    hungry:      'obsidian plates still, eyes dimmed to faint slits, ancient patient indifference to hunger, smooth loop',
    play:        'one wing shifts almost imperceptibly, the barest acknowledgment of engagement, ancient tolerance',
  },
};

// --- CLI args ---
const args = process.argv.slice(2);
const resume   = args.includes('--resume');
const speciesArg = args.find(a => a.startsWith('--species='))?.split('=')[1] ??
                   (args.indexOf('--species') >= 0 ? args[args.indexOf('--species') + 1] : null);
const animArg  = args.find(a => a.startsWith('--anim='))?.split('=')[1] ??
                 (args.indexOf('--anim') >= 0 ? args[args.indexOf('--anim') + 1] : null);
const stageArg = args.find(a => a.startsWith('--stage='))?.split('=')[1] ??
                 (args.indexOf('--stage') >= 0 ? args[args.indexOf('--stage') + 1] : null);

// --- State ---
interface AnimJobState {
  jobId: string;
  speciesId: string;
  stageKey: string;
  animName: string;
  outDir: string;
  status: 'pending' | 'done' | 'failed';
  error?: string;
}

interface AnimState {
  done: number;
  failed: number;
  jobs: AnimJobState[];
}

function loadState(): AnimState {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return { done: 0, failed: 0, jobs: [] };
}

function saveState(state: AnimState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// --- Species JSON ---
function loadSpecies(): any[] {
  return JSON.parse(fs.readFileSync(SPECIES_FILE, 'utf8'));
}

function updateSpeciesJson(speciesId: string, stageKey: string, animName: string, framePaths: string[]) {
  const species = loadSpecies();
  const sp = species.find((s: any) => s.id === speciesId);
  if (!sp) return;
  const stageNum = parseInt(stageKey.replace('stage', ''));
  const stage = sp.stages.find((s: any) => s.stage === stageNum);
  if (!stage) return;

  // Store as web paths
  const webPaths = framePaths.map(p => p.replace(path.resolve('public'), '').replace(/\\/g, '/'));

  if (animName === 'idle')   stage.idleFrames   = webPaths;
  if (animName === 'attack') stage.attackFrames = webPaths;

  // Also update animations map on the species level
  if (!sp.animations) sp.animations = {};
  sp.animations[`${stageKey}-${animName}`] = webPaths;

  fs.writeFileSync(SPECIES_FILE, JSON.stringify(species, null, 2));
}

// --- HTTP helpers ---
async function apiFetch(endpoint: string, body: object): Promise<any> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${endpoint} failed ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiGet(endpoint: string): Promise<any> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`API GET ${endpoint} failed ${res.status}`);
  return res.json();
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function pollJob(jobId: string): Promise<any> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const result = await apiGet(`/background-jobs/${jobId}`);
    if (result.status === 'completed') return result;
    if (result.status === 'failed') throw new Error(`Job ${jobId} failed: ${result.error}`);
  }
  throw new Error(`Job ${jobId} timed out after 5 minutes`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// --- Core generation ---
// animate-with-text-v3 may return images directly OR a background_job_id to poll.
async function generateAnimation(spritePath: string, animName: string, outDir: string, speciesId?: string): Promise<string[]> {
  const spriteData = fs.readFileSync(spritePath);
  const base64 = spriteData.toString('base64');

  const prompt = (speciesId && SPECIES_OVERRIDES[speciesId]?.[animName])
    ?? ANIM_PROMPTS[animName];

  const frameCount = ANIM_FRAME_COUNTS[animName] ?? FRAME_COUNT_DEFAULT;

  const body = {
    first_frame: { type: 'base64', base64, format: 'png' },
    action: prompt,
    frame_count: frameCount,
    no_background: true,
  };

  let res = await apiFetch('/animate-with-text-v3', body);

  // If the API returns a background job, poll until complete
  if (res.background_job_id) {
    const jobResult = await pollJob(res.background_job_id);
    // Images may be in last_response.images or directly on the job result
    res = jobResult.last_response ?? jobResult;
  }

  const images: any[] = res.images ?? [];

  if (images.length === 0) throw new Error('No images in response');

  fs.mkdirSync(outDir, { recursive: true });
  const paths: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const outPath = path.join(outDir, `frame${i}.png`);

    if (img.base64) {
      fs.writeFileSync(outPath, Buffer.from(img.base64, 'base64'));
    } else if (img.url || img.storage_url) {
      const url = img.url ?? img.storage_url;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Download failed: ${url}`);
      fs.writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
    } else {
      throw new Error(`Unknown image format at index ${i}`);
    }

    paths.push(outPath);
  }

  return paths;
}

// --- Main ---
async function main() {
  const animNames = animArg ? [animArg] : Object.keys(ANIM_PROMPTS);
  const stageFilter = stageArg ? parseInt(stageArg) : null;

  console.log('\n🎬 Synamon Phase 3 — Animation Generation');
  console.log(`Mode: ${resume ? 'resume' : 'fresh'}`);
  console.log(`Animations: ${animNames.join(', ')}`);
  if (speciesArg) console.log(`Species: ${speciesArg}`);
  if (stageFilter) console.log(`Stage: ${stageFilter}`);
  console.log();

  const allSpecies = loadSpecies();
  const state = loadState();

  // Build job list
  interface Job {
    speciesId: string;
    stageKey: string;
    animName: string;
    spritePath: string;
    outDir: string;
  }

  const jobs: Job[] = [];

  for (const sp of allSpecies) {
    if (speciesArg && sp.id !== speciesArg) continue;

    for (const stage of sp.stages) {
      if (stageFilter && stage.stage !== stageFilter) continue;
      if (!stage.sprite) continue;

      const spritePath = path.resolve('public' + stage.sprite);
      if (!fs.existsSync(spritePath)) {
        console.log(`  ⚠️  Sprite missing: ${stage.sprite} — skipping`);
        continue;
      }

      const stageKey = `stage${stage.stage}`;

      for (const animName of animNames) {
        // Tamagotchi anims are base form only — skip stage 2+
        if (TAMAGOTCHI_ANIMS.has(animName) && stage.stage !== 1) continue;

        const animOutDir = path.join(OUT_DIR, sp.id, `${stageKey}-${animName}`);

        // Skip if already done (resume mode)
        if (resume) {
          const existingFrames = fs.existsSync(animOutDir)
            ? fs.readdirSync(animOutDir).filter(f => f.endsWith('.png'))
            : [];
          if (existingFrames.length > 0) {
            console.log(`  ✓  ${sp.id}/${stageKey}-${animName} already done (${existingFrames.length} frames)`);
            continue;
          }
        }

        jobs.push({ speciesId: sp.id, stageKey, animName, spritePath, outDir: animOutDir });
      }
    }
  }

  console.log(`Generating ${jobs.length} animations in batches of ${BATCH_SIZE}...\n`);

  let done = 0, failed = 0;

  // Process in batches of BATCH_SIZE concurrent jobs.
  // Each job submits to the API and polls its background job until complete.
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(batch.map(async (job) => {
      process.stdout.write(`  ⏳ ${job.speciesId}/${job.stageKey}-${job.animName}... `);

      let attempts = 0;
      const MAX_RETRIES = 3;

      while (attempts < MAX_RETRIES) {
        try {
          const framePaths = await generateAnimation(job.spritePath, job.animName, job.outDir, job.speciesId);
          updateSpeciesJson(job.speciesId, job.stageKey, job.animName, framePaths);
          console.log(`✓ ${framePaths.length} frames`);
          done++;
          return;
        } catch (err: any) {
          if (err.message.includes('429') && attempts < MAX_RETRIES - 1) {
            attempts++;
            const wait = 30 * attempts;
            process.stdout.write(`(429, retry ${attempts}/${MAX_RETRIES} in ${wait}s) `);
            await sleep(wait * 1000);
          } else {
            console.log(`✗ ${err.message}`);
            failed++;
            return;
          }
        }
      }
    }));

    state.done = done;
    state.failed = failed;
    saveState(state);
  }

  console.log(`\n✅ Done: ${done}  ✗ Failed: ${failed}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

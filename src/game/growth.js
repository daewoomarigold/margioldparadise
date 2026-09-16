// Growth/rolling logic — pure functions, no DOM/React/storage here. See
// GAME_DESIGN.md "The new pet mechanic" for the rules this implements:
//   Egg -> Baby --(random 1 of 3)--> Toddler --(random 1 of 4)--> Teen
//        --(random 1 of 4, no dupes)--> Adult -> (new cycle) Egg -> ...
// plus the no-dupes/closing rules (teen lines close once fully collected,
// biomes close + award a secret once all 4 of their teen lines are closed).
//
// Egg isn't in GAME_DESIGN.md's growth-chart notation (which starts at
// Baby) but sprite data for it exists (tamaAtlas.json's separate `egg`
// entry, not indexed like the other 68), and it's a natural pre-baby
// stage each new cycle passes through, one meter-fill each way like every
// other stage. bbmarutchi (growthChart.json's specialBaby) is explicitly
// "can't be bred with others" per the design doc, so it's deliberately
// NOT part of this roll chain — a regular cycle can never produce it;
// how a student would ever get one isn't designed yet.
//
// Family tree data lives in src/data/growthChart.json (reconstructed from
// real sprite indices + shape-matched species names, cross-checked against
// the reference chart image — see git log for how index 16/53 errors were
// found and fixed).

import chart from '../data/growthChart.json';

// How many points fill the meter and trigger one growth step. Placeholder —
// GAME_DESIGN.md doesn't specify a number; adjust once playtested.
export const POINTS_PER_GROWTH = 10;

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function findToddler(toddlerId) {
  return chart.toddlers.find((t) => t.tamaId === toddlerId);
}

function findTeen(toddlerId, teenId) {
  return findToddler(toddlerId)?.teens.find((t) => t.tamaId === teenId);
}

// Looks up a species name by tamaId anywhere in the chart (baby, toddlers,
// teens, adults, secrets, bbmarutchi) — used to resolve a tamadex entry
// (which only stores the id) back into a display name, e.g. for a "display
// tama" picker. Returns null if not found (e.g. egg, which has no tamaId).
export function findTamaName(tamaId) {
  if (tamaId == null) return null;
  if (chart.baby.tamaId === tamaId) return chart.baby.name;
  if (chart.specialBaby.tamaId === tamaId) return chart.specialBaby.name;
  for (const toddler of chart.toddlers) {
    if (toddler.tamaId === tamaId) return toddler.name;
    if (toddler.secret.tamaId === tamaId) return toddler.secret.name;
    for (const teen of toddler.teens) {
      if (teen.tamaId === tamaId) return teen.name;
      const adult = teen.adults.find((a) => a.tamaId === tamaId);
      if (adult) return adult.name;
    }
  }
  return null;
}

// Resolves a student's displayTamaId into what should actually render:
// { tamaId, stage }. 'current' (or unset) follows whatever's growing
// right now (including egg — the field roaming code uses `stage` to
// decide whether this should roam or sit still); a specific tamadex
// tamaId (a completed adult/secret the student picked to show off
// instead) always resolves to 'adult' stage, since tamadex entries are
// never anything else. This is the single source of truth for "what tama
// does the FIELD show" — see StudentGrid.jsx for the tile, which
// deliberately shows growth.currentTama directly instead (the asymmetric
// design: field shows the chosen display tama, tile always shows what's
// actively growing).
export function resolveDisplayTama(student) {
  const { displayTamaId, growth } = student;
  if (!displayTamaId || displayTamaId === 'current') {
    return { tamaId: growth.currentTama.tamaId, stage: growth.currentTama.stage };
  }
  return { tamaId: displayTamaId, stage: 'adult' };
}

// Total possible tamadex entries: every adult across all teen lines (48)
// plus the 3 biome secrets — matches GAME_DESIGN.md's "only completed
// adults count as tamadex entries" (secrets are adult-tier awards, not a
// separate category). Doesn't include bbmarutchi, which isn't part of the
// normal roll chain. Computed from growthChart.json rather than
// hardcoded so it can't drift if the chart data ever changes.
export function totalCollectible() {
  let total = 0;
  for (const toddler of chart.toddlers) {
    for (const teen of toddler.teens) total += teen.adults.length;
    total += 1; // secret
  }
  return total;
}

// Every regular adult (48, no secrets) in a fixed order — the natural
// order they appear in growthChart.json (toddler, then that toddler's
// teens in order, then each teen's adults in order). Used for a numbered
// tamadex grid; the order is stable across calls since it just reads the
// static chart data.
export function allAdults() {
  const adults = [];
  for (const toddler of chart.toddlers) {
    for (const teen of toddler.teens) {
      adults.push(...teen.adults);
    }
  }
  return adults;
}

// Creates a fresh student progression record. tamadex/closedTeens/
// closedBiomes/secrets persist across growth cycles (a completed adult
// starts a new baby, but collection history is permanent) — only
// currentTama resets.
export function newStudentProgress() {
  return {
    currentTama: startEgg(),
    tamadex: [], // adult + secret tamaIds this student has completed
    closedTeens: [], // teen tamaIds fully collected (can't roll again)
    closedBiomes: [], // toddler tamaIds fully collected (can't roll again)
    unlockedSecrets: [], // secret tamaIds unlocked
    growthConsumedPts: 0, // how many gotchiPts have already been spent on growth steps
  };
}

function startEgg() {
  // tamaId stays null — egg isn't indexed into tamaAtlas.json's 68 tamas
  // like everything else; it's the separate `egg` entry, special-cased by
  // whichever sprite-rendering code eventually consumes this.
  return { stage: 'egg', tamaId: null, name: 'egg', toddlerId: null, teenId: null };
}

function startBaby() {
  return { stage: 'baby', tamaId: chart.baby.tamaId, name: chart.baby.name, toddlerId: null, teenId: null };
}

// Rolls the next stage for a student's currentTama, respecting no-dupe and
// closing rules. Returns a NEW progress object (doesn't mutate). Reaching
// adult also updates tamadex/closedTeens/closedBiomes/unlockedSecrets in
// the same call — the design doc's rules are all resolved together, not as
// a separate "check" step, so there's no window where the state is
// inconsistent (e.g. a 4th adult logged but the teen not yet marked closed).
export function advanceGrowth(progress) {
  const { stage } = progress.currentTama;

  if (stage === 'adult') {
    // Completed — this life is done and stays in tamadex; a new cycle
    // starts from an egg, not straight back to baby.
    return { ...progress, currentTama: startEgg() };
  }

  if (stage === 'egg') {
    return { ...progress, currentTama: startBaby() };
  }

  if (stage === 'baby') {
    const available = chart.toddlers.filter((t) => !progress.closedBiomes.includes(t.tamaId));
    if (available.length === 0) return progress; // every biome closed (endgame) — nothing left to roll
    const toddler = pick(available);
    return {
      ...progress,
      currentTama: { stage: 'toddler', tamaId: toddler.tamaId, name: toddler.name, toddlerId: toddler.tamaId, teenId: null },
    };
  }

  if (stage === 'toddler') {
    const toddler = findToddler(progress.currentTama.toddlerId);
    const available = toddler.teens.filter((t) => !progress.closedTeens.includes(t.tamaId));
    // available should never be empty here — a toddler only offers itself
    // for rolling (in the baby step above) while it still has open teens —
    // but fall back to a fresh cycle rather than crash if data is ever
    // inconsistent (e.g. manually edited save data).
    if (available.length === 0) return { ...progress, currentTama: startEgg() };
    const teen = pick(available);
    return {
      ...progress,
      currentTama: {
        stage: 'teen',
        tamaId: teen.tamaId,
        name: teen.name,
        toddlerId: progress.currentTama.toddlerId,
        teenId: teen.tamaId,
      },
    };
  }

  if (stage === 'teen') {
    const { toddlerId, teenId } = progress.currentTama;
    const teen = findTeen(toddlerId, teenId);
    const available = teen.adults.filter((a) => !progress.tamadex.includes(a.tamaId));
    if (available.length === 0) return progress; // shouldn't happen — teen would already be closed
    const adult = pick(available);

    let next = {
      ...progress,
      currentTama: { stage: 'adult', tamaId: adult.tamaId, name: adult.name, toddlerId, teenId },
      tamadex: [...progress.tamadex, adult.tamaId],
    };

    // Teen line closes once all 4 of its adults are logged.
    const teenNowComplete = teen.adults.every((a) => next.tamadex.includes(a.tamaId));
    if (teenNowComplete && !next.closedTeens.includes(teenId)) {
      next = { ...next, closedTeens: [...next.closedTeens, teenId] };

      // Biome closes once all 4 of its teen lines are closed — awards the secret.
      const toddler = findToddler(toddlerId);
      const biomeNowComplete = toddler.teens.every((t) => next.closedTeens.includes(t.tamaId));
      if (biomeNowComplete && !next.closedBiomes.includes(toddlerId)) {
        next = {
          ...next,
          closedBiomes: [...next.closedBiomes, toddlerId],
          unlockedSecrets: [...next.unlockedSecrets, toddler.secret.tamaId],
          tamadex: [...next.tamadex, toddler.secret.tamaId],
        };
      }
    }

    return next;
  }

  return progress;
}

// Applies a change in gotchiPts to a student's growth progress, advancing
// the meter and triggering as many growth steps as the points cover (e.g.
// awarding 25 points at once with a 10-point threshold triggers 2 steps,
// leaving 5 toward the next). Deducting points never un-advances a stage —
// growth is a one-way ratchet; it only slows future progress. Returns the
// new progress object; call with the student's up-to-date gotchiPts after
// whatever award/deduct just happened.
export function applyPointsToGrowth(progress, gotchiPts) {
  let next = progress;
  while (gotchiPts - next.growthConsumedPts >= POINTS_PER_GROWTH) {
    next = { ...advanceGrowth(next), growthConsumedPts: next.growthConsumedPts + POINTS_PER_GROWTH };
  }
  return next;
}

// 0-1 fraction of the way to the next growth step, clamped so a point
// deduction never shows a negative/overfull bar.
export function meterFraction(progress, gotchiPts) {
  const remainder = gotchiPts - progress.growthConsumedPts;
  return Math.max(0, Math.min(1, remainder / POINTS_PER_GROWTH));
}

// Sound effects — ported from the old gotchigarden.html (see that repo's
// AUDIO section, near the top of the file): same cloneNode()-per-play
// pattern (so two overlapping plays — e.g. rapid clicks — don't cut each
// other off, since each play gets its own <audio> element instead of
// rewinding a shared one) and the same volumes. The old file also had a
// yes.mp3 for a purchase-confirm flow this app doesn't have yet; only the
// two actually requested (tap, addpoint) were carried over — add yes.mp3
// the same way here if/when a confirm flow needs it.
//
// The .mp3 files themselves are the old repo's own asset files, copied
// over as-is into public/sounds/.

const SOUND_BASE = `${import.meta.env.BASE_URL}sounds/`;

function makeSfx(file, volume) {
  const base = new Audio(`${SOUND_BASE}${file}`);
  base.preload = 'auto';
  return () => {
    const s = base.cloneNode();
    s.volume = volume;
    // play() returns a promise that rejects if the browser's autoplay
    // policy blocks it (e.g. no user gesture yet) — that's fine to just
    // swallow rather than let it throw into whatever triggered the sound.
    s.play().catch(() => {});
  };
}

// Global button/link click — see IslandView.jsx's document-wide click
// listener (island-only, not the teacher dashboard — see that file's
// header comment for why).
export const playTap = makeSfx('tap.mp3', 0.5);

// A student's points went up — see TeacherDashboard.jsx's setStudentPts/
// awardAll.
export const playAddPoint = makeSfx('addpoint.mp3', 0.6);

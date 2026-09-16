// 4x4 roster grid shown alongside the island — one tile per student
// (Taylor's real classes max out at 16), showing their GROWING tama (not
// their chosen display tama — see the asymmetric-design note below),
// growth meter, name, and tamadex progress. Empty slots render as plain
// placeholders, matching the mockup. Static (idle-pose) sprites, not
// roaming — this is a dashboard panel, not part of the island canvas
// itself.
//
// Asymmetric by design: the island field shows whatever tama a student
// has chosen to display (resolveDisplayTama in growth.js — 'current'
// growing tama by default, or a specific completed adult they picked in
// the tamadex toast), but this tile always shows growth.currentTama
// directly regardless of that choice — it's a progress/status readout
// (paired with the meter right below it), not the showcase. A student
// mid-toddler can proudly display a finished adult on the island while
// this tile still tracks the toddler actually growing.
//
// Tapping a tile opens the tamadex toast (see TamadexToast.jsx), where a
// student can change their display tama; a future item shop could pop
// out from here too.

import { meterFraction, totalCollectible, POINTS_PER_GROWTH } from '../game/growth.js';
import { TamaComposite } from '../game/spriteCompositor.jsx';

const GRID_SIZE = 16; // 4x4 — matches the real max class size, not just the current roster
const TILE_SCALE = 2; // mini sprites are 32x32 native; on-screen size within the tile

const TOTAL_COLLECTIBLE = totalCollectible();

export default function StudentGrid({ students, onSelectStudent }) {
  const tiles = Array.from({ length: GRID_SIZE }, (_, i) => students[i] ?? null);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridAutoRows: '1fr',
        gap: 8,
        width: 512,
        maxWidth: '100%',
      }}
    >
      {tiles.map((s, i) =>
        s ? <StudentTile key={s.id} student={s} onClick={() => onSelectStudent(s)} /> : <EmptyTile key={`empty-${i}`} />,
      )}
    </div>
  );
}

function StudentTile({ student, onClick }) {
  const growth = student.growth;
  const fraction = meterFraction(growth, student.gotchiPts);
  const { stage, tamaId } = growth.currentTama; // deliberately the growing tama, not the display tama — see file header
  const isEgg = stage === 'egg';

  return (
    <div style={{ ...tileStyle, cursor: 'pointer' }} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 32 * TILE_SCALE }}>
        <TamaComposite tamaId={isEgg ? 'egg' : tamaId} variant="mini" frames={{ body: 0, eyes: 0, mouth: 0 }} scale={TILE_SCALE} />
      </div>
      <div style={nameStyle}>{student.name}</div>
      <div style={meterTrackStyle} title={`${Math.round(fraction * POINTS_PER_GROWTH)}/${POINTS_PER_GROWTH} pts to next stage`}>
        <div style={{ ...meterFillStyle, width: `${fraction * 100}%` }} />
      </div>
      <div style={dexStyle}>
        dex {growth.tamadex.length}/{TOTAL_COLLECTIBLE}
      </div>
    </div>
  );
}

function EmptyTile() {
  return <div style={{ ...tileStyle, border: '1px dashed #2e2e4e', background: 'transparent' }} />;
}

const tileStyle = {
  aspectRatio: '1 / 1',
  background: '#22223a',
  border: '1px solid #2e2e4e',
  borderRadius: 6,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: 6,
  boxSizing: 'border-box',
  overflow: 'hidden',
  fontFamily: 'ui-monospace, monospace',
};

const nameStyle = {
  fontSize: 10,
  color: '#e0e0f0',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
};

const meterTrackStyle = {
  width: '85%',
  height: 5,
  background: '#1a1a2e',
  border: '1px solid #2e2e4e',
  borderRadius: 3,
  overflow: 'hidden',
};

const meterFillStyle = {
  height: '100%',
  background: '#4ef0d8',
  transition: 'width 0.2s',
};

const dexStyle = {
  fontSize: 8,
  color: '#7070a0',
};

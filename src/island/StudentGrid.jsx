// 4x4 roster grid shown alongside the island — one tile per student
// (Taylor's real classes max out at 16), showing their display tama,
// growth meter, name, and tamadex progress. Empty slots render as plain
// placeholders, matching the mockup. Static (idle-pose) sprites, not
// roaming — this is a dashboard panel, not part of the island canvas
// itself.
//
// Future (not built yet, per the request that added this file): tapping
// a tile pops out the student's full tamadex, and later an item shop.

import { meterFraction, totalCollectible, POINTS_PER_GROWTH } from '../game/growth.js';
import { TamaComposite } from '../game/spriteCompositor.jsx';

const GRID_SIZE = 16; // 4x4 — matches the real max class size, not just the current roster
const TILE_SCALE = 2; // mini sprites are 32x32 native; on-screen size within the tile

const TOTAL_COLLECTIBLE = totalCollectible();

// Same 'current' | specific-tamadex-tamaId resolution as TeacherDashboard's
// display-tama picker — kept in sync there since both read the same
// student.displayTamaId field.
function resolveDisplayTamaId(student) {
  const { displayTamaId, growth } = student;
  if (!displayTamaId || displayTamaId === 'current') return growth.currentTama.tamaId;
  return displayTamaId;
}

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
  const tamaId = resolveDisplayTamaId(student);
  const isEgg = tamaId == null; // egg stage — TamaComposite's 'egg' entity, not an atlas index

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

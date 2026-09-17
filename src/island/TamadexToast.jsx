// Popup shown when a student's tile is clicked — a numbered grid of all 48
// regular adults (no secrets, per the request that added this: "a
// numerical list of all adult tamas"). Collected ones (in the student's
// growth.tamadex) show in normal color; uncollected ones show the same
// sprite silhouetted black via a CSS filter, so the shape/number is
// visible as a "not yet found" placeholder rather than a blank slot.
//
// Clicking a COLLECTED entry sets it as the student's display tama (the
// one shown roaming on the island field — see growth.js's
// resolveDisplayTama). The current display tama is highlighted yellow
// with a star. Uncollected entries aren't clickable — nothing to display.

import { allAdults, findTamaName, resolveDisplayTama } from '../game/growth.js';
import { TamaComposite } from '../game/spriteCompositor.jsx';

const CELL_SCALE = 1.5; // mini sprites are 32x32 native

export default function TamadexToast({ student, onSelectDisplay, onClose }) {
  const adults = allAdults();
  const collected = new Set(student.growth.tamadex);
  const collectedCount = adults.filter((a) => collected.has(a.tamaId)).length;
  const currentDisplayTamaId = resolveDisplayTama(student).tamaId;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={titleStyle}>{student.name}&rsquo;s Tamadex</div>
          <div style={countStyle}>
            {collectedCount}/{adults.length}
          </div>
          <button style={closeBtnStyle} onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={gridStyle}>
          {adults.map((a, i) => {
            const got = collected.has(a.tamaId);
            const isDisplayed = got && a.tamaId === currentDisplayTamaId;
            return (
              <div
                key={a.tamaId}
                role={got ? 'button' : undefined}
                style={{
                  ...cellStyle,
                  ...(isDisplayed ? cellSelectedStyle : null),
                  cursor: got ? 'pointer' : 'default',
                }}
                title={got ? findTamaName(a.tamaId) : '???'}
                onClick={got ? () => onSelectDisplay(a.tamaId) : undefined}
              >
                <div style={numStyle}>
                  {isDisplayed && <span style={starStyle}>★</span>}
                  {i + 1}
                </div>
                <div style={{ filter: got ? 'none' : 'brightness(0)', opacity: got ? 1 : 0.6 }}>
                  <TamaComposite tamaId={a.tamaId} variant="mini" frames={{ body: 0, eyes: 0, mouth: 0 }} scale={CELL_SCALE} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const backdropStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(10, 4, 20, 0.85)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
  padding: 16,
};

const cardStyle = {
  background: '#1a1a2e',
  border: '1px solid #4a4a7a',
  borderRadius: 10,
  padding: 20,
  maxWidth: '90vw',
  maxHeight: '85vh',
  overflowY: 'auto',
  fontFamily: 'ui-monospace, monospace',
  color: '#e0e0f0',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 14,
};

const titleStyle = {
  fontSize: 13,
  letterSpacing: 0.5,
};

const countStyle = {
  fontSize: 12,
  color: '#ffe066',
  flex: 1,
};

const closeBtnStyle = {
  background: 'none',
  border: '1px solid #2e2e4e',
  color: '#7070a0',
  borderRadius: 4,
  padding: '4px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(8, 1fr)',
  gap: 8,
};

const cellStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  background: '#22223a',
  border: '1px solid #2e2e4e',
  borderRadius: 5,
  padding: 4,
};

const cellSelectedStyle = {
  border: '1px solid #ffe066',
  background: 'rgba(255, 224, 102, 0.1)',
  boxShadow: '0 0 0 1px #ffe066',
};

const numStyle = {
  fontSize: 8,
  color: '#7070a0',
  display: 'flex',
  alignItems: 'center',
  gap: 2,
};

const starStyle = {
  color: '#ffe066',
  fontSize: 9,
};

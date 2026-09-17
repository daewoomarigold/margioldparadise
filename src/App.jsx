import { useEffect } from 'react';
import TeacherDashboard from './teacher/TeacherDashboard.jsx';
import IslandView from './island/IslandView.jsx';
import { playTap } from './sound.js';

// No router library yet — a query param is enough for now while there are
// only two screens. Revisit if/when this grows past a couple of views.
const view = new URLSearchParams(window.location.search).get('view');

function App() {
  // Global button-tap sound — ported from the old gotchigarden.html's
  // document-wide click listener (see that repo's AUDIO section): fires
  // for any button/link click anywhere in the app, so it doesn't need
  // wiring into every individual button across both views.
  useEffect(() => {
    function onClick(e) {
      const btn = e.target.closest('button, a[role="button"]');
      if (btn) playTap();
    }
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  if (view === 'island') return <IslandView />;
  return <TeacherDashboard />;
}

export default App;

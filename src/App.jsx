import TeacherDashboard from './teacher/TeacherDashboard.jsx';
import IslandView from './island/IslandView.jsx';

// No router library yet — a query param is enough for now while there are
// only two screens. Revisit if/when this grows past a couple of views.
const view = new URLSearchParams(window.location.search).get('view');

function App() {
  if (view === 'island') return <IslandView />;
  return <TeacherDashboard />;
}

export default App;

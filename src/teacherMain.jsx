import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import TeacherDashboard from './teacher/TeacherDashboard.jsx';
import TamaAssembler from './dev/TamaAssembler.jsx';

// Dev-only tooling, e.g. visit /teacher/?dev=assembler while running
// `npm run dev`. import.meta.env.DEV is a compile-time constant, so this
// branch (and TamaAssembler itself) is eliminated entirely from
// `vite build` output — it never ships to the live site. Lives on this
// entry rather than island's mostly arbitrarily (it's unrelated to either
// page, just needs SOME dev-reachable home) — fine to add to islandMain
// too if that's ever more convenient.
const devTool = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('dev')
  : null;

createRoot(document.getElementById('root')).render(
  <StrictMode>{devTool === 'assembler' ? <TamaAssembler /> : <TeacherDashboard />}</StrictMode>,
);

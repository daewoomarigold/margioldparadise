import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import IslandView from './island/IslandView.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <IslandView />
  </StrictMode>,
);

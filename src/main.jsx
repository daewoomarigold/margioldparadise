import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import TamaAssembler from './dev/TamaAssembler.jsx'

// Dev-only tooling, e.g. visit /?dev=assembler while running `npm run dev`.
// import.meta.env.DEV is a compile-time constant, so this branch (and
// TamaAssembler itself) is eliminated entirely from `vite build` output —
// it never ships to the live site.
const devTool = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('dev')
  : null

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {devTool === 'assembler' ? <TamaAssembler /> : <App />}
  </StrictMode>,
)

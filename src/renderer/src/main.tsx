import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './assets/main.css'
import './i18n'
import './click-through'
import { initTheme } from './theme'
import { initComfort } from './comfort'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Before the first paint, so a dark-mode window never flashes light (or text never jumps size).
initTheme()
initComfort()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

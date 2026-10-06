import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './store'
import { App } from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)

// basit offline cache (üretimde)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* yok sayılır */
    })
  })
}
import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './store'
import { App } from './App'
import './index.css'

/**
 * Ekranda hiçbir şey çizilmezse (beyaz ekran) en azından hata metni görünsün.
 * Yükleme hatası da bileşen hatası da burada yakalanır.
 */
class HataEkran extends Component<{ children: ReactNode }, { hata: Error | null }> {
  state = { hata: null as Error | null }

  static getDerivedStateFromError(hata: Error) {
    return { hata }
  }

  componentDidCatch(hata: Error, bilgi: ErrorInfo) {
    console.error('Uygulama çöktü:', hata, bilgi)
  }

  render() {
    if (!this.state.hata) return this.props.children
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', color: '#e8eef7' }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Uygulama başlatılamadı</h1>
        <pre
          style={{
            background: '#1a2537',
            border: '1px solid #33465f',
            borderRadius: 10,
            padding: 12,
            whiteSpace: 'pre-wrap',
            fontSize: 12,
            color: '#fca5a5',
          }}
        >
          {this.state.hata.message}
        </pre>
        <button
          type="button"
          onClick={() => location.reload()}
          style={{ marginTop: 12, padding: '8px 14px', borderRadius: 10, border: 0, background: '#f2c14e', cursor: 'pointer' }}
        >
          Sayfayı yenile
        </button>
      </div>
    )
  }
}

const el = document.getElementById('root')
if (!el) throw new Error('#root bulunamadı')

// Eski sürümden kalmış service worker kaydını ve cache'leri temizle.
// public/sw.js kendini imha eder; bu satır onu tetikler.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister())
  })
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)))
  }
}

createRoot(el).render(
  <StrictMode>
    <HataEkran>
      <AppProvider>
        <App />
      </AppProvider>
    </HataEkran>
  </StrictMode>,
)
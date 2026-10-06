import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import {
  focusElement,
  hideSurroundingContent,
  lockBodyScroll,
  rememberFocusedElement,
  restoreFocus,
  trapFocus,
} from '../lib/a11y'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

export function Modal({ open, onClose, title, subtitle, children, footer, wide }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // onClose her render'da yeni referans olabilir; tuş dinleyicisini boşuna yeniden
  // kurmamak (ve odağı/arkaplanı kaydırmamak) için ref'te tutuyoruz.
  const closeRef = useRef(onClose)
  // Açılışta odaklanılacak hedef. React StrictMode geliştirme modunda efektleri iki kez
  // çalıştırdığı için "ilk odak" kararı bir kez verilip korunur; böylece `autoFocus`
  // kullanan içeriklerin odağı da geliştirmede çalınmaz.
  const initialFocusRef = useRef<{ target: HTMLElement } | null>(null)

  // React 18 useId: başlık/alt başlık için kararlı (stable) id'ler
  const uid = useId()
  const titleId = `${uid}-baslik`
  const descId = `${uid}-aciklama`

  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) {
      initialFocusRef.current = null
      return
    }
    const panel = panelRef.current
    const root = rootRef.current
    if (!panel || !root) return

    const opener = rememberFocusedElement()

    // 1) Odağı diyaloğa taşı → ekran okuyucu "diyalog + başlık" diye okur.
    //    İçeride `autoFocus` ile zaten odaklanmış bir kontrol varsa ona dokunulmaz.
    if (!initialFocusRef.current) {
      const active = document.activeElement
      initialFocusRef.current = {
        target: active instanceof HTMLElement && panel.contains(active) ? active : panel,
      }
    }
    focusElement(initialFocusRef.current.target)

    // 2) Arka planı ekran okuyucudan gizle.
    //    Modal kökü (portal) ve tüm içeriği — backdrop dâhil — dokunulabilir kalır,
    //    ki backdrop'a tıklayınca kapatma çalışsın. `inert` tıklanabilirliği
    //    tamamen kaldırdığı için gizleme daima modalın dışındaki kardeşlere uygulanır.
    const revealBackground = hideSurroundingContent(root)
    // 3) Arka plan kaydırmasını kilitle
    const unlockScroll = lockBodyScroll()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return
        e.preventDefault()
        closeRef.current()
        return
      }
      // Tab / Shift+Tab diyalog içinde döngüde kalsın
      trapFocus(panel, e)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      // sıra önemli: önce kilidi/arkaplanı aç, sonra odağı geri ver
      unlockScroll()
      revealBackground()
      restoreFocus(opener)
    }
  }, [open])

  if (!open) return null

  const dialog = (
    <div ref={rootRef} className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="fade-in absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
        aria-hidden="true"
        onClick={() => closeRef.current()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descId : undefined}
        tabIndex={-1}
        // panel üzerinde sürükleme başlatılmasın: dışarıya taşan seçim/mousedown olmasın
        onMouseDown={(e) => {
          e.stopPropagation()
          if (e.target === e.currentTarget) e.preventDefault()
        }}
        className={`sheet-in panel relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-2xl ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="flex select-none items-start gap-3 border-b border-white/8 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-sm font-black uppercase tracking-wide text-gold-100">
              {title}
            </h2>
            {subtitle && (
              <p id={descId} className="mt-0.5 text-[11px] text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => closeRef.current()}
            className="btn btn-sm btn-ghost shrink-0"
            title="Kapat"
            aria-label="Kapat"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-white/8 px-4 py-3">{footer}</div>}
      </div>
    </div>
  )

  // Modal, uygulama kökünün (#root) dışına basılır: böylece arka plan inert/aria-hidden
  // yapılırken diyalog kendisi ekran okuyucuya açık kalır.
  const target = typeof document !== 'undefined' ? document.body : null
  return target ? createPortal(dialog, target) : dialog
}
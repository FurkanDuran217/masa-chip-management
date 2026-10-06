import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { AppState, Table } from './lib/types'
import type { TableAction } from './lib/table'
import { emptyState, loadState, rootReducer, saveState, type RootAction } from './lib/store'
import { playerAt } from './lib/chips'

export type ModalKind = 'setup' | 'payout' | 'players' | 'tables' | 'help' | 'none'
export type TrayMode = 'push' | 'pull'

interface Notice {
  id: number
  text: string
  tone: 'info' | 'warn' | 'good'
}

interface Ctx {
  state: AppState
  table: Table | null
  dispatch: (a: RootAction) => void
  act: (a: TableAction) => void
  undo: () => void
  canUndo: boolean
  // ui
  modal: ModalKind
  openModal: (m: ModalKind) => void
  closeModal: () => void
  side: 'log' | 'balances' | null
  setSide: (s: 'log' | 'balances' | null) => void
  targetSeat: number | null
  setTargetSeat: (seat: number | null) => void
  trayMode: TrayMode
  setTrayMode: (m: TrayMode) => void
  winners: string[]
  toggleWinner: (id: string) => void
  clearWinners: () => void
  notice: Notice | null
  notify: (text: string, tone?: Notice['tone']) => void
}

const AppCtx = createContext<Ctx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(rootReducer, null, () => loadState())
  const [modal, setModal] = useState<ModalKind>('none')
  const [side, setSide] = useState<'log' | 'balances' | null>(null)
  const [targetSeat, setTargetSeat] = useState<number | null>(null)
  const [trayMode, setTrayMode] = useState<TrayMode>('push')
  const [winners, setWinners] = useState<string[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'masa.chip.v1' && e.newValue) dispatch({ type: 'hydrate', state: loadState() })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const notify = useCallback((text: string, tone: Notice['tone'] = 'info') => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice({ id: Date.now(), text, tone })
    noticeTimer.current = setTimeout(() => setNotice(null), 2600)
  }, [])

  const value = useMemo<Ctx>(() => {
    const table = state.tables.find((t) => t.id === state.activeTableId) ?? null
    const undoStack = state.activeTableId ? (state.undo[state.activeTableId] ?? []) : []
    return {
      state,
      table,
      dispatch,
      act: (a: TableAction) => {
        if (!state.activeTableId) return
        dispatch({ type: 'tableAction', id: state.activeTableId, action: a })
      },
      undo: () => {
        if (!state.activeTableId) return
        dispatch({ type: 'undo', id: state.activeTableId })
      },
      canUndo: undoStack.length > 0,
      modal,
      openModal: (m) => {
        setModal(m)
        setSide(null)
      },
      closeModal: () => setModal('none'),
      side,
      setSide,
      targetSeat,
      setTargetSeat,
      trayMode,
      setTrayMode,
      winners,
      toggleWinner: (id: string) => {
        setWinners((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]))
      },
      clearWinners: () => setWinners([]),
      notice,
      notify,
    }
  }, [state, modal, side, targetSeat, trayMode, winners, notice, notify])

  // hedef koltuk artık dolu değilse sıradakine kay
  useEffect(() => {
    const t = state.tables.find((x) => x.id === state.activeTableId)
    if (!t) return
    if (targetSeat !== null && playerAt(t, targetSeat)) return
    const fallback = t.players.find((p) => p.stack > 0)?.seat ?? t.players[0]?.seat ?? null
    if (fallback !== targetSeat) setTargetSeat(fallback)
  }, [state.tables, state.activeTableId, targetSeat])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp, AppProvider içinde kullanılmalı')
  return ctx
}

export { emptyState }
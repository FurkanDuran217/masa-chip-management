import { RotateCcw, UserPlus } from 'lucide-react'
import type { Player, Table } from '../lib/types'
import { avatarColor, chips as fmtChips, initials, money, netOf } from '../lib/chips'

interface Props {
  table: Table
  player: Player | null
  seat: number
  compact: boolean
  /** tahta planından gelen sabit yükseklik (px) — hizalı ve taşmasız halka için */
  cardH: number
  /** kart küçüldüğünde küçük tipografi */
  dense: boolean
  isTurn: boolean
  isTarget: boolean
  isWinner: boolean
  onSelect: () => void
  onClearBet: () => void
  onAddPlayer: () => void
  onSetButton: () => void
}

export function SeatCard({
  table,
  player,
  seat,
  compact,
  cardH,
  dense,
  isTurn,
  isTarget,
  isWinner,
  onSelect,
  onClearBet,
  onAddPlayer,
  onSetButton,
}: Props) {
  const tiny = dense || cardH < 40

  if (!player) {
    return (
      <button
        type="button"
        onClick={onAddPlayer}
        title="Oyuncu ekle"
        aria-label={`${seat + 1}. koltuğa oyuncu ekle`}
        style={{ height: cardH }}
        className={`seat seat-empty flex w-full items-center justify-center gap-1 overflow-hidden rounded-2xl border border-dashed border-white/15 bg-ink-900/40 text-slate-400 hover:border-gold-300/50 hover:text-gold-200 ${
          compact ? (tiny ? 'text-[9px]' : 'text-[10px]') : 'text-xs'
        }`}
      >
        <UserPlus size={compact ? (tiny ? 11 : 12) : 14} />
        <span className="font-semibold">Ekle</span>
      </button>
    )
  }

  const isButton = table.buttonSeat === seat
  const isSB = table.sbSeat === seat
  const isBB = table.bbSeat === seat
  const net = netOf(player)
  const dim = player.status === 'sitout' || player.status === 'cashedout' || player.stack === 0

  // dar kartta rozetler sığsın diye en fazla bir durum rozeti gösterilir
  const status =
    player.allIn
      ? { text: 'ALL-IN', cls: 'border-rose-400/50 bg-rose-600/90 text-white', title: 'ALL-IN' }
      : player.folded
        ? { text: 'PAS', cls: 'border-white/15 bg-ink-800/95 text-slate-300', title: 'Pas geçti' }
        : player.status === 'sitout'
          ? { text: 'MOLA', cls: 'border-white/15 bg-ink-800/95 text-slate-300', title: 'Mola verdi' }
          : player.status === 'cashedout'
            ? { text: 'AYAKTA', cls: 'border-white/15 bg-ink-800/95 text-slate-300', title: 'Ayakta kaldı' }
            : null

  // para satırı sığmıyorsa gizlenir, o zaman seçme düğmesi tüm yüksekliği kaplar
  const showMoney = !compact && cardH >= 56

  return (
    <div
      style={{ height: cardH }}
      className={[
        'seat relative w-full rounded-2xl border text-left backdrop-blur-sm',
        compact ? 'px-1.5 py-1' : 'px-2 py-1.5',
        'bg-gradient-to-b from-ink-800/95 to-ink-950/95 border-white/10',
        isTurn && 'seat-turn border-gold-300/70',
        !isTurn && isTarget && 'border-gold-300/50 shadow-[0_0_0_1px_rgba(242,193,78,0.35)]',
        !isTurn && !isTarget && isWinner && 'seat-winner border-emerald-400/60',
        player.folded && 'seat-folded',
        dim && !player.folded && 'opacity-55 saturate-50',
      ].join(' ')}
    >
      {/* içerik: sabit yüksekliğe sığacak şekilde ortalanır, taşma kırpılır */}
      <div className="flex h-full min-h-0 flex-col justify-center overflow-hidden">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={isTarget}
          aria-label={`${player.name} koltuk ${seat + 1}${isTurn ? ', sırası geldi' : ''}`}
          className={`flex w-full items-center gap-1.5 ${showMoney ? '' : 'h-full'}`}
        >
          <span
            className={`grid shrink-0 place-items-center rounded-full font-bold text-white shadow-inner ring-1 ring-white/15 ${
              compact
                ? tiny
                  ? 'h-5 w-5 text-[8px]'
                  : 'h-6 w-6 text-[9px]'
                : tiny
                  ? 'h-7 w-7 text-[10px]'
                  : 'h-8 w-8 text-[11px]'
            }`}
            style={{ background: avatarColor(player.id) }}
          >
            {initials(player.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate font-semibold leading-tight ${
                compact ? (tiny ? 'text-[9px]' : 'text-[10px]') : 'text-[13px]'
              }`}
            >
              {player.name}
            </span>
            <span
              className={`block truncate font-bold tabular-nums leading-tight text-gold-200 ${
                compact ? (tiny ? 'text-[10px]' : 'text-[11px]') : tiny ? 'text-[14px]' : 'text-[15px]'
              }`}
            >
              {fmtChips(player.stack)}
            </span>
          </span>
        </button>

        {showMoney && (
          <button
            type="button"
            onClick={onSelect}
            tabIndex={-1}
            aria-label={`${player.name} koltuk ${seat + 1}, para karşılığı ${money(player.stack * table.chipValue, table.currency)}`}
            className="mt-0.5 block w-full text-left"
          >
            <span className="block truncate text-[10px] font-medium text-slate-400">
              {money(player.stack * table.chipValue, table.currency)}
              {player.rebuys > 0 && <span className="ml-1 text-slate-500">· +{player.rebuys} rebuy</span>}
            </span>
          </button>
        )}
      </div>

      {/* düğme ve kör rozetleri: tek sırada, birbirinin üstüne binmez */}
      <div className="absolute -top-1.5 -left-1.5 z-10 flex items-center gap-[2px]">
        {isButton && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSetButton()
            }}
            title="Düğme (Dealer)"
            aria-label={`Düğmeyi ${seat + 1}. koltuğa taşı`}
            className="grid h-5 w-5 place-items-center rounded-full border border-ink-950/60 bg-white text-[10px] font-black text-ink-950 shadow"
          >
            D
          </button>
        )}
        {(isSB || isBB) && (
          <span
            className="rounded-full border border-ink-950/60 bg-slate-200 px-1 text-[8px] font-black leading-[14px] text-ink-950 shadow"
            title={isSB ? 'Küçük kör' : 'Büyük kör'}
          >
            {isSB ? 'SB' : 'BB'}
          </span>
        )}
      </div>

      {/* net bakiye rozeti */}
      {net !== 0 && (
        <span
          className={`absolute -top-1.5 -right-1.5 z-10 flex h-5 max-w-[40px] items-center rounded-full px-1 text-[9px] font-black shadow ${
            net > 0 ? 'bg-emerald-500 text-emerald-950' : 'bg-rose-500 text-rose-950'
          }`}
          title={`Net ${net > 0 ? '+' : ''}${fmtChips(net)} çip`}
        >
          <span className="truncate">
            {net > 0 ? '+' : ''}
            {Math.abs(net) >= 1000 ? `${Math.round(net / 100) / 10}K` : fmtChips(net)}
          </span>
        </span>
      )}

      {/* alt rozet satırı: en fazla bir durum + geri al */}
      <div className="pointer-events-none absolute -bottom-2 left-1/2 z-10 flex max-w-full -translate-x-1/2 items-center gap-1">
        {status && (
          <span
            className={`truncate rounded-full border px-1.5 py-[1px] text-[8px] font-black leading-[11px] tracking-wide shadow ${
              status.cls
            }`}
            title={status.title}
          >
            {status.text}
          </span>
        )}
        {player.bet > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClearBet()
            }}
            title="Önündeki çipleri geri al"
            aria-label={`${player.name} önündeki ${fmtChips(player.bet)} çipi geri al`}
            className="pointer-events-auto relative grid h-4 w-4 shrink-0 place-items-center rounded-full border border-white/20 bg-ink-800 text-slate-300 shadow hover:text-white"
          >
            <RotateCcw size={9} strokeWidth={3} />
            {/* görünmez 28px dokunma alanı */}
            <span className="pointer-events-auto absolute -inset-[6px]" />
          </button>
        )}
      </div>
    </div>
  )
}
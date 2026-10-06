import type { BlindLevel, Currency, Player, PlayerStatus, Table } from './types'
import { computePots, currentMaxBet, netOf, nextOccupied, nextToAct, occupiedSeats, playerAt, uid } from './chips'

export interface NewTableInput {
  name?: string
  currency?: Currency
  chipValue?: number
  maxPlayers?: number
  buyIn?: number
  sb?: number
  bb?: number
  ante?: number
  denoms?: number[]
  handsPerLevel?: number
  blindLevels?: BlindLevel[]
}

export function defaultBlindLevels(sb: number, bb: number): BlindLevel[] {
  const out: BlindLevel[] = []
  for (let i = 0; i < 12; i++) {
    out.push({ sb: sb * Math.pow(2, i), bb: bb * Math.pow(2, i) })
  }
  return out
}

export function createTable(input: NewTableInput = {}): Table {
  const currency = input.currency ?? 'TRY'
  const chipValue = input.chipValue ?? 1
  const maxPlayers = clamp(Math.round(input.maxPlayers ?? 6), 2, 12)
  const buyIn = Math.max(1, Math.round(input.buyIn ?? 5000))
  const sb = Math.max(0, Math.round(input.sb ?? 25))
  const bb = Math.max(sb, Math.round(input.bb ?? sb * 2))
  const denoms = normalizeDenoms(input.denoms ?? [1, 5, 10, 25, 50, 100, 500, 1000])
  const now = Date.now()
  return {
    id: uid('t'),
    name: input.name?.trim() || 'Yeni Masa',
    createdAt: now,
    updatedAt: now,
    currency,
    chipValue,
    maxPlayers,
    buyIn,
    sb,
    bb,
    ante: Math.max(0, Math.round(input.ante ?? 0)),
    denoms,
    players: [],
    buttonSeat: 0,
    currentSeat: 0,
    sbSeat: null,
    bbSeat: null,
    handNumber: 0,
    handActive: false,
    blindLevels: input.blindLevels ?? defaultBlindLevels(sb, bb),
    handsPerLevel: input.handsPerLevel ?? 0,
    blindLevel: 0,
    note: '',
    log: [],
  }
}

export type TableSettings = Partial<
  Pick<
    Table,
    'name' | 'currency' | 'chipValue' | 'maxPlayers' | 'buyIn' | 'sb' | 'bb' | 'ante' | 'denoms' | 'handsPerLevel' | 'blindLevels' | 'note'
  >
>

export type TableAction =
  | { type: 'settings'; patch: TableSettings }
  | { type: 'addPlayer'; name?: string }
  | { type: 'renamePlayer'; id: string; name: string }
  | { type: 'removePlayer'; id: string }
  | { type: 'moveSeat'; id: string; dir: -1 | 1 }
  | { type: 'setStatus'; id: string; status: PlayerStatus }
  | { type: 'setButton'; seat: number }
  | { type: 'startHand' }
  | { type: 'endHand' }
  | { type: 'nextTurn'; dir?: 1 | -1 }
  | { type: 'setCurrent'; seat: number }
  | { type: 'pushChips'; id: string; amount: number }
  | { type: 'pullChips'; id: string; amount: number }
  | { type: 'allIn'; id: string }
  | { type: 'call'; id: string }
  | { type: 'fold'; id: string }
  | { type: 'clearBet'; id: string }
  | { type: 'distribute'; winners: string[] }
  | { type: 'split'; winners: string[] }
  | { type: 'rebuy'; id: string; amount: number }
  | { type: 'setStack'; id: string; amount: number }
  | { type: 'cashOut'; id: string }
  | { type: 'resetChips' }
  | { type: 'clearLog' }

function clone(t: Table): Table {
  return structuredClone(t)
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function normalizeDenoms(denoms: number[]): number[] {
  const clean = denoms
    .map((d) => Math.round(d))
    .filter((d) => Number.isFinite(d) && d > 0)
  const uniq = [...new Set(clean)].sort((a, b) => a - b)
  return uniq.length > 0 ? uniq : [1]
}

function withLog(t: Table, kind: Table['log'][number]['kind'], text: string, amount?: number, seat?: number): Table {
  t.log = [{ id: uid('l'), t: Date.now(), kind, text, amount, seat }, ...t.log].slice(0, 250)
  t.updatedAt = Date.now()
  return t
}

function byId(t: Table, id: string): Player | undefined {
  return t.players.find((p) => p.id === id)
}

function mapPlayer(t: Table, id: string, fn: (p: Player) => void): void {
  const p = byId(t, id)
  if (p) fn(p)
}

/** oyuncu adını kısaltarak kullanmak için: "Ahmet" -> "Ahmet" */
function label(t: Table, id: string): string {
  return byId(t, id)?.name ?? 'Oyuncu'
}

function fmtN(n: number): string {
  return new Intl.NumberFormat('tr-TR').format(n)
}

function post(p: Player, amount: number): number {
  const a = clamp(Math.round(amount), 0, p.stack)
  p.stack -= a
  p.bet += a
  p.invested += a
  if (p.stack === 0 && a > 0) p.allIn = true
  return a
}

// ---------------------------------------------------------------------------

export function applyTableAction(prev: Table, action: TableAction): Table {
  const t = clone(prev)

  switch (action.type) {
    case 'settings': {
      const p = action.patch
      if (p.name !== undefined) t.name = p.name.trim() || t.name
      if (p.currency !== undefined) t.currency = p.currency
      if (p.chipValue !== undefined && p.chipValue > 0) t.chipValue = p.chipValue
      if (p.maxPlayers !== undefined) {
        const highest = t.players.reduce((m, pl) => Math.max(m, pl.seat), 0)
        t.maxPlayers = clamp(Math.round(p.maxPlayers), Math.max(2, highest + 1), 12)
      }
      if (p.buyIn !== undefined && p.buyIn > 0) t.buyIn = Math.round(p.buyIn)
      if (p.sb !== undefined) t.sb = Math.max(0, Math.round(p.sb))
      if (p.bb !== undefined) t.bb = Math.max(0, Math.round(p.bb))
      if (p.bb !== undefined || p.sb !== undefined) t.bb = Math.max(t.bb, t.sb)
      if (p.ante !== undefined) t.ante = Math.max(0, Math.round(p.ante))
      if (p.denoms !== undefined) t.denoms = normalizeDenoms(p.denoms)
      if (p.handsPerLevel !== undefined) t.handsPerLevel = Math.max(0, Math.round(p.handsPerLevel))
      if (p.blindLevels !== undefined && p.blindLevels.length > 0) {
        t.blindLevels = p.blindLevels.map((l) => ({ sb: Math.max(0, Math.round(l.sb)), bb: Math.max(0, Math.round(l.bb)) }))
        t.blindLevel = clamp(t.blindLevel, 0, t.blindLevels.length - 1)
      }
      if (p.note !== undefined) t.note = p.note
      return withLog(t, 'setup', 'Masa ayarları güncellendi')
    }

    case 'addPlayer': {
      const used = new Set(t.players.map((p) => p.seat))
      let seat = -1
      for (let i = 0; i < t.maxPlayers; i++) {
        if (!used.has(i)) {
          seat = i
          break
        }
      }
      if (seat === -1) {
        if (t.maxPlayers >= 12) return withLog(t, 'info', 'Masa dolu (en fazla 12 kişi)')
        t.maxPlayers += 1
        seat = t.maxPlayers - 1
      }
      const auto = t.players.length === 0
      const name = (action.name ?? '').trim() || (auto ? 'Oyuncu 1' : `Oyuncu ${t.players.length + 1}`)
      t.players.push(blankPlayer(seat, name, t.buyIn))
      t.players.sort((a, b) => a.seat - b.seat)
      if (auto) t.buttonSeat = seat
      t.currentSeat = t.players[0]?.seat ?? 0
      return withLog(t, 'info', `${name} masaya oturdu (${seat + 1}. koltuk)`, undefined, seat)
    }

    case 'renamePlayer':
      mapPlayer(t, action.id, (p) => {
        p.name = action.name.trim() || p.name
      })
      return withLog(t, 'info', `İsim güncellendi: ${label(t, action.id)}`)

    case 'removePlayer': {
      const p = byId(t, action.id)
      if (!p) return t
      // El bitmeden kalkış yasak: masadaki çip kaybolur.
      if (p.invested > 0) return withLog(t, 'info', 'El bitmeden masadan kalkılamaz')
      // Masadan kalkan oyuncu defterden de düştüğü için Σ tutulabilmesi için
      // oyuncunun tam nötr çıkması gerekir (stack+cashOutTotal === buyInTotal).
      // Elinde çip varsa otomatik nakite çevrilir; kârı/zararı varsa kalkamaz.
      if (p.stack + p.cashOutTotal !== p.buyInTotal) {
        return withLog(t, 'info', `${p.name} masadan kalkamaz, önce çıkışını tamamla`)
      }
      const paid = p.stack
      p.cashOutTotal += paid
      p.stack = 0
      t.players = t.players.filter((x) => x.id !== action.id)
      if (t.players.length === 0) t.buttonSeat = 0
      return withLog(t, 'info', `${p.name} masadan kalktı${paid > 0 ? ` (+${fmtN(paid)} çip)` : ''}`, paid || undefined, p.seat)
    }

    case 'moveSeat': {
      const p = byId(t, action.id)
      if (!p) return t
      const from = p.seat
      const to = (((from + action.dir) % t.maxPlayers) + t.maxPlayers) % t.maxPlayers
      const other = playerAt(t, to)
      if (other && other.id !== p.id) other.seat = from
      p.seat = to
      t.players.sort((a, b) => a.seat - b.seat)
      if (t.buttonSeat === from) t.buttonSeat = to
      else if (t.buttonSeat === to) t.buttonSeat = from
      // el sırasındaki koltuklar da taşınmalı, aksi halde SB/BB etiketi yanlış oyuncuyu gösterir
      if (t.sbSeat === from) t.sbSeat = to
      else if (t.sbSeat === to) t.sbSeat = from
      if (t.bbSeat === from) t.bbSeat = to
      else if (t.bbSeat === to) t.bbSeat = from
      if (t.currentSeat === from) t.currentSeat = to
      else if (t.currentSeat === to) t.currentSeat = from
      return withLog(t, 'info', `${p.name} → ${to + 1}. koltuk`, undefined, to)
    }

    case 'setStatus': {
      const p = byId(t, action.id)
      if (!p) return t
      if (action.status === 'cashedout' || action.status === 'out') {
        return applyTableAction(t, { type: 'cashOut', id: action.id })
      }
      if (action.status === 'sitout' && p.invested > 0) return withLog(t, 'info', 'Çip masadaki oyuncu mola veremez')
      p.status = action.status
      // sıra bu koltuktaysa ve oyuncu artık hamle yapamıyorsa, sırayı geçer bir oyuncuya taşı
      if (t.currentSeat === p.seat && t.handActive && p.status !== 'playing') {
        const n = nextToAct(t, t.currentSeat, 1)
        if (n !== -1) t.currentSeat = n
      }
      return withLog(t, 'info', `${p.name} → ${action.status === 'playing' ? 'oyunda' : 'mola verdi'}`, undefined, p.seat)
    }

    case 'setButton': {
      const p = playerAt(t, action.seat)
      if (!p) return t
      if (p.status === 'out' || p.status === 'cashedout') return withLog(t, 'info', 'Düğme yalnızca masadaki bir oyuncuya verilebilir')
      // el sırasında düğme değişirse körler da değişmiş görünür; uyar
      if (t.handActive && t.buttonSeat !== action.seat) {
        withLog(t, 'info', 'Dikkat: el devam ederken düğme değiştirildi')
      }
      t.buttonSeat = action.seat
      return withLog(t, 'info', `Düğme (Dealer) → ${p.name}`, undefined, action.seat)
    }

    case 'startHand':
      return startHand(t)

    case 'endHand':
      return endHand(t)

    case 'nextTurn': {
      const n = nextToAct(t, t.currentSeat, action.dir ?? 1)
      t.currentSeat = n === -1 ? t.currentSeat : n
      return t
    }

    case 'setCurrent':
      t.currentSeat = action.seat
      return t

    case 'pushChips': {
      const p = byId(t, action.id)
      if (!p) return t
      const a = post(p, action.amount)
      if (a === 0) return withLog(t, 'info', `${p.name} elinde çip kalmadı`)
      return withLog(t, 'bet', `${p.name} → ${fmtN(a)} çip`, a, p.seat)
    }

    case 'pullChips': {
      const p = byId(t, action.id)
      if (!p) return t
      const a = clamp(Math.round(action.amount), 0, p.bet)
      if (a === 0) return t
      p.bet -= a
      p.invested -= a
      p.stack += a
      if (p.stack > 0) p.allIn = false
      return withLog(t, 'return', `${p.name}'ten ${fmtN(a)} çip geri alındı`, a, p.seat)
    }

    case 'allIn': {
      const p = byId(t, action.id)
      if (!p) return t
      const a = post(p, p.stack)
      if (a === 0) return t
      return withLog(t, 'bet', `${p.name} ALL-IN! ${fmtN(a)} çip`, a, p.seat)
    }

    case 'call': {
      const p = byId(t, action.id)
      if (!p) return t
      const need = Math.max(0, currentMaxBet(t) - p.bet)
      const a = post(p, Math.min(need, p.stack))
      if (a === 0) return t
      return withLog(t, 'bet', `${p.name} ${fmtN(a)} çip çağırdı${need > p.stack ? ' (kısa)' : ''}`, a, p.seat)
    }

    case 'fold': {
      const p = byId(t, action.id)
      if (!p) return t
      p.folded = true
      return withLog(t, 'fold', `${p.name} pas geçti`, undefined, p.seat)
    }

    case 'clearBet': {
      const p = byId(t, action.id)
      if (!p || p.bet === 0) return t
      const a = p.bet
      p.bet = 0
      p.invested -= a
      p.stack += a
      p.allIn = false
      return withLog(t, 'return', `${p.name} önündeki ${fmtN(a)} çip geri alındı`, a, p.seat)
    }

    case 'distribute':
      return distribute(t, action.winners)

    case 'split':
      return split(t, action.winners)

    case 'rebuy': {
      const p = byId(t, action.id)
      if (!p) return t
      const a = Math.max(0, Math.round(action.amount))
      if (a === 0) return t
      p.stack += a
      p.buyInTotal += a
      p.rebuys += 1
      // bust olmuş oyuncu çip alınca oyuna döner. 'cashedout' oyuncu
      // bilinçli olarak masayı terk ettiği için masada sayılmaz;
      // geri dönebilmesi için durumu 'playing' yapılmalı.
      if (p.status === 'out' && p.stack > 0) p.status = 'playing'
      return withLog(t, 'rebuy', `${p.name} +${fmtN(a)} çip (rebuy #${p.rebuys})`, a, p.seat)
    }

    case 'cashOut': {
      const p = byId(t, action.id)
      if (!p) return t
      if (p.invested > 0) return withLog(t, 'info', 'El bitmeden çıkılamaz')
      const a = p.stack
      p.cashOutTotal += a
      p.stack = 0
      p.status = 'cashedout'
      return withLog(t, 'cashout', `${p.name} masayı bıraktı (+${fmtN(a)} çip)`, a, p.seat)
    }

    case 'setStack': {
      const p = byId(t, action.id)
      if (!p) return t
      const a = Math.max(0, Math.round(action.amount))
      const diff = a - p.stack
      p.stack = a
      p.buyInTotal += diff
      // El ortasında stack 0 yapılırsa oyuncunun masada yatırımı varsa all-in
      // sayılır (yoksa masadaki çip kimse tarafından çağrılamaz ve oyuncu da
      // kimseyi çağıramaz). Yatırımı yoksa oyuncu bust olur.
      if (p.stack === 0 && p.invested > 0) p.allIn = true
      else if (p.stack === 0 && p.status === 'playing') p.status = 'out'
      if (p.stack > 0) p.allIn = false
      return withLog(t, 'info', `${p.name} stack düzeltildi: ${fmtN(a)}`, diff || undefined, p.seat)
    }

    case 'resetChips': {
      t.players.forEach((p) => {
        p.stack = t.buyIn
        p.bet = 0
        p.invested = 0
        p.allIn = false
        p.folded = false
        p.status = 'playing'
        p.buyInTotal = t.buyIn
        p.cashOutTotal = 0
        p.rebuys = 0
      })
      t.buttonSeat = t.players[0]?.seat ?? 0
      t.currentSeat = t.players[0]?.seat ?? 0
      t.handActive = false
      t.handNumber = 0
      // kör seviyesi listesi boşsa sb/bb mevcut değerlerinde kalır (bayat değer yazılmaz)
      if (t.blindLevels.length > 0) {
        t.blindLevel = 0
        const lvl = t.blindLevels[0]
        t.sb = lvl.sb
        t.bb = lvl.bb
      }
      return withLog(t, 'setup', `Yeni oyun: herkes ${fmtN(t.buyIn)} çip ile başlıyor`)
    }

    case 'clearLog':
      t.log = []
      return t

    default:
      return t
  }
}

function blankPlayer(seat: number, name: string, buyIn: number): Player {
  return {
    id: uid('p'),
    name,
    seat,
    stack: buyIn,
    bet: 0,
    invested: 0,
    status: 'playing',
    allIn: false,
    folded: false,
    buyInTotal: buyIn,
    cashOutTotal: 0,
    rebuys: 0,
  }
}

// eldeki tüm çipler oyuncuların stack'ine geri verilir (el iptal / el kapanışı)
function refundBets(t: Table): number {
  let refunded = 0
  t.players.forEach((p) => {
    if (p.invested > 0) {
      refunded += p.invested
      p.stack += p.invested
    }
    p.invested = 0
    p.bet = 0
    p.folded = false
    p.allIn = false
    if (p.status === 'playing' && p.stack === 0) p.status = 'out'
  })
  return refunded
}

function startHand(prev: Table): Table {
  const t = prev
  // Bu elde oynayacak koltuklar: yalnız 'playing' olan ve elinde çip bulunanlar.
  // 'sitout' (mola), 'out' (bust) ve 'cashedout' (çıkış) oyuncular bu elde yok sayılır;
  // böylece mola veren ya da çipi biten oyuncu kâre geçip sıradakinin körünü yutmaz.
  const seats = t.players
    .filter((p) => p.status === 'playing' && p.stack + p.invested > 0)
    .map((p) => p.seat)
    .sort((a, b) => a - b)
  if (seats.length < 2) return withLog(t, 'info', 'Başlamak için en az 2 oyuncu gerekli')

  const refunded = refundBets(t)
  if (refunded > 0) {
    withLog(t, 'return', `Önceki elde masada kalan ${fmtN(refunded)} çip oyunculara iade edildi`, refunded)
  }

  // düğme: eldeki bir oyuncunun koltuğunda olmalı. Ölü bir koltuğa düşmüşse
  // (oyuncu kalktı/bust/çıktı/mola verdi) sıradaki oyuncuya atlar (ölü düğme kuralı).
  const nextSeat = (from: number): number => {
    const i = seats.findIndex((s) => s > from)
    return i === -1 ? seats[0] : seats[i]
  }
  const bi = seats.indexOf(t.buttonSeat)
  if (bi === -1) t.buttonSeat = nextSeat(t.buttonSeat)
  else if (t.handNumber > 0) t.buttonSeat = seats[(bi + 1) % seats.length]

  const headsUp = seats.length === 2

  // ante: eldeki her oyuncu aynı miktarı öder
  if (t.ante > 0) {
    seats.forEach((seat) => {
      const p = playerAt(t, seat)
      if (p) post(p, t.ante)
    })
  }

  // Körler düğmeden sonraki oyuncu sırasına göre verilir: 1. oyuncu SB, 2. oyuncu BB.
  // Koltuk numarası boşluklu olsa da doğru oyuncuya gider.
  const order = headsUp
    ? [t.buttonSeat, ...seats.filter((s) => s !== t.buttonSeat)]
    : [...seats.filter((s) => s > t.buttonSeat), ...seats.filter((s) => s <= t.buttonSeat)]
  // Ante sonrası çipi biten oyuncu köre girmez, kör sıradakine kayar: kimse
  // körsüz kalmasın. Herkes all-in ise sıra yine korunur.
  const payable = order.filter((s) => (playerAt(t, s)?.stack ?? 0) > 0)
  let blinds = payable
  if (payable.length === 0) blinds = order.slice(0, 2)
  else if (payable.length === 1) blinds = [payable[0], order.find((s) => s !== payable[0]) ?? payable[0]]
  const sbSeat = blinds[0] ?? -1
  const bbSeat = blinds[1] ?? -1

  let sbPlayer: Player | undefined
  let bbPlayer: Player | undefined
  if (sbSeat !== -1) sbPlayer = playerAt(t, sbSeat)
  if (bbSeat !== -1) bbPlayer = playerAt(t, bbSeat)
  if (sbPlayer) post(sbPlayer, t.sb)
  if (bbPlayer) post(bbPlayer, t.bb)

  t.handActive = true
  t.sbSeat = sbSeat === -1 ? null : sbSeat
  t.bbSeat = bbSeat === -1 ? null : bbSeat
  // ilk hamle: heads-up'ta SB, geri kalanda BB'den sonraki ilk oyuncu.
  // Körlerden sonra çipi biten (all-in) oyuncular sıradan çıkar.
  const firstAct = headsUp ? sbSeat : nextOccupied(t, bbSeat === -1 ? sbSeat : bbSeat, 1, true)
  t.currentSeat = firstAct === -1 ? (sbSeat === -1 ? (seats[0] ?? 0) : sbSeat) : firstAct

  const parts = [`El #${t.handNumber + 1}`]
  if (sbPlayer) parts.push(`SB ${sbPlayer.name} ${fmtN(sbPlayer.bet)}`)
  if (bbPlayer) parts.push(`BB ${bbPlayer.name} ${fmtN(bbPlayer.bet)}`)
  return withLog(t, 'hand', parts.join(' · '))
}

function endHand(prev: Table): Table {
  const t = prev
  const refunded = refundBets(t)
  t.handActive = false
  t.sbSeat = null
  t.bbSeat = null
  t.handNumber += 1

  if (t.handsPerLevel > 0 && t.blindLevels.length > 0) {
    // hedef seviyeye tek adımda monotonik olarak kilitlen (eller atlansa da geri de gitmeli)
    const target = clamp(Math.floor(t.handNumber / t.handsPerLevel), 0, t.blindLevels.length - 1)
    if (target !== t.blindLevel) {
      const up = target > t.blindLevel
      t.blindLevel = target
      const lvl = t.blindLevels[t.blindLevel]
      t.sb = lvl.sb
      t.bb = lvl.bb
      withLog(
        t,
        'info',
        `${up ? 'Körler yükseldi' : 'Körler düşürüldü'}: SB ${fmtN(lvl.sb)} / BB ${fmtN(lvl.bb)}`,
      )
    }
  }
  // sıra, düğme ölü bir koltuğa düşmüşse masadaki ilk oyuncuya döner
  const seated = occupiedSeats(t).sort((a, b) => a - b)
  t.currentSeat = seated.includes(t.buttonSeat) ? t.buttonSeat : (seated[0] ?? t.buttonSeat)
  return withLog(
    t,
    'hand',
    refunded > 0 ? `El #${t.handNumber} kapandı · ${fmtN(refunded)} çip iade edildi` : `El #${t.handNumber} kapandı`,
    refunded || undefined,
  )
}

/** dağıtım planı: hangi oyuncuya ne kadar gidecek (onay öncesi önizleme) */
export function planPayout(t: Table, winnerIds: string[]) {
  const pots = computePots(t.players)
  const wins = winnerIds.filter((id) => byId(t, id))
  const gains: Record<string, number> = {}
  let unclaimed = 0
  for (const pot of pots) {
    const candidates = pot.eligible.filter((id) => wins.includes(id))
    if (candidates.length === 0) {
      unclaimed += pot.amount
      continue
    }
    const best = candidates
      .map((id) => byId(t, id)!)
      .sort((b, a) => b.invested - a.invested)[0]
    gains[best.id] = (gains[best.id] ?? 0) + pot.amount
  }
  return { pots, gains, unclaimed, total: pots.reduce((s, p) => s + p.amount, 0) }
}

function distribute(t: Table, winnerIds: string[]): Table {
  const plan = planPayout(t, winnerIds)
  if (plan.pots.length === 0 || plan.total === 0) return withLog(t, 'info', 'Dağıtılacak çip yok')
  if (Object.keys(plan.gains).length === 0) return withLog(t, 'info', 'Kazanan seç')
  if (plan.unclaimed > 0) return withLog(t, 'info', `${fmtN(plan.unclaimed)} çip için uygun kazanan yok`)

  return payout(
    t,
    plan.gains,
    Object.keys(plan.gains).length > 1 ? 'Yan potlar dağıtıldı' : 'Pot dağıtıldı',
  )
}

function split(t: Table, winnerIds: string[]): Table {
  const winners = winnerIds.filter((id) => byId(t, id))
  if (winners.length === 0) return withLog(t, 'info', 'Kazanan seç')
  const total = t.players.reduce((s, p) => s + p.invested, 0)
  if (total === 0) return withLog(t, 'info', 'Dağıtılacak çip yok')

  const share = Math.floor(total / winners.length)
  const remainder = total - share * winners.length
  const gained: Record<string, number> = {}
  // artık çipler düğmeden sonra sırayla dağıtılır: en yakın koltuğa değil,
  // düğmeye en yakın kazananın solundaki ilk kazanan ilk artığı alır
  const order = [...winners]
    .map((id) => byId(t, id)!)
    .sort((a, b) => cyclicDistance(a.seat, t.buttonSeat) - cyclicDistance(b.seat, t.buttonSeat))
    .map((p) => p.id)
  for (const id of winners) gained[id] = share
  for (let i = 0; i < remainder; i++) {
    gained[order[i % order.length]] += 1
  }
  return payout(t, gained, winners.length > 1 ? `${winners.length} kişiye bölündü` : 'Pot dağıtıldı')
}

/** düğmeden başlayarak saat yönünde kaçıncı koltuk (0 = düğmenin kendisi) */
function cyclicDistance(seatA: number, from: number): number {
  return (((seatA - from) % 1000) + 1000) % 1000
}

function payout(t: Table, gained: Record<string, number>, text: string): Table {
  const totalPot = t.players.reduce((s, p) => s + p.invested, 0)
  const awarded = Object.values(gained).reduce((a, b) => a + b, 0)
  // güvenlik: sadece potun tamamı dağıtıldığında tüm yatırımlar temizlenir
  if (awarded !== totalPot) {
    return withLog(t, 'info', 'Potun tamamı dağıtılmadı, çipler masada kalıyor')
  }

  const lines: string[] = []
  Object.entries(gained).forEach(([id, amount]) => {
    const p = byId(t, id)
    if (!p) return
    p.stack += amount
    lines.push(`${p.name} +${fmtN(amount)}`)
  })
  // pot payıldı: artık masada yatırım kalmadı
  t.players.forEach((p) => {
    p.bet = 0
    p.invested = 0
    p.folded = false
    p.allIn = false
    if (p.stack > 0 && (p.status === 'out' || p.status === 'cashedout')) p.status = 'playing'
  })
  const ids = Object.keys(gained)
  return withLog(t, ids.length > 1 ? 'split' : 'win', `${text}: ${lines.join(', ')}`, totalPot || undefined, byId(t, ids[0])?.seat)
}

export function tableNets(t: Table) {
  return t.players.map((p) => ({ p, net: netOf(p) })).sort((a, b) => b.net - a.net)
}

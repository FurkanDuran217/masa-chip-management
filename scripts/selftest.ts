/**
 * Çip muhasebesi kendi kendine testi.
 * Çalıştırma:  npm run selftest
 *
 * Ana değişmez (invariant):
 *   Σ (stack + invested + cashOutTotal) === Σ buyInTotal
 * Yani hiçbir çip yok olmaz, hiçbir çip yoktan çıkmaz.
 */
import { computePots, currentMaxBet, decompose, nextOccupied, nextToAct, playerAt, toCall } from '../src/lib/chips'
import { applyTableAction, createTable, planPayout, type NewTableInput, type TableAction } from '../src/lib/table'
import { emptyState, exportTable, parseImport, rootReducer, type RootAction } from '../src/lib/store'
import type { AppState, Player, PlayerStatus, Table } from '../src/lib/types'

let failures = 0
let checks = 0

function check(label: string, cond: boolean, detail = '') {
  checks++
  if (!cond) {
    failures++
    console.error(`  x ${label} ${detail}`)
  }
}

function invariant(t: Table, step: string) {
  const left = t.players.reduce((s, p) => s + p.stack + p.invested + p.cashOutTotal, 0)
  const right = t.players.reduce((s, p) => s + p.buyInTotal, 0)
  check(`koruma [${step}]`, left === right, `${left} != ${right}`)
  check(
    `negatif yok [${step}]`,
    t.players.every((p) => p.stack >= 0 && p.bet >= 0 && p.invested >= 0),
    JSON.stringify(t.players.map((p) => ({ n: p.name, s: p.stack, b: p.bet, i: p.invested }))),
  )
  const pot = t.players.reduce((s, p) => s + p.invested, 0)
  const sum = computePots(t.players).reduce((s, x) => s + x.amount, 0)
  check(`pot parcalari [${step}]`, sum === pot, `${sum} != ${pot}`)
  check(`bet<=invested [${step}]`, t.players.every((p) => p.bet <= p.invested))
  check(`stack yoksa allIn [${step}]`, t.players.every((p) => !(p.stack === 0 && p.invested > 0) || p.allIn))
  check(`tum oyuncular benzersiz koltuk [${step}]`, new Set(t.players.map((p) => p.seat)).size === t.players.length)
}

function seq(t: Table, actions: TableAction[]): Table {
  let cur = t
  actions.forEach((a, i) => {
    cur = applyTableAction(cur, a)
    invariant(cur, `${a.type}#${i}`)
  })
  return cur
}

function build(n = 6, opts: { sb?: number; bb?: number; buyIn?: number } = {}): Table {
  let t = createTable({ maxPlayers: n, buyIn: opts.buyIn ?? 5000, sb: opts.sb ?? 25, bb: opts.bb ?? 50, chipValue: 1 })
  for (let i = 0; i < n; i++) t = applyTableAction(t, { type: 'addPlayer', name: `Oyuncu ${i + 1}` })
  t = applyTableAction(t, { type: 'startHand' })
  return t
}

const potOf = (t: Table) => t.players.reduce((s, p) => s + p.invested, 0)
const stackSum = (t: Table) => t.players.reduce((s, p) => s + p.stack, 0)
const byId = (t: Table, id: string) => t.players.find((p) => p.id === id)!

/** herkesi maxBet seviyesine kadar eşitler */
function everyoneCalls(t: Table, rounds = 3): Table {
  let cur = t
  for (let r = 0; r < rounds; r++) {
    const target = currentMaxBet(cur)
    cur.players.forEach((p) => {
      if (!p.folded && p.bet < target && p.stack > 0) {
        cur = applyTableAction(cur, { type: 'call', id: p.id })
      }
    })
  }
  return cur
}

// ------------------------------------------------ 9+ bölümleri için yardımcılar

/** anahtar sırasından bağımsız, kararlı JSON (derin karşılaştırma için) */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.keys(val as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((acc, k) => {
            acc[k] = (val as Record<string, unknown>)[k]
            return acc
          }, {})
      : val,
  )
}

/** options ile masa kurar (el açılmaz) */
function tableOf(opts: NewTableInput = {}, names: string[] = ['Ali', 'Veli', 'Ayşe', 'Can', 'Deniz', 'Ece']): Table {
  let t = createTable({ maxPlayers: Math.max(2, names.length), chipValue: 1, ...opts })
  names.forEach((n) => {
    t = applyTableAction(t, { type: 'addPlayer', name: n })
  })
  return t
}

/** körsüz masa kurar, verilen miktarları yatırır: pot tam olarak amounts toplamı olur */
function funded(amounts: number[], opts: NewTableInput = {}): Table {
  const names = amounts.map((_, i) => `O${i + 1}`)
  const buyIn = Math.max(1, ...amounts) * 4 + 100
  let t = tableOf({ buyIn, sb: 0, bb: 0, ante: 0, maxPlayers: Math.max(2, names.length), ...opts }, names)
  t = applyTableAction(t, { type: 'startHand' })
  amounts.forEach((a, i) => {
    if (a > 0) t = applyTableAction(t, { type: 'pushChips', id: t.players[i].id, amount: a })
  })
  return t
}

/** koltuktaki oyuncu (undefined = boş koltuk) */
const seatOf = (t: Table, seat: number): Player | undefined => playerAt(t, seat)

/** koltuktaki oyuncunun bahsi (koltuk yoksa -1) */
const betAt = (t: Table, seat: number | null): number => (seat === null ? -1 : seatOf(t, seat)?.bet ?? -1)

/** koltuktaki oyuncunun durumu (koltuk yoksa 'yok') */
const statusAt = (t: Table, seat: number | null): PlayerStatus | 'yok' =>
  seat === null ? 'yok' : seatOf(t, seat)?.status ?? 'yok'

/** 'playing' durumundaki oyuncuların koltukları */
const playingSeats = (t: Table) => t.players.filter((p) => p.status === 'playing').map((p) => p.seat).sort((a, b) => a - b)

/** updatedAt hariç derin eşitlik */
const sameTable = (a: Table, b: Table) => {
  const { updatedAt: _ua, ...ra } = a
  const { updatedAt: _ub, ...rb } = b
  return canon(ra) === canon(rb)
}

/** oyuncu kimliği hariç derin eşitlik */
const samePlayer = (a: Player, b: Player) => {
  const { id: _ia, ...pa } = a
  const { id: _ib, ...pb } = b
  return canon(pa) === canon(pb)
}

/** id / log / zaman damgaları / oyuncular çıkarılmış masa alanları */
function tableFields(t: Table): Record<string, unknown> {
  const { id: _i, log: _l, createdAt: _c, updatedAt: _u, players: _p, ...rest } = t
  return rest as Record<string, unknown>
}

/** dağıtım öncesi stack'lar (kazançları ölçmek için) */
const stacksOf = (t: Table) => Object.fromEntries(t.players.map((p) => [p.id, p.stack]))

/** parseImport geçersiz girdide hata fırlatıyor mu? */
function importThrows(text: string): boolean {
  try {
    parseImport(text)
    return false
  } catch {
    return true
  }
}

/** kök reducer'a sırayla aksiyon uygular */
const runRoot = (s: AppState, ...actions: RootAction[]): AppState => actions.reduce(rootReducer, s)

/** uzun soak'un tohumu: çıktıda yazar, aynı tohum aynı hataları üretir */
const SOAK_SEED = 20260101
/** soak sırasında bir kontrolün adresi (hata çıktısında kullanılır) */
const soakAt = (round: number, step: number, action: TableAction) => `soak[${SOAK_SEED}] tur ${round} adim ${step} ${action.type}`

// ---------------------------------------------------------------- 1) temel akış
console.log('1) temel el akisi')
{
  let t = build(6)
  const sb = t.players.find((p) => p.seat === t.sbSeat)!
  const bb = t.players.find((p) => p.seat === t.bbSeat)!
  check('SB 25 odedi', sb.bet === 25, `${sb.bet}`)
  check('BB 50 odedi', bb.bet === 50, `${bb.bet}`)
  check('pot 75', potOf(t) === 75, `${potOf(t)}`)
  check('sira BB sonrasi', t.currentSeat === (t.bbSeat! + 1) % 6, `${t.currentSeat} vs ${t.bbSeat}`)
  invariant(t, 'baslangic')

  const utg = playerAt(t, t.currentSeat)!
  check('toCall hesabi', toCall(utg, currentMaxBet(t)) === 50, `${toCall(utg, currentMaxBet(t))}`)
  t = seq(t, [{ type: 'call', id: utg.id }])
  check('UTG cagirildi', byId(t, utg.id).bet === 50, `${byId(t, utg.id).bet}`)

  const raiser = playerAt(t, t.currentSeat)!
  t = seq(t, [{ type: 'pushChips', id: raiser.id, amount: 200 }])
  check('raise 250', byId(t, raiser.id).bet === 250, `${byId(t, raiser.id).bet}`)

  t = everyoneCalls(t)
  invariant(t, 'hepsi esitlendi')
  check('pot = 6 x 250', potOf(t) === 1500, `${potOf(t)}`)
  check('hepsi 250', t.players.every((p) => p.bet === 250), JSON.stringify(t.players.map((p) => p.bet)))

  const winner = t.players[2]
  const plan = planPayout(t, [winner.id])
  check('plan = pot', plan.gains[winner.id] === 1500, `${plan.gains[winner.id]}`)
  check('unclaimed yok', plan.unclaimed === 0)
  t = applyTableAction(t, { type: 'distribute', winners: [winner.id] })
  check('kazanan bitti', t.players[2].stack === 5000 - 250 + 1500, `${t.players[2].stack}`)
  check('pot bosaldi', potOf(t) === 0)
  check('el kapanmadi', t.handActive === true)
  invariant(t, 'payout')

  t = applyTableAction(t, { type: 'endHand' })
  check('el kapandi', t.handActive === false)
  check('el sayaci 1', t.handNumber === 1)
  check('eller bos', t.players.every((p) => p.bet === 0 && p.invested === 0))
  check('el kapaninca cips iade', stackSum(t) === 6 * 5000, `${stackSum(t)}`)
  invariant(t, 'endHand')
}

// ---------------------------------------------------------------- 2) all-in + yan pot
console.log('2) all-in ve yan pot')
{
  let t = build(6)
  // 3 farklı büyüklükte yatırım: 5000 / 1525 / 3050
  const [a, b, c] = t.players
  t = seq(t, [
    { type: 'allIn', id: a.id },
    { type: 'pushChips', id: b.id, amount: 1500 },
    { type: 'pushChips', id: c.id, amount: 3000 },
  ])
  check('a all-in', a.id && byId(t, a.id).allIn && byId(t, a.id).stack === 0)
  const pots = computePots(t.players)
  check('tam 3 pot', pots.length === 3, `${pots.length}`)
  check('pot toplami = yatirim', pots.reduce((s, p) => s + p.amount, 0) === potOf(t))
  check('ana pot en az 3 kisi', pots[0].eligible.length >= 3, `${pots[0].eligible.length}`)
  check('son pot tek kisi', pots[2].eligible.length === 1, `${pots[2].eligible.length}`)
  invariant(t, 'yan potlar')

  // en büyük yatırımcı her potu alır
  const big = t.players.reduce((x, y) => (y.invested > x.invested ? y : x))
  const plan = planPayout(t, [big.id])
  check('buyuk yatirimci her potu alir', plan.unclaimed === 0 && plan.gains[big.id] === potOf(t),
    `${plan.gains[big.id]} / ${potOf(t)}`)
  t = applyTableAction(t, { type: 'distribute', winners: [big.id] })
  check('pot tamamen bos', potOf(t) === 0)
  check('herkesin stack = yatirim + eski stack', stackSum(t) === 6 * 5000, `${stackSum(t)}`)
  invariant(t, 'yan pot payout')
}
{
  // aynı eli 2 kazanan arasında paylaştırma: toplam korunmalı
  let t = build(6)
  const [a, b] = t.players
  t = seq(t, [{ type: 'pushChips', id: a.id, amount: 1000 }, { type: 'pushChips', id: b.id, amount: 2000 }])
  const before = stackSum(t)
  const pot = potOf(t)
  t = applyTableAction(t, { type: 'split', winners: [a.id, b.id] })
  check('bolustu, korundu', stackSum(t) === before + pot, `${stackSum(t)} vs ${before + pot}`)
  check('ikisi de aldI', t.players[0].stack > 0 && t.players[1].stack > 0)
  invariant(t, 'split yan pot')
}

// ---------------------------------------------------------------- 3) bölüşme
console.log('3) pot bolusme (artik cipler)')
{
  let t = build(5)
  t = everyoneCalls(t)
  const pot = potOf(t)
  const before = stackSum(t)
  check('5 x 50 = 250 pot', pot === 250, `${pot}`)
  t = applyTableAction(t, { type: 'split', winners: [t.players[0].id, t.players[1].id, t.players[2].id] })
  check('3 kisiye bolundu', stackSum(t) === before + pot, `${stackSum(t)} vs ${before + pot}`)
  const gain = stackSum(t) - before
  check('bolum ~ esit', Math.abs(gain / 3 - pot / 3) < 1, `${gain} / 3 = ${gain / 3}`)
  check('korundu', stackSum(t) === 5 * 5000, `${stackSum(t)}`)
  invariant(t, 'split')
}

// ---------------------------------------------------------------- 4) kör yükseltme
console.log('4) kor yukseltme (turnuva)')
{
  let t = createTable({ maxPlayers: 4, buyIn: 5000, sb: 10, bb: 20, handsPerLevel: 5 })
  t = applyTableAction(t, {
    type: 'settings',
    patch: { blindLevels: [{ sb: 10, bb: 20 }, { sb: 20, bb: 40 }, { sb: 40, bb: 80 }, { sb: 80, bb: 160 }] },
  })
  for (let i = 0; i < 4; i++) t = applyTableAction(t, { type: 'addPlayer', name: `P${i}` })
  const ladder: Array<[number, number, number]> = [
    [5, 20, 40],
    [10, 40, 80],
    [15, 80, 160],
    [16, 80, 160],
  ]
  for (let h = 1; h <= 16; h++) {
    t = applyTableAction(t, { type: 'startHand' })
    t = applyTableAction(t, { type: 'endHand' })
    const want = ladder.find(([at]) => at === h)
    if (want) check(`${h}. el kor seviyesi`, t.sb === want[1] && t.bb === want[2], `${t.sb}/${t.bb} != ${want[1]}/${want[2]}`)
    invariant(t, `el ${h}`)
  }
  check('kisa oyun korleri degistirmez', createTable({ maxPlayers: 4, handsPerLevel: 0 }).handsPerLevel === 0)
}

// ---------------------------------------------------------------- 5) rebuy / çıkış / düzeltme
console.log('5) rebuy, cikis, duzeltme')
{
  let t = build(4)
  const id = t.players[0].id
  const stackBefore = byId(t, id).stack
  t = applyTableAction(t, { type: 'rebuy', id, amount: 2000 })
  check('rebuy stack += 2000', byId(t, id).stack === stackBefore + 2000, `${byId(t, id).stack} != ${stackBefore + 2000}`)
  check('rebuy sayaci', byId(t, id).rebuys === 1)
  invariant(t, 'rebuy')

  t = applyTableAction(t, { type: 'setStack', id, amount: 3000 })
  check('duzeltme stack 3000', byId(t, id).stack === 3000, `${byId(t, id).stack}`)
  invariant(t, 'duzeltme')

  const beforeCash = byId(t, id).stack
  t = applyTableAction(t, { type: 'endHand' })
  t = applyTableAction(t, { type: 'cashOut', id })
  check('cikista stack 0', byId(t, id).stack === 0)
  check('cikista odeme', byId(t, id).cashOutTotal === beforeCash, `${byId(t, id).cashOutTotal} != ${beforeCash}`)
  check('durum ayakta', byId(t, id).status === 'cashedout')
  check('net sifir', byId(t, id).stack + byId(t, id).cashOutTotal === byId(t, id).buyInTotal)
  invariant(t, 'cikis')
}

// ---------------------------------------------------------------- 6) sıra & düğme
console.log('6) sira ve dugme')
{
  const t = build(6)
  check('aktif oyuncu var', nextToAct(t, t.currentSeat) !== -1)
  check('korrler farkli', t.sbSeat !== null && t.bbSeat !== null && t.sbSeat !== t.bbSeat)
  const first = t.buttonSeat
  let x = applyTableAction(t, { type: 'endHand' })
  x = applyTableAction(x, { type: 'startHand' })
  check('dugme dondu', x.buttonSeat !== first, `${first} -> ${x.buttonSeat}`)
  check('dugme dolu koltuga', !!playerAt(x, x.buttonSeat))
  invariant(x, 'dugme rotasyon')
}

// ---------------------------------------------------------------- 7) heads-up
console.log('7) heads-up (2 kisi)')
{
  const t = build(2)
  check('SB = dugme', t.sbSeat === t.buttonSeat, `${t.sbSeat} vs ${t.buttonSeat}`)
  check('BB = digeri', t.bbSeat === (t.buttonSeat + 1) % 2)
  check('SB/BB miktari dogru', t.players.find((p) => p.seat === t.sbSeat)!.bet === 25)
  check('ilk hamle SB', t.currentSeat === t.sbSeat, `${t.currentSeat}`)
  invariant(t, 'heads-up')
}

// ---------------------------------------------------------------- 8) fuzz
console.log('8) rastgele islem fuzzu')
{
  let seed = 20241005
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]

  for (let round = 0; round < 60 && failures === 0; round++) {
    const seats = 2 + Math.floor(rnd() * 8)
    let t = createTable({
      maxPlayers: seats,
      buyIn: 1000 + Math.floor(rnd() * 4000),
      sb: 5,
      bb: 10,
      chipValue: 1,
    })
    for (let i = 0; i < seats; i++) t = applyTableAction(t, { type: 'addPlayer', name: `P${i}` })
    invariant(t, `fuzz${round}/kurulum`)

    for (let step = 0; step < 80 && failures === 0; step++) {
      const roll = rnd()
      const p = t.players.length > 0 ? pick(t.players) : undefined
      const others = t.players.filter((x) => x.id !== p?.id)
      let action: TableAction
      if (roll < 0.13) action = { type: 'startHand' }
      else if (roll < 0.25) action = { type: 'endHand' }
      else if (roll < 0.37 && p) action = { type: 'pushChips', id: p.id, amount: Math.floor(rnd() * 900) }
      else if (roll < 0.45 && p) action = { type: 'pullChips', id: p.id, amount: Math.floor(rnd() * 900) }
      else if (roll < 0.53 && p) action = { type: 'allIn', id: p.id }
      else if (roll < 0.61 && p) action = { type: 'call', id: p.id }
      else if (roll < 0.67 && p) action = { type: 'fold', id: p.id }
      else if (roll < 0.73) action = { type: 'nextTurn' }
      else if (roll < 0.79 && p && others.length > 0)
        action = { type: 'distribute', winners: [rnd() < 0.7 ? p.id : pick(others).id] }
      else if (roll < 0.85 && p && others.length > 0)
        action = { type: 'split', winners: [p.id, pick(others).id] }
      else if (roll < 0.89 && p) action = { type: 'rebuy', id: p.id, amount: Math.floor(rnd() * 3000) }
      else if (roll < 0.93 && p) action = { type: 'setStack', id: p.id, amount: Math.floor(rnd() * 6000) }
      else if (roll < 0.96 && p) action = { type: 'cashOut', id: p.id }
      else if (roll < 0.98 && p) action = { type: 'clearBet', id: p.id }
      else action = { type: 'setButton', seat: Math.floor(rnd() * seats) }

      t = applyTableAction(t, action)
      invariant(t, `fuzz${round}/${action.type}`)
    }
  }
  console.log('   fuzz bitti')
}

// ---------------------------------------------------------------- 9) ante
console.log('9) ante')
{
  let t = tableOf({ maxPlayers: 4, buyIn: 5000, sb: 25, bb: 50, ante: 10 }, ['Ali', 'Veli', 'Ayşe', 'Can'])
  invariant(t, 'ante/kurulum')
  t = applyTableAction(t, { type: 'startHand' })
  invariant(t, 'ante/baslangic')

  const digerleri = t.players.filter((p) => p.id !== byId(t, seatOf(t, t.sbSeat!)?.id ?? '')!.id &&
    p.id !== byId(t, seatOf(t, t.bbSeat!)?.id ?? '')!.id)
  check('korsuz oyuncular tam 10 ante', digerleri.length === 2 && digerleri.every((p) => p.bet === 10),
    JSON.stringify(digerleri.map((p) => p.bet)))
  check('SB = 10 ante + 25', betAt(t, t.sbSeat) === 35, `${betAt(t, t.sbSeat)}`)
  check('BB = 10 ante + 50', betAt(t, t.bbSeat) === 60, `${betAt(t, t.bbSeat)}`)
  check('pot = 4x10 + 25 + 50 = 115', potOf(t) === 115, `${potOf(t)}`)
  check('pot parcalari 115', computePots(t.players).reduce((s, p) => s + p.amount, 0) === 115)
  check('ante yatirim olarak sayilir', t.players.reduce((s, p) => s + p.invested, 0) === 115)
  check('kalan stack 4965 / 4940', seatOf(t, t.sbSeat!)!.stack === 4965 && seatOf(t, t.bbSeat!)!.stack === 4940,
    `${seatOf(t, t.sbSeat!)?.stack}/${seatOf(t, t.bbSeat!)?.stack}`)
  check('ante ana potu 4 x 10 = 40', computePots(t.players)[0].amount === 40, `${computePots(t.players)[0].amount}`)
  check('ante ana potta herkes hakli', computePots(t.players)[0].eligible.length === 4,
    `${computePots(t.players)[0].eligible.length}`)
  invariant(t, 'ante/eller')
}
{
  // mola veren oyuncu masada sayılmaz: ante de kör de ödemez
  let t = tableOf({ maxPlayers: 4, buyIn: 5000, sb: 25, bb: 50, ante: 30 }, ['Ali', 'Veli', 'Ayşe', 'Can'])
  const sitoutId = t.players[1].id
  const sitoutSeat = t.players[1].seat
  t = seq(t, [{ type: 'setStatus', id: sitoutId, status: 'sitout' }])
  t = applyTableAction(t, { type: 'startHand' })
  check('mola veren ante de kor de odemiyor', byId(t, sitoutId).bet === 0 && byId(t, sitoutId).invested === 0,
    `${byId(t, sitoutId).bet}/${byId(t, sitoutId).invested}`)
  check('mola veren oyuncunun stacki duruyor', byId(t, sitoutId).stack === 5000, `${byId(t, sitoutId).stack}`)
  check('mola veren oyuncuya kor gitmez', t.sbSeat !== sitoutSeat && t.bbSeat !== sitoutSeat,
    `sb=${t.sbSeat} bb=${t.bbSeat} mola=${sitoutSeat}`)
  check('pot 3x30 + 25 + 50 = 165', potOf(t) === 165, `${potOf(t)}`)
  check('sira oynayan oyuncuda', statusAt(t, t.currentSeat) === 'playing', `${t.currentSeat}`)
  invariant(t, 'ante/mola')
}
{
  // antesinden az çipi olan oyuncu elindeki her şeyi all-in yapar
  let t = tableOf({ maxPlayers: 4, buyIn: 5000, sb: 25, bb: 50, ante: 100 }, ['Ali', 'Veli', 'Ayşe', 'Can'])
  const shortId = t.players[2].id
  const shortSeat = t.players[2].seat
  t = seq(t, [{ type: 'setStack', id: shortId, amount: 35 }])
  t = applyTableAction(t, { type: 'startHand' })
  const short = byId(t, shortId)
  check('kisa stack tam all-in', short.stack === 0 && short.allIn, `stack=${short.stack} allIn=${short.allIn}`)
  check('kisa oyuncu elindeki 35i koydu', short.bet === 35 && short.invested === 35, `${short.bet}/${short.invested}`)
  check('kisa oyuncu yalniz ana pota hakli',
    computePots(t.players).filter((p) => p.eligible.includes(shortId)).length === 1,
    JSON.stringify(computePots(t.players).map((p) => p.eligible.length)))
  check('cipsi bitene kor verilmez', t.sbSeat !== shortSeat && t.bbSeat !== shortSeat, `sb=${t.sbSeat} bb=${t.bbSeat}`)
  check('kalan uclu kora girdi', betAt(t, t.sbSeat) === t.ante + t.sb && betAt(t, t.bbSeat) === t.ante + t.bb,
    `${betAt(t, t.sbSeat)}/${betAt(t, t.bbSeat)}`)
  check('pot 100 + 125 + 35 + 150 = 410', potOf(t) === 410, `${potOf(t)}`)
  check('toplam 15035 korundu', stackSum(t) + potOf(t) === 3 * 5000 + 35, `${stackSum(t) + potOf(t)}`)
  invariant(t, 'ante/kisa stack')
}
{
  // ante kör gibi davranır: herkes çağırınca tek katman
  let t = tableOf({ maxPlayers: 4, buyIn: 5000, sb: 25, bb: 50, ante: 50 }, ['Ali', 'Veli', 'Ayşe', 'Can'])
  t = applyTableAction(t, { type: 'startHand' })
  t = everyoneCalls(t)
  check('herkes 100 = 50 ante + kor', t.players.every((p) => p.bet === 100), JSON.stringify(t.players.map((p) => p.bet)))
  check('ante dahil pot 400', potOf(t) === 400, `${potOf(t)}`)
  check('kazanan potun tamamini alir', planPayout(t, [t.players[0].id]).gains[t.players[0].id] === 400)
  t = applyTableAction(t, { type: 'distribute', winners: [t.players[0].id] })
  check('ante dahil dagitim korundu', stackSum(t) === 4 * 5000, `${stackSum(t)}`)
  invariant(t, 'ante/pot')
}

// ---------------------------------------------------------------- 10) heads-up tam el
console.log('10) heads-up tam el ve odeme')
{
  let t = build(2, { buyIn: 5000, sb: 25, bb: 50 })
  const btn = t.players.find((p) => p.seat === t.buttonSeat)!
  const other = t.players.find((p) => p.seat !== t.buttonSeat)!
  check('SB = dugme', t.sbSeat === t.buttonSeat)
  check('BB = digeri', t.bbSeat === other.seat)
  check('ilk hamle SB', t.currentSeat === t.sbSeat, `${t.currentSeat}`)
  check('ilk pot 75', potOf(t) === 75, `${potOf(t)}`)
  // SB katmanı (25+25) ve BB katmanı (25) ayrı hesaplanır; tek pot, ikisi eşitlenince oluşur
  check('ilk pot iki katman (SB + BB)', computePots(t.players).length === 2, `${computePots(t.players).length}`)

  t = seq(t, [{ type: 'call', id: btn.id }])
  check('SB 50 cagri yapti', byId(t, btn.id).bet === 50, `${byId(t, btn.id).bet}`)
  t = seq(t, [{ type: 'allIn', id: other.id }])
  check('BB all-in 5000', byId(t, other.id).allIn && byId(t, other.id).stack === 0 &&
    byId(t, other.id).invested === 5000, `${byId(t, other.id).invested}`)
  t = seq(t, [{ type: 'call', id: btn.id }])
  check('SB de all-in', byId(t, btn.id).allIn && byId(t, btn.id).invested === 5000, `${byId(t, btn.id).invested}`)
  check('pot 10000', potOf(t) === 10000, `${potOf(t)}`)

  const pots = computePots(t.players)
  check('tek pot', pots.length === 1, `${pots.length}`)
  check('pot iki kazanana da acik', pots[0].eligible.length === 2, `${pots[0].eligible.length}`)

  const plan = planPayout(t, [btn.id])
  check('odeme plani potun tamami', plan.gains[btn.id] === 10000 && plan.unclaimed === 0,
    `${plan.gains[btn.id]}/${plan.unclaimed}`)
  t = applyTableAction(t, { type: 'distribute', winners: [btn.id] })
  check('kazanan 10000', byId(t, btn.id).stack === 10000, `${byId(t, btn.id).stack}`)
  check('kaybeden 0', byId(t, other.id).stack === 0)
  check('masa bos', potOf(t) === 0)
  check('toplam 10000', stackSum(t) === 10000, `${stackSum(t)}`)
  invariant(t, 'hu/odeme')

  t = applyTableAction(t, { type: 'endHand' })
  check('kaybeden cikiyor', byId(t, other.id).status === 'out', `${byId(t, other.id).status}`)
  const btnBefore = t.buttonSeat
  const refused = applyTableAction(t, { type: 'startHand' })
  check('tek kisiyle el acilmaz', refused.handActive === false && refused.handNumber === 1,
    `${refused.handActive}/${refused.handNumber}`)
  check('tek kisiyle dugme degismez', refused.buttonSeat === btnBefore, `${btnBefore} -> ${refused.buttonSeat}`)
  check('tek kisiyle pot 0', potOf(refused) === 0, `${potOf(refused)}`)
  invariant(refused, 'hu/tek kisi')

  // rebuy ile geri gelir, düğme diğerine geçer
  t = seq(refused, [{ type: 'rebuy', id: other.id, amount: 5000 }])
  check('rebuy oyuna dondurdu', byId(t, other.id).status === 'playing' && byId(t, other.id).stack === 5000,
    `${byId(t, other.id).status}/${byId(t, other.id).stack}`)
  t = applyTableAction(t, { type: 'startHand' })
  check('dugme degisti', t.buttonSeat !== btnBefore, `${btnBefore} -> ${t.buttonSeat}`)
  check('dugme dolu koltuga', !!seatOf(t, t.buttonSeat))
  check('yeni dugme SB', t.sbSeat === t.buttonSeat, `${t.sbSeat} vs ${t.buttonSeat}`)
  check('digeri BB', t.bbSeat === (t.buttonSeat + 1) % 2, `${t.bbSeat}`)
  check('ilk hamle yine SB', t.currentSeat === t.sbSeat, `${t.currentSeat}`)
  check('pot sb+bb = 75', potOf(t) === 75, `${potOf(t)}`)
  invariant(t, 'hu/rotasyon')
}

// ---------------------------------------------------------------- 11) düğme + kalkış
console.log('11) dugme rotasyonu ve kalkan oyuncular')
{
  let t = build(6)
  const order: number[] = []
  for (let h = 1; h <= 6; h++) {
    check(`el ${h} dugmede oyuncu var`, statusAt(t, t.buttonSeat) === 'playing',
      `dugme=${t.buttonSeat} durum=${statusAt(t, t.buttonSeat)}`)
    check(`el ${h} SB/BB oyuncu koltuğunda`, t.sbSeat !== null && t.bbSeat !== null && t.sbSeat !== t.bbSeat &&
      statusAt(t, t.sbSeat) !== 'yok' && statusAt(t, t.bbSeat) !== 'yok', `sb=${t.sbSeat} bb=${t.bbSeat}`)
    check(`el ${h} pot = sb + bb`, potOf(t) === t.sb + t.bb, `${potOf(t)} != ${t.sb + t.bb}`)
    check(`el ${h} korrler tam odedi`, betAt(t, t.sbSeat) >= t.sb && betAt(t, t.bbSeat) >= t.bb,
      `${betAt(t, t.sbSeat)}/${betAt(t, t.bbSeat)}`)
    if (!order.includes(t.buttonSeat)) order.push(t.buttonSeat)
    invariant(t, `dugme6/el${h}`)
    t = applyTableAction(t, { type: 'endHand' })
    t = applyTableAction(t, { type: 'startHand' })
  }
  check('dugme 6 koltugu da gezdi', order.length === 6, `${order.join(',')}`)
  check('el sonrasi dugme dolu', !!seatOf(t, t.buttonSeat))
  invariant(t, 'dugme6/6el')
}
{
  // düğmedeki oyuncu kalkarsa düğme boş koltuğa değil, dolu koltuğa geçmeli
  let t = build(6)
  t = applyTableAction(t, { type: 'endHand' })
  t = applyTableAction(t, { type: 'startHand' })
  const btnSeat = t.buttonSeat
  const btnId = seatOf(t, btnSeat)!.id
  t = applyTableAction(t, { type: 'endHand' })
  t = seq(t, [{ type: 'removePlayer', id: btnId }])
  check('dugme koltuğu bos', seatOf(t, btnSeat) === undefined)
  t = applyTableAction(t, { type: 'startHand' })
  check('yeni dugme kalkan koltuk degil', t.buttonSeat !== btnSeat, `${btnSeat} -> ${t.buttonSeat}`)
  check('yeni dugme pes pese dolu koltuga', t.buttonSeat === nextOccupied(t, btnSeat, 1), `${t.buttonSeat}`)
  check('yeni dugme oyuncu', statusAt(t, t.buttonSeat) === 'playing')
  check('SB/BB farkli ve dolu', t.sbSeat !== null && t.bbSeat !== null && t.sbSeat !== t.bbSeat &&
    statusAt(t, t.sbSeat) !== 'yok' && statusAt(t, t.bbSeat) !== 'yok')
  check('pot = sb + bb', potOf(t) === t.sb + t.bb, `${potOf(t)} != ${t.sb + t.bb}`)
  invariant(t, 'dugme/kalkan')
}
{
  // masadan çıkan oyuncu artık masada sayılmamalı (kör, düğme, sıra)
  let t = build(4)
  const gone = t.players[1]
  const goneId = gone.id
  const goneSeat = gone.seat
  t = applyTableAction(t, { type: 'endHand' })
  t = seq(t, [{ type: 'cashOut', id: goneId }])
  check('cikan oyuncu listede kaldi', !!seatOf(t, goneSeat), `${goneSeat}`)
  t = applyTableAction(t, { type: 'startHand' })
  check('kalan uc oyuncu oynuyor', playingSeats(t).length === 3, `${playingSeats(t).length}`)
  check('dugme cikan koltuga degil', t.buttonSeat !== goneSeat, `dugme=${t.buttonSeat} cikan=${goneSeat}`)
  check('korrler cikan koltuga degil', t.sbSeat !== goneSeat && t.bbSeat !== goneSeat, `sb=${t.sbSeat} bb=${t.bbSeat}`)
  check('sira cikan koltuga degil', t.currentSeat !== goneSeat, `sira=${t.currentSeat}`)
  check('cikan oyuncunun cipi masada yok', byId(t, goneId).stack === 0 && byId(t, goneId).invested === 0)
  check('cikan oyuncu sira almadi', nextToAct(t, t.currentSeat) !== goneSeat, `${nextToAct(t, t.currentSeat)}`)
  check('pot = sb + bb', potOf(t) === t.sb + t.bb, `${potOf(t)} != ${t.sb + t.bb}`)
  invariant(t, 'cikan/eller')
}

// ---------------------------------------------------------------- 12) koltuk boşlukları
console.log('12) koltuk bosluklari')
{
  let t = build(6)
  for (const seat of [2, 4]) {
    t = applyTableAction(t, { type: 'endHand' })
    t = seq(t, [{ type: 'removePlayer', id: seatOf(t, seat)!.id }])
  }
  const alive = [0, 1, 3, 5]
  check('4 oyuncu kaldi', t.players.length === 4, `${t.players.length}`)
  check('koltuklar 0,1,3,5', JSON.stringify(t.players.map((p) => p.seat)) === JSON.stringify(alive),
    JSON.stringify(t.players.map((p) => p.seat)))
  check('boslukta kimse yok', seatOf(t, 2) === undefined && seatOf(t, 4) === undefined)
  invariant(t, 'bosluk/kurulum')

  const seen = new Set<number>()
  for (let h = 1; h <= 6; h++) {
    t = applyTableAction(t, { type: 'startHand' })
    check(`bosluk el ${h} dugme dolu`, statusAt(t, t.buttonSeat) === 'playing', `${t.buttonSeat}`)
    check(`bosluk el ${h} korrler oyuncu koltuğunda`, statusAt(t, t.sbSeat) !== 'yok' && statusAt(t, t.bbSeat) !== 'yok')
    check(`bosluk el ${h} bos koltuga kor yok`, alive.includes(t.sbSeat ?? -1) && alive.includes(t.bbSeat ?? -1),
      `sb=${t.sbSeat} bb=${t.bbSeat}`)
    check(`bosluk el ${h} pot = sb + bb`, potOf(t) === t.sb + t.bb, `${potOf(t)} != ${t.sb + t.bb}`)
    seen.add(t.buttonSeat)
    invariant(t, `bosluk/el${h}`)
    t = everyoneCalls(t)
    t = applyTableAction(t, { type: 'endHand' })
  }
  check('dugme dort koltugu da gezdi', seen.size === 4, `${[...seen].join(',')}`)
  check('6 el sonrasi cips dondu', stackSum(t) === 4 * 5000, `${stackSum(t)}`)

  // nextToAct boş koltukları atlamalı (iki yön)
  t = applyTableAction(t, { type: 'startHand' })
  t = everyoneCalls(t)
  alive.forEach((seat, i) => {
    check(`nextToAct ${seat} -> ${alive[(i + 1) % alive.length]}`,
      nextToAct(t, seat, 1) === alive[(i + 1) % alive.length], `${nextToAct(t, seat, 1)}`)
    check(`nextToAct geri ${seat} -> ${alive[(i + 3) % alive.length]}`,
      nextToAct(t, seat, -1) === alive[(i + 3) % alive.length], `${nextToAct(t, seat, -1)}`)
  })
  invariant(t, 'bosluk/sira')

  // potu 250'ye çıkar (4'e bölününce artık çip olsun) ve 4 kazanan arasında paylaştır
  t = seq(t, [{ type: 'pushChips', id: t.players[0].id, amount: 50 }])
  check('pot 250', potOf(t) === 250, `${potOf(t)}`)
  const before = stackSum(t)
  const beforeStacks = stacksOf(t)
  const ids = t.players.map((p) => p.id)
  t = seq(t, [{ type: 'split', winners: ids }])
  check('250 dort kisiye tam bolundu', stackSum(t) === before + 250, `${stackSum(t)} vs ${before + 250}`)
  check('pot bosaldi', potOf(t) === 0, `${potOf(t)}`)
  const gain = ids.map((id) => byId(t, id).stack - beforeStacks[id])
  check('paylar 62 veya 63', gain.every((g) => g === 62 || g === 63), JSON.stringify(gain))
  check('artik 2 kisiye gitti', gain.filter((g) => g === 63).length === 2, JSON.stringify(gain))
  check('kazanc toplami 250', gain.reduce((a, b) => a + b, 0) === 250, `${gain.reduce((a, b) => a + b, 0)}`)
  check('toplam korundu', stackSum(t) === 4 * 5000, `${stackSum(t)}`)
  invariant(t, 'bosluk/split')
}
{
  // koltuğunu kaydırma: düğme, korrler ve sıra boşluklarla da doğru kalmalı
  let t = build(6)
  t = applyTableAction(t, { type: 'endHand' })
  t = seq(t, [{ type: 'removePlayer', id: seatOf(t, 4)!.id }])
  const mover = seatOf(t, 5)!
  t = seq(t, [{ type: 'moveSeat', id: mover.id, dir: -1 }])
  check('kaydirilan koltuga girdi', seatOf(t, 4)!.id === mover.id, `${mover.seat}`)
  check('5. koltuk bos kaldi', seatOf(t, 5) === undefined)
  t = applyTableAction(t, { type: 'startHand' })
  check('kaydirma sonrasi dugme dolu', statusAt(t, t.buttonSeat) === 'playing')
  check('kaydirma sonrasi pot = sb + bb', potOf(t) === t.sb + t.bb, `${potOf(t)} != ${t.sb + t.bb}`)
  check('kaydirma sonrasi tum koltuklar dolu',
    [t.sbSeat, t.bbSeat, t.currentSeat].every((s) => statusAt(t, s) !== 'yok'), `${t.sbSeat}/${t.bbSeat}/${t.currentSeat}`)
  invariant(t, 'kaydirma')
}

// ---------------------------------------------------------------- 13) 12 koltuk + boşluk
console.log('13) 12 koltuk ve coklu kalkis')
{
  const names = Array.from({ length: 12 }, (_, i) => `Oyuncu ${i + 1}`)
  let t = tableOf({ maxPlayers: 12, buyIn: 3000, sb: 10, bb: 20 }, names)
  check('12 oyuncu oturdu', t.players.length === 12, `${t.players.length}`)
  check('12 koltuk dolu', new Set(t.players.map((p) => p.seat)).size === 12)
  check('ilk dugme 1. koltuk', t.buttonSeat === 0, `${t.buttonSeat}`)
  invariant(t, '12/kurulum')

  t = seq(t, [{ type: 'addPlayer', name: 'Fazlalik' }])
  check('13. oyuncu eklenmedi', t.players.length === 12, `${t.players.length}`)
  invariant(t, '12/dolu')

  for (const seat of [1, 4, 7, 10]) {
    t = applyTableAction(t, { type: 'endHand' })
    t = seq(t, [{ type: 'removePlayer', id: seatOf(t, seat)!.id }])
  }
  check('8 oyuncu kaldi', t.players.length === 8, `${t.players.length}`)
  check('kalan koltuklar', JSON.stringify(t.players.map((p) => p.seat)) === JSON.stringify([0, 2, 3, 5, 6, 8, 9, 11]),
    JSON.stringify(t.players.map((p) => p.seat)))
  invariant(t, '12/kalkis')

  for (let h = 1; h <= 5; h++) {
    t = applyTableAction(t, { type: 'startHand' })
    check(`12 el ${h} dugme dolu`, statusAt(t, t.buttonSeat) === 'playing', `${t.buttonSeat}`)
    check(`12 el ${h} korrler oyuncu koltuğunda`, statusAt(t, t.sbSeat) !== 'yok' && statusAt(t, t.bbSeat) !== 'yok')
    check(`12 el ${h} pot = sb + bb`, potOf(t) === t.sb + t.bb, `${potOf(t)} != ${t.sb + t.bb}`)
    t = everyoneCalls(t)
    check(`12 el ${h} pot tam`, potOf(t) === 8 * t.bb, `${potOf(t)} != ${8 * t.bb}`)
    const w1 = playerAt(t, nextToAct(t, t.currentSeat))!
    const w2 = t.players.find((p) => p.id !== w1.id)!
    t = seq(t, [{ type: 'split', winners: [w1.id, w2.id] }])
    check(`12 el ${h} bolustu`, potOf(t) === 0 && stackSum(t) === 8 * 3000, `${potOf(t)}/${stackSum(t)}`)
    invariant(t, `12/el${h}`)
    t = applyTableAction(t, { type: 'endHand' })
  }
  check('12 sonda cips korundu', stackSum(t) === 8 * 3000, `${stackSum(t)}`)
  check('9 el sayaci (4 kalkis eli + 5 oyun eli)', t.handNumber === 9, `${t.handNumber}`)

  // setStack defterdeki net farkı silmez (buyInTotal da değişir); temizlenmiş
  // defterle oynamak için yeni oyun (resetChips) gerekir, sonra silmek güvenlidir
  const alive = seatOf(t, 0)!
  check('silmeden once oyuncularin neti degilmis', byId(t, alive.id).stack !== byId(t, alive.id).buyInTotal ||
    byId(t, alive.id).invested === 0, `${byId(t, alive.id).stack}/${byId(t, alive.id).buyInTotal}`)
  t = seq(t, [{ type: 'resetChips' }])
  check('yeni oyun defteri temizledi', t.players.every((p) => p.stack + p.invested + p.cashOutTotal === p.buyInTotal))
  t = seq(t, [{ type: 'removePlayer', id: alive.id }])
  check('temiz defterli oyuncu silinebilir', t.players.length === 7, `${t.players.length}`)
  t = applyTableAction(t, { type: 'startHand' })
  check('12 son dugme dolu', statusAt(t, t.buttonSeat) === 'playing')
  check('12 son pot = sb + bb', potOf(t) === t.sb + t.bb, `${potOf(t)} != ${t.sb + t.bb}`)
  invariant(t, '12/son')
}
{
  // REGRESYON: removePlayer oyuncunun net kazancını da yanında götürürse masada
  // o kadar çip yok olur ve Σ koruma bozulur. Kaynak artık (a) el bitmeden kalkışı
  // ve (b) net nötr olmayan oyuncunun kalkışını reddediyor, elindeki çipi de
  // otomatik nakite çeviriyor. Bu blok her iki kuralı da kilitliyor.
  // repro: 3 kişi, buyIn 5000, sb 25 / bb 50 -> herkes 50'ye eşitlenir (pot 150),
  // 1. oyuncu potu alır (stack 5100 > buyInTotal 5000), sonra onu silmeyi dene.
  let t = tableOf({ maxPlayers: 3, buyIn: 5000, sb: 25, bb: 50 }, ['Ali', 'Veli', 'Ayşe'])
  t = applyTableAction(t, { type: 'startHand' })
  t = everyoneCalls(t)
  check('repro pot 150', potOf(t) === 150, `${potOf(t)}`)
  const winner = t.players[0].id
  t = applyTableAction(t, { type: 'distribute', winners: [winner] })
  check('repro kazanan 5100', byId(t, winner).stack === 5100, `${byId(t, winner).stack}`)
  check('repro once koruma saglam', stackSum(t) === 3 * 5000, `${stackSum(t)}`)
  const after = seq(t, [{ type: 'removePlayer', id: winner }])
  // net kazancı 100 çip olan oyuncu silinince çipler ya yazılmalı ya da silme reddedilmeli
  check('silinen oyuncunun ciphasi kaybolmaz', stackSum(after) === 3 * 5000, `${stackSum(after)} != 15000`)
  check('silinen oyuncu ya kaldi ya ciphasi yazildi',
    after.players.some((p) => p.id === winner) || stackSum(after) === 3 * 5000,
    `${after.players.length} oyuncu, stack ${stackSum(after)}`)
  // net nötr (kârı/zararı olmayan) oyuncu silinebilir ve elindeki çip ona ödenir
  const neutral = t.players[1].id
  check('el kaybedeni net notr degil', byId(t, neutral).stack + byId(t, neutral).cashOutTotal !== byId(t, neutral).buyInTotal,
    `${byId(t, neutral).stack}/${byId(t, neutral).buyInTotal}`)
  const clean = seq(t, [{ type: 'resetChips' }])
  const gone = seq(clean, [{ type: 'removePlayer', id: neutral }])
  check('net notr oyuncu silinebilir', !gone.players.some((p) => p.id === neutral), `${gone.players.length}`)
  // silinen oyuncunun çipi masadan tam çıkar (kayıp yok, fazla yok)
  check('silinen oyuncunun cibi masadan cikti', stackSum(gone) === 2 * 5000, `${stackSum(gone)}`)
  invariant(gone, 'silme/notr')
}

// ---------------------------------------------------------------- 14) bölüşmede artık çipler
console.log('14) split artik cipleri')
{
  const cases: Array<[number, number, number[]]> = [
    // [kazanan sayısı, toplam, yatırımlar]
    [2, 101, [60, 41]],
    [3, 100, [40, 35, 25]],
    [4, 101, [30, 30, 25, 16]],
    [7, 100, [20, 15, 15, 14, 12, 12, 12]],
  ]
  cases.forEach(([k, total, amounts]) => {
    let t = funded(amounts)
    check(`artik pot ${total}`, potOf(t) === total, `${potOf(t)} != ${total}`)
    check(`artik bolunmez (${total}/${k})`, total % k !== 0, `${total} % ${k}`)
    const before = stackSum(t)
    const beforeStacks = stacksOf(t)
    const winners = t.players.slice(0, k).map((p) => p.id)
    t = seq(t, [{ type: 'split', winners }])
    check(`${k} kisiye tam bolundu (${total})`, stackSum(t) === before + total, `${stackSum(t)} vs ${before + total}`)
    check(`${k} kisiye pot bosaldi`, potOf(t) === 0, `${potOf(t)}`)
    const gain = winners.map((id) => byId(t, id).stack - beforeStacks[id])
    const share = Math.floor(total / k)
    const remainder = total - share * k
    check(`${k} kisiye pay ${share} (artik ${remainder})`, gain.every((g) => g === share || g === share + 1),
      JSON.stringify(gain))
    const plus = gain.filter((g) => g === share + 1).length
    check(`${k} artik ${remainder} farkli oyuncuya gitti`, plus === remainder, `${plus} != ${remainder}`)
    check(`${k} artik tekrar etmedi`, new Set(winners.filter((_, i) => gain[i] === share + 1)).size === plus)
    check(`${k} toplam korundu`, stackSum(t) === t.players.length * (Math.max(...amounts) * 4 + 100), `${stackSum(t)}`)
    invariant(t, `artik/${k}kisi`)
  })
}
{
  // artık çip düğmeden sonra sırayla dağıtılır: ilk kazanan ilk artığı alır
  let t = funded([30, 30, 25, 16, 10]) // pot 111
  check('pot 111', potOf(t) === 111, `${potOf(t)}`)
  const before = stackSum(t)
  const beforeStacks = stacksOf(t)
  const winners = [t.players[1].id, t.players[3].id] // düğme (1. koltuk) sonrası sırayla 2. ve 4.
  t = seq(t, [{ type: 'split', winners }])
  check('111 ikiye bolundu', stackSum(t) === before + 111, `${stackSum(t)} vs ${before + 111}`)
  const gain = winners.map((id) => byId(t, id).stack - beforeStacks[id])
  check('paylar 55 ve 56', gain.includes(55) && gain.includes(56), JSON.stringify(gain))
  check('artik ilk siradaki kazanana gitti', gain[0] === 56 && gain[1] === 55, JSON.stringify(gain))
  invariant(t, 'artik/sira')
}
{
  // tekrarlanan kazanan kimliği ve olmayan kimlik: hiçbir çip yaratılıp yok edilmemeli
  let t = funded([40, 35, 25, 15]) // pot 115
  const pot = potOf(t)
  const before = stackSum(t)
  const ids = t.players.map((p) => p.id)
  t = seq(t, [{ type: 'split', winners: [ids[0], ids[0]] }])
  check('tekrarli kazananda pot durur', potOf(t) === pot, `${potOf(t)} != ${pot}`)
  check('tekrarli kazananda cips korunur', stackSum(t) + potOf(t) === before + pot, `${stackSum(t) + potOf(t)}`)
  invariant(t, 'artik/tekrarli')
  t = seq(t, [{ type: 'split', winners: ['yok-boyle-bir-id'] }])
  check('olmayan kazananda cips korunur', stackSum(t) + potOf(t) === before + pot, `${stackSum(t) + potOf(t)}`)
  invariant(t, 'artik/olmayan')
}

// ---------------------------------------------------------------- 15) kök reducer / geri al
console.log('15) kok reducer ve geri alma')
{
  const run = runRoot
  const first = (s: AppState) => s.tables[0]
  const depthOf = (s: AppState) => (s.undo[id] ?? []).length

  let s = rootReducer(emptyState, { type: 'createTable', input: { maxPlayers: 6, buyIn: 5000, sb: 25, bb: 50 } })
  const id = first(s).id
  s = run(s, ...Array.from({ length: 6 }, () => ({ type: 'tableAction' as const, id, action: { type: 'addPlayer' as const } })))
  check('6 oyuncu eklendi', first(s).players.length === 6, `${first(s).players.length}`)
  check('masa etkin', s.activeTableId === id)
  check('her oyuncu eklemesi geri alinabilir', depthOf(s) === 6, `${depthOf(s)}`)

  // geri alma, tam masayı geri getirir (updatedAt hariç birebir)
  const beforePush = first(s)
  const targetId = beforePush.players[3].id
  s = run(s, { type: 'tableAction', id, action: { type: 'pushChips', id: targetId, amount: 750 } })
  check('push cipi masaya tasiyor', byId(first(s), targetId).bet === 750 && byId(first(s), targetId).stack === 4250,
    `${byId(first(s), targetId).bet}/${byId(first(s), targetId).stack}`)
  check('undo yigini 7', depthOf(s) === 7, `${depthOf(s)}`)
  s = rootReducer(s, { type: 'undo', id })
  check('undo tam esitlik (updatedAt haric)', sameTable(first(s), beforePush))
  check('undo yigini 6', depthOf(s) === 6, `${depthOf(s)}`)
  check('undo stacki geri aldi', byId(first(s), targetId).stack === 5000, `${byId(first(s), targetId).stack}`)
  invariant(first(s), 'undo/push')
  for (let i = 0; i < 6; i++) s = rootReducer(s, { type: 'undo', id })
  check('yigin bosaltildi', depthOf(s) === 0, `${depthOf(s)}`)
  check('6 geri alma oyuncuyu da kaldirdi', first(s).players.length === 0, `${first(s).players.length}`)
  check('bos yiginda undo no-op', rootReducer(s, { type: 'undo', id }) === s)
  s = run(s, ...Array.from({ length: 6 }, () => ({ type: 'tableAction' as const, id, action: { type: 'addPlayer' as const } })))
  check('oyuncular tekrar eklendi', first(s).players.length === 6, `${first(s).players.length}`)
  check('yigin tekrar 6', depthOf(s) === 6, `${depthOf(s)}`)

  // çip eylemleri geri alınabilir, clearLog olmaz
  s = run(s, { type: 'tableAction', id, action: { type: 'startHand' } })
  const afterStart = first(s)
  s = run(s, { type: 'tableAction', id, action: { type: 'allIn', id: afterStart.players[0].id } })
  check('cip eylemleri yiginda', depthOf(s) === 8, `${depthOf(s)}`)
  const afterAllIn = first(s)
  check('all-in cipsi masada', potOf(afterAllIn) > 0 && byId(afterAllIn, afterAllIn.players[0].id).allIn)
  s = run(s, { type: 'tableAction', id, action: { type: 'clearLog' } })
  check('clearLog logu sildi', first(s).log.length === 0, `${first(s).log.length}`)
  check('clearLog geri alinamaz', depthOf(s) === 8, `${depthOf(s)}`)
  s = rootReducer(s, { type: 'undo', id })
  check('undo all-in durumunu geri aldi', sameTable(first(s), afterStart))
  check('undo gunlogu da geri getirdi', first(s).log.length === afterStart.log.length, `${first(s).log.length}`)
  check('undo yigini 7', depthOf(s) === 7, `${depthOf(s)}`)

  // geri alma yığını sınırlıdır (store.ts UNDO_LIMIT = 100)
  const N = 130
  for (let i = 1; i <= N; i++) {
    s = run(s, { type: 'tableAction', id, action: { type: 'setStack', id: first(s).players[0].id, amount: 1000 + i } })
  }
  const depth = depthOf(s)
  check('undo yigini sinirli (100)', depth === 100, `${depth}`)
  check('undo yigini buyumedi', depth <= 100)
  const oldest = (s.undo[id] ?? [])[0]
  check('en eski kayitlar atildi', byId(oldest, first(s).players[0].id).stack === 1030,
    `${byId(oldest, first(s).players[0].id).stack}`)
  for (let i = 0; i < 100; i++) s = rootReducer(s, { type: 'undo', id })
  check('100 geri alinca 31. adima dondu', byId(first(s), first(s).players[0].id).stack === 1030,
    `${byId(first(s), first(s).players[0].id).stack}`)
  check('yigin kalan kayit kadar', depthOf(s) === 0, `${depthOf(s)}`)
  invariant(first(s), 'undo/limit')

  // silme: geri alma kaydını da temizler
  s = run(s, { type: 'tableAction', id, action: { type: 'startHand' } })
  check('silmeden once yigin dolu', depthOf(s) === 1, `${depthOf(s)}`)
  const two = rootReducer(s, { type: 'createTable', input: { maxPlayers: 3 }, activate: false })
  check('ikinci masa eklendi', two.tables.length === 2, `${two.tables.length}`)
  const del = rootReducer(two, { type: 'deleteTable', id })
  check('masa silindi', del.tables.length === 1, `${del.tables.length}`)
  check('silinen masanin undo kaydi yok', del.undo[id] === undefined, `${Object.keys(del.undo).join(',')}`)
  check('silinen masa etkin degil', del.activeTableId !== id, `${del.activeTableId}`)
  check('kalan masa degismedi', sameTable(del.tables[0], two.tables[1]))

  // kopya: yeni kimlikler, ortak oyuncu kimliği yok
  const src = first(s)
  const dup = rootReducer(s, { type: 'duplicateTable', id: src.id })
  const copy = dup.tables[1]
  check('kopya eklendi', dup.tables.length === 2, `${dup.tables.length}`)
  check('kopya farkli masa kimligi', copy.id !== src.id, `${copy.id} vs ${src.id}`)
  check('kopya etkin oldu', dup.activeTableId === copy.id)
  check('kopya adi degisti', copy.name === `${src.name} (kopya)`, `${copy.name}`)
  check('kopya gunlugu bos', copy.log.length === 0, `${copy.log.length}`)
  check('kopya oyuncu sayisi ayni', copy.players.length === src.players.length)
  check('kopya oyuncu kimlikleri farkli', copy.players.every((p) => !src.players.some((q) => q.id === p.id)))
  check('kopya oyuncu verileri ayni', copy.players.every((p, i) => samePlayer(p, src.players[i])))
  check('kopya masasi tutarli', copy.players.every((p) => p.stack + p.invested + p.cashOutTotal === p.buyInTotal))
  invariant(copy, 'kopya')
  check('olmayan kopya no-op', rootReducer(s, { type: 'duplicateTable', id: 'yok' }) === s)

  // çip sıfırlama: isimler ve koltuklar korunur, her şey sıfırlanır
  let r = first(s)
  const seatsBefore = JSON.stringify(r.players.map((p) => p.seat))
  const namesBefore = JSON.stringify(r.players.map((p) => p.name))
  r = seq(r, [{ type: 'startHand' }])
  r = seq(r, [{ type: 'rebuy', id: r.players[0].id, amount: 1234 }])
  r = seq(r, [{ type: 'endHand' }])
  r = seq(r, [{ type: 'cashOut', id: r.players[1].id }])
  check('sifirlamadan once kirli durum', r.players.some((p) => p.cashOutTotal > 0 || p.rebuys > 0))
  const beforeReset = r
  r = applyTableAction(r, { type: 'resetChips' })
  check('isimler korundu', JSON.stringify(r.players.map((p) => p.name)) === namesBefore)
  check('koltuklar korundu', JSON.stringify(r.players.map((p) => p.seat)) === seatsBefore)
  check('hepsi stack = buyIn', r.players.every((p) => p.stack === r.buyIn), JSON.stringify(r.players.map((p) => p.stack)))
  check('hepsi buyInTotal = buyIn', r.players.every((p) => p.buyInTotal === r.buyIn))
  check('coke islemsiz', r.players.every((p) => p.cashOutTotal === 0 && p.rebuys === 0))
  check('eller temiz', r.players.every((p) => p.bet === 0 && p.invested === 0 && !p.allIn && !p.folded))
  check('yeni oyun sayaci sifirlandi', r.handNumber === 0 && r.handActive === false, `${r.handNumber}/${r.handActive}`)
  check('kollar ilk seviyeye dondu', r.sb === r.blindLevels[0].sb && r.bb === r.blindLevels[0].bb, `${r.sb}/${r.bb}`)
  invariant(r, 'resetChips')
  const reset = run(s, { type: 'tableAction', id: src.id, action: { type: 'resetChips' } })
  check('resetChips geri alinabilir', (reset.undo[src.id] ?? []).length >= 1)
  const undone = rootReducer(reset, { type: 'undo', id: src.id })
  check('undo resetChips oncesi duruma dondurdu', sameTable(first(undone), first(s)))
  invariant(first(undone), 'undo/resetChips')
}

// ---------------------------------------------------------------- 16) dışa/içe aktarma
console.log('16) disa ice aktarma')
{
  let t = tableOf({ maxPlayers: 5, buyIn: 5000, sb: 25, bb: 50 }, ['Ali', 'Veli', 'Ayşe', 'Can', 'Deniz'])
  t = applyTableAction(t, { type: 'settings', patch: { name: 'Cumartesi Masası — Büyük Oyun' } })
  check('turkce ad', t.name === 'Cumartesi Masası — Büyük Oyun', `${t.name}`)
  t = applyTableAction(t, { type: 'startHand' })
  t = seq(t, [
    { type: 'pushChips', id: t.players[0].id, amount: 400 },
    { type: 'rebuy', id: t.players[1].id, amount: 1500 },
    { type: 'pushChips', id: t.players[2].id, amount: 250 },
  ])
  t = applyTableAction(t, { type: 'endHand' })
  t = seq(t, [{ type: 'cashOut', id: t.players[3].id }])
  t = applyTableAction(t, { type: 'startHand' })
  t = seq(t, [{ type: 'allIn', id: t.players[4].id }])
  check('aktarma icin cesitli durum', t.players.some((p) => p.bet > 0) && t.players.some((p) => p.rebuys > 0) &&
    t.players.some((p) => p.cashOutTotal > 0) && t.players.some((p) => p.allIn),
    JSON.stringify(t.players.map((p) => ({ b: p.bet, r: p.rebuys, c: p.cashOutTotal, a: p.allIn }))))
  check('gunlukte cip hareketi var', t.log.some((l) => l.kind === 'bet') && t.log.some((l) => l.kind === 'cashout') &&
    t.log.some((l) => l.kind === 'rebuy'), t.log.map((l) => l.kind).join(','))
  for (let i = 0; i < 300; i++) {
    t = applyTableAction(t, { type: 'renamePlayer', id: t.players[i % 5].id, name: `Oyuncu ${i + 1}` })
  }
  check('gunluk sinirli (250)', t.log.length === 250, `${t.log.length}`)
  invariant(t, 'aktarma/kurulum')

  const text = exportTable(t)
  check('disa aktarim json', JSON.parse(text).table.id === t.id)
  const imported = parseImport(text)
  check('iceri aktarma tek masa dondurdu', imported.length === 1, `${imported.length}`)
  const imp = imported[0]
  check('iceri aktarim yeni masa kimligi verir', imp.id !== t.id, `${imp.id} == ${t.id}`)
  check('iceri aktarim yeni oyuncu kimlikleri verir',
    imp.players.every((p) => !t.players.some((q) => q.id === p.id)),
    imp.players.map((p) => p.id).join(','))
  check('iceri aktarim gunlugu bos', imp.log.length === 0, `${imp.log.length}`)
  check('iceri aktarim oyuncu sayisi ayni', imp.players.length === t.players.length, `${imp.players.length}`)
  check('iceri aktarim oyuncu verileri birebir ayni', t.players.every((p, i) => samePlayer(p, imp.players[i])))
  check('iceri aktarim masa verisi ayni', canon(tableFields(imp)) === canon(tableFields(t)),
    `kaynak=${canon(tableFields(t)).slice(0, 90)} / alinan=${canon(tableFields(imp)).slice(0, 90)}`)
  check('iceri aktarim ciphasa korur', canon(imp.players.map((p) => [p.stack, p.bet, p.invested, p.buyInTotal, p.cashOutTotal])) ===
    canon(t.players.map((p) => [p.stack, p.bet, p.invested, p.buyInTotal, p.cashOutTotal])))
  invariant(imp, 'aktarma/iceri')

  // aynı dosya iki kez içe aktarılırsa iki ayrı kayıt gelmeli
  const imp2 = parseImport(text)[0]
  check('cift ice aktarim farkli masa kimligi verir', imp.id !== imp2.id, `her ikisi de ${imp.id}`)
  const both = runRoot(
    runRoot(emptyState, { type: 'importTables', tables: parseImport(text) }),
    { type: 'importTables', tables: parseImport(text) },
  )
  check('cift ice aktarim 2 ayri masa olarak durur', new Set(both.tables.map((x) => x.id)).size === 2,
    `${both.tables.map((x) => x.id).join(' | ')}`)
  check('cift ice aktarimda etkin masa son import', both.activeTableId === both.tables[1].id,
    `${both.activeTableId}`)
  check('cift ice aktarimda oyuncu kimligi cakismaz',
    both.tables[0].players.every((p) => !both.tables[1].players.some((q) => q.id === p.id)))
  invariant(both.tables[1], 'aktarma/cift')

  const many = parseImport(JSON.stringify({ tables: [t, t] }))
  check('toplu aktarma 2 masa', many.length === 2, `${many.length}`)
  check('toplu aktarmada kimlikler farkli', many[0].id !== many[1].id, `${many[0].id} | ${many[1].id}`)
  check('bozuk girdi hata firlatir', importThrows('{"tables":42}'))
  check('json olmayan girdi hata firlatir', importThrows('bu json degil'))
  check('bos girdi hata firlatir', importThrows('   '))
  check('masa icermeyen dosya hata firlatir', importThrows('{"notlar":"merhaba"}'))
}

// ---------------------------------------------------------------- 17) uç durumlar
console.log('17) uct durumlar')
{
  // 1 çiplik giriş
  let t = tableOf({ maxPlayers: 3, buyIn: 1, sb: 1, bb: 2 }, ['Ali', 'Veli', 'Ayşe'])
  check('buyIn en az 1', t.buyIn === 1, `${t.buyIn}`)
  t = applyTableAction(t, { type: 'startHand' })
  check('1 ciplik el acildi', t.handActive === true)
  check('korrler 1er', potOf(t) === 2, `${potOf(t)}`)
  check('korre girenler all-in', t.players.filter((p) => p.bet > 0).every((p) => p.allIn && p.stack === 0))
  invariant(t, '1cip')
  // düğmede kalan oyuncu (3 kişi) kör atmadığı için pota hakkı yok: dağıtım reddedilir
  const refused = applyTableAction(t, { type: 'distribute', winners: [t.players[0].id] })
  check('uygun olmayan kazanan reddedilir', potOf(refused) === 2 && stackSum(refused) === 1,
    `${potOf(refused)}/${stackSum(refused)}`)
  t = applyTableAction(t, { type: 'distribute', winners: [t.players[1].id] })
  check('1 cirpoyle pot dagitildi (3 x 1 = 3 cip)', stackSum(t) === 3 && potOf(t) === 0, `${stackSum(t)}/${potOf(t)}`)
  invariant(t, '1cip/dagitim')
  const w2 = t.players[1].id
  t = seq(t, [{ type: 'rebuy', id: w2, amount: 1 }])
  check('1 cirpoyle rebuy (2 + 1)', byId(t, w2).stack === 3, `${byId(t, w2).stack}`)
  invariant(t, '1cip/rebuy')
}
{
  // körsüz masa: pot hep 0, dağıtım da yapılamaz
  let t = tableOf({ maxPlayers: 4, buyIn: 2000, sb: 0, bb: 0 }, ['Ali', 'Veli', 'Ayşe', 'Can'])
  check('korler 0', t.sb === 0 && t.bb === 0)
  t = applyTableAction(t, { type: 'startHand' })
  check('korsuz elde pot 0', potOf(t) === 0, `${potOf(t)}`)
  check('korsuz elde kimse yatirmadi', t.players.every((p) => p.invested === 0))
  check('korsuz elde pot parcalari yok', computePots(t.players).length === 0)
  invariant(t, 'korsuz')
  const before = stackSum(t)
  t = applyTableAction(t, { type: 'distribute', winners: [t.players[0].id] })
  check('korsuz dagitim no-op', potOf(t) === 0 && stackSum(t) === before, `${potOf(t)}/${stackSum(t)}`)
  t = seq(t, [{ type: 'pushChips', id: t.players[0].id, amount: 7 }])
  check('korsuz elde de yatirim olur', potOf(t) === 7, `${potOf(t)}`)
  invariant(t, 'korsuz/yatirim')
  const zero = tableOf({ maxPlayers: 2, buyIn: 100, sb: 0, bb: 0, ante: 0 }, ['Ali'])
  check('ante 0 varsayilan', zero.ante === 0)
  check('kor 0 kabul edilir', zero.sb === 0 && zero.bb === 0)
}
{
  // tek çip birimi
  let t = tableOf({ maxPlayers: 3, buyIn: 3000, sb: 25, bb: 50, denoms: [500] }, ['Ali', 'Veli', 'Ayşe'])
  check('tek birim', JSON.stringify(t.denoms) === '[500]', JSON.stringify(t.denoms))
  t = seq(t, [{ type: 'settings', patch: { denoms: [1000, 100, 100, 25] } }])
  check('birimler sirali ve tekil', JSON.stringify(t.denoms) === '[25,100,1000]', JSON.stringify(t.denoms))
  t = seq(t, [{ type: 'settings', patch: { denoms: [0, -5, 7.6] } }])
  check('bozuk birimler temizlenir', JSON.stringify(t.denoms) === '[8]', JSON.stringify(t.denoms))
  t = seq(t, [{ type: 'settings', patch: { denoms: [] } }])
  check('birim listesi bos olamaz', JSON.stringify(t.denoms) === '[1]', JSON.stringify(t.denoms))
  ;[[999], [1001], [100], [1001, 1], [1_000_000], [5, 25, 100, 1000, 5000]].forEach((amounts) => {
    const parts = decompose(1200, amounts)
    check(`cip parcalari toplami ${amounts.join('/')}`, parts.reduce((s, p) => s + p.value * p.count, 0) === 1200,
      JSON.stringify(parts))
    check(`cip parcalari gecerli ${amounts.join('/')}`,
      parts.every((p) => p.value > 0 && p.count > 0 && Number.isInteger(p.count)), JSON.stringify(parts))
  })
  check('0 tutar parca uretmez', decompose(0, [500]).length === 0, JSON.stringify(decompose(0, [500])))
}
{
  // çok büyük yığınlar: tamsı aritmetik kayması olmamalı
  let t = tableOf({ maxPlayers: 6, buyIn: 10_000_000, sb: 500_000, bb: 1_000_000 })
  t = applyTableAction(t, { type: 'startHand' })
  check('devasa pot 1.5M', potOf(t) === 1_500_000, `${potOf(t)}`)
  t = seq(t, [{ type: 'allIn', id: t.players[0].id }, { type: 'allIn', id: t.players[1].id },
    { type: 'pushChips', id: t.players[2].id, amount: 7_500_000 }])
  check('devasa yatirim tam (1M kor + 7.5M)', byId(t, t.players[2].id).invested === 8_500_000,
    `${byId(t, t.players[2].id).invested}`)
  invariant(t, 'devasa')
  const plan = planPayout(t, [t.players[0].id])
  check('devasa plan tam', plan.unclaimed === 0 && plan.gains[t.players[0].id] === potOf(t),
    `${plan.gains[t.players[0].id]}/${potOf(t)}`)
  const before = stackSum(t)
  const pot = potOf(t)
  t = applyTableAction(t, { type: 'distribute', winners: [t.players[0].id] })
  check('devasa dagitim korundu', stackSum(t) === before + pot, `${stackSum(t)} vs ${before + pot}`)
  check('devasa toplam 60M', stackSum(t) === 60_000_000, `${stackSum(t)}`)
  check('sayilar tamsi', Number.isSafeInteger(stackSum(t)))
  invariant(t, 'devasa/dagitim')
}
{
  // tek kişilik / boş masa ve 12 kişi sınırı
  let t = tableOf({ maxPlayers: 2, buyIn: 1000, sb: 10, bb: 20 }, ['Ali'])
  t = applyTableAction(t, { type: 'startHand' })
  check('tek kisiyle el acilmaz', t.handActive === false && potOf(t) === 0, `${t.handActive}/${potOf(t)}`)
  invariant(t, 'tek kisi')
  t = applyTableAction(t, { type: 'removePlayer', id: t.players[0].id })
  check('masa bos', t.players.length === 0)
  t = seq(t, [{ type: 'startHand' }, { type: 'endHand' }, { type: 'distribute', winners: ['x'] },
    { type: 'split', winners: ['x'] }, { type: 'resetChips' }, { type: 'addPlayer', name: 'Geri geldi' }])
  check('bos masaya aksiyonlar dayanir', t.players.length === 1, `${t.players.length}`)
  invariant(t, 'bos masa')
  let many = tableOf({ maxPlayers: 12, buyIn: 100, sb: 1, bb: 2 }, [])
  for (let i = 0; i < 15; i++) many = applyTableAction(many, { type: 'addPlayer', name: `O${i}` })
  check('en fazla 12 oyuncu', many.players.length === 12, `${many.players.length}`)
  check('koltuklar 0-11', many.players.every((p, i) => p.seat === i), JSON.stringify(many.players.map((p) => p.seat)))
  invariant(many, '12 limit')
}
{
  // REGRESYON: setStack el ortasında 0 yapılırsa oyuncu "stack'ı bitti ama masada
  // çipi var, all-in de değil" durumuna düşüyordu; kimse onu çağıramıyor, o da
  // kimseyi çağıramıyor (UI'daki "Öde" düğmesi el ortasında etkin). Kaynak artık
  // masada yatırımı varsa all-in sayıyor. repro: 6 kişilik masa, startHand,
  // BB'nin stack'ını 0 yap.
  let t = build(6)
  const victim = t.players[2]
  check('kurban elde cipli', victim.invested > 0 && victim.stack > 0, `${victim.invested}/${victim.stack}`)
  const after = applyTableAction(t, { type: 'setStack', id: victim.id, amount: 0 })
  const v = byId(after, victim.id)
  check('el ortasinda stack 0 -> all-in isaretlenmeli', v.allIn === true, `allIn=${v.allIn} stack=${v.stack}`)
  check('el ortasinda stack 0 -> cagri mumkun olmali', toCall(v, currentMaxBet(after)) === 0 || v.stack > 0,
    `stack=${v.stack} toCall=${toCall(v, currentMaxBet(after))}`)
  invariant(after, 'setStack0/ortasi')
}

// ---------------------------------------------------------------- 18) uzun soak
console.log(`18) uzun soak (300 tur x 120 adim, tohum ${SOAK_SEED})`)
{
  const before = failures
  let seed = SOAK_SEED
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const int = (n: number) => Math.floor(rnd() * n)
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]
  const statuses: PlayerStatus[] = ['playing', 'sitout', 'out', 'cashedout']

  let rounds = 0
  let actions = 0
  outer: for (let round = 0; round < 300; round++) {
    rounds++
    const seats = 2 + int(11)
    let t = createTable({
      maxPlayers: seats,
      buyIn: 1 + int(6000),
      sb: int(30),
      bb: int(60),
      ante: int(20),
      chipValue: 1,
      denoms: [1, 25, 500],
    })
    for (let i = 0; i < seats; i++) t = applyTableAction(t, { type: 'addPlayer', name: `P${i}` })
    invariant(t, soakAt(round, -1, { type: 'addPlayer' }))

    for (let step = 0; step < 120; step++) {
      actions++
      const p = t.players.length > 0 ? pick(t.players) : undefined
      const others = t.players.filter((x) => x.id !== p?.id)
      const roll = rnd()
      let action: TableAction
      if (roll < 0.07) action = { type: 'startHand' }
      else if (roll < 0.12) action = { type: 'endHand' }
      else if (roll < 0.17) action = { type: 'nextTurn', dir: (int(2) === 0 ? -1 : 1) as 1 | -1 }
      else if (roll < 0.20) action = { type: 'setCurrent', seat: int(seats) }
      else if (roll < 0.23) action = { type: 'setButton', seat: int(seats) }
      else if (roll < 0.26 && p) action = { type: 'moveSeat', id: p.id, dir: (int(2) === 0 ? -1 : 1) as -1 | 1 }
      else if (roll < 0.29 && p) action = { type: 'setStatus', id: p.id, status: pick(statuses) }
      else if (roll < 0.31 && p) action = { type: 'renamePlayer', id: p.id, name: `İsim ${int(999)}` }
      else if (roll < 0.33) action = { type: 'addPlayer', name: `Yeni ${int(999)}` }
      // removePlayer, oyuncunun net kazancını da silmemeli (13. bölüm): soak'ta
      // yalnız elde yatırımı olmayan oyuncuları siliyoruz (defter temizlenmiştir).
      else if (roll < 0.35 && p && p.invested === 0 && p.stack + p.cashOutTotal === p.buyInTotal)
        action = { type: 'removePlayer', id: p.id }
      else if (roll < 0.38) action = { type: 'clearLog' }
      else if (roll < 0.39) action = { type: 'resetChips' }
      else if (roll < 0.42) action = { type: 'settings', patch: { ante: int(25), sb: int(30), bb: int(60), buyIn: 1 + int(9000), maxPlayers: 2 + int(11) } }
      else if (roll < 0.48 && p) action = { type: 'pushChips', id: p.id, amount: int(1200) }
      else if (roll < 0.52 && p) action = { type: 'pullChips', id: p.id, amount: int(1200) }
      else if (roll < 0.55 && p) action = { type: 'allIn', id: p.id }
      else if (roll < 0.59 && p) action = { type: 'call', id: p.id }
      else if (roll < 0.62 && p) action = { type: 'fold', id: p.id }
      else if (roll < 0.65 && p) action = { type: 'clearBet', id: p.id }
      else if (roll < 0.71 && p && others.length > 0)
        action = { type: 'distribute', winners: rnd() < 0.6 ? [p.id] : [p.id, pick(others).id] }
      else if (roll < 0.77 && p && others.length > 0)
        action = { type: 'split', winners: int(2) === 0 ? [p.id] : [p.id, pick(others).id, ...others.slice(0, int(3)).map((x) => x.id)] }
      // setStack el ortasında 0'a inebilir; kaynak artık böyle bir oyuncuyu all-in
      // sayıyor (17. bölüm) ama soak'ın genel muhasebe kontrolünü bozmaması için
      // yalnız elde yatırımı olmayan oyuncularda çalıştırıyoruz.
      else if (roll < 0.82 && p && p.invested === 0) action = { type: 'setStack', id: p.id, amount: int(7000) }
      else if (p) action = { type: 'cashOut', id: p.id }
      else action = { type: 'nextTurn' }

      t = applyTableAction(t, action)
      invariant(t, soakAt(round, step, action))
      if (failures > before) {
        console.error(`  !! SOAK DURDURULDU, ilk hata: ${soakAt(round, step, action)}`)
        break outer
      }
    }
  }
  console.log(`   soak bitti: ${rounds} tur x 120 adim = ${actions} aksiyon (tohum ${SOAK_SEED})`)
  check('soak tamamlandi', rounds === 300, `${rounds}`)
}

// ---------------------------------------------------------------- sonuç
console.log('')
if (failures === 0) {
  console.log(`OK  ${checks} kontrol gecti - cip muhasebesi tutarli.`)
} else {
  console.log(`FAIL  ${failures} / ${checks} kontrol basarisiz.`)
  process.exit(1)
}
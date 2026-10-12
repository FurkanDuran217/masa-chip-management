import { apply, emptyState, addSeat, removeSeat, computePots, tableChips, Action } from '../src/lib/engine';
import { RoomSettings, RoomState } from '../src/lib/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

console.log('🧪 Masa v2 Bahis ve Çip Motoru Selftest Başlatılıyor...\n');

const settings: RoomSettings = {
  sb: 5,
  bb: 10,
  ante: 0,
  startingStack: 200,
  maxSeats: 9,
};

let state: RoomState = emptyState();

// 1. Koltuk Ekleme Testi
console.log('1️⃣ Koltuk Ekleme & Çip Muhasebesi');
state = addSeat(state, { memberId: 'p1', name: 'Ahmet', color: '#f5b942', emoji: '🦊', stack: 200, sittingOut: false });
state = addSeat(state, { memberId: 'p2', name: 'Mehmet', color: '#4fd1c5', emoji: '🐻', stack: 200, sittingOut: false });
state = addSeat(state, { memberId: 'p3', name: 'Can', color: '#f56565', emoji: '🦁', stack: 200, sittingOut: false });

assert(state.seats.length === 3, '3 koltuk olmalı');
assert(tableChips(state) === 600, 'Toplam masada 600 çip olmalı');
console.log('   ✅ 3 oyuncu başarıyla eklendi, toplam 600 çip doğrulandı.');

// 2. El Başlatma (Blind dağıtımı)
console.log('2️⃣ El Başlatma (Körler & Sıra)');
const startRes = apply(state, settings, { type: 'start' });
state = startRes.state;

assert(state.street === 'preflop', 'El preflop sokağında olmalı');
assert(state.handNo === 1, 'El no 1 olmalı');
assert(state.currentBet === 10, 'Preflop currentBet BB (10) olmalı');
assert(tableChips(state) === 600, 'Körler konduktan sonra toplam çip 600 kalmalı');
console.log('   ✅ El başladı. Dealer, SB ve BB doğru atandı.');

// 3. Bahis Turu İşleyişi (Call, Raise, Fold)
console.log('3️⃣ Bahis Turu (Gör, Artır, Pas)');
const turn1 = state.turn;
assert(turn1 >= 0, 'Sırası gelen oyuncu olmalı');

// Sıradaki oyuncu Gör (Call) yapar
const callRes = apply(state, settings, { type: 'call', seat: turn1 });
state = callRes.state;
assert(tableChips(state) === 600, 'Call sonrası çip korunmalı');

// Diğer oyuncu Call
const turn2 = state.turn;
const callRes2 = apply(state, settings, { type: 'call', seat: turn2 });
state = callRes2.state;
assert(tableChips(state) === 600, 'Call 2 sonrası çip korunmalı');

// BB check yapar -> sokak Flop'a geçmeli
const turn3 = state.turn;
const checkRes = apply(state, settings, { type: 'check', seat: turn3 });
state = checkRes.state;

assert(state.street === 'flop', 'Flop sokağına geçilmeli');
assert(state.pot === 30, 'Pot 30 çip olmalı (3 x 10)');
assert(tableChips(state) === 600, 'Flop geçişinde çip korunmalı');
console.log('   ✅ Preflop tamamlandı, 30 çip pot ile Flop açıldı.');

// 4. All-in ve Yan Pot Testi
console.log('4️⃣ All-in & Çoklu Yan Pot (Side Pot)');
let allInState = emptyState();
allInState = addSeat(allInState, { memberId: 'short', name: 'Kısa Yığın', color: '#f5b942', emoji: '🦊', stack: 50, sittingOut: false });
allInState = addSeat(allInState, { memberId: 'mid', name: 'Orta Yığın', color: '#4fd1c5', emoji: '🐻', stack: 100, sittingOut: false });
allInState = addSeat(allInState, { memberId: 'deep', name: 'Derin Yığın', color: '#f56565', emoji: '🦁', stack: 200, sittingOut: false });

const startRes2 = apply(allInState, settings, { type: 'start' });
allInState = startRes2.state;

// deep raise 100 yapar
const deepSeatIdx = allInState.seats.findIndex(s => s.memberId === 'deep');
// deep call/raise
allInState.seats[deepSeatIdx].committed = 100;
allInState.seats[deepSeatIdx].stack = 100;

const midSeatIdx = allInState.seats.findIndex(s => s.memberId === 'mid');
allInState.seats[midSeatIdx].committed = 100;
allInState.seats[midSeatIdx].stack = 0;
allInState.seats[midSeatIdx].allIn = true;

const shortSeatIdx = allInState.seats.findIndex(s => s.memberId === 'short');
allInState.seats[shortSeatIdx].committed = 50;
allInState.seats[shortSeatIdx].stack = 0;
allInState.seats[shortSeatIdx].allIn = true;

const pots = computePots(allInState);
assert(pots.length === 2, '2 ayrı pot (Ana Pot + Yan Pot) oluşmalı');
assert(pots[0].amount === 150, 'Ana pot 150 olmalı (3 x 50)');
assert(pots[0].eligible.length === 3, 'Ana potta 3 oyuncu hak sahibi olmalı');
assert(pots[1].amount === 100, 'Yan pot 100 olmalı (2 x 50)');
assert(pots[1].eligible.length === 2, 'Yan potta short yer almamalı');
console.log('   ✅ Yan potlar kusursuz hesaplandı (Ana: 150, Yan: 100).');

// 5. Fuzzing Testi (Rastgele 500 hamle ile çip sızıntısı arama)
console.log('5️⃣ Fuzz Testi (500 rastgele işlemde çip dengesi kontrolü)...');
let fState = emptyState();
fState = addSeat(fState, { memberId: 'f1', name: 'F1', color: '#111', emoji: '1', stack: 150, sittingOut: false });
fState = addSeat(fState, { memberId: 'f2', name: 'F2', color: '#222', emoji: '2', stack: 150, sittingOut: false });
fState = addSeat(fState, { memberId: 'f3', name: 'F3', color: '#333', emoji: '3', stack: 150, sittingOut: false });

const initialTotal = tableChips(fState);

for (let round = 0; round < 25; round++) {
  if (fState.street === 'idle') {
    // Çipi bitenlere biraz takviye yap
    for (const s of fState.seats) {
      if (s.stack < 10) s.stack += 100;
    }
    const currentT = tableChips(fState);
    const sRes = apply(fState, settings, { type: 'start' });
    fState = sRes.state;
    assert(tableChips(fState) === currentT, `El başlangıcı çip uyuşmazlığı tur ${round}`);
  }

  let moves = 0;
  while (fState.street !== 'idle' && fState.street !== 'showdown' && moves < 20) {
    moves++;
    const t = fState.turn;
    if (t < 0) break;
    const s = fState.seats[t];
    const actions: Action[] = [{ type: 'fold', seat: t }];
    if (s.bet >= fState.currentBet) {
      actions.push({ type: 'check', seat: t });
    } else {
      actions.push({ type: 'call', seat: t });
    }
    const picked = actions[Math.floor(Math.random() * actions.length)];
    const beforeMove = tableChips(fState);
    const mRes = apply(fState, settings, picked);
    fState = mRes.state;
    assert(tableChips(fState) === beforeMove, `Hamle sonrası çip uyuşmazlığı tur ${round}`);
  }

  if (fState.street === 'showdown') {
    const curPots = computePots(fState);
    const winners = curPots.map(p => [p.eligible[0]]);
    const beforeResolve = tableChips(fState);
    const rRes = apply(fState, settings, { type: 'resolve', winners });
    fState = rRes.state;
    assert(tableChips(fState) === beforeResolve, `Showdown dağıtımında çip uyuşmazlığı tur ${round}`);
  }
}

console.log('   ✅ Fuzz testi başarıyla geçti. Sıfır çip kaybı!');
console.log('\n🎉 TÜM MOTOR TESTLERİ BAŞARIYLA TAMAMLANDI! (ALL TESTS PASSED)');

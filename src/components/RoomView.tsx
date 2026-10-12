import React, { useState } from 'react';
import { useStore } from '../store';
import { act, buyIn, cashOut, undo, addMember } from '../lib/actions';
import { canRaise, minRaiseTo, maxRaiseTo, toCall, potTotal, computePots, STREET_LABEL } from '../lib/engine';
import { fmt } from '../lib/util';
import { sound, vibrate } from '../lib/sound';
import { ArrowLeft, RotateCcw, LogOut, PlusCircle, Check, UserPlus } from 'lucide-react';

export const RoomView: React.FC<{ roomId: string }> = ({ roomId }) => {
  const { group, groupLoaded, me, members, rooms, roomsLoaded, go, run, notify, addRoomOptimistic } = useStore();
  const room = rooms.find((r) => r.id === roomId);

  const [raiseVal, setRaiseVal] = useState<number>(0);
  const [showBuyInModal, setShowBuyInModal] = useState(false);
  const [buyInAmount, setBuyInAmount] = useState<number>(200);
  const [targetMemberId, setTargetMemberId] = useState<string>('');
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [winners, setWinners] = useState<string[][]>([]);

  // 1. Veriler henüz yükleniyorsa spinner göster (asla doğrudan "masa bulunamadı" deme)
  if (!groupLoaded || !roomsLoaded) {
    return (
      <div className="center-screen">
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px', maxWidth: 360 }}>
          <div className="spinner" style={{ margin: '0 auto 16px', width: 36, height: 36 }} />
          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Masa Yükleniyor...</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Masa durumu ve oyuncular senkronize ediliyor</p>
        </div>
      </div>
    );
  }

  // 2. Yüklendi ve oda gerçekten yoksa
  if (!group || !room || !me) {
    return (
      <div className="center-screen">
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px', maxWidth: 380 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>♠️</div>
          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Masa bulunamadı veya kapatılmış.</h3>
          <p className="muted" style={{ margin: '0 0 20px', fontSize: 13 }}>
            Bu masa kapatılmış veya silinmiş olabilir.
          </p>
          <button className="btn primary block" onClick={() => go({ name: 'lobby' })}>
            Lobiye Dön
          </button>
        </div>
      </div>
    );
  }

  const { state, settings } = room;
  const mySeatIdx = state.seats.findIndex((s) => s.memberId === me.id);
  const mySeat = mySeatIdx >= 0 ? state.seats[mySeatIdx] : null;
  const isMyTurn = state.turn === mySeatIdx && mySeatIdx >= 0;

  // Ses ve titreşim sırası kontrolü
  React.useEffect(() => {
    if (isMyTurn) {
      sound.yourTurn();
      vibrate([50, 50, 50]);
    }
  }, [isMyTurn]);

  // Raise slider min/max hesapla
  const minR = mySeatIdx >= 0 ? minRaiseTo(state, mySeatIdx, settings) : 0;
  const maxR = mySeatIdx >= 0 ? maxRaiseTo(state, mySeatIdx) : 0;
  const callAmt = mySeatIdx >= 0 ? toCall(state, mySeatIdx) : 0;

  // Buy-in modal açıcı
  const openBuyInModal = (preferredId?: string) => {
    const isMeSeated = state.seats.some((s) => s.memberId === me.id);
    let chosenId = preferredId;
    if (!chosenId) {
      if (!isMeSeated) {
        chosenId = me.id;
      } else {
        const unseated = members.find((m) => !state.seats.some((s) => s.memberId === m.id));
        chosenId = unseated ? unseated.id : me.id;
      }
    }
    setTargetMemberId(chosenId || me.id);
    setBuyInAmount(settings.startingStack || 200);
    setIsAddingGuest(false);
    setNewGuestName('');
    setShowBuyInModal(true);
  };

  // Aksiyonlar
  const handleAction = async (action: any) => {
    await run(async () => {
      if (action.type === 'fold') sound.fold();
      else if (action.type === 'check') sound.check();
      else if (action.type === 'call') sound.chip();
      else if (action.type === 'raise') sound.raise();
      else if (action.type === 'allin') sound.raise();

      const res = await act(group.id, room, action);
      if (res?.room) addRoomOptimistic(res.room);
    });
  };

  const handleStart = async () => {
    const readyPlayers = state.seats.filter((s) => s.stack > 0);
    if (readyPlayers.length < 2) {
      notify('Eli başlatmak için masada çipi olan en az 2 oyuncu olması gerekir. "Masaya Otur" ile diğer oyuncuları ekleyin.');
      return;
    }
    await run(async () => {
      sound.chip();
      const res = await act(group.id, room, { type: 'start' });
      if (res?.room) addRoomOptimistic(res.room);
    });
  };

  const handleBuyInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      let targetUser = members.find((m) => m.id === (targetMemberId || me.id)) || me;

      // Yeni misafir oyuncu ekleme seçildiyse
      if (isAddingGuest && newGuestName.trim()) {
        targetUser = await addMember(group, newGuestName.trim(), '1234', members);
      }

      const amt = Number(buyInAmount) || settings.startingStack || 200;
      const updated = await buyIn(group.id, room, targetUser, amt, true);
      addRoomOptimistic(updated);
      setShowBuyInModal(false);
      sound.chip();
      notify(`${targetUser.name} ${fmt(amt)} çip ile masaya oturdu!`);
    });
  };

  const handleCashOut = async () => {
    if (!window.confirm('Masadaki çiplerinizi havuza aktarıp kalkmak istiyor musunuz?')) return;
    await run(async () => {
      const updated = await cashOut(group.id, room, me);
      if (updated) addRoomOptimistic(updated);
    });
  };

  // Pots hesaplama
  const activePots = computePots(state);
  const totalInTable = potTotal(state);

  // Showdown resolve modal açma
  const openResolve = () => {
    // Her pot için boş seçim başlat
    setWinners(activePots.map(() => []));
    setShowResolveModal(true);
  };

  const submitResolve = async () => {
    await run(async () => {
      sound.win();
      const res = await act(group.id, room, { type: 'resolve', winners });
      if (res?.room) addRoomOptimistic(res.room);
      setShowResolveModal(false);
    });
  };

  return (
    <div className="col" style={{ gap: 12 }}>
      {/* Üst Bar */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn ghost icon" onClick={() => go({ name: 'lobby' })}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>{room.name}</h2>
            <div className="muted mono" style={{ fontSize: 12 }}>
              Körler: {settings.sb}/{settings.bb} {settings.ante > 0 && `(Ante ${settings.ante})`}
            </div>
          </div>
        </div>

        <div className="row" style={{ gap: 8 }}>
          {room.undo.length > 0 && (
            <button className="btn ghost icon" onClick={() => run(() => undo(group.id, room))} title="Geri Al">
              <RotateCcw size={16} />
            </button>
          )}
          <button className="btn" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => openBuyInModal()}>
            <PlusCircle size={14} /> {mySeat ? 'Oyuncu / Çip Ekle' : 'Masaya Otur'}
          </button>
          {mySeat && (
            <button className="btn danger" style={{ fontSize: 13, padding: '6px 12px' }} onClick={handleCashOut}>
              <LogOut size={14} /> Masadan Kalk
            </button>
          )}
        </div>
      </div>

      {/* POKER MASASI */}
      <div className="table-wrap">
        <div className="felt">
          {/* Pot Merkezi */}
          <div className="pot-center">
            <div className="street">{STREET_LABEL[state.street]}</div>
            <div className="pot mono">{fmt(totalInTable)}</div>
            {state.runout && <div className="badge gold" style={{ marginTop: 4 }}>ALL-IN RUNOUT</div>}
          </div>
        </div>

        {/* Koltuklar (Mevcut oyuncular + boş koltuklar) */}
        {Array.from({ length: Math.max(state.seats.length, settings.maxSeats || 8) }).map((_, idx) => {
          const totalSlotCount = Math.max(state.seats.length, settings.maxSeats || 8);
          const angle = (idx / totalSlotCount) * 2 * Math.PI + Math.PI / 2;
          const left = 50 + 41 * Math.cos(angle);
          const top = 50 + 37 * Math.sin(angle);

          const s = state.seats[idx];

          if (!s) {
            // Boş koltuk
            return (
              <div
                key={`empty_${idx}`}
                className="seat empty-seat"
                style={{ left: `${left}%`, top: `${top}%` }}
                onClick={() => openBuyInModal()}
                title="Masaya Otur / Oyuncu Ekle"
              >
                <div className="empty-seat-plus">+</div>
                <div className="nm muted">Boş Koltuk</div>
              </div>
            );
          }

          const isTurn = state.turn === idx;
          const isButton = state.button === idx;
          const isSb = state.sbIdx === idx;
          const isBb = state.bbIdx === idx;
          const isMe = s.memberId === me.id;

          return (
            <div
              key={s.memberId}
              className={`seat ${isTurn ? 'turn' : ''} ${s.folded ? 'folded' : ''} ${s.sittingOut ? 'out' : ''} ${isMe ? 'me' : ''}`}
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <div className="tags">
                {isButton && <span className="tag d">D</span>}
                {isSb && <span className="tag sb">SB</span>}
                {isBb && <span className="tag bb">BB</span>}
                {s.allIn && <span className="tag ai">ALL-IN</span>}
              </div>

              <div className="nm">{s.name}</div>
              <div className="st mono gold">{fmt(s.stack)}</div>

              {/* Bu sokaktaki bet göstergesi */}
              {s.bet > 0 && (
                <div
                  className="bet-chip mono"
                  style={{
                    left: `${50 - 24 * Math.cos(angle)}%`,
                    top: `${50 - 20 * Math.sin(angle)}%`,
                  }}
                >
                  {fmt(s.bet)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AKSİYON ÇUBUĞU */}
      <div className="actionbar">
        {state.street === 'idle' ? (
          <div className="row" style={{ justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div className="col" style={{ gap: 2 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {state.seats.filter((s) => s.stack > 0).length >= 2
                  ? '🟢 Masa Hazır (Çipli oyuncular var)'
                  : '🔴 Masada en az 2 oyuncu olmalı'}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {state.seats.length === 0
                  ? 'Masada kimse yok. Oyuncu ekleyip çip verin.'
                  : `${state.seats.length} koltuk dolu. Başlatmak için 2+ oyuncu gerekir.`}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={() => openBuyInModal()}>
                <PlusCircle size={15} /> Oyuncu Ekle / Oturt
              </button>
              <button
                className="btn primary big"
                onClick={handleStart}
                disabled={state.seats.filter((s) => s.stack > 0).length < 2}
              >
                Eli Başlat
              </button>
            </div>
          </div>
        ) : state.street === 'showdown' ? (
          <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
            <div>
              <div style={{ fontWeight: 700 }}>Showdown!</div>
              <div className="muted" style={{ fontSize: 13 }}>Kazananları seçip potu dağıtın.</div>
            </div>
            <button className="btn primary big" onClick={openResolve}>
              Kazananları Belirle & Dağıt
            </button>
          </div>
        ) : isMyTurn ? (
          <div className="col" style={{ width: '100%' }}>
            <div className="actions">
              <button className="btn danger" onClick={() => handleAction({ type: 'fold', seat: mySeatIdx })}>
                Pas (Fold)
              </button>

              {callAmt === 0 ? (
                <button className="btn" onClick={() => handleAction({ type: 'check', seat: mySeatIdx })}>
                  Check
                </button>
              ) : (
                <button className="btn primary" onClick={() => handleAction({ type: 'call', seat: mySeatIdx })}>
                  Gör ({fmt(callAmt)})
                </button>
              )}

              {canRaise(state, mySeatIdx) && (
                <button
                  className="btn success"
                  onClick={() => handleAction({ type: 'raise', seat: mySeatIdx, to: raiseVal || minR })}
                >
                  Artır ({fmt(raiseVal || minR)})
                </button>
              )}

              <button className="btn danger" onClick={() => handleAction({ type: 'allin', seat: mySeatIdx })}>
                ALL-IN ({fmt(maxR)})
              </button>
            </div>

            {/* Raise Slider */}
            {canRaise(state, mySeatIdx) && (
              <div className="col" style={{ marginTop: 10 }}>
                <div className="raise-row">
                  <span className="muted mono" style={{ fontSize: 12 }}>{fmt(minR)}</span>
                  <input
                    type="range"
                    min={minR}
                    max={maxR}
                    step={settings.bb}
                    value={raiseVal || minR}
                    onChange={(e) => setRaiseVal(Number(e.target.value))}
                  />
                  <span className="mono gold" style={{ fontSize: 14 }}>{fmt(raiseVal || minR)}</span>
                </div>
                <div className="quick">
                  <button type="button" onClick={() => setRaiseVal(minR)}>Min ({fmt(minR)})</button>
                  <button type="button" onClick={() => setRaiseVal(Math.min(maxR, state.currentBet + settings.bb * 2))}>+2BB</button>
                  <button type="button" onClick={() => setRaiseVal(Math.min(maxR, Math.floor(totalInTable / 2)))}>½ Pot</button>
                  <button type="button" onClick={() => setRaiseVal(Math.min(maxR, totalInTable))}>Pot</button>
                  <button type="button" onClick={() => setRaiseVal(maxR)}>Max</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="row" style={{ justifyContent: 'center', width: '100%', padding: '6px 0' }}>
            <span className="muted">
              Sıra: <strong className="gold">{state.seats[state.turn]?.name || 'Bekleniyor...'}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Son Olay Kayıtları */}
      <div className="card" style={{ marginTop: 8 }}>
        <div className="section-title" style={{ margin: '0 0 8px' }}>Son Hareketler</div>
        <div className="log">
          {room.log.slice(0, 15).map((e) => (
            <div key={e.id} className="e">
              <time className="mono">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
              <span>{e.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Buy-In Modal */}
      {showBuyInModal && (
        <div className="backdrop" onClick={() => setShowBuyInModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Masaya Otur / Oyuncu Ekle</h2>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setIsAddingGuest(!isAddingGuest)}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                <UserPlus size={13} /> {isAddingGuest ? 'Gruptan Seç' : '+ Yeni Misafir'}
              </button>
            </div>

            <form onSubmit={handleBuyInSubmit} className="col" style={{ gap: 14 }}>
              {isAddingGuest ? (
                <div className="field">
                  <label>Yeni Oyuncu Adı</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="örn. Can, Barış, Murat..."
                    value={newGuestName}
                    onChange={(e) => setNewGuestName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              ) : (
                <div className="field">
                  <label>Oyuncu Seç</label>
                  <select
                    className="input"
                    value={targetMemberId || me.id}
                    onChange={(e) => setTargetMemberId(e.target.value)}
                  >
                    {members.map((m) => {
                      const isSeated = state.seats.some((s) => s.memberId === m.id);
                      return (
                        <option key={m.id} value={m.id}>
                          {m.emoji} {m.name} {isSeated ? '(Masada Oturuyor - Çip Ekle)' : `(Havuz: ${fmt(m.balance)} çip)`}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="field">
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ margin: 0 }}>Giriş Çipi (Yığın)</label>
                  {!isAddingGuest && (
                    <span className="muted mono" style={{ fontSize: 12 }}>
                      Havuz: <strong className="gold">{fmt(members.find((m) => m.id === (targetMemberId || me.id))?.balance ?? me.balance)}</strong> çip
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  className="input mono"
                  min={settings.bb}
                  value={buyInAmount}
                  onChange={(e) => setBuyInAmount(Math.max(1, Number(e.target.value)))}
                  required
                />
              </div>

              {/* Hızlı Çip Seçicileri */}
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {[settings.startingStack || 200, (settings.startingStack || 200) * 2, 500, 1000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`btn ${buyInAmount === preset ? 'primary' : 'ghost'}`}
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => setBuyInAmount(preset)}
                  >
                    {fmt(preset)} Çip
                  </button>
                ))}
              </div>

              {!isAddingGuest && (members.find((m) => m.id === (targetMemberId || me.id))?.balance ?? me.balance) < buyInAmount && (
                <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f59e0b' }}>
                  💡 Havuzdaki bakiye yetersiz olsa bile eksik çipler masaya oturunca otomatik yüklenecektir.
                </div>
              )}

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
                <button type="button" className="btn ghost" onClick={() => setShowBuyInModal(false)}>
                  İptal
                </button>
                <button type="submit" className="btn primary big">
                  Masaya Oturt ({fmt(buyInAmount)} Çip)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Showdown Kazanan Seçimi Modal */}
      {showResolveModal && (
        <div className="backdrop" onClick={() => setShowResolveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Kazananları Belirle</h2>
            <div className="col" style={{ gap: 16 }}>
              {activePots.map((pot, potIdx) => (
                <div key={potIdx} style={{ background: 'rgba(0,0,0,0.25)', padding: 12, borderRadius: 12 }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>Pot #{potIdx + 1}</strong>
                    <span className="gold mono">{fmt(pot.amount)} çip</span>
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {pot.eligible.map((memId) => {
                      const memberSeat = state.seats.find((s) => s.memberId === memId);
                      const isSelected = winners[potIdx]?.includes(memId);
                      return (
                        <button
                          key={memId}
                          type="button"
                          className={`btn ${isSelected ? 'primary' : 'ghost'}`}
                          style={{ fontSize: 13, padding: '6px 12px' }}
                          onClick={() => {
                            const cur = winners[potIdx] || [];
                            const next = isSelected ? cur.filter((x) => x !== memId) : [...cur, memId];
                            const updated = [...winners];
                            updated[potIdx] = next;
                            setWinners(updated);
                          }}
                        >
                          {isSelected && <Check size={14} />} {memberSeat?.name || 'Oyuncu'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn ghost" onClick={() => setShowResolveModal(false)}>
                  İptal
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={winners.some((w) => w.length === 0)}
                  onClick={submitResolve}
                >
                  Potları Dağıt & Bitir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

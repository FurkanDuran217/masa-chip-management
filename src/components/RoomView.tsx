import React, { useState } from 'react';
import { useStore } from '../store';
import { act, buyIn, cashOut, undo } from '../lib/actions';
import { canRaise, minRaiseTo, maxRaiseTo, toCall, potTotal, computePots, STREET_LABEL } from '../lib/engine';
import { fmt } from '../lib/util';
import { sound, vibrate } from '../lib/sound';
import { ArrowLeft, RotateCcw, LogOut, PlusCircle, Check } from 'lucide-react';

export const RoomView: React.FC<{ roomId: string }> = ({ roomId }) => {
  const { group, me, rooms, go, run } = useStore();
  const room = rooms.find((r) => r.id === roomId);

  const [raiseVal, setRaiseVal] = useState<number>(0);
  const [showBuyInModal, setShowBuyInModal] = useState(false);
  const [buyInAmount, setBuyInAmount] = useState<number>(200);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [winners, setWinners] = useState<string[][]>([]);

  if (!group || !room || !me) {
    return (
      <div className="center-screen">
        <div className="card">
          <p>Masa bulunamadı veya kapatılmış.</p>
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

  // Aksiyonlar
  const handleAction = async (action: any) => {
    await run(async () => {
      if (action.type === 'fold') sound.fold();
      else if (action.type === 'check') sound.check();
      else if (action.type === 'call') sound.chip();
      else if (action.type === 'raise') sound.raise();
      else if (action.type === 'allin') sound.raise();

      await act(group.id, room, action);
    });
  };

  const handleStart = async () => {
    await run(async () => {
      sound.chip();
      await act(group.id, room, { type: 'start' });
    });
  };

  const handleBuyInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      await buyIn(group.id, room, me, Number(buyInAmount));
      setShowBuyInModal(false);
    });
  };

  const handleCashOut = async () => {
    if (!window.confirm('Masadaki çiplerinizi havuza aktarıp kalkmak istiyor musunuz?')) return;
    await run(async () => {
      await cashOut(group.id, room, me);
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
      await act(group.id, room, { type: 'resolve', winners });
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
          {mySeat ? (
            <button className="btn danger" style={{ fontSize: 13, padding: '6px 12px' }} onClick={handleCashOut}>
              <LogOut size={14} /> Masadan Kalk
            </button>
          ) : (
            <button className="btn primary" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => setShowBuyInModal(true)}>
              <PlusCircle size={14} /> Masaya Otur
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

        {/* Koltuklar */}
        {state.seats.map((s, idx) => {
          // Elips koordinatları (rX, rY)
          const angle = (idx / state.seats.length) * 2 * Math.PI + Math.PI / 2;
          const left = 50 + 40 * Math.cos(angle);
          const top = 50 + 36 * Math.sin(angle);

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
          <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
            <div className="muted" style={{ fontSize: 14 }}>
              {state.seats.filter((s) => s.stack > 0).length >= 2
                ? 'El başlatılmaya hazır.'
                : 'En az 2 oyuncu gerekli.'}
            </div>
            <div className="row">
              {mySeat && (
                <button className="btn" onClick={() => setShowBuyInModal(true)}>
                  Çip Ekle
                </button>
              )}
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
            <h2>Masaya Çip Getir</h2>
            <p className="muted" style={{ fontSize: 14, margin: '0 0 16px' }}>
              Havuz bakiyeniz: <strong className="gold mono">{fmt(me.balance)}</strong> çip
            </p>
            <form onSubmit={handleBuyInSubmit} className="col">
              <div className="field">
                <label>Giriş Çipi</label>
                <input
                  type="number"
                  className="input mono"
                  max={me.balance}
                  min={settings.bb}
                  value={buyInAmount}
                  onChange={(e) => setBuyInAmount(Number(e.target.value))}
                  required
                  autoFocus
                />
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setShowBuyInModal(false)}>
                  İptal
                </button>
                <button type="submit" className="btn primary">
                  Masaya Aktar
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

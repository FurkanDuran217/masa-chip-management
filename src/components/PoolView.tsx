import React, { useState } from 'react';
import { useStore } from '../store';
import { deposit } from '../lib/actions';
import { fmt, signed } from '../lib/util';
import { Plus } from 'lucide-react';

export const PoolView: React.FC = () => {
  const { group, me, members, ledger, run } = useStore();
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState<number>(500);
  const [note, setNote] = useState('');

  if (!group || !me) return null;

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      await deposit(group.id, me, Number(depositAmount), note || 'Yükleme');
      setShowDeposit(false);
      setNote('');
    });
  };

  const totalPool = members.reduce((sum, m) => sum + m.balance, 0);

  return (
    <div className="col" style={{ gap: 20 }}>
      {/* Özet Kartı */}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="muted" style={{ fontSize: 13, textTransform: 'uppercase' }}>Grup Toplam Havuzu</div>
            <div className="big-num gold mono">{fmt(totalPool)} <span style={{ fontSize: 16 }}>çip</span></div>
          </div>
          <button className="btn primary" onClick={() => setShowDeposit(true)}>
            <Plus size={16} /> Çip Yükle / Ekle
          </button>
        </div>
      </div>

      {/* Üye Bakiyeleri */}
      <div className="card">
        <div className="section-title" style={{ margin: '0 0 12px' }}>Üye Bakiyeleri</div>
        <div className="list">
          {members.map((m) => (
            <div key={m.id} className="list-item">
              <div className="avatar" style={{ background: m.color, color: '#111' }}>
                {m.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{m.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Yatırılan Toplam: {fmt(m.deposited)}
                </div>
              </div>
              <div className="mono gold" style={{ fontWeight: 800, fontSize: 16 }}>
                {fmt(m.balance)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Havuz Hareketleri (Ledger) */}
      <div className="card">
        <div className="section-title" style={{ margin: '0 0 12px' }}>Son Havuz Hareketleri</div>
        <div className="list">
          {ledger.slice(0, 30).map((l) => {
            const mem = members.find((m) => m.id === l.memberId);
            return (
              <div key={l.id} className="list-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {mem?.name || 'Üye'}: <span className="muted">{l.note || l.type}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {new Date(l.at).toLocaleDateString()} {new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className={`mono ${l.amount >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
                  {signed(l.amount)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Yükleme Modal */}
      {showDeposit && (
        <div className="backdrop" onClick={() => setShowDeposit(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Havuza Çip Ekle</h2>
            <form onSubmit={handleDeposit} className="col">
              <div className="field">
                <label>Miktar</label>
                <input
                  type="number"
                  className="input mono"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(Number(e.target.value))}
                  required
                  autoFocus
                />
              </div>

              <div className="field">
                <label>Açıklama (opsiyonel)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="örn. Nakit ödeme karşılığı"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setShowDeposit(false)}>
                  İptal
                </button>
                <button type="submit" className="btn primary">
                  Yükle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

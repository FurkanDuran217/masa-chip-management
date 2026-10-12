import React, { useState } from 'react';
import { useStore } from '../store';
import { addMember, verifyPin } from '../lib/actions';
import { Member } from '../lib/types';
import { fmt } from '../lib/util';
import { UserPlus, KeyRound, LogIn, ArrowLeft } from 'lucide-react';

export const MemberGate: React.FC = () => {
  const { group, members, setMeId, run, notify } = useStore();
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [pin, setPin] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');

  if (!group) return null;

  const handleSelect = async (m: Member) => {
    if (!m.pinHash) {
      setMeId(m.id);
      return;
    }
    setSelectedMember(m);
    setPin('');
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;
    const ok = await verifyPin(selectedMember, pin);
    if (ok) {
      setMeId(selectedMember.id);
    } else {
      notify('Hatalı PIN!');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await run(async () => {
      const m = await addMember(group, newName.trim(), newPin.trim(), members);
      setMeId(m.id);
    });
  };

  return (
    <div className="center-screen">
      <div className="card" style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 4 }}>{group.emoji}</div>
          <h2 style={{ margin: 0 }}>{group.name}</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
            Kim olduğunu seç veya yeni profil oluştur
          </p>
        </div>

        {selectedMember ? (
          <form onSubmit={handleVerifyPin} className="col">
            <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
              <button
                type="button"
                className="btn ghost icon"
                onClick={() => setSelectedMember(null)}
              >
                <ArrowLeft size={18} />
              </button>
              <div
                className="avatar"
                style={{ background: selectedMember.color, color: '#111' }}
              >
                {selectedMember.emoji}
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>{selectedMember.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>PIN Kodu Girin</div>
              </div>
            </div>

            <div className="field">
              <input
                type="password"
                className="input mono"
                placeholder="4 haneli PIN"
                maxLength={6}
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn primary big block" style={{ marginTop: 8 }}>
              <LogIn size={18} /> Giriş Yap
            </button>
          </form>
        ) : isAdding ? (
          <form onSubmit={handleAddMember} className="col">
            <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
              <button
                type="button"
                className="btn ghost icon"
                onClick={() => setIsAdding(false)}
              >
                <ArrowLeft size={18} />
              </button>
              <h3 style={{ margin: 0, fontSize: 16 }}>Yeni Oyuncu Ekle</h3>
            </div>

            <div className="field">
              <label>Adın / Takma Adın</label>
              <input
                type="text"
                className="input"
                placeholder="örn. Ahmet"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="field">
              <label>PIN (İsteğe bağlı koruma)</label>
              <input
                type="password"
                maxLength={6}
                className="input mono"
                placeholder="örn. 1234"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
              />
            </div>

            <button type="submit" className="btn primary big block" style={{ marginTop: 12 }}>
              <UserPlus size={18} /> Ekle & Masaya Geç
            </button>
          </form>
        ) : (
          <div className="col">
            <div className="list" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {members.map((m) => (
                <div
                  key={m.id}
                  className="list-item"
                  style={{ cursor: 'pointer', padding: '8px 10px', borderRadius: 10 }}
                  onClick={() => handleSelect(m)}
                >
                  <div className="avatar" style={{ background: m.color, color: '#111' }}>
                    {m.emoji}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {m.name}
                      {m.pinHash && <KeyRound size={12} className="muted" />}
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      Bakiye: <span className="gold mono">{fmt(m.balance)}</span> çip
                    </div>
                  </div>
                  <button type="button" className="btn ghost" style={{ fontSize: 13 }}>
                    Seç →
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn block"
              style={{ marginTop: 12, borderStyle: 'dashed' }}
              onClick={() => setIsAdding(true)}
            >
              <UserPlus size={16} /> Yeni Oyuncu Ekle
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

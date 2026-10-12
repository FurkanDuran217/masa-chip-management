import React, { useState } from 'react';
import { useStore } from '../store';
import { createGroup, addMember } from '../lib/actions';
import { EMOJIS } from '../lib/util';
import { ArrowRight, Sparkles } from 'lucide-react';

export const GroupGate: React.FC = () => {
  const { setGroupId, run } = useStore();
  const [tab, setTab] = useState<'join' | 'create'>('create');
  
  // Create form
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('♠️');
  const [adminName, setAdminName] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [startingBalance, setStartingBalance] = useState('1000');
  const [chipValue, setChipValue] = useState('0');
  
  // Join form
  const [joinId, setJoinId] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await run(async () => {
      const g = await createGroup(
        {
          name,
          emoji,
          startingBalance: parseInt(startingBalance, 10) || 1000,
          chipValue: parseFloat(chipValue) || 0,
          currency: '₺',
          defaults: { sb: 5, bb: 10, ante: 0, startingStack: 200 },
        },
        adminName || 'Admin'
      );
      if (adminName.trim()) {
        await addMember(g, adminName.trim(), adminPin.trim(), []);
      }
      setGroupId(g.id);
    });
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinId.trim()) {
      setGroupId(joinId.trim());
    }
  };

  return (
    <div className="center-screen">
      <div className="card" style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="brand" style={{ justifyContent: 'center', marginBottom: 8 }}>
            <div className="logo">♠</div>
            <span>Masa</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Ortak çip havuzu, canlı poker masası ve oyuncu istatistikleri
          </p>
        </div>

        <div className="row" style={{ marginBottom: 20, background: 'rgba(0,0,0,0.25)', padding: 4, borderRadius: 12 }}>
          <button
            type="button"
            className={`btn block ${tab === 'create' ? 'primary' : 'ghost'}`}
            style={{ flex: 1 }}
            onClick={() => setTab('create')}
          >
            Grup Kur
          </button>
          <button
            type="button"
            className={`btn block ${tab === 'join' ? 'primary' : 'ghost'}`}
            style={{ flex: 1 }}
            onClick={() => setTab('join')}
          >
            Gruba Katıl
          </button>
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreate} className="col">
            <div className="field">
              <label>Grup Adı</label>
              <div className="row" style={{ gap: 8 }}>
                <select
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  className="input"
                  style={{ width: 64, textAlign: 'center', fontSize: 18 }}
                >
                  {EMOJIS.map((em: string) => (
                    <option key={em} value={em}>{em}</option>
                  ))}
                  <option value="♠️">♠️</option>
                  <option value="♥️">♥️</option>
                  <option value="♦️">♦️</option>
                  <option value="♣️">♣️</option>
                </select>
                <input
                  type="text"
                  className="input"
                  placeholder="örn. Cuma Pokeri"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label>Senin Adın (İlk Üye)</label>
              <input
                type="text"
                className="input"
                placeholder="örn. Furkan"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Giriş PIN (İsteğe bağlı 4 hane)</label>
              <input
                type="password"
                maxLength={6}
                className="input mono"
                placeholder="örn. 1234"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
              />
            </div>

            <div className="fields">
              <div className="field">
                <label>Başlangıç Çipi</label>
                <input
                  type="number"
                  className="input mono"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                />
              </div>
              <div className="field">
                <label>1 Çip Değeri (₺, opsiyonel)</label>
                <input
                  type="number"
                  step="any"
                  className="input mono"
                  placeholder="0 = kapalı"
                  value={chipValue}
                  onChange={(e) => setChipValue(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="btn primary big block" style={{ marginTop: 12 }}>
              <Sparkles size={18} /> Grubu Oluştur & Başla
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="col">
            <div className="field">
              <label>Grup Kodu veya Linki</label>
              <input
                type="text"
                className="input mono"
                placeholder="örn. xk92ma"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn primary big block" style={{ marginTop: 12 }}>
              <ArrowRight size={18} /> Gruba Git
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useStore } from '../store';
import { createGroup, addMember } from '../lib/actions';
import { EMOJIS } from '../lib/util';
import { ArrowRight, Sparkles } from 'lucide-react';

export const GroupGate: React.FC = () => {
  const { joinedGroups, switchGroup, setGroupId, unlockGroup, run } = useStore();
  const urlParamG = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('g') : null;
  const [tab, setTab] = useState<'join' | 'create' | 'my-groups'>(() => {
    if (urlParamG) return 'join';
    return joinedGroups.length > 0 ? 'my-groups' : 'create';
  });

  // Create form
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('♠️');
  const [groupPassword, setGroupPassword] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [startingBalance, setStartingBalance] = useState('1000');

  // Çip oranı hesap modu
  // 'direct' = 1 çip = X TL
  // 'inverse' = 1 TL = X çip
  const [calcMode, setCalcMode] = useState<'direct' | 'inverse'>('inverse');
  const [chipValue, setChipValue] = useState('0'); // 1 çip = ... TL
  const [chipsPerCurrency, setChipsPerCurrency] = useState('10'); // 1 TL = ... çip

  // Join form
  const [joinId, setJoinId] = useState(() => urlParamG || '');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await run(async () => {
      let finalChipValue = 0;
      let finalChipsPerCurrency = 0;

      if (calcMode === 'direct') {
        finalChipValue = parseFloat(chipValue) || 0;
        finalChipsPerCurrency = finalChipValue > 0 ? Math.round(1 / finalChipValue) : 0;
      } else {
        finalChipsPerCurrency = parseFloat(chipsPerCurrency) || 0;
        finalChipValue = finalChipsPerCurrency > 0 ? 1 / finalChipsPerCurrency : 0;
      }

      const g = await createGroup(
        {
          name,
          emoji,
          password: groupPassword.trim() || undefined,
          startingBalance: parseInt(startingBalance, 10) || 1000,
          chipValue: finalChipValue,
          chipsPerCurrency: finalChipsPerCurrency,
          currency: '₺',
          defaults: { sb: 5, bb: 10, ante: 0, startingStack: 200 },
        },
        adminName || 'Admin'
      );

      // Kuran kişi otomatik açılmış sayılır
      unlockGroup(g.id);

      if (adminName.trim()) {
        await addMember(g, adminName.trim(), adminPin.trim(), []);
      }
      setGroupId(g.id);
    });
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    let code = joinId.trim();
    if (!code) return;
    // Eğer kullanıcı tam URL yapıştırdıysa (?g= parametresini ayıkla)
    if (code.includes('?g=') || code.includes('&g=')) {
      try {
        const u = new URL(code.startsWith('http') ? code : `https://${code}`);
        const param = u.searchParams.get('g');
        if (param) code = param;
      } catch {
        const match = code.match(/[?&]g=([a-zA-Z0-9_-]+)/);
        if (match) code = match[1];
      }
    }
    setGroupId(code);
  };

  return (
    <div className="center-screen">
      <div className="card" style={{ maxWidth: 460, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div className="brand" style={{ justifyContent: 'center', marginBottom: 8 }}>
            <div className="logo">♠</div>
            <span>Masa</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Ortak çip havuzu, canlı poker masası ve oyuncu istatistikleri
          </p>
        </div>

        <div className="row" style={{ marginBottom: 20, background: 'rgba(0,0,0,0.25)', padding: 4, borderRadius: 12 }}>
          {joinedGroups.length > 0 && (
            <button
              type="button"
              className={`btn block ${tab === 'my-groups' ? 'primary' : 'ghost'}`}
              style={{ flex: 1 }}
              onClick={() => setTab('my-groups')}
            >
              Gruplarım ({joinedGroups.length})
            </button>
          )}
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

        {tab === 'my-groups' ? (
          <div className="col">
            <div className="list" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {joinedGroups.map((jg) => (
                <div
                  key={jg.id}
                  className="list-item"
                  style={{ cursor: 'pointer', padding: '10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', marginBottom: 6 }}
                  onClick={() => switchGroup(jg.id)}
                >
                  <div className="avatar" style={{ background: '#1e293b', fontSize: 22 }}>
                    {jg.emoji}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{jg.name}</div>
                    <div className="muted mono" style={{ fontSize: 12 }}>Kod: {jg.id}</div>
                  </div>
                  <button type="button" className="btn primary" style={{ fontSize: 13, padding: '6px 12px' }}>
                    Aç →
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn block"
              style={{ marginTop: 12, borderStyle: 'dashed' }}
              onClick={() => setTab('create')}
            >
              <Sparkles size={16} /> Farklı Bir Grup Kur
            </button>
          </div>
        ) : tab === 'create' ? (
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
              <label>Gruba Giriş Şifresi (Herkesin girmemesi için)</label>
              <input
                type="password"
                className="input"
                placeholder="İsteğe bağlı grup şifresi"
                value={groupPassword}
                onChange={(e) => setGroupPassword(e.target.value)}
              />
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
              <label>Kişisel Profil PIN (4 hane, profilini korumak için)</label>
              <input
                type="password"
                maxLength={6}
                className="input mono"
                placeholder="örn. 1234 (isteğe bağlı)"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Üyelere Verilecek Başlangıç Çipi</label>
              <input
                type="number"
                className="input mono"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                required
              />
            </div>

            {/* Çip Değeri Hesaplama Seçeneği */}
            <div className="field" style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 12, marginTop: 4 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ margin: 0, fontWeight: 700 }}>Para & Çip Oranı (Opsiyonel)</label>
                <div className="row" style={{ gap: 4 }}>
                  <button
                    type="button"
                    className={`btn ${calcMode === 'inverse' ? 'primary' : 'ghost'}`}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 8 }}
                    onClick={() => setCalcMode('inverse')}
                  >
                    1 TL = X Çip
                  </button>
                  <button
                    type="button"
                    className={`btn ${calcMode === 'direct' ? 'primary' : 'ghost'}`}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 8 }}
                    onClick={() => setCalcMode('direct')}
                  >
                    1 Çip = X TL
                  </button>
                </div>
              </div>

              {calcMode === 'inverse' ? (
                <div>
                  <div className="field">
                    <label>1 TL Kaç Çip Eder?</label>
                    <input
                      type="number"
                      step="any"
                      className="input mono"
                      placeholder="örn. 10 (1 TL = 10 çip ise 1 çip = 0.10 TL)"
                      value={chipsPerCurrency}
                      onChange={(e) => setChipsPerCurrency(e.target.value)}
                    />
                  </div>
                  {parseFloat(chipsPerCurrency) > 0 && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      💡 1 çip = {(1 / parseFloat(chipsPerCurrency)).toFixed(3)} ₺ eder.
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="field">
                    <label>1 Çip Kaç TL Eder?</label>
                    <input
                      type="number"
                      step="any"
                      className="input mono"
                      placeholder="örn. 0.25 veya 1"
                      value={chipValue}
                      onChange={(e) => setChipValue(e.target.value)}
                    />
                  </div>
                  {parseFloat(chipValue) > 0 && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      💡 1 ₺ = {(1 / parseFloat(chipValue)).toFixed(1)} çip eder.
                    </div>
                  )}
                </div>
              )}
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

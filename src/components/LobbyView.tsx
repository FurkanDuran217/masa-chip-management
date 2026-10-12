import React, { useState } from 'react';
import { useStore } from '../store';
import { createRoom } from '../lib/actions';
import { fmt } from '../lib/util';
import { Plus, Play, Users, ExternalLink } from 'lucide-react';

export const LobbyView: React.FC = () => {
  const { group, me, rooms, go, run, notify, addRoomOptimistic } = useStore();
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [sb, setSb] = useState(group?.defaults.sb || 5);
  const [bb, setBb] = useState(group?.defaults.bb || 10);
  const [ante, setAnte] = useState(group?.defaults.ante || 0);
  const [startingStack, setStartingStack] = useState(group?.defaults.startingStack || 200);

  if (!group || !me) return null;

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const r = await createRoom(group, me.id, roomName || `${group.name} Masası`, {
        sb: Number(sb) || 5,
        bb: Number(bb) || 10,
        ante: Number(ante) || 0,
        startingStack: Number(startingStack) || 200,
        maxSeats: 9,
      });
      addRoomOptimistic(r);
      setShowNewRoom(false);
      go({ name: 'room', roomId: r.id });
    });
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(window.location.origin + window.location.pathname + `?g=${group.id}`);
    notify('Davet linki panoya kopyalandı!');
  };

  const openRooms = rooms.filter((r) => r.status === 'open');

  return (
    <div className="col" style={{ gap: 20 }}>
      {/* Header Info */}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="row" style={{ gap: 12 }}>
            <div className="avatar" style={{ background: me.color, color: '#111' }}>
              {me.emoji}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{me.name}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                Havuzdaki Bakiyen: <strong className="gold mono">{fmt(me.balance)}</strong> çip
              </div>
            </div>
          </div>
          <button className="btn ghost" onClick={copyInvite} style={{ fontSize: 13 }}>
            <ExternalLink size={14} /> Davet Linki
          </button>
        </div>
      </div>

      {/* Aktif Masalar */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 18 }}>Canlı Masalar</h2>
        <button className="btn primary" onClick={() => setShowNewRoom(true)}>
          <Plus size={16} /> Yeni Masa Aç
        </button>
      </div>

      {openRooms.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
          <p className="muted" style={{ margin: '0 0 16px' }}>Şu an açık bir masa yok.</p>
          <button className="btn primary" onClick={() => setShowNewRoom(true)}>
            <Plus size={16} /> İlk Masayı Başlat
          </button>
        </div>
      ) : (
        <div className="grid">
          {openRooms.map((r) => {
            const inCount = r.state.seats.length;
            const isPlaying = r.state.seats.some((s) => s.memberId === me.id);
            return (
              <div
                key={r.id}
                className="card hover"
                onClick={() => go({ name: 'room', roomId: r.id })}
              >
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                  <span className="badge live">CANLI</span>
                  <span className="muted mono" style={{ fontSize: 12 }}>
                    {r.settings.sb}/{r.settings.bb}
                    {r.settings.ante > 0 && ` (${r.settings.ante})`}
                  </span>
                </div>
                <h3 style={{ fontSize: 18, marginBottom: 6 }}>{r.name}</h3>
                <div className="row muted" style={{ fontSize: 13, gap: 14 }}>
                  <span><Users size={14} style={{ verticalAlign: -2 }} /> {inCount} Oyuncu</span>
                  <span>El #{r.state.handNo}</span>
                </div>
                <div style={{ marginTop: 16 }}>
                  <button className={`btn block ${isPlaying ? 'success' : 'primary'}`}>
                    <Play size={14} /> {isPlaying ? 'Masaya Dön' : 'Masayı Aç'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Yeni Masa Modal */}
      {showNewRoom && (
        <div className="backdrop" onClick={() => setShowNewRoom(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Yeni Oyun Masası</h2>
            <form onSubmit={handleCreateRoom} className="col">
              <div className="field">
                <label>Masa Adı</label>
                <input
                  type="text"
                  className="input"
                  placeholder="örn. Ana Masa"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="fields">
                <div className="field">
                  <label>Küçük Kör (SB)</label>
                  <input
                    type="number"
                    className="input mono"
                    value={sb}
                    onChange={(e) => setSb(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="field">
                  <label>Büyük Kör (BB)</label>
                  <input
                    type="number"
                    className="input mono"
                    value={bb}
                    onChange={(e) => setBb(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="fields">
                <div className="field">
                  <label>Ante (İsteğe bağlı)</label>
                  <input
                    type="number"
                    className="input mono"
                    value={ante}
                    onChange={(e) => setAnte(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label>Önerilen Giriş Çipi</label>
                  <input
                    type="number"
                    className="input mono"
                    value={startingStack}
                    onChange={(e) => setStartingStack(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn ghost" onClick={() => setShowNewRoom(false)}>
                  İptal
                </button>
                <button type="submit" className="btn primary">
                  Masayı Kur & Başla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

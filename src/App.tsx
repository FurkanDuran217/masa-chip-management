import { useStore } from './store';
import { GroupGate } from './components/GroupGate';
import { GroupLockGate } from './components/GroupLockGate';
import { MemberGate } from './components/MemberGate';
import { LobbyView } from './components/LobbyView';
import { RoomView } from './components/RoomView';
import { StatsView } from './components/StatsView';
import { PoolView } from './components/PoolView';
import { SettingsView } from './components/SettingsView';
import { Play, BarChart3, Coins, Settings } from 'lucide-react';

export const App: React.FC = () => {
  const { groupId, group, groupLoaded, isGroupUnlocked, me, view, go, toast, joinedGroups, switchGroup, setGroupId } = useStore();

  // 1. Grup ID var ama henüz yükleniyorsa spinner göster
  if (groupId && !groupLoaded) {
    return (
      <div className="center-screen">
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px', maxWidth: 360 }}>
          <div className="spinner" style={{ margin: '0 auto 16px', width: 36, height: 36 }} />
          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Grup Yükleniyor...</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Grup ve masa verileri senkronize ediliyor</p>
        </div>
      </div>
    );
  }

  // 2. Grup seçili değilse veya grup bulunamadıysa grup oluşturma/katılma ekranı
  if (!groupId || !group) {
    return (
      <>
        <GroupGate />
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  // 2. Grup şifreliyse ve bu cihazda henüz açılmadıysa şifre sor
  if (!isGroupUnlocked) {
    return (
      <>
        <GroupLockGate />
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  // 2. Üye oturumu açık değilse üye seçimi / PIN gate
  if (!me) {
    return (
      <>
        <MemberGate />
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  return (
    <div className="app">
      {/* Üst Bar */}
      <header className="topbar">
        <div className="brand" onClick={() => go({ name: 'lobby' })} style={{ cursor: 'pointer' }}>
          <div className="logo">{group.emoji || '♠'}</div>
          <span>{group.name}</span>
        </div>

        {/* Grup Değiştirici */}
        {joinedGroups.length > 1 && (
          <select
            value={group.id}
            onChange={(e) => switchGroup(e.target.value)}
            className="input"
            style={{ width: 'auto', padding: '6px 10px', fontSize: 13, background: 'rgba(255,255,255,0.06)' }}
            title="Grup Değiştir"
          >
            {joinedGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.emoji} {g.name}
              </option>
            ))}
          </select>
        )}

        <div className="spacer" />
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn ghost icon"
            onClick={() => setGroupId(null)}
            title="Gruplarıma / Yeni Gruba Dön"
            style={{ fontSize: 12, padding: '6px 10px' }}
          >
            Gruplar
          </button>
          <div
            className="avatar"
            style={{ width: 32, height: 32, fontSize: 16, background: me.color, color: '#111' }}
            title={me.name}
          >
            {me.emoji}
          </div>
        </div>
      </header>

      {/* Ana Görünüm */}
      <main>
        {view.name === 'lobby' && <LobbyView />}
        {view.name === 'room' && <RoomView roomId={view.roomId} />}
        {view.name === 'stats' && <StatsView />}
        {view.name === 'pool' && <PoolView />}
        {view.name === 'settings' && <SettingsView />}
      </main>

      {/* Alt Navigasyon Çubuğu */}
      <nav className="tabs">
        <button
          className={view.name === 'lobby' || view.name === 'room' ? 'on' : ''}
          onClick={() => go({ name: 'lobby' })}
        >
          <Play size={18} />
          <span>Masalar</span>
        </button>
        <button
          className={view.name === 'pool' ? 'on' : ''}
          onClick={() => go({ name: 'pool' })}
        >
          <Coins size={18} />
          <span>Havuz</span>
        </button>
        <button
          className={view.name === 'stats' ? 'on' : ''}
          onClick={() => go({ name: 'stats' })}
        >
          <BarChart3 size={18} />
          <span>İstatistik</span>
        </button>
        <button
          className={view.name === 'settings' ? 'on' : ''}
          onClick={() => go({ name: 'settings' })}
        >
          <Settings size={18} />
          <span>Ayarlar</span>
        </button>
      </nav>

      {/* Toast Bildirim */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

export default App;

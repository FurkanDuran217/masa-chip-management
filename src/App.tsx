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
  const { groupId, group, isGroupUnlocked, me, view, go, toast } = useStore();

  // 1. Grup seçili değilse grup oluşturma/katılma ekranı
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
        <div className="spacer" />
        <div className="row" style={{ gap: 8 }}>
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

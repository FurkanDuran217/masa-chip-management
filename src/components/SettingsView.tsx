import React, { useState } from 'react';
import { useStore } from '../store';
import { loadSavedFirebaseConfig, saveFirebaseConfig, isFirebaseConnected } from '../lib/firebase';
import { Save, LogOut, Database, Volume2, VolumeX } from 'lucide-react';
import { sound } from '../lib/sound';

export const SettingsView: React.FC = () => {
  const { group, me, setGroupId, notify } = useStore();
  const [apiKey, setApiKey] = useState(() => loadSavedFirebaseConfig()?.apiKey || '');
  const [projectId, setProjectId] = useState(() => loadSavedFirebaseConfig()?.projectId || '');
  const [soundEnabled, setSoundEnabled] = useState(() => sound.isEnabled());

  const handleSaveFirebase = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim() && projectId.trim()) {
      saveFirebaseConfig({
        apiKey: apiKey.trim(),
        projectId: projectId.trim(),
        authDomain: `${projectId.trim()}.firebaseapp.com`,
      });
      notify('Firebase ayarları kaydedildi! Yeniden bağlanılıyor...');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      saveFirebaseConfig(null);
      notify('Firebase ayarları temizlendi (Yerel mod devrede).');
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    sound.toggle(next);
    setSoundEnabled(next);
  };

  return (
    <div className="col" style={{ gap: 20 }}>
      {/* Genel Bilgi */}
      <div className="card">
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Ayarlar & Hesap</h2>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Aktif Grup: {group?.name}</div>
            <div className="muted" style={{ fontSize: 13 }}>Kullanıcı: {me?.name}</div>
          </div>
          <button
            className="btn danger"
            onClick={() => {
              if (window.confirm('Bu gruptan çıkış yapmak istiyor musunuz?')) {
                setGroupId(null);
              }
            }}
          >
            <LogOut size={16} /> Gruptan Çık
          </button>
        </div>
      </div>

      {/* Ses Ayarı */}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Ses Efektleri</div>
            <div className="muted" style={{ fontSize: 13 }}>Çip, sıra ve aksiyon sesleri</div>
          </div>
          <button className={`btn ${soundEnabled ? 'primary' : 'ghost'}`} onClick={toggleSound}>
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            {soundEnabled ? 'Açık' : 'Kapalı'}
          </button>
        </div>
      </div>

      {/* Firebase Gerçek Zamanlı Bulut Senkronizasyonu */}
      <div className="card">
        <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <Database size={18} className="gold" />
          <h3 style={{ fontSize: 16, margin: 0 }}>Firebase Bulut Senkronu</h3>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 16px' }}>
          {isFirebaseConnected()
            ? '✅ Firebase bağlı. Tüm cihazlar (telefonlar, bilgisayarlar) gerçek zamanlı senkronize çalışıyor.'
            : '⚠️ Şu an yerel moddasınız (Aynı tarayıcı ve sekmeler arası senkron). Arkadaşlarınızla farklı cihazlardan oynamak için Firebase config girin.'}
        </p>

        <form onSubmit={handleSaveFirebase} className="col">
          <div className="field">
            <label>Firebase API Key</label>
            <input
              type="text"
              className="input mono"
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Firebase Project ID</label>
            <input
              type="text"
              className="input mono"
              placeholder="masa-poker-xyz"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            />
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <button type="submit" className="btn primary">
              <Save size={16} /> Yapılandırmayı Kaydet & Yenile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

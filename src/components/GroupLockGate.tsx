import React, { useState } from 'react';
import { useStore } from '../store';
import { verifyGroupPassword } from '../lib/actions';
import { ArrowLeft, KeyRound } from 'lucide-react';

export const GroupLockGate: React.FC = () => {
  const { group, unlockGroup, setGroupId, notify } = useStore();
  const [password, setPassword] = useState('');

  if (!group) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await verifyGroupPassword(group, password);
    if (ok) {
      unlockGroup(group.id);
    } else {
      notify('Hatalı grup şifresi!');
    }
  };

  return (
    <div className="center-screen">
      <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>{group.emoji}</div>
        <h2 style={{ marginBottom: 4 }}>{group.name}</h2>
        <p className="muted" style={{ margin: '0 0 20px', fontSize: 14 }}>
          Bu grup şifre korumalıdır. Devam etmek için şifreyi girin.
        </p>

        <form onSubmit={handleSubmit} className="col">
          <div className="field">
            <input
              type="password"
              className="input mono"
              placeholder="Grup Şifresi"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn primary big block" style={{ marginTop: 8 }}>
            <KeyRound size={18} /> Gruba Giriş Yap
          </button>

          <button
            type="button"
            className="btn ghost block"
            style={{ marginTop: 6 }}
            onClick={() => setGroupId(null)}
          >
            <ArrowLeft size={16} /> Farklı Gruba Geç
          </button>
        </form>
      </div>
    </div>
  );
};

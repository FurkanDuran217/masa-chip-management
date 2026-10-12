// Küçük yardımcılar
export const uid = (n = 10) => {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  const r = crypto.getRandomValues(new Uint8Array(n));
  for (const x of r) s += a[x % a.length];
  return s;
};

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function hashPin(pin: string): Promise<string> {
  if (!pin) return '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('masa:' + pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const COLORS = ['#f5b942', '#4fd1c5', '#f56565', '#9f7aea', '#48bb78', '#ed8936', '#4299e1', '#ed64a6', '#a0aec0', '#ecc94b', '#38b2ac', '#fc8181'];
export const EMOJIS = ['🦊', '🐻', '🐯', '🦁', '🐺', '🦉', '🐙', '🦈', '🐲', '🦄', '🐸', '🐼'];

export const fmt = (n: number) => n.toLocaleString('tr-TR');
export const signed = (n: number) => (n > 0 ? '+' : '') + fmt(n);

import type { Group } from './types';

export function encodeGroupUrlData(g: Group): string {
  try {
    const minObj = {
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      sb: g.startingBalance,
      cv: g.chipValue,
      cpc: g.chipsPerCurrency,
      cur: g.currency,
      def: g.defaults,
      pw: g.passwordHash,
      at: g.createdAt,
      by: g.createdBy,
    };
    return btoa(encodeURIComponent(JSON.stringify(minObj)));
  } catch {
    return '';
  }
}

export function decodeGroupUrlData(encoded: string): Group | null {
  try {
    const raw = decodeURIComponent(atob(encoded));
    const obj = JSON.parse(raw);
    if (!obj.id || !obj.name) return null;
    return {
      id: String(obj.id),
      name: String(obj.name),
      emoji: obj.emoji || '♠️',
      startingBalance: Number(obj.sb) || 1000,
      chipValue: Number(obj.cv) || 0,
      chipsPerCurrency: Number(obj.cpc) || 10,
      currency: obj.cur || '₺',
      defaults: obj.def || { sb: 5, bb: 10, ante: 0, startingStack: 200 },
      passwordHash: obj.pw ? String(obj.pw) : undefined,
      createdAt: Number(obj.at) || Date.now(),
      createdBy: String(obj.by || 'Admin'),
    };
  } catch {
    return null;
  }
}

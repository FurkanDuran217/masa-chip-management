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

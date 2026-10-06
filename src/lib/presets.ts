import type { TableSettings } from './table'
import { defaultBlindLevels } from './table'

export interface SetupPreset {
  id: string
  name: string
  tag: string
  patch: TableSettings
}

function levels(sb: number, bb: number, factor = 2) {
  return Array.from({ length: 14 }, (_, i) => ({ sb: sb * Math.pow(factor, i), bb: bb * Math.pow(factor, i) }))
}

export const PRESETS: SetupPreset[] = [
  {
    id: 'ev6',
    name: 'Ev Yapımı 6',
    tag: '6 kişi · 25/50 · 5.000 çip',
    patch: {
      maxPlayers: 6,
      chipValue: 1,
      buyIn: 5000,
      sb: 25,
      bb: 50,
      ante: 0,
      denoms: [1, 5, 10, 25, 50, 100, 500, 1000],
      handsPerLevel: 0,
      blindLevels: levels(25, 50),
    },
  },
  {
    id: 'ev9',
    name: 'Ev Yapımı 9',
    tag: '9 kişi · 50/100',
    patch: {
      maxPlayers: 9,
      chipValue: 1,
      buyIn: 10000,
      sb: 50,
      bb: 100,
      ante: 0,
      denoms: [5, 10, 25, 50, 100, 500, 1000, 5000],
      handsPerLevel: 0,
      blindLevels: levels(50, 100),
    },
  },
  {
    id: 'tur1k',
    name: 'Turnuva 1.000',
    tag: '1.000 çip giriş · 10/20',
    patch: {
      maxPlayers: 9,
      chipValue: 1,
      buyIn: 1000,
      sb: 10,
      bb: 20,
      ante: 0,
      denoms: [10, 20, 50, 100, 200, 500, 1000],
      handsPerLevel: 6,
      blindLevels: levels(10, 20),
    },
  },
  {
    id: 'tur5k',
    name: 'Turnuva 5.000',
    tag: 'ante 5 · 25/50',
    patch: {
      maxPlayers: 9,
      chipValue: 1,
      buyIn: 5000,
      sb: 25,
      bb: 50,
      ante: 5,
      denoms: [25, 50, 100, 500, 1000, 5000],
      handsPerLevel: 8,
      blindLevels: levels(25, 50),
    },
  },
  {
    id: 'deep',
    name: 'Deep Stack',
    tag: '20.000 çip · 50/100',
    patch: {
      maxPlayers: 6,
      chipValue: 1,
      buyIn: 20000,
      sb: 50,
      bb: 100,
      ante: 0,
      denoms: [100, 500, 1000, 5000, 10000],
      handsPerLevel: 10,
      blindLevels: levels(50, 100),
    },
  },
  {
    id: 'kasa500',
    name: 'Kısa Masa 500',
    tag: '500 çip giriş · 5/10',
    patch: {
      maxPlayers: 6,
      chipValue: 1,
      buyIn: 500,
      sb: 5,
      bb: 10,
      ante: 0,
      denoms: [1, 5, 10, 25, 50, 100, 500],
      handsPerLevel: 0,
      blindLevels: levels(5, 10),
    },
  },
  {
    id: 'buy50000',
    name: '50.000 çip masası',
    tag: 'çip = 1₺ · 100/200',
    patch: {
      maxPlayers: 6,
      chipValue: 1,
      buyIn: 50000,
      sb: 100,
      bb: 200,
      ante: 0,
      denoms: [100, 500, 1000, 5000, 10000, 25000, 50000],
      handsPerLevel: 0,
      blindLevels: levels(100, 200),
    },
  },
  {
    id: 'dolar',
    name: 'Kısa (USD)',
    tag: '$25 giriş · 1/2 · 0.25$/çip',
    patch: {
      currency: 'USD',
      chipValue: 0.25,
      maxPlayers: 6,
      buyIn: 100,
      sb: 1,
      bb: 2,
      ante: 0,
      denoms: [1, 5, 10, 25, 50, 100],
      handsPerLevel: 0,
      blindLevels: defaultBlindLevels(1, 2),
    },
  },
]

export function presetById(id: string): SetupPreset | undefined {
  return PRESETS.find((p) => p.id === id)
}
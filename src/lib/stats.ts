// ============================================================
// İstatistik Motoru (VPIP, PFR, All-in, Net Kâr/Zarar, Potlar)
// ============================================================
import type { HandRecord, Member } from './types';

export interface PlayerStats {
  memberId: string;
  name: string;
  handsPlayed: number;
  handsWon: number;
  totalInvested: number;
  totalWon: number;
  netProfit: number;
  biggestPotWon: number;
  vpipHands: number;
  vpipRate: number; // Yüzde
  pfrHands: number;
  pfrRate: number; // Yüzde
  allInCount: number;
  showdownCount: number;
  showdownWinCount: number;
  showdownWinRate: number; // Yüzde
}

export function computeGroupStats(members: Member[], hands: HandRecord[]): Record<string, PlayerStats> {
  const map: Record<string, PlayerStats> = {};

  for (const m of members) {
    map[m.id] = {
      memberId: m.id,
      name: m.name,
      handsPlayed: 0,
      handsWon: 0,
      totalInvested: 0,
      totalWon: 0,
      netProfit: 0,
      biggestPotWon: 0,
      vpipHands: 0,
      vpipRate: 0,
      pfrHands: 0,
      pfrRate: 0,
      allInCount: 0,
      showdownCount: 0,
      showdownWinCount: 0,
      showdownWinRate: 0,
    };
  }

  for (const h of hands) {
    for (const [id, p] of Object.entries(h.players)) {
      if (!map[id]) {
        map[id] = {
          memberId: id,
          name: p.name,
          handsPlayed: 0,
          handsWon: 0,
          totalInvested: 0,
          totalWon: 0,
          netProfit: 0,
          biggestPotWon: 0,
          vpipHands: 0,
          vpipRate: 0,
          pfrHands: 0,
          pfrRate: 0,
          allInCount: 0,
          showdownCount: 0,
          showdownWinCount: 0,
          showdownWinRate: 0,
        };
      }
      const s = map[id];
      s.handsPlayed += 1;
      s.totalInvested += p.invested;
      s.totalWon += p.won;
      s.netProfit += p.won - p.invested;

      if (p.won > 0) {
        s.handsWon += 1;
        if (p.won > s.biggestPotWon) {
          s.biggestPotWon = p.won;
        }
      }

      if (p.vpip) s.vpipHands += 1;
      if (p.pfr) s.pfrHands += 1;
      if (p.allIn) s.allInCount += 1;
      if (p.showdown) {
        s.showdownCount += 1;
        if (p.won > 0) s.showdownWinCount += 1;
      }
    }
  }

  // Yüzdeleri hesapla
  for (const s of Object.values(map)) {
    if (s.handsPlayed > 0) {
      s.vpipRate = Math.round((s.vpipHands / s.handsPlayed) * 100);
      s.pfrRate = Math.round((s.pfrHands / s.handsPlayed) * 100);
    }
    if (s.showdownCount > 0) {
      s.showdownWinRate = Math.round((s.showdownWinCount / s.showdownCount) * 100);
    }
  }

  return map;
}

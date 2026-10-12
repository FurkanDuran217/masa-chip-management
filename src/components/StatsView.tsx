import React, { useMemo } from 'react';
import { useStore } from '../store';
import { computeGroupStats } from '../lib/stats';
import { fmt, signed } from '../lib/util';

export const StatsView: React.FC = () => {
  const { members, hands } = useStore();

  const statsMap = useMemo(() => {
    return computeGroupStats(members, hands);
  }, [members, hands]);

  const statsList = Object.values(statsMap).sort((a, b) => b.netProfit - a.netProfit);

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="card">
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Grup İstatistikleri & Liderlik</h2>
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>
          Toplam {hands.length} el oynandı.
        </p>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="scroll-x">
          <table className="stats">
            <thead>
              <tr>
                <th>Oyuncu</th>
                <th>Net Kâr / Zarar</th>
                <th>Oynanan El</th>
                <th>Kazanılan El</th>
                <th>VPIP %</th>
                <th>PFR %</th>
                <th>Showdown Win %</th>
                <th>En Büyük Pot</th>
              </tr>
            </thead>
            <tbody>
              {statsList.map((s, idx) => {
                const mem = members.find((m) => m.id === s.memberId);
                return (
                  <tr key={s.memberId}>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <span style={{ fontWeight: 700, width: 16 }}>{idx + 1}.</span>
                        <div
                          className="avatar"
                          style={{ width: 28, height: 28, fontSize: 15, background: mem?.color || '#ccc', color: '#111' }}
                        >
                          {mem?.emoji || '👤'}
                        </div>
                        <span style={{ fontWeight: 700 }}>{s.name}</span>
                      </div>
                    </td>
                    <td className={`mono ${s.netProfit >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 800 }}>
                      {signed(s.netProfit)}
                    </td>
                    <td className="mono">{s.handsPlayed}</td>
                    <td className="mono">{s.handsWon}</td>
                    <td className="mono">{s.vpipRate}%</td>
                    <td className="mono">{s.pfrRate}%</td>
                    <td className="mono">{s.showdownWinRate}%</td>
                    <td className="mono gold">{fmt(s.biggestPotWon)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

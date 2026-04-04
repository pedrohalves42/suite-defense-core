import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { TacticCoverage } from '@/hooks/useMitreCoverage';

interface Props {
  tactics: TacticCoverage[];
}

const getBarColor = (pct: number) => {
  if (pct >= 75) return 'hsl(142, 76%, 36%)';
  if (pct >= 50) return 'hsl(48, 96%, 53%)';
  return 'hsl(0, 84%, 60%)';
};

const formatTactic = (name: string) =>
  name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function CoverageBarChart({ tactics }: Props) {
  const chartData = tactics.map(t => ({
    tactic: formatTactic(t.tactic),
    coverage_pct: t.coverage_pct,
    covered: t.covered_techniques,
    total: t.total_techniques,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(300, tactics.length * 40)}>
      <BarChart layout="vertical" data={chartData} margin={{ left: 10, right: 20 }}>
        <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} />
        <YAxis type="category" dataKey="tactic" width={150} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number, _name: string, props: { payload: { covered: number; total: number } }) =>
            [`${value}% (${props.payload.covered}/${props.payload.total})`, 'Cobertura']
          }
        />
        <Bar dataKey="coverage_pct" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={getBarColor(entry.coverage_pct)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

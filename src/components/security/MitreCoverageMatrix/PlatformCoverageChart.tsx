import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { useMitrePlatformCoverage } from '@/hooks/useMitrePlatformCoverage';

const PLATFORM_COLORS: Record<string, string> = {
  Windows: 'hsl(217, 91%, 60%)',
  Linux: 'hsl(142, 76%, 36%)',
  macOS: 'hsl(280, 67%, 54%)',
};

export function PlatformCoverageChart() {
  const { data, isLoading } = useMitrePlatformCoverage();

  if (isLoading) return <Skeleton className="h-[200px] w-full" />;
  if (!data?.platforms) return null;

  const chartData = data.platforms.map(p => ({
    platform: p.platform,
    coverage_pct: p.coverage_pct,
    covered: p.covered_techniques,
    total: p.total_techniques,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={chartData} margin={{ left: 10, right: 20 }}>
        <XAxis dataKey="platform" tick={{ fontSize: 12 }} />
        <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
        <Tooltip
          formatter={(value: number, _name: string, props: { payload: { covered: number; total: number } }) =>
            [`${value}% (${props.payload.covered}/${props.payload.total})`, 'Cobertura']
          }
        />
        <Bar dataKey="coverage_pct" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={PLATFORM_COLORS[entry.platform] ?? 'hsl(var(--primary))'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

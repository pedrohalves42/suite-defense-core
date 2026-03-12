import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWebVitals } from "@/hooks/useWebVitals";

export function WebVitalsCard() {
  const { lcp, fid, cls, ttfb, fcp, score } = useWebVitals();

  const scoreColors = {
    good: "bg-success/20 text-success border-success/30",
    "needs-improvement": "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
    poor: "bg-destructive/20 text-destructive border-destructive/30",
  };

  const formatMs = (v: number | null) => v !== null ? `${v.toFixed(0)}ms` : "—";
  const formatCls = (v: number | null) => v !== null ? v.toFixed(3) : "—";

  const vitals = [
    { label: "LCP", value: formatMs(lcp), desc: "Largest Contentful Paint", good: lcp !== null && lcp <= 2500 },
    { label: "FID", value: formatMs(fid), desc: "First Input Delay", good: fid !== null && fid <= 100 },
    { label: "CLS", value: formatCls(cls), desc: "Cumulative Layout Shift", good: cls !== null && cls <= 0.1 },
    { label: "TTFB", value: formatMs(ttfb), desc: "Time to First Byte", good: ttfb !== null && ttfb <= 800 },
    { label: "FCP", value: formatMs(fcp), desc: "First Contentful Paint", good: fcp !== null && fcp <= 1800 },
  ];

  return (
    <Card className="bg-gradient-card border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Web Vitals
          </CardTitle>
          {score && (
            <Badge variant="outline" className={scoreColors[score]}>
              {score === "good" ? "Bom" : score === "needs-improvement" ? "Médio" : "Ruim"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-2">
          {vitals.map(v => (
            <div key={v.label} className="text-center">
              <p className="text-xs text-muted-foreground">{v.label}</p>
              <p className={`text-sm font-mono font-bold ${v.good ? "text-success" : "text-foreground"}`}>
                {v.value}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

import { cn } from "@/lib/utils";

interface RiskGaugeProps {
  score: number;
  level: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function RiskGauge({ score, level, size = "md", showLabel = true, className }: RiskGaugeProps) {
  // Calculate rotation: 0 = -90deg (left), 100 = 90deg (right)
  const rotation = -90 + (score / 100) * 180;
  
  // INVERTED: High score = good (green), Low score = bad (red)
  // This represents a SECURITY SCORE where 100 = fully protected
  const getColors = () => {
    if (score >= 90) return { bg: "from-success/20 to-success/10", text: "text-success", stroke: "#22c55e" };
    if (score >= 70) return { bg: "from-emerald-500/20 to-emerald-500/10", text: "text-emerald-500", stroke: "#10b981" };
    if (score >= 50) return { bg: "from-warning/20 to-warning/10", text: "text-warning", stroke: "#eab308" };
    if (score >= 30) return { bg: "from-orange-500/20 to-orange-500/10", text: "text-orange-500", stroke: "#f97316" };
    return { bg: "from-destructive/20 to-destructive/10", text: "text-destructive", stroke: "#ef4444" };
  };

  const sizeClasses = {
    sm: { container: "w-24 h-14", text: "text-lg", label: "text-[10px]" },
    md: { container: "w-40 h-24", text: "text-3xl", label: "text-xs" },
    lg: { container: "w-56 h-32", text: "text-5xl", label: "text-sm" },
  };

  const colors = getColors();
  const sizes = sizeClasses[size];

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <div className={cn("relative", sizes.container)}>
        {/* Background arc */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 60">
          {/* Gray background arc */}
          <path
            d="M 10 55 A 40 40 0 0 1 90 55"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className="text-muted/30"
          />
          {/* Colored progress arc */}
          <path
            d="M 10 55 A 40 40 0 0 1 90 55"
            fill="none"
            stroke={colors.stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 126} 126`}
            className="transition-all duration-700 ease-out"
          />
          {/* Needle */}
          <g transform={`rotate(${rotation}, 50, 55)`} className="transition-transform duration-700 ease-out">
            <line
              x1="50"
              y1="55"
              x2="50"
              y2="22"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-foreground"
            />
            <circle cx="50" cy="55" r="4" fill="currentColor" className="text-foreground" />
          </g>
        </svg>
        
        {/* Score text */}
        <div className="absolute inset-0 flex items-end justify-center pb-0">
          <span className={cn("font-bold", sizes.text, colors.text)}>
            {score}
          </span>
        </div>
      </div>
      
      {showLabel && (
        <div className={cn("mt-1 font-semibold uppercase tracking-wide", sizes.label, colors.text)}>
          {level}
        </div>
      )}
    </div>
  );
}

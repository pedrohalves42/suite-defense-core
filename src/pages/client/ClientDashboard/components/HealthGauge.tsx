import { motion } from 'framer-motion';

export function HealthGauge({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getLabel = () => {
    if (score >= 80) return 'Excelente';
    if (score >= 50) return 'Atenção';
    return 'Crítico';
  };

  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
          <motion.circle
            cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
            className={getColor()}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${getColor()}`}>{score}</span>
          <span className="text-xs text-muted-foreground">pontos</span>
        </div>
      </div>
      <span className={`mt-2 text-sm font-medium ${getColor()}`}>{getLabel()}</span>
    </div>
  );
}

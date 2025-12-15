import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Star, Gem } from 'lucide-react';

export type BillingPeriod = 'monthly' | '6m' | '12m' | '24m';

interface BillingPeriodSelectorProps {
  value: BillingPeriod;
  onChange: (value: BillingPeriod) => void;
  basePrice: number; // in centavos
}

const PERIOD_CONFIG: Record<BillingPeriod, {
  label: string;
  months: number;
  discountPct: number;
  icon?: React.ElementType;
  popular?: boolean;
  best?: boolean;
}> = {
  monthly: {
    label: 'Mensal',
    months: 1,
    discountPct: 0,
  },
  '6m': {
    label: '6 meses',
    months: 6,
    discountPct: 4,
  },
  '12m': {
    label: '12 meses',
    months: 12,
    discountPct: 8,
    icon: Star,
    popular: true,
  },
  '24m': {
    label: '24 meses',
    months: 24,
    discountPct: 16,
    icon: Gem,
    best: true,
  },
};

export function calculateSavings(basePriceCentavos: number, period: BillingPeriod): {
  totalWithoutDiscount: number;
  totalWithDiscount: number;
  savings: number;
  monthlyEquivalent: number;
} {
  const config = PERIOD_CONFIG[period];
  const totalWithoutDiscount = basePriceCentavos * config.months;
  const discount = totalWithoutDiscount * (config.discountPct / 100);
  const totalWithDiscount = totalWithoutDiscount - discount;
  const monthlyEquivalent = totalWithDiscount / config.months;

  return {
    totalWithoutDiscount: totalWithoutDiscount / 100,
    totalWithDiscount: totalWithDiscount / 100,
    savings: discount / 100,
    monthlyEquivalent: monthlyEquivalent / 100,
  };
}

export function BillingPeriodSelector({ value, onChange, basePrice }: BillingPeriodSelectorProps) {
  const currentSavings = calculateSavings(basePrice, value);

  return (
    <div className="space-y-3">
      <ToggleGroup 
        type="single" 
        value={value} 
        onValueChange={(v) => v && onChange(v as BillingPeriod)}
        className="grid grid-cols-4 gap-1 p-1 bg-muted rounded-lg"
      >
        {(Object.entries(PERIOD_CONFIG) as [BillingPeriod, typeof PERIOD_CONFIG[BillingPeriod]][]).map(([period, config]) => (
          <ToggleGroupItem 
            key={period}
            value={period}
            className={`relative flex flex-col items-center py-2 px-3 text-xs ${
              config.popular ? 'data-[state=on]:ring-2 data-[state=on]:ring-primary' : ''
            } ${
              config.best ? 'data-[state=on]:ring-2 data-[state=on]:ring-purple-500' : ''
            }`}
          >
            {config.popular && (
              <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] px-1 py-0 bg-primary">
                Popular
              </Badge>
            )}
            {config.best && (
              <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] px-1 py-0 bg-purple-500">
                Melhor valor
              </Badge>
            )}
            <span className="font-medium">{config.label}</span>
            {config.discountPct > 0 && (
              <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold">
                -{config.discountPct}%
              </span>
            )}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {value !== 'monthly' && currentSavings.savings > 0 && (
        <div className="flex items-center justify-center gap-2 p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-700 dark:text-green-300 text-sm">
          <Sparkles className="h-4 w-4" />
          <span className="font-medium">
            Economize R$ {currentSavings.savings.toFixed(2)} com este plano!
          </span>
        </div>
      )}

      {value !== 'monthly' && (
        <p className="text-center text-xs text-muted-foreground">
          Equivale a R$ {currentSavings.monthlyEquivalent.toFixed(2)}/mês
        </p>
      )}
    </div>
  );
}

export { PERIOD_CONFIG };

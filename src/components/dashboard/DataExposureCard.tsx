import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, FileWarning, ShieldAlert, CreditCard, User, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDataExposure } from '@/hooks/useDataExposure';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Eye; color: string }> = {
  cpf: { label: 'CPF', icon: User, color: 'text-orange-500' },
  cnpj: { label: 'CNPJ', icon: User, color: 'text-orange-400' },
  credit_card: { label: 'Cartão', icon: CreditCard, color: 'text-red-500' },
  medical_record: { label: 'Prontuário', icon: FileWarning, color: 'text-red-600' },
  password: { label: 'Senha', icon: Key, color: 'text-red-500' },
  api_key: { label: 'API Key', icon: Key, color: 'text-red-400' },
  email_list: { label: 'Emails', icon: User, color: 'text-yellow-500' },
  rg: { label: 'RG', icon: User, color: 'text-orange-500' },
};

export function DataExposureCard() {
  const { data: summary, isLoading } = useDataExposure();

  const hasFindings = summary && summary.open > 0;

  return (
    <Card className={cn(
      'transition-colors',
      hasFindings 
        ? summary.critical > 0 
          ? 'border-red-300 dark:border-red-800' 
          : 'border-yellow-300 dark:border-yellow-800'
        : 'border-border'
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Exposição de Dados
          </span>
          {hasFindings && (
            <Badge variant={summary.critical > 0 ? 'destructive' : 'outline'} className="text-xs">
              {summary.open} encontrado{summary.open !== 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : !hasFindings ? (
          <div className="text-center py-4 text-muted-foreground">
            <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma exposição detectada</p>
            <p className="text-xs mt-1">Dados sensíveis protegidos ✓</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Category breakdown */}
            <div className="space-y-1.5">
              {Object.entries(summary.byCategory).slice(0, 5).map(([cat, count]) => {
                const config = CATEGORY_CONFIG[cat] || { label: cat, icon: Eye, color: 'text-muted-foreground' };
                const Icon = config.icon;
                return (
                  <div key={cat} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <Icon className={cn('h-3.5 w-3.5', config.color)} />
                      <span className="text-sm">{config.label}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {count}
                    </Badge>
                  </div>
                );
              })}
            </div>

            {/* Severity summary */}
            <div className="flex gap-2 pt-2 border-t border-border/50">
              {summary.critical > 0 && (
                <Badge variant="destructive" className="text-xs">{summary.critical} crítico</Badge>
              )}
              {summary.high > 0 && (
                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 text-xs">
                  {summary.high} alto
                </Badge>
              )}
              {summary.medium > 0 && (
                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs">
                  {summary.medium} médio
                </Badge>
              )}
            </div>

            <Button variant="outline" size="sm" className="w-full mt-2" asChild>
              <Link to="/admin/data-exposure">Ver detalhes →</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

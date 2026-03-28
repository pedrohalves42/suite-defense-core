import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Stethoscope, Target, Eye, RefreshCw } from 'lucide-react';

interface DiagnosticsHeaderProps {
  socMode: boolean;
  onSocModeChange: (value: string) => void;
  onRefresh: () => void;
}

export function DiagnosticsHeader({ socMode, onSocModeChange, onRefresh }: DiagnosticsHeaderProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-primary" />
          Central de Diagnósticos
          {socMode && (
            <Badge variant="destructive" className="ml-2">
              <Target className="h-3 w-3 mr-1" />
              Modo SOC
            </Badge>
          )}
        </h1>
        <p className="text-muted-foreground mt-1">
          {socMode
            ? 'Visualização focada em problemas críticos — ação rápida'
            : 'Identifique e resolva problemas de instalação e conectividade'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          value={socMode ? 'soc' : 'default'}
          onValueChange={onSocModeChange}
          className="border rounded-lg p-1"
        >
          <ToggleGroupItem value="default" className="text-xs px-3">
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            Completo
          </ToggleGroupItem>
          <ToggleGroupItem value="soc" className="text-xs px-3">
            <Target className="h-3.5 w-3.5 mr-1.5" />
            SOC
          </ToggleGroupItem>
        </ToggleGroup>
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>
    </div>
  );
}

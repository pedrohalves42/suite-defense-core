import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, Plus } from 'lucide-react';
import type { SecurityPolicy } from '@/types/security-policies';

interface PolicyListProps {
  policies: SecurityPolicy[];
  loading: boolean;
  selectedPolicy: SecurityPolicy | null;
  onSelect: (policy: SecurityPolicy) => void;
  onCreateClick: () => void;
}

export function PolicyList({ policies, loading, selectedPolicy, onSelect, onCreateClick }: PolicyListProps) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-base">Políticas</CardTitle>
          <CardDescription>{policies.length} políticas configuradas</CardDescription>
        </div>
        <Button size="sm" onClick={onCreateClick}>
          <Plus className="h-4 w-4 mr-1" />
          Nova
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : policies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhuma política criada</div>
          ) : (
            <div className="space-y-2">
              {policies.map((policy) => (
                <div
                  key={policy.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedPolicy?.id === policy.id
                      ? 'bg-primary/10 border-primary'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => onSelect(policy)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">{policy.name}</span>
                    </div>
                    <Badge variant={policy.is_active ? 'default' : 'secondary'} className="text-xs">
                      {policy.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  {policy.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{policy.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

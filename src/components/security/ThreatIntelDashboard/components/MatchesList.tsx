import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useThreatMatches } from '@/hooks/useThreatIntel';
import { severityColors } from '../constants';

export function MatchesList() {
  const { data: matches, isLoading } = useThreatMatches();

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-2">
        {(matches ?? []).map((match: any) => (
          <Card key={match.id as string} className="border-destructive/20">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{match.match_context as string}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Agent: {match.agent_id as string}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={severityColors[match.severity as string] ?? ''}>
                    {(match.severity as string).toUpperCase()}
                  </Badge>
                  <Badge variant={match.status === 'open' ? 'destructive' : 'secondary'}>
                    {match.status as string}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {(matches ?? []).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-30 text-green-500" />
            <p>Nenhum match de ameaça encontrado na frota.</p>
            <p className="text-sm">Seus endpoints estão limpos!</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

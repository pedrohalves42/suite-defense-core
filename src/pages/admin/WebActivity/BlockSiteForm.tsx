import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Ban, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';

interface Group {
  id: string;
  name: string;
}

interface BlockSiteFormProps {
  groups: Group[] | undefined;
  blockWebsite: {
    mutateAsync: (params: { domain_pattern: string; reason?: string; group_id?: string | null; autoSync?: boolean }) => Promise<unknown>;
  };
}

export function BlockSiteForm({ groups, blockWebsite }: BlockSiteFormProps) {
  const [manualDomain, setManualDomain] = useState('');
  const [manualGroupId, setManualGroupId] = useState<string | null>(null);
  const [manualReason, setManualReason] = useState('');
  const [isManualBlocking, setIsManualBlocking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDomain.trim()) {
      toast.error('Digite um domínio para bloquear');
      return;
    }
    setIsManualBlocking(true);
    try {
      await blockWebsite.mutateAsync({
        domain_pattern: manualDomain.trim().toLowerCase(),
        reason: manualReason || 'Bloqueio manual',
        group_id: manualGroupId,
        autoSync: true,
      });
      setManualDomain('');
      setManualReason('');
      setManualGroupId(null);
      toast.success(`Site ${manualDomain} bloqueado com sucesso`);
    } catch (error) {
      toast.error(`Erro ao bloquear: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setIsManualBlocking(false);
    }
  };

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-5 w-5" />
          Bloquear Novo Site
        </CardTitle>
        <CardDescription>Digite um domínio para adicionar à lista de bloqueio</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-wrap items-end gap-4" onSubmit={handleSubmit}>
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="manual-domain">Domínio</Label>
            <Input id="manual-domain" placeholder="exemplo.com ou *.exemplo.com" value={manualDomain} onChange={(e) => setManualDomain(e.target.value)} disabled={isManualBlocking} />
          </div>
          <div className="w-[200px]">
            <Label htmlFor="manual-group">Aplicar a</Label>
            <Select value={manualGroupId || 'all'} onValueChange={(v) => setManualGroupId(v === 'all' ? null : v)} disabled={isManualBlocking}>
              <SelectTrigger id="manual-group">
                <SelectValue placeholder="Todos os grupos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2"><Users className="h-4 w-4" />Todos os grupos</div>
                </SelectItem>
                {groups?.map((group) => (
                  <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <Label htmlFor="manual-reason">Motivo (opcional)</Label>
            <Input id="manual-reason" placeholder="Política de segurança" value={manualReason} onChange={(e) => setManualReason(e.target.value)} disabled={isManualBlocking} />
          </div>
          <Button type="submit" variant="destructive" disabled={isManualBlocking || !manualDomain.trim()}>
            {isManualBlocking ? (<><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Bloqueando...</>) : (<><Ban className="h-4 w-4 mr-2" />Bloquear Site</>)}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

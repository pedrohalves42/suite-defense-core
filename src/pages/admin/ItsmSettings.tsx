import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useItsmIntegrations } from '@/hooks/useItsmIntegrations';
import { Loader2, Plus, ExternalLink, Ticket, Settings2, ToggleLeft } from 'lucide-react';

const ItsmSettings = () => {
  const { integrations, tickets, saveIntegration, createTicket, toggleIntegration } = useItsmIntegrations();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newIntegration, setNewIntegration] = useState({
    provider: 'jira' as string,
    display_name: '',
    base_url: '',
    project_key: '',
    auth_type: 'api_token',
    credentials_encrypted: {} as Record<string, string>,
    default_issue_type: 'Task',
    default_priority: 'Medium',
    auto_create_on_alert: false,
    auto_create_severity_threshold: 'high',
  });
  const [credEmail, setCredEmail] = useState('');
  const [credToken, setCredToken] = useState('');
  const [credUsername, setCredUsername] = useState('');
  const [credPassword, setCredPassword] = useState('');

  const handleSave = () => {
    const creds = newIntegration.provider === 'jira'
      ? { email: credEmail, api_token: credToken }
      : { username: credUsername, password: credPassword };

    saveIntegration.mutate({
      ...newIntegration,
      credentials_encrypted: creds,
    }, {
      onSuccess: () => {
        setShowAddDialog(false);
        setNewIntegration({ provider: 'jira', display_name: '', base_url: '', project_key: '', auth_type: 'api_token', credentials_encrypted: {}, default_issue_type: 'Task', default_priority: 'Medium', auto_create_on_alert: false, auto_create_severity_threshold: 'high' });
        setCredEmail(''); setCredToken(''); setCredUsername(''); setCredPassword('');
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conectores ITSM</h1>
          <p className="text-muted-foreground">Integração com Jira e ServiceNow para gestão de incidentes</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nova Integração</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Adicionar Integração ITSM</DialogTitle>
              <DialogDescription>Configure a conexão com Jira ou ServiceNow</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Provedor</Label>
                <Select value={newIntegration.provider} onValueChange={v => setNewIntegration(p => ({ ...p, provider: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jira">Jira (Atlassian)</SelectItem>
                    <SelectItem value="servicenow">ServiceNow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nome de Exibição</Label>
                <Input value={newIntegration.display_name} onChange={e => setNewIntegration(p => ({ ...p, display_name: e.target.value }))} placeholder="Ex: Jira Produção" />
              </div>
              <div>
                <Label>{newIntegration.provider === 'jira' ? 'URL do Jira Cloud' : 'URL da Instância ServiceNow'}</Label>
                <Input value={newIntegration.base_url} onChange={e => setNewIntegration(p => ({ ...p, base_url: e.target.value }))} placeholder={newIntegration.provider === 'jira' ? 'https://sua-empresa.atlassian.net' : 'https://sua-empresa.service-now.com'} />
              </div>
              {newIntegration.provider === 'jira' && (
                <div>
                  <Label>Chave do Projeto</Label>
                  <Input value={newIntegration.project_key} onChange={e => setNewIntegration(p => ({ ...p, project_key: e.target.value }))} placeholder="Ex: SEC" />
                </div>
              )}

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Credenciais</h4>
                {newIntegration.provider === 'jira' ? (
                  <>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" value={credEmail} onChange={e => setCredEmail(e.target.value)} placeholder="user@empresa.com" />
                    </div>
                    <div className="space-y-2 mt-2">
                      <Label>API Token</Label>
                      <Input type="password" value={credToken} onChange={e => setCredToken(e.target.value)} placeholder="Token gerado em id.atlassian.com" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Usuário</Label>
                      <Input value={credUsername} onChange={e => setCredUsername(e.target.value)} placeholder="admin" />
                    </div>
                    <div className="space-y-2 mt-2">
                      <Label>Senha</Label>
                      <Input type="password" value={credPassword} onChange={e => setCredPassword(e.target.value)} />
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={newIntegration.auto_create_on_alert} onCheckedChange={v => setNewIntegration(p => ({ ...p, auto_create_on_alert: v }))} />
                <Label>Criar tickets automaticamente em alertas</Label>
              </div>

              <Button onClick={handleSave} disabled={saveIntegration.isPending} className="w-full">
                {saveIntegration.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Integração
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="integrations">
        <TabsList>
          <TabsTrigger value="integrations"><Settings2 className="h-4 w-4 mr-1" />Integrações</TabsTrigger>
          <TabsTrigger value="tickets"><Ticket className="h-4 w-4 mr-1" />Tickets ({tickets.data?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-4 mt-4">
          {integrations.isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : integrations.data?.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma integração configurada. Clique em "Nova Integração" para começar.</CardContent></Card>
          ) : (
            integrations.data?.map(int => (
              <Card key={int.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant={int.provider === 'jira' ? 'default' : 'secondary'}>
                        {int.provider === 'jira' ? 'Jira' : 'ServiceNow'}
                      </Badge>
                      <CardTitle className="text-lg">{int.display_name || int.base_url}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={int.is_active ? 'default' : 'outline'}>
                        {int.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={() => toggleIntegration.mutate({ id: int.id, is_active: !int.is_active })}>
                        <ToggleLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription>{int.base_url} {int.project_key ? `• Projeto: ${int.project_key}` : ''}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Tipo padrão: {int.default_issue_type}</span>
                    <span>Prioridade: {int.default_priority}</span>
                    {int.auto_create_on_alert && <Badge variant="outline" className="text-xs">Auto-criar em alertas ≥ {int.auto_create_severity_threshold}</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="tickets" className="space-y-4 mt-4">
          {tickets.isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : tickets.data?.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum ticket criado ainda.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {tickets.data?.map(t => (
                <Card key={t.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant={t.provider === 'jira' ? 'default' : 'secondary'} className="text-xs">
                        {t.provider}
                      </Badge>
                      <span className="font-mono text-sm font-medium">{t.external_ticket_key}</span>
                      <span className="text-sm">{t.summary}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{t.status}</Badge>
                      <Badge variant="outline" className="text-xs">{t.source_type}</Badge>
                      {t.external_ticket_url && (
                        <a href={t.external_ticket_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm"><ExternalLink className="h-3 w-3" /></Button>
                        </a>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ItsmSettings;

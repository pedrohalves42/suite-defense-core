import { Monitor, Apple, Terminal, Power, CheckCircle2, XCircle, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { format, ptBR } from '@/lib/date-utils';
import type { RolloutPolicy } from "./types";

const PLATFORM_ICONS = { windows: Monitor, linux: Terminal, macos: Apple } as const;
const PLATFORMS = [
  { id: 'windows' as const, label: 'Windows' },
  { id: 'linux' as const, label: 'Linux' },
  { id: 'macos' as const, label: 'macOS' },
];

interface PlatformCardsProps {
  editingPolicy: string | null;
  formData: Partial<RolloutPolicy>;
  setFormData: (data: Partial<RolloutPolicy>) => void;
  saveMutation: { isPending: boolean };
  toggleMutation: { mutate: (args: { id: string; enabled: boolean }) => void };
  getPolicyForPlatform: (platform: string) => RolloutPolicy | undefined;
  getLatestVersionForPlatform: (platform: string) => string;
  startEditing: (platform: string) => void;
  handleSave: (platform: string) => void;
  cancelEditing: () => void;
}

export function PlatformCards({
  editingPolicy, formData, setFormData,
  saveMutation, toggleMutation,
  getPolicyForPlatform, getLatestVersionForPlatform,
  startEditing, handleSave, cancelEditing,
}: PlatformCardsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {PLATFORMS.map((platform) => {
        const policy = getPolicyForPlatform(platform.id);
        const latestVersion = getLatestVersionForPlatform(platform.id);
        const Icon = PLATFORM_ICONS[platform.id];
        const isEditing = editingPolicy === platform.id;

        return (
          <Card key={platform.id} className={policy?.enabled ? 'border-green-500/50' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5" /><CardTitle>{platform.label}</CardTitle>
                </div>
                {policy && (
                  <Switch checked={policy.enabled}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: policy.id, enabled: checked })} />
                )}
              </div>
              <CardDescription>Última release: <code className="bg-muted px-1 rounded">{latestVersion}</code></CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!policy && !isEditing ? (
                <div className="text-center py-4">
                  <XCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Nenhuma política configurada</p>
                  <Button variant="outline" size="sm" onClick={() => startEditing(platform.id)}>Configurar</Button>
                </div>
              ) : isEditing ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Versão Alvo</Label>
                    <Input value={formData.target_version || ''} onChange={(e) => setFormData({ ...formData, target_version: e.target.value })} placeholder={latestVersion} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Rollout %</Label>
                      <span className="text-2xl font-bold">{formData.rollout_percentage || 0}%</span>
                    </div>
                    <Slider value={[formData.rollout_percentage || 0]} onValueChange={([value]) => setFormData({ ...formData, rollout_percentage: value })} min={0} max={100} step={5} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notas</Label>
                    <Input value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Motivo do rollout..." />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Ativado</Label>
                    <Switch checked={formData.enabled || false} onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })} />
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => handleSave(platform.id)} disabled={saveMutation.isPending}>
                      <Save className="h-4 w-4 mr-2" />Salvar
                    </Button>
                    <Button variant="outline" onClick={cancelEditing}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {policy?.enabled ? (
                      <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Ativo</Badge>
                    ) : (
                      <Badge variant="secondary"><Power className="h-3 w-3 mr-1" />Desativado</Badge>
                    )}
                  </div>
                  <div><Label className="text-xs text-muted-foreground">Versão Alvo</Label><p className="font-mono">{policy?.target_version || 'N/A'}</p></div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Rollout</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${policy?.rollout_percentage || 0}%` }} />
                      </div>
                      <span className="text-lg font-bold">{policy?.rollout_percentage || 0}%</span>
                    </div>
                  </div>
                  {policy?.notes && (<div><Label className="text-xs text-muted-foreground">Notas</Label><p className="text-sm">{policy.notes}</p></div>)}
                  <div>
                    <Label className="text-xs text-muted-foreground">Atualizado</Label>
                    <p className="text-sm">{policy?.updated_at ? format(new Date(policy.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : 'N/A'}</p>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => startEditing(platform.id)}>Editar</Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

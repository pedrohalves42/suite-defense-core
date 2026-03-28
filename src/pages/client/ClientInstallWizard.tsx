import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Copy, Check, Terminal, Loader2, Shield, Monitor } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ClientInstallWizard = () => {
  const { tenant } = useTenant();
  const [platform, setPlatform] = useState<'windows' | 'linux'>('windows');
  const [agentName, setAgentName] = useState('');
  const [installCommand, setInstallCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<'choose' | 'install' | 'done'>('choose');

  const generateInstall = async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-generate-enrollment', {
        body: { agentName: agentName.trim() || 'Meu Computador', platform }
      });
      if (error) throw error;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const installUrl = `${supabaseUrl}/functions/v1/serve-installer/${data.enrollmentKey}`;

      setInstallCommand(
        platform === 'windows'
          ? `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $sp="$env:TEMP\\cs-install-$(Get-Random).ps1"; Invoke-WebRequest -Uri ${installUrl} -OutFile $sp -UseBasicParsing; & $sp; Remove-Item $sp -Force`
          : `curl -sSL ${installUrl} | bash`
      );
      setStep('install');
      toast.success('Comando gerado com sucesso!');
    } catch (err) {
      toast.error('Erro: ' + (err.message || 'Tente novamente'));
    } finally {
      setLoading(false);
    }
  };

  const copyCommand = () => {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    toast.success('Copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Proteger Meu Computador
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Instale o agente de proteção em poucos minutos
        </p>
      </div>

      {step === 'choose' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-primary" />
                Escolha a plataforma
              </CardTitle>
              <CardDescription>Selecione o sistema operacional do computador a proteger</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {(['windows', 'linux'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={cn(
                      "p-6 rounded-xl border-2 text-center transition-all",
                      platform === p
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    <div className="text-4xl mb-2">{p === 'windows' ? '🪟' : '🐧'}</div>
                    <div className="font-semibold text-foreground">{p === 'windows' ? 'Windows' : 'Linux'}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {p === 'windows' ? 'PowerShell' : 'Terminal Bash'}
                    </div>
                  </button>
                ))}
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Nome do Computador (opcional)</label>
                <input
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Ex: Recepção, Notebook João"
                  value={agentName}
                  onChange={e => setAgentName(e.target.value)}
                />
              </div>

              <Button onClick={generateInstall} disabled={loading} className="w-full" size="lg">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Gerar Comando de Instalação
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {step === 'install' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                Comando de Instalação
              </CardTitle>
              <CardDescription>
                Abra o {platform === 'windows' ? 'PowerShell como Administrador' : 'Terminal como root'} e cole o comando abaixo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <pre className="bg-muted/50 border rounded-lg p-4 text-xs font-mono whitespace-pre-wrap break-all text-foreground">
                  {installCommand}
                </pre>
                <Button size="sm" variant="secondary" onClick={copyCommand} className="absolute top-2 right-2">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-sm text-foreground">📋 Passo a passo:</h4>
                <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                  {platform === 'windows' ? (
                    <>
                      <li>Clique em <strong>Iniciar</strong> e busque <strong>PowerShell</strong></li>
                      <li>Clique com botão direito → <strong>Executar como Administrador</strong></li>
                      <li>Cole o comando acima e pressione <strong>Enter</strong></li>
                      <li>Aguarde ~30 segundos até a instalação completar</li>
                    </>
                  ) : (
                    <>
                      <li>Abra o <strong>Terminal</strong></li>
                      <li>Execute <code className="bg-muted px-1 rounded">sudo su</code> para elevar privilégios</li>
                      <li>Cole o comando acima e pressione <strong>Enter</strong></li>
                      <li>Aguarde a instalação completar</li>
                    </>
                  )}
                </ol>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => { setStep('choose'); setInstallCommand(''); }}>
                  ← Voltar
                </Button>
                <Button variant="outline" onClick={() => setStep('choose')} className="flex-1">
                  Instalar em Outro Computador
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Badge variant="secondary" className="mt-0.5">💡</Badge>
                <div>
                  <p className="text-sm font-medium text-foreground">Precisa de ajuda?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Entre em contato com seu administrador de TI se tiver dúvidas durante a instalação.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
};

export default ClientInstallWizard;

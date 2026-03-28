import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, CreditCard, Download, CheckCircle2, ArrowRight, ArrowLeft, Copy, Check, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const STEPS = [
  { icon: Building2, label: 'Empresa', description: 'Informações básicas' },
  { icon: CreditCard, label: 'Plano', description: 'Escolha seu plano' },
  { icon: Download, label: 'Primeiro Agente', description: 'Instale o agente' },
  { icon: CheckCircle2, label: 'Verificação', description: 'Confirme a conexão' },
];

const TEMPLATES = [
  { id: 'office', label: '🏢 Escritório', desc: 'Firewall, antivírus, atualizações' },
  { id: 'clinic', label: '🏥 Clínica/Saúde', desc: 'LGPD, criptografia, USB bloqueado' },
  { id: 'school', label: '🏫 Escola', desc: 'DNS filter, controle web, horários' },
  { id: 'custom', label: '⚙️ Personalizado', desc: 'Configure manualmente depois' },
];

const stepVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

const OnboardingWizard = () => {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 1: Company
  const [companyName, setCompanyName] = useState('');
  const [companyType, setCompanyType] = useState('office');
  const [contactEmail, setContactEmail] = useState('');

  // Step 2: Plan (display only - already has plan)
  const [selectedPlan] = useState('professional');

  // Step 3: Agent install
  const [enrollmentKey, setEnrollmentKey] = useState('');
  const [installCommand, setInstallCommand] = useState('');
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState<'windows' | 'linux'>('windows');

  // Step 4: Verification
  const [heartbeatDetected, setHeartbeatDetected] = useState(false);
  const [checkingHeartbeat, setCheckingHeartbeat] = useState(false);
  const [confetti, setConfetti] = useState(false);

  const progress = ((step + 1) / STEPS.length) * 100;

  // Step 3: Auto-generate enrollment key
  const generateEnrollmentKey = async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-generate-enrollment', {
        body: { agentName: companyName.trim() || 'Primeiro Agente', platform }
      });

      if (error) throw error;

      const key = data.enrollmentKey;
      setEnrollmentKey(key);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const installUrl = `${supabaseUrl}/functions/v1/serve-installer/${key}`;

      if (platform === 'windows') {
        setInstallCommand(`[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm ${installUrl} | iex`);
      } else {
        setInstallCommand(`curl -sSL ${installUrl} | bash`);
      }

      toast.success('Chave de instalação gerada!');
    } catch (err) {
      toast.error('Erro ao gerar chave: ' + (err.message || 'Tente novamente'));
    } finally {
      setLoading(false);
    }
  };

  const copyCommand = () => {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    toast.success('Comando copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Step 4: Check heartbeat
  useEffect(() => {
    if (step !== 3 || !tenant || heartbeatDetected) return;

    setCheckingHeartbeat(true);
    const interval = setInterval(async () => {
      try {
        const fiveMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30min threshold
        const { data } = await supabase
          .from('agents' )
          .select('id')
          .eq('tenant_id', tenant?.id ?? '')
          .gte('last_seen', fiveMinAgo)
          .limit(1);

        if (data && data.length > 0) {
          setHeartbeatDetected(true);
          setCheckingHeartbeat(false);
          setConfetti(true);
          toast.success('🎉 Primeiro agente conectado com sucesso!');
          setTimeout(() => setConfetti(false), 4000);
        }
      } catch {}
    }, 5000);

    return () => clearInterval(interval);
  }, [step, tenant, heartbeatDetected]);

  const canNext = () => {
    switch (step) {
      case 0: return companyName.trim().length >= 2;
      case 1: return true;
      case 2: return !!installCommand;
      case 3: return true;
      default: return false;
    }
  };

  const handleNext = async () => {
    if (step === 2 && !installCommand) {
      await generateEnrollmentKey();
      return;
    }
    if (step === STEPS.length - 1) {
      navigate('/admin/dashboard');
      return;
    }
    setStep(s => s + 1);
  };

  return (
    <div className="max-w-3xl mx-auto py-6">
      {/* Progress header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Setup Rápido</h1>
        <p className="text-muted-foreground text-sm mb-4">Configure seu primeiro cliente em menos de 5 minutos</p>
        <Progress value={progress} className="h-2 mb-4" />
        <div className="flex justify-between">
          {STEPS.map((s, i) => (
            <div key={i} className={cn(
              "flex items-center gap-2 text-xs transition-colors",
              i <= step ? "text-primary" : "text-muted-foreground"
            )}>
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all",
                i < step ? "bg-primary border-primary text-primary-foreground" :
                i === step ? "border-primary text-primary" :
                "border-muted text-muted-foreground"
              )}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
              </div>
              <span className="hidden sm:inline font-medium">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25 }}
        >
          {/* STEP 0: Company */}
          {step === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Dados da Empresa
                </CardTitle>
                <CardDescription>Informações básicas do novo cliente</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Nome da Empresa *</Label>
                  <Input
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Ex: Clínica São Paulo"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Email de Contato</Label>
                  <Input
                    type="email"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    placeholder="admin@empresa.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Template de Políticas</Label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {TEMPLATES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setCompanyType(t.id)}
                        className={cn(
                          "p-3 rounded-lg border text-left transition-all",
                          companyType === t.id
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <div className="font-medium text-sm">{t.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 1: Plan */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Plano de Proteção
                </CardTitle>
                <CardDescription>O plano pode ser alterado a qualquer momento</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {[
                    { id: 'starter', name: 'Starter', price: 'R$ 5/agente', features: ['Monitoramento básico', 'Alertas', 'Dashboard'] },
                    { id: 'professional', name: 'Professional', price: 'R$ 12/agente', features: ['Tudo do Starter', 'Remediação automática', 'Compliance', 'Relatórios'], recommended: true },
                    { id: 'enterprise', name: 'Enterprise', price: 'Sob consulta', features: ['Tudo do Professional', 'SIEM export', 'White label', 'SLA dedicado'] },
                  ].map(plan => (
                    <div
                      key={plan.id}
                      className={cn(
                        "p-4 rounded-lg border flex items-center gap-4 cursor-pointer transition-all",
                        selectedPlan === plan.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/40",
                        plan.recommended && "relative"
                      )}
                    >
                      {plan.recommended && (
                        <Badge className="absolute -top-2.5 right-3 bg-primary text-primary-foreground text-[10px]">
                          Recomendado
                        </Badge>
                      )}
                      <div className="flex-1">
                        <div className="font-semibold">{plan.name}</div>
                        <div className="text-sm text-primary font-medium">{plan.price}</div>
                        <ul className="mt-2 space-y-1">
                          {plan.features.map(f => (
                            <li key={f} className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Check className="h-3 w-3 text-primary" /> {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 2: Install agent */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" />
                  Instalar Primeiro Agente
                </CardTitle>
                <CardDescription>Cole o comando abaixo no terminal do computador alvo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Plataforma</Label>
                  <Select value={platform} onValueChange={(v: 'windows' | 'linux') => { setPlatform(v); setInstallCommand(''); setEnrollmentKey(''); }}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="windows">🪟 Windows (PowerShell)</SelectItem>
                      <SelectItem value="linux">🐧 Linux (Bash)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {!installCommand ? (
                  <Button onClick={generateEnrollmentKey} disabled={loading} className="w-full">
                    {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Gerar Comando de Instalação
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="relative">
                      <pre className="bg-muted/50 border rounded-lg p-4 text-xs font-mono whitespace-pre-wrap break-all text-foreground">
                        {installCommand}
                      </pre>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={copyCommand}
                        className="absolute top-2 right-2"
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">
                        <strong className="text-foreground">Instruções:</strong> Abra o {platform === 'windows' ? 'PowerShell como Administrador' : 'Terminal como root'} no computador alvo e cole o comando acima. A instalação leva ~30 segundos.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 3: Verification */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Verificação
                </CardTitle>
                <CardDescription>Aguardando o primeiro heartbeat do agente</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-8">
                {confetti && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-6xl mb-4"
                  >
                    🎉
                  </motion.div>
                )}

                {heartbeatDetected ? (
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                      <CheckCircle2 className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">Agente Conectado!</h3>
                    <p className="text-sm text-muted-foreground">
                      O primeiro computador de <strong>{companyName || 'seu cliente'}</strong> está protegido.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin" />
                    <h3 className="text-lg font-semibold text-foreground">Aguardando conexão...</h3>
                    <p className="text-sm text-muted-foreground">
                      Execute o comando de instalação no computador alvo. A detecção é automática.
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      Verificando a cada 5 segundos
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation buttons */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={() => step === 0 ? navigate('/admin/dashboard') : setStep(s => s - 1)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {step === 0 ? 'Cancelar' : 'Voltar'}
        </Button>
        <Button
          onClick={handleNext}
          disabled={!canNext() || loading}
        >
          {step === STEPS.length - 1 ? (
            heartbeatDetected ? 'Ir para o Dashboard' : 'Pular e finalizar'
          ) : (
            step === 2 && !installCommand ? 'Gerar Comando' : 'Próximo'
          )}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};

export default OnboardingWizard;

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, Lock, Crown, ArrowRight, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PLAN_CONFIG, LEGACY_PLANS, isLegacyPlan } from "@/constants/plans";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan?: string;
  triggerReason?: "device_limit" | "feature_lock" | "critical_risk" | "legacy_migration";
  featureName?: string;
  isLegacy?: boolean;
}

const getTriggerMessage = (reason?: string, featureName?: string, isLegacy?: boolean) => {
  if (isLegacy) {
    return {
      title: "Migre para os planos atuais",
      description: "Seu plano legado não suporta novos recursos. Migre agora para desbloquear dispositivos adicionais e funcionalidades avançadas.",
    };
  }
  
  switch (reason) {
    case "device_limit":
      return {
        title: "Você atingiu o limite do seu plano",
        description: "Sua empresa está crescendo — sua segurança também precisa acompanhar.",
      };
    case "feature_lock":
      return {
        title: `${featureName || "Este recurso"} está disponível no Business`,
        description: "Desbloqueie recursos avançados para ter controle total da segurança.",
      };
    case "critical_risk":
      return {
        title: "Risco crítico identificado",
        description: "Tenha ações recomendadas e histórico completo no plano Business.",
      };
    case "legacy_migration":
      return {
        title: "Migração necessária",
        description: "Seu plano atual não está mais disponível. Migre para continuar com acesso completo.",
      };
    default:
      return {
        title: "Faça upgrade do seu plano",
        description: "Desbloqueie mais recursos e dispositivos para sua empresa.",
      };
  }
};

export function UpgradeModal({
  open,
  onOpenChange,
  currentPlan = "starter",
  triggerReason,
  featureName,
  isLegacy = false,
}: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);
  const message = getTriggerMessage(triggerReason, featureName, isLegacy);
  
  // V4: Determine if current plan is legacy
  const planIsLegacy = isLegacy || isLegacyPlan(currentPlan);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          planName: "business",
          billingPeriod: "monthly",
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, "_blank");
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Erro ao criar checkout:", error);
      toast.error("Erro ao processar upgrade. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleMigrate = async () => {
    setLoading(true);
    try {
      // For legacy customers, create checkout for starter_compliance
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          planName: "starter_compliance",
          billingPeriod: "monthly",
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, "_blank");
        onOpenChange(false);
        toast.success("Redirecionando para checkout de migração...");
      }
    } catch (error) {
      console.error("Erro ao criar checkout de migração:", error);
      toast.error("Erro ao processar migração. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Crown className="w-6 h-6 text-primary" />
            {message.title}
          </DialogTitle>
          <DialogDescription>{message.description}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* V4: Legacy customer warning */}
          {planIsLegacy && (
            <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-600 dark:text-amber-400">
                <strong>Plano Legado:</strong> Você está em um plano que não está mais disponível. 
                Para adicionar dispositivos ou acessar novos recursos, é necessário migrar para os planos atuais.
              </AlertDescription>
            </Alert>
          )}

          {/* Comparativo */}
          <div className="grid grid-cols-2 gap-4">
            {/* Plano atual */}
            <div className={`p-4 rounded-xl border ${planIsLegacy ? 'border-amber-500/50 bg-amber-500/5' : 'border-border bg-muted/30'}`}>
              <div className="text-sm font-medium text-muted-foreground mb-2">
                {planIsLegacy ? 'Plano Legado' : 'Seu plano atual'}
              </div>
              <div className="text-lg font-bold mb-3">
                {planIsLegacy ? `${currentPlan} (Descontinuado)` : 'Starter Compliance'}
              </div>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  10 dispositivos
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Lock className="w-4 h-4" />
                  Scans básicos
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Lock className="w-4 h-4" />
                  Relatórios padrão
                </li>
                {planIsLegacy && (
                  <li className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="w-4 h-4" />
                    Sem novos recursos
                  </li>
                )}
              </ul>
            </div>

            {/* Plano Business */}
            <div className="p-4 rounded-xl border-2 border-primary bg-primary/5">
              <div className="text-sm font-medium text-primary mb-2">Recomendado</div>
              <div className="text-lg font-bold mb-3">Business</div>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span className="font-medium">30 dispositivos</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span className="font-medium">Scans ilimitados</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span className="font-medium">Relatórios customizados</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span className="font-medium">Suporte prioritário</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Preço e CTA */}
          <div className="text-center space-y-4">
            <div>
              <span className="text-3xl font-bold">R$ 899</span>
              <span className="text-muted-foreground">/mês</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Sem fidelidade • Cancele quando quiser
            </p>

            <div className="flex gap-3">
              {planIsLegacy ? (
                <>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleMigrate}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Migrar para Starter
                  </Button>
                  <Button
                    className="flex-1 bg-gradient-to-r from-primary to-accent"
                    onClick={handleUpgrade}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Migrar para Business
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => onOpenChange(false)}
                  >
                    Continuar no Starter
                  </Button>
                  <Button
                    className="flex-1 bg-gradient-to-r from-primary to-accent"
                    onClick={handleUpgrade}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Fazer upgrade agora
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

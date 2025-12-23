import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Package, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PlatformResult {
  platform: string;
  success: boolean;
  version?: string;
  error?: string;
  sha256?: string;
}

export function RegisterLatestRelease() {
  const [version, setVersion] = useState("v4.1.4");
  const [releaseNotes, setReleaseNotes] = useState(
    "- Correção do erro MissingCatchOrFinally na função Verify-Ed25519Signature\n- SSA-011 v2: Implementação completa de assinatura Ed25519"
  );
  const [platforms, setPlatforms] = useState({
    windows: true,
    linux: false,
    macos: false,
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [results, setResults] = useState<PlatformResult[]>([]);

  const togglePlatform = (platform: keyof typeof platforms) => {
    setPlatforms((prev) => ({ ...prev, [platform]: !prev[platform] }));
  };

  const handleRegister = async () => {
    const selectedPlatforms = Object.entries(platforms)
      .filter(([_, selected]) => selected)
      .map(([platform]) => platform);

    if (selectedPlatforms.length === 0) {
      toast.error("Selecione pelo menos uma plataforma");
      return;
    }

    if (!version.trim()) {
      toast.error("Informe a versão");
      return;
    }

    setIsRegistering(true);
    setResults([]);

    try {
      const { data, error } = await supabase.functions.invoke("register-agent-release", {
        body: {
          version: version.trim(),
          platforms: selectedPlatforms,
          releaseNotes: releaseNotes.trim(),
          channel: "stable",
        },
      });

      if (error) throw error;

      const platformResults: PlatformResult[] = data?.results || [];
      setResults(platformResults);

      const successCount = platformResults.filter((r) => r.success).length;
      const failCount = platformResults.filter((r) => !r.success).length;

      if (successCount > 0 && failCount === 0) {
        toast.success(`${successCount} plataforma(s) registrada(s) com sucesso`);
      } else if (successCount > 0 && failCount > 0) {
        toast.warning(`${successCount} sucesso, ${failCount} falha(s)`);
      } else {
        toast.error("Falha ao registrar releases");
      }
    } catch (error: any) {
      console.error("Erro ao registrar:", error);
      toast.error(error.message || "Erro ao registrar release");
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          Registrar Nova Release
        </CardTitle>
        <CardDescription>
          Registra e assina automaticamente os scripts do agente para as plataformas selecionadas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="version">Versão</Label>
            <Input
              id="version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="v4.1.4"
              disabled={isRegistering}
            />
          </div>

          <div className="space-y-2">
            <Label>Plataformas</Label>
            <div className="flex items-center gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="windows"
                  checked={platforms.windows}
                  onCheckedChange={() => togglePlatform("windows")}
                  disabled={isRegistering}
                />
                <Label htmlFor="windows" className="cursor-pointer">Windows</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="linux"
                  checked={platforms.linux}
                  onCheckedChange={() => togglePlatform("linux")}
                  disabled={isRegistering}
                />
                <Label htmlFor="linux" className="cursor-pointer">Linux</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="macos"
                  checked={platforms.macos}
                  onCheckedChange={() => togglePlatform("macos")}
                  disabled={isRegistering}
                />
                <Label htmlFor="macos" className="cursor-pointer">macOS</Label>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Release Notes</Label>
          <Textarea
            id="notes"
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            placeholder="Descreva as mudanças desta versão..."
            rows={4}
            disabled={isRegistering}
          />
        </div>

        <Button
          onClick={handleRegister}
          disabled={isRegistering}
          className="w-full"
          size="lg"
        >
          {isRegistering ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Registrando e Assinando...
            </>
          ) : (
            <>
              <Package className="mr-2 h-4 w-4" />
              Registrar e Assinar Automaticamente
            </>
          )}
        </Button>

        {results.length > 0 && (
          <div className="mt-4 space-y-2 rounded-lg border p-4">
            <h4 className="font-medium">Resultados:</h4>
            {results.map((result) => (
              <div
                key={result.platform}
                className={`flex items-center gap-2 rounded p-2 text-sm ${
                  result.success
                    ? "bg-green-500/10 text-green-700 dark:text-green-400"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {result.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span className="font-medium capitalize">{result.platform}:</span>
                {result.success ? (
                  <span>{result.version} registrada (SHA: {result.sha256?.slice(0, 12)}...)</span>
                ) : (
                  <span>{result.error}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>Importante:</strong> Após registrar uma nova versão, gere novos instaladores 
            para os agentes que precisam atualizar. Agentes existentes receberão a atualização 
            automaticamente no próximo heartbeat.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

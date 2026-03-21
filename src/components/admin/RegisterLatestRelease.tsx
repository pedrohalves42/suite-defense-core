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

const SCRIPT_FILES: Record<string, string> = {
  windows: "cybershield-agent-windows-v5.ps1",
  linux: "cybershield-agent-linux-v5.sh",
  macos: "cybershield-agent-macos-v5.sh",
};

export function RegisterLatestRelease() {
  const [version, setVersion] = useState("v5.0.15");
  const [releaseNotes, setReleaseNotes] = useState(
    "v5.0.15 — STABILIZATION & BUGFIXES\n" +
    "- FIX: $PID read-only variable renamed to $procId (EDR process collection)\n" +
    "- NEW: Persistent USB whitelist (auto-whitelist after 3 detections)\n" +
    "- FIX: DNS sync 403/404 handled gracefully\n" +
    "- FIX: RSA-2048 signature fallback confirmed operational\n" +
    "- PARITY: Windows / Linux / macOS support"
  );
  const [platforms, setPlatforms] = useState({
    windows: true,
    linux: true,
    macos: true,
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [currentPlatform, setCurrentPlatform] = useState<string | null>(null);
  const [results, setResults] = useState<PlatformResult[]>([]);

  const togglePlatform = (platform: keyof typeof platforms) => {
    setPlatforms((prev) => ({ ...prev, [platform]: !prev[platform] }));
  };

  const fetchScriptContent = async (platform: string): Promise<string> => {
    const fileName = SCRIPT_FILES[platform];
    if (!fileName) throw new Error(`Unknown platform: ${platform}`);

    // Strategy 1: Storage bucket (works in production)
    try {
      const { data: fileData, error: storageError } = await supabase.storage
        .from('agent-installers')
        .download(`scripts/${fileName}`);
      
      if (!storageError && fileData) {
        const content = await fileData.text();
        if (content && content.length > 1000 && !content.trimStart().startsWith('<!DOCTYPE')) {
          return content;
        }
      }
    } catch {
      // Storage fallback failed — continue to next strategy
    }

    // Strategy 2: Public URL (local dev only)
    const response = await fetch(`/agent-scripts/${fileName}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${platform} script: ${response.status}`);
    }
    const text = await response.text();
    if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
      throw new Error(`${platform}: URL returned HTML instead of script. Upload the script to the storage bucket first.`);
    }
    return text;
  };

  const registerPlatform = async (platform: string, scriptContent: string): Promise<PlatformResult> => {
    try {
      const { data, error } = await supabase.functions.invoke("register-agent-release", {
        body: {
          version: version.trim(),
          platform,
          script_content: scriptContent,
          release_notes: releaseNotes.trim(),
          channel: "stable",
        },
      });

      if (error) throw error;

      return {
        platform,
        success: true,
        version: data?.version || version,
        sha256: data?.sha256,
      };
    } catch (err: any) {
      return {
        platform,
        success: false,
        error: err.message || "Unknown error",
      };
    }
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

    const platformResults: PlatformResult[] = [];

    for (const platform of selectedPlatforms) {
      setCurrentPlatform(platform);
      
      try {
        toast.info(`Carregando script ${platform}...`);
        const scriptContent = await fetchScriptContent(platform);
        
        const minSize = platform === "windows" ? 40000 : 20000;
        if (scriptContent.length < minSize) {
          platformResults.push({
            platform,
            success: false,
            error: `Script muito pequeno (${(scriptContent.length / 1024).toFixed(1)}KB)`,
          });
          continue;
        }

        toast.info(`Registrando ${platform} (${(scriptContent.length / 1024).toFixed(1)}KB)...`);
        const result = await registerPlatform(platform, scriptContent);
        platformResults.push(result);
      } catch (err: any) {
        platformResults.push({
          platform,
          success: false,
          error: err.message || "Failed to fetch script",
        });
      }
    }

    setResults(platformResults);
    setCurrentPlatform(null);
    setIsRegistering(false);

    const successCount = platformResults.filter((r) => r.success).length;
    const failCount = platformResults.filter((r) => !r.success).length;

    if (successCount > 0 && failCount === 0) {
      toast.success(`${successCount} plataforma(s) registrada(s) com sucesso`);
    } else if (successCount > 0 && failCount > 0) {
      toast.warning(`${successCount} sucesso, ${failCount} falha(s)`);
    } else {
      toast.error("Falha ao registrar releases");
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
          Carrega scripts de /agent-scripts/, registra e assina automaticamente
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
              {(["windows", "linux", "macos"] as const).map((platform) => (
                <div key={platform} className="flex items-center gap-2">
                  <Checkbox
                    id={platform}
                    checked={platforms[platform]}
                    onCheckedChange={() => togglePlatform(platform)}
                    disabled={isRegistering}
                  />
                  <Label htmlFor={platform} className="cursor-pointer capitalize">
                    {platform}
                  </Label>
                </div>
              ))}
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
              {currentPlatform ? `Registrando ${currentPlatform}...` : "Registrando..."}
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
                  <span>{result.version} (SHA: {result.sha256?.slice(0, 12)}...)</span>
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
            <strong>Importante:</strong> Após registrar, gere novos instaladores para os agentes.
            Agentes existentes receberão a atualização no próximo heartbeat.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

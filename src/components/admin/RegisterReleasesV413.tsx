import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, Shield, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReleaseResult {
  platform: string;
  success: boolean;
  version?: string;
  sha256?: string;
  signature_present?: boolean;
  signed_by?: string;
  error?: string;
}

/**
 * Component to register v4.1.3 releases with Ed25519 signatures
 * SSA-004: Payload Signing implementation
 * SSA-009: Browser History Collection
 * SSA-010: Full V3 Jobs Restoration
 * SSA-011: Fix PowerShell MissingCatchOrFinally syntax error
 */
export function RegisterReleasesV413() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [results, setResults] = useState<ReleaseResult[]>([]);
  const [currentPlatform, setCurrentPlatform] = useState<string | null>(null);

  const platforms = [
    { id: 'windows', name: 'Windows', file: '/agent-scripts/cybershield-agent-windows-v4.ps1' },
    { id: 'linux', name: 'Linux', file: '/agent-scripts/cybershield-agent-linux-v4.sh' },
    { id: 'macos', name: 'macOS', file: '/agent-scripts/cybershield-agent-macos-v4.sh' },
  ];

  const releaseNotes = `v4.1.3 - SSA-011: Fix MissingCatchOrFinally + SSA-010 + SSA-009

BUGFIX (SSA-011):
- Corrigido erro de sintaxe PowerShell "MissingCatchOrFinally" na linha 303
- Função Verify-ScriptSignature com try/catch corrigido
- Agentes podem agora sincronizar corretamente

RESTORED JOBS (SSA-010):
- scan: Antivirus and security scanning
- fix_firewall: Windows Firewall repair and configuration
- restart_service: Windows service restart capability
- collect_network_info: Network adapters, DNS, firewall status
- sync_blocked_websites: Website blocking synchronization
- integration_test: Agent self-diagnostics
- collect_info: System information collection
- reinstall_agent: Self-reinstallation capability

BROWSER HISTORY (SSA-009):
- Chrome history collection
- Firefox history collection  
- Edge history collection
- SQLite database parsing

SECURITY (SSA-004):
- Ed25519 job payload signature verification
- Rejects unsigned jobs when public key is configured
- Canonical payload format: job_id:job_type:JSON(payload)
- Prevents RCE via compromised database`;

  const registerRelease = async (platform: string, scriptContent: string) => {
    const { data, error } = await supabase.functions.invoke('register-agent-release', {
      body: {
        platform,
        version: 'v4.1.3',
        script_content: scriptContent,
        release_notes: releaseNotes,
        channel: 'stable',
        // Backend will auto-sign with ED25519_PRIVATE_KEY
      },
    });

    if (error) throw error;
    return data;
  };

  const handleRegisterAll = async () => {
    setIsRegistering(true);
    setResults([]);

    try {
      for (const platform of platforms) {
        setCurrentPlatform(platform.id);
        
        try {
          // Fetch the script content
          const response = await fetch(platform.file);
          if (!response.ok) {
            throw new Error(`Failed to fetch ${platform.file}: ${response.status}`);
          }
          const scriptContent = await response.text();
          
          if (scriptContent.length < 10000) {
            throw new Error(`Script too small (${scriptContent.length} bytes) - possible placeholder`);
          }

          // Register the release
          const result = await registerRelease(platform.id, scriptContent);
          
          setResults(prev => [...prev, {
            platform: platform.id,
            success: true,
            version: result.version,
            sha256: result.sha256,
            signature_present: result.signature_present,
            signed_by: result.signed_by,
          }]);

          toast.success(`${platform.name} v4.1.3 registrado com sucesso`);
          
        } catch (platformError) {
          const error = platformError as Error;
          setResults(prev => [...prev, {
            platform: platform.id,
            success: false,
            error: error.message,
          }]);
          toast.error(`Erro ao registrar ${platform.name}: ${error.message}`);
        }
      }
    } finally {
      setIsRegistering(false);
      setCurrentPlatform(null);
    }
  };

  const successCount = results.filter(r => r.success).length;
  const signedCount = results.filter(r => r.signature_present).length;

  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-500" />
          <CardTitle>Registrar Releases v4.1.3 (SSA-011 Bugfix)</CardTitle>
          <Badge className="bg-blue-600">HOTFIX</Badge>
        </div>
        <CardDescription>
          Correção do erro MissingCatchOrFinally + Full V3 Jobs + Browser History
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-4 text-sm">
          <h4 className="font-semibold mb-2">Novidades v4.1.3:</h4>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li><strong>SSA-011:</strong> Corrigido erro de sintaxe PowerShell "MissingCatchOrFinally" na função Verify-ScriptSignature</li>
            <li><strong>SSA-010:</strong> 8 job handlers restaurados do v3</li>
            <li><strong>SSA-009:</strong> Browser history collection (Chrome, Firefox, Edge)</li>
            <li><strong>SSA-004:</strong> Ed25519 signature verification mantido</li>
          </ul>
        </div>

        <Button 
          onClick={handleRegisterAll} 
          disabled={isRegistering}
          className="w-full bg-blue-600 hover:bg-blue-700"
          size="lg"
        >
          {isRegistering ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Registrando {currentPlatform}...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Registrar 3 Releases v4.1.3
            </>
          )}
        </Button>

        {results.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Resultados:</span>
              <Badge variant={successCount === 3 ? 'default' : 'secondary'}>
                {successCount}/3 sucesso
              </Badge>
              {signedCount > 0 && (
                <Badge variant="outline" className="border-blue-500 text-blue-600">
                  {signedCount} assinadas
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              {results.map((result) => (
                <div 
                  key={result.platform}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    result.success 
                      ? 'bg-blue-500/10 border-blue-500/20' 
                      : 'bg-destructive/10 border-destructive/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle className="h-4 w-4 text-blue-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="font-medium capitalize">{result.platform}</span>
                    {result.version && (
                      <Badge variant="outline" className="text-xs">{result.version}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {result.signature_present && (
                      <Badge className="bg-blue-600">
                        Assinada ({result.signed_by})
                      </Badge>
                    )}
                    {result.sha256 && (
                      <span className="text-muted-foreground font-mono">
                        SHA256: {result.sha256.substring(0, 12)}...
                      </span>
                    )}
                    {result.error && (
                      <span className="text-destructive">{result.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

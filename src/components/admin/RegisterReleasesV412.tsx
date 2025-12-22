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
 * Component to register v4.1.2 releases with Ed25519 signatures
 * SSA-004: Payload Signing implementation
 * SSA-009: Browser History Collection
 * SSA-010: Full V3 Jobs Restoration
 */
export function RegisterReleasesV412() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [results, setResults] = useState<ReleaseResult[]>([]);
  const [currentPlatform, setCurrentPlatform] = useState<string | null>(null);

  const platforms = [
    { id: 'windows', name: 'Windows', file: '/agent-scripts/cybershield-agent-windows-v4.ps1' },
    { id: 'linux', name: 'Linux', file: '/agent-scripts/cybershield-agent-linux-v4.sh' },
    { id: 'macos', name: 'macOS', file: '/agent-scripts/cybershield-agent-macos-v4.sh' },
  ];

  const releaseNotes = `v4.1.2 - SSA-010: Full V3 Jobs Restoration + SSA-009: Browser History

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
        version: 'v4.1.2',
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

          toast.success(`${platform.name} v4.1.2 registrado com sucesso`);
          
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
    <Card className="border-green-500/30 bg-green-500/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-green-500" />
          <CardTitle>Registrar Releases v4.1.2 (SSA-009 + SSA-010)</CardTitle>
          <Badge className="bg-green-600">NOVA</Badge>
        </div>
        <CardDescription>
          Full V3 Jobs Restoration + Browser History Collection para Windows, Linux e macOS
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-4 text-sm">
          <h4 className="font-semibold mb-2">Novidades v4.1.2:</h4>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li><strong>SSA-010:</strong> 8 job handlers restaurados do v3 (scan, fix_firewall, restart_service, collect_network_info, sync_blocked_websites, integration_test, collect_info, reinstall_agent)</li>
            <li><strong>SSA-009:</strong> Browser history collection (Chrome, Firefox, Edge)</li>
            <li><strong>SSA-004:</strong> Ed25519 signature verification mantido</li>
            <li>14 job types totais suportados</li>
          </ul>
        </div>

        <Button 
          onClick={handleRegisterAll} 
          disabled={isRegistering}
          className="w-full bg-green-600 hover:bg-green-700"
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
              Registrar 3 Releases v4.1.2
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
                <Badge variant="outline" className="border-green-500 text-green-600">
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
                      ? 'bg-green-500/10 border-green-500/20' 
                      : 'bg-destructive/10 border-destructive/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
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
                      <Badge className="bg-green-600">
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

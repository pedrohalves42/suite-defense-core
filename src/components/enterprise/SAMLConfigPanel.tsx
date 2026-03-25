import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { KeyRound, Save, ExternalLink, Shield, Copy } from 'lucide-react';
import { callEdgeFunction } from '@/lib/edge-function-client';
import { toast } from 'sonner';

const PROVIDERS = [
  { value: 'okta', label: 'Okta' },
  { value: 'azure', label: 'Azure AD' },
  { value: 'google', label: 'Google Workspace' },
  { value: 'auth0', label: 'Auth0' },
  { value: 'custom', label: 'Custom SAML 2.0' },
];

interface SAMLConfigPanelProps {
  tenantId: string;
}

export function SAMLConfigPanel({ tenantId }: SAMLConfigPanelProps) {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [provider, setProvider] = useState('custom');
  const [entityId, setEntityId] = useState('');
  const [ssoUrl, setSsoUrl] = useState('');
  const [certificate, setCertificate] = useState('');
  const [enabled, setEnabled] = useState(false);

  const acsUrl = `${window.location.origin}/auth/saml/callback`;

  const loadConfig = useCallback(async () => {
    try {
      const data = await callEdgeFunction('saml-sso', { action: 'config', tenantId });
      setConfig(data);
      if (data?.enabled) {
        setProvider(data.provider || 'custom');
        setEntityId(data.entity_id || '');
        setSsoUrl(data.sso_url || '');
        setEnabled(data.enabled);
      }
    } catch (e) {
      // Not configured yet — that's fine
    }
  }, [tenantId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await callEdgeFunction('saml-sso', {
        action: 'configure',
        tenantId,
        provider,
        entityId,
        ssoUrl,
        certificate,
      });
      toast.success('Configuração SAML salva');
      loadConfig();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao salvar');
    } finally {
      setLoading(false);
    }
  };

  const handleTestLogin = async () => {
    setLoading(true);
    try {
      const data = await callEdgeFunction('saml-sso', { action: 'login', tenantId });
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      }
    } catch (e: any) {
      toast.error(e.message || 'Falha ao iniciar login');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          SAML 2.0 Single Sign-On (SSO)
        </CardTitle>
        <CardDescription>
          Configure SSO com seu provedor de identidade corporativo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* SP Metadata */}
        <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
          <h4 className="text-sm font-medium">Service Provider (SP) Metadata</h4>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-background px-2 py-1 rounded flex-1">Entity ID: cybershield</code>
            <Button variant="ghost" size="sm" onClick={() => copyToClipboard('cybershield')}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-background px-2 py-1 rounded flex-1">ACS URL: {acsUrl}</code>
            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(acsUrl)}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <Label htmlFor="saml-enabled">Habilitar SAML SSO</Label>
          <Switch id="saml-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Provider */}
        <div className="space-y-2">
          <Label>Provedor de Identidade (IdP)</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROVIDERS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Entity ID */}
        <div className="space-y-2">
          <Label>IdP Entity ID</Label>
          <Input
            placeholder="https://your-org.okta.com"
            value={entityId}
            onChange={e => setEntityId(e.target.value)}
          />
        </div>

        {/* SSO URL */}
        <div className="space-y-2">
          <Label>SSO URL</Label>
          <Input
            placeholder="https://your-org.okta.com/app/.../sso/saml"
            value={ssoUrl}
            onChange={e => setSsoUrl(e.target.value)}
          />
        </div>

        {/* Certificate */}
        <div className="space-y-2">
          <Label>Certificado X.509</Label>
          <Textarea
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            value={certificate}
            onChange={e => setCertificate(e.target.value)}
            rows={4}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={loading || !ssoUrl}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Configuração
          </Button>
          {config?.enabled && (
            <Button variant="outline" onClick={handleTestLogin} disabled={loading}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Testar Login SSO
            </Button>
          )}
        </div>

        {config?.enabled && (
          <Alert>
            <KeyRound className="h-4 w-4" />
            <AlertDescription>
              SAML SSO está ativo. Usuários podem entrar usando o provedor <Badge variant="secondary">{config.provider}</Badge>.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

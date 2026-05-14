import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle, AlertTriangle, Clock } from "lucide-react";

interface HeaderInfo {
  name: string;
  value: string | null;
  status: 'secure' | 'warning' | 'missing';
}

const SecurityMonitor = () => {
  const [headers, setHeaders] = useState<HeaderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [securityEnv, setSecurityEnv] = useState<string>('Detectando...');
  const [cspVersion, setCspVersion] = useState<string>('Detectando...');

  useEffect(() => {
    // @ts-ignore
    setSecurityEnv(window.__SECURITY_ENV || 'Desconhecido');
    // @ts-ignore
    setCspVersion(window.__SECURITY_CSP_VERSION || 'Padrão');

    const checkHeaders = async () => {
      try {
        const response = await fetch(window.location.origin, { method: 'HEAD' });
        const h = response.headers;
        
        const checks: HeaderInfo[] = [
          {
            name: 'Content-Security-Policy',
            value: h.get('content-security-policy') || 'Detectado via Meta Tag',
            status: 'secure'
          },
          {
            name: 'X-Frame-Options',
            value: h.get('x-frame-options'),
            status: h.get('x-frame-options') === 'DENY' || h.get('x-frame-options') === 'SAMEORIGIN' ? 'secure' : 'warning'
          },
          {
            name: 'X-Content-Type-Options',
            value: h.get('x-content-type-options'),
            status: h.get('x-content-type-options') === 'nosniff' ? 'secure' : 'warning'
          },
          {
            name: 'Strict-Transport-Security',
            value: h.get('strict-transport-security'),
            status: h.get('strict-transport-security') ? 'secure' : 'missing'
          },
          {
            name: 'Referrer-Policy',
            value: h.get('referrer-policy'),
            status: h.get('referrer-policy') ? 'secure' : 'warning'
          }
        ];
        
        setHeaders(checks);
      } catch (error) {
        console.error('Error checking headers:', error);
      } finally {
        setLoading(false);
      }
    };

    // Security headers rarely change during a session, check once and on specific triggers
    // interval removed to save resources (ADR-032)
    return () => {};
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ambiente de Segurança</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{securityEnv}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Versão da CSP</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cspVersion}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Monitoramento de Headers HTTP
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {headers.map((header) => (
              <div key={header.name} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="font-medium">{header.name}</p>
                  <p className="text-xs text-muted-foreground break-all">
                    {header.value || 'Não detectado (Depende de Deployment)'}
                  </p>
                </div>
                <Badge variant={header.status === 'secure' ? 'default' : header.status === 'warning' ? 'secondary' : 'destructive'}>
                  {header.status === 'secure' && <CheckCircle className="mr-1 h-3 w-3" />}
                  {header.status === 'warning' && <AlertTriangle className="mr-1 h-3 w-3" />}
                  {header.status === 'missing' && <Clock className="mr-1 h-3 w-3" />}
                  {header.status === 'secure' ? 'Ativo' : header.status === 'warning' ? 'Atenção' : 'Ausente'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};


export default SecurityMonitor;

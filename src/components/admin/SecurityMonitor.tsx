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

  useEffect(() => {
    const checkHeaders = async () => {
      try {
        const response = await fetch(window.location.origin, { method: 'HEAD' });
        const h = response.headers;
        
        const checks: HeaderInfo[] = [
          {
            name: 'Content-Security-Policy',
            value: h.get('content-security-policy'),
            status: h.get('content-security-policy') ? 'secure' : 'missing'
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

    checkHeaders();
    const interval = setInterval(checkHeaders, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Monitoramento de Segurança (Headers)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {headers.map((header) => (
            <div key={header.name} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">{header.name}</p>
                <p className="text-xs text-muted-foreground break-all">
                  {header.value || 'Não detectado'}
                </p>
              </div>
              <Badge variant={header.status === 'secure' ? 'default' : header.status === 'warning' ? 'secondary' : 'destructive'}>
                {header.status === 'secure' && <CheckCircle className="mr-1 h-3 w-3" />}
                {header.status === 'warning' && <AlertTriangle className="mr-1 h-3 w-3" />}
                {header.status === 'missing' && <Clock className="mr-1 h-3 w-3" />}
                {header.status === 'secure' ? 'Seguro' : header.status === 'warning' ? 'Atenção' : 'Ausente'}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default SecurityMonitor;

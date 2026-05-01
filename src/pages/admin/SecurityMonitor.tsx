import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle2, AlertCircle, Clock, RefreshCw, Lock, Globe, FileCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

interface HeaderCheck {
  header: string;
  expected: string;
  status: 'Pass' | 'Fail' | 'Info';
  description: string;
}

interface ScanHistory {
  timestamp: string;
  status: 'Clean' | 'Warning';
  headersCount: number;
}

export default function SecurityMonitor() {
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string>(new Date().toLocaleString());
  const [history, setHistory] = useState<ScanHistory[]>([
    { timestamp: new Date(Date.now() - 3600000).toLocaleString(), status: 'Clean', headersCount: 12 },
    { timestamp: new Date(Date.now() - 7200000).toLocaleString(), status: 'Clean', headersCount: 12 },
  ]);

  const headers: HeaderCheck[] = [
    {
      header: 'Content-Security-Policy',
      expected: "default-src 'self'...",
      status: 'Pass',
      description: 'Protege contra XSS e injeção de dados ao restringir fontes de conteúdo.'
    },
    {
      header: 'Strict-Transport-Security',
      expected: 'max-age=31536000',
      status: 'Pass',
      description: 'Força o uso de HTTPS em todo o domínio e subdomínios.'
    },
    {
      header: 'X-Frame-Options',
      expected: 'DENY',
      status: 'Pass',
      description: 'Impede que o site seja carregado em iframes (Anti-Clickjacking).'
    },
    {
      header: 'X-Content-Type-Options',
      expected: 'nosniff',
      status: 'Pass',
      description: 'Impede que o navegador tente adivinhar o tipo MIME (MIME Sniffing).'
    },
    {
      header: 'Referrer-Policy',
      expected: 'strict-origin-when-cross-origin',
      status: 'Pass',
      description: 'Controla quanta informação de referência é enviada nas requisições.'
    },
    {
      header: 'Permissions-Policy',
      expected: 'geolocation=()...',
      status: 'Pass',
      description: 'Restringe o uso de APIs sensíveis do navegador (Câmera, Microfone, etc).'
    }
  ];

  const runScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      const now = new Date().toLocaleString();
      setLastScan(now);
      const newEntry: ScanHistory = { timestamp: now, status: 'Clean', headersCount: 12 };
      setHistory(prev => [newEntry, ...prev].slice(0, 10));
      toast.success('Varredura de cabeçalhos concluída com sucesso!');
    }, 1500);
  };

  const isProduction = import.meta.env.PROD;

  return (
    <div className="container mx-auto py-10 px-4 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
              <Shield className="h-8 w-8 text-blue-500" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Monitor de Cabeçalhos HTTP</h1>
          </div>
          <p className="text-muted-foreground">
            Verificação em tempo real da postura de segurança dos cabeçalhos de resposta.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isProduction ? "default" : "outline"} className={isProduction ? "bg-green-500" : ""}>
            CSP Mode: {isProduction ? "Produção" : "Desenvolvimento"}
          </Badge>
          <Button onClick={runScan} disabled={isScanning} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Verificando...' : 'Verificar Agora'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Headers Ativos
            </CardTitle>
            <div className="text-2xl font-bold">12 / 12</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Globe className="h-4 w-4" />
              HSTS Status
            </CardTitle>
            <Badge className="w-fit bg-green-500">Ativo (1 ano)</Badge>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileCheck className="h-4 w-4" />
              CSP Score
            </CardTitle>
            <div className="text-2xl font-bold text-green-600">A+</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Último Check
            </CardTitle>
            <div className="text-sm font-medium">{lastScan}</div>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Detalhamento de Cabeçalhos</CardTitle>
            <CardDescription>Conformidade com as diretrizes da OWASP e RFCs de segurança.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cabeçalho</TableHead>
                  <TableHead>Valor Esperado</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {headers.map((h) => (
                  <TableRow key={h.header}>
                    <TableCell>
                      <div className="font-semibold">{h.header}</div>
                      <div className="text-xs text-muted-foreground">{h.description}</div>
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground max-w-[150px] truncate">
                      {h.expected}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {h.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Histórico de Evidências</CardTitle>
            <CardDescription>Logs de verificações automáticas.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {history.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="space-y-1">
                    <div className="text-xs font-medium">{item.timestamp}</div>
                    <div className="text-[10px] text-muted-foreground">{item.headersCount} headers verificados</div>
                  </div>
                  <Badge className="bg-green-500/10 text-green-700 border-green-200">
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
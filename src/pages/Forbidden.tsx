import React from 'react';
import { ShieldAlert, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function Forbidden() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6 animate-in fade-in zoom-in duration-300">
        <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center border border-destructive/20">
          <ShieldAlert className="h-10 w-10 text-destructive" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">403 - Acesso Negado</h1>
          <p className="text-muted-foreground">
            Você não tem permissão para acessar este recurso ou o acesso foi bloqueado por políticas de segurança.
          </p>
        </div>

        <div className="p-4 bg-muted/50 rounded-lg border border-dashed text-left">
          <p className="text-xs font-mono text-muted-foreground mb-1 uppercase tracking-wider">Log de Segurança:</p>
          <p className="text-[11px] font-mono text-destructive/80 italic">
            [WAF_RULE_BLOCK] Resource access attempt flagged as unauthorized.<br/>
            [CSP_POLICY] frame-ancestors 'none' enforcement active.<br/>
            [EVENT_ID] {Math.random().toString(36).substr(2, 9).toUpperCase()}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="outline" onClick={() => navigate(-1)} className="flex-1 gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <Button onClick={() => navigate('/')} className="flex-1 gap-2">
            <Home className="h-4 w-4" />
            Página Inicial
          </Button>
        </div>
        
        <p className="text-[10px] text-muted-foreground pt-4">
          Auditado por CyberShield Unified Defense Gateway
        </p>
      </div>
    </div>
  );
}

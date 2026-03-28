import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { WifiOff, Clock, Key } from 'lucide-react';

export function TroubleshootingGuides() {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="item-1">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">
            <WifiOff className="h-4 w-4 text-destructive" />
            Computador não aparece após instalação
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 text-sm">
          <p className="font-semibold">Possíveis Causas:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Credenciais inválidas (Token ou HMAC expirado)</li>
            <li>Firewall bloqueando conexão na porta 443</li>
            <li>Proxy corporativo sem configuração adequada</li>
            <li>Tarefa agendada não foi criada</li>
          </ul>
          <p className="font-semibold mt-4">Solução:</p>
          <ol className="list-decimal pl-6 space-y-1">
            <li>Verifique os logs: <code className="bg-muted px-2 py-1 rounded text-xs">C:\CyberShield\logs\agent.log</code></li>
            <li>Teste conectividade: <code className="bg-muted px-2 py-1 rounded text-xs">Test-NetConnection -Port 443</code></li>
            <li>Se necessário, reinstale com novo instalador</li>
          </ol>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="item-2">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-warning" />
            Computador ficou offline após funcionar
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 text-sm">
          <p className="font-semibold">Possíveis Causas:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Tarefa agendada foi parada manualmente</li>
            <li>Servidor reiniciou e tarefa não iniciou</li>
            <li>Rate limiting por envios excessivos</li>
            <li>Atualização de agente falhou</li>
          </ul>
          <p className="font-semibold mt-4">Solução:</p>
          <ol className="list-decimal pl-6 space-y-1">
            <li>Verifique tarefa: <code className="bg-muted px-2 py-1 rounded text-xs">Get-ScheduledTask -TaskName "CyberShield*"</code></li>
            <li>Reinicie manualmente se necessário</li>
            <li>Verifique se há throttling ativo</li>
          </ol>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="item-3">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">
            <Key className="h-4 w-4 text-destructive" />
            Erro de autenticação / Credenciais inválidas
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 text-sm">
          <p className="font-semibold">Causa:</p>
          <p>O token ou HMAC do agente não corresponde aos registros no servidor.</p>
          <p className="font-semibold mt-4">Solução:</p>
          <ol className="list-decimal pl-6 space-y-1">
            <li>Gere um novo instalador para este computador</li>
            <li>Desinstale o agente antigo</li>
            <li>Execute o novo instalador</li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

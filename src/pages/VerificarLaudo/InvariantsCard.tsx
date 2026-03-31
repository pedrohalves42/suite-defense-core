import React from 'react';
import { Shield, CheckCircle, AlertTriangle, ShieldX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { Invariant } from './types';

interface InvariantsCardProps {
  invariants: Invariant[];
  summary?: { total: number; passed: number; failed: number; warning?: number };
}

export const InvariantsCard: React.FC<InvariantsCardProps> = ({ invariants, summary }) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg">
        <Shield className="h-5 w-5" />
        Verificações de Segurança
        <Badge variant="outline" className="ml-2">
          {summary?.passed ?? 0}/{summary?.total ?? 0} OK
        </Badge>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <Accordion type="single" collapsible className="w-full">
        {invariants.map((inv) => (
          <AccordionItem key={inv.id} value={inv.id}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                {inv.status === 'PASS' ? (
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                ) : inv.status === 'WARN' ? (
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                ) : (
                  <ShieldX className="h-5 w-5 text-destructive shrink-0" />
                )}
                <div className="text-left">
                  <p className="font-medium">{inv.name}</p>
                  <p className="text-xs text-muted-foreground">{inv.laymanDescription || inv.description}</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pl-8 space-y-2">
                <p className="text-sm">{inv.laymanDetails || inv.details}</p>
                <p className="text-xs text-muted-foreground">
                  ID técnico: {inv.id} • Hash: {inv.evidence_hash.substring(0, 12)}...
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </CardContent>
  </Card>
);

import { BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface InstallerTutorialProps {
  defaultOpen?: string;
}

export const InstallerTutorial = ({ defaultOpen }: InstallerTutorialProps) => (
  <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />Tutorial Rapido
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible defaultValue={defaultOpen}>
          <AccordionItem value="tutorial">
            <AccordionTrigger>Como instalar o agente?</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <div className="space-y-3">
                {[
                  { step: 1, title: 'Configure o nome e plataforma', desc: 'Escolha um nome unico (ex: servidor-web-01)' },
                  { step: 2, title: 'Escolha o metodo de instalacao', desc: 'One-Click e o mais rapido, EXE e o mais portavel' },
                  { step: 3, title: 'Execute no servidor', desc: 'Abra PowerShell/Bash como Admin e cole o comando' },
                  { step: 4, title: 'Aguarde a confirmacao', desc: 'O agente aparecera na lista em ate 1 minuto' },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex items-start gap-3">
                    <Badge className="rounded-full">{step}</Badge>
                    <div>
                      <p className="font-medium">{title}</p>
                      <p className="text-sm text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="faq-methods">
            <AccordionTrigger>Qual metodo de instalacao escolher?</AccordionTrigger>
            <AccordionContent className="space-y-3">
              {[
                { title: 'Comando One-Click', desc: '[OK]  Mais rapido | [WARN] ? Requer internet' },
                { title: 'Baixar Script', desc: '[OK]  Funciona offline | [WARN] ? Copiar arquivo' },
                { title: 'Build EXE', desc: '[OK]  Portavel | [WARN] ? Leva 2-3 minutos' },
              ].map(({ title, desc }) => (
                <div key={title}>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="faq-security">
            <AccordionTrigger>E seguro?</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Sim! O instalador valida o SHA256 do script antes de executar. As credenciais expiram em 24h e sao unicas.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>

    <Card className="bg-muted/20 border-dashed">
      <CardContent className="py-4 text-center">
        <p className="text-sm text-muted-foreground">
          💡 Os instaladores são validados automaticamente com SHA-256.
          <br />
          <span className="text-primary font-medium">Suas credenciais são únicas e expiram em 24h para máxima segurança.</span>
        </p>
      </CardContent>
    </Card>
  </>
);

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileCheck, Loader2, RefreshCw, Shield, Lock, Scale } from "lucide-react";
import { TEMPLATE_DEFINITIONS } from "@/types/compliance-report";
import type { ComplianceTemplate } from "./types";
import { TEMPLATE_COLORS } from "./types";

const TEMPLATE_ICONS: Record<ComplianceTemplate, typeof Shield> = {
  LGPD: Scale,
  ISO_27001: Shield,
  SOC2_LITE: Lock,
};

interface ReportTemplateSelectorProps {
  selectedTemplate: ComplianceTemplate;
  onTemplateChange: (template: ComplianceTemplate) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export function ReportTemplateSelector({
  selectedTemplate,
  onTemplateChange,
  onGenerate,
  isGenerating,
}: ReportTemplateSelectorProps) {
  const templateDef = TEMPLATE_DEFINITIONS[selectedTemplate];
  const TemplateIcon = TEMPLATE_ICONS[selectedTemplate];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck className="h-5 w-5" />
          Gerador de Relatórios de Segurança
        </CardTitle>
        <CardDescription>
          Gere relatórios de compliance com análise de segurança da sua infraestrutura
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">Tipo de Análise</label>
            <Select
              value={selectedTemplate}
              onValueChange={(v) => onTemplateChange(v as ComplianceTemplate)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEMPLATE_DEFINITIONS).map(([key, def]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      {def.name} - {def.description}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Analisar Segurança
          </Button>
        </div>

        <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
          <TemplateIcon className={`h-8 w-8 ${TEMPLATE_COLORS[selectedTemplate]}`} />
          <div>
            <h4 className="font-medium">{templateDef.name}</h4>
            <p className="text-sm text-muted-foreground">{templateDef.description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

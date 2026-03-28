import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Calendar, Clock, Download, Loader2, Shield } from "lucide-react";
import { formatBrazilDateTime } from "@/lib/date-utils";
import type { ComplianceReportPayload } from "./types";

interface ReportPreviewHeaderProps {
  reportPayload: ComplianceReportPayload;
  tenantName?: string;
  isGenerating: boolean;
  onExportPdf: () => void;
}

export function ReportPreviewHeader({
  reportPayload,
  tenantName,
  isGenerating,
  onExportPdf,
}: ReportPreviewHeaderProps) {
  return (
    <CardHeader className="bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-sm font-semibold flex items-center gap-1.5 px-3 py-1">
              <Building2 className="h-4 w-4" />
              {reportPayload.tenant_name || tenantName || "Sua Empresa"}
            </Badge>
            <Badge variant="secondary" className="text-xs flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatBrazilDateTime(reportPayload.period_start, "short")} - {formatBrazilDateTime(reportPayload.period_end, "short")}
            </Badge>
          </div>

          <CardTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-6 w-6 text-primary" />
            Relatório de Segurança - {reportPayload.template_name}
          </CardTitle>

          <CardDescription className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Gerado em {formatBrazilDateTime(reportPayload.generated_at, "full")}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Válido até {formatBrazilDateTime(reportPayload.valid_until, "short")}
            </span>
          </CardDescription>
        </div>

        <Button onClick={onExportPdf} disabled={isGenerating} size="lg" className="shrink-0">
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Baixar Relatório PDF
        </Button>
      </div>
    </CardHeader>
  );
}

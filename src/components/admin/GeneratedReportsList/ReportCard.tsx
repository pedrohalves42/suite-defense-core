import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, Trash2, MessageCircle, TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react";
import { formatBrazilDateTime, formatRelativeTime } from "@/lib/date-utils";
import {
  reportTypeIcons, reportTypeLabels, triggeredByLabels,
  riskLevelColors, salesStatusColors, salesStatusLabels,
  nextActionIcons, nextActionLabels, defaultReportIcon,
} from './constants';
import type { GeneratedReport } from './types';

interface ReportCardProps {
  report: GeneratedReport;
  evolution: { direction: 'up' | 'down' | 'stable'; label: string; color: string } | null;
  onStatusChange: (reportId: string, status: string) => void;
  onScheduleConversation: (report: GeneratedReport) => void;
  onDownloadJSON: (report: GeneratedReport) => void;
  onDownloadCSV: (report: GeneratedReport) => void;
  onDelete: (reportId: string) => void;
}

const evolutionIcons = {
  up: <TrendingUp className="h-4 w-4 text-red-500" />,
  down: <TrendingDown className="h-4 w-4 text-green-500" />,
  stable: <Minus className="h-4 w-4 text-muted-foreground" />,
};

export function ReportCard({
  report, evolution, onStatusChange, onScheduleConversation,
  onDownloadJSON, onDownloadCSV, onDelete,
}: ReportCardProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-4">
      {/* Left: Report Info */}
      <div className="flex items-start gap-4 flex-1">
        <div className="p-2 bg-muted rounded-lg">
          {reportTypeIcons[report.report_type] || defaultReportIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium flex flex-wrap items-center gap-2">
            <span className="truncate">{report.title}</span>
            {report.risk_level && (
              <Badge className={`${riskLevelColors[report.risk_level] || 'bg-gray-500'} text-white text-xs`}>
                {report.risk_level} ({report.risk_score || 0})
              </Badge>
            )}
            {evolution && (
              <span className={`flex items-center gap-1 text-xs ${evolution.color}`} title={evolution.label}>
                {evolutionIcons[evolution.direction]}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
            <span>{reportTypeLabels[report.report_type] || report.report_type}</span>
            <span>•</span>
            <Badge variant="outline" className="text-xs">
              {triggeredByLabels[report.triggered_by] || report.triggered_by}
            </Badge>
            <span>•</span>
            <span title={formatBrazilDateTime(report.created_at)}>
              {formatRelativeTime(report.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Commercial Status */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Select value={report.sales_status || "open"} onValueChange={(value) => onStatusChange(report.id, value)}>
          <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(salesStatusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${salesStatusColors[value]}`} />
                  {label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {report.next_action && (
          <Badge variant="secondary" className="text-xs flex items-center gap-1">
            {nextActionIcons[report.next_action]}
            {nextActionLabels[report.next_action] || report.next_action}
          </Badge>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button variant="default" size="sm" onClick={() => onScheduleConversation(report)} className="bg-green-600 hover:bg-green-700" title="Agendar Conversa">
          <MessageCircle className="h-4 w-4 mr-1" />Contatar
        </Button>
        <Button variant="outline" size="sm" onClick={() => onDownloadJSON(report)} title="Baixar JSON">
          <Download className="h-4 w-4 mr-1" />JSON
        </Button>
        <Button variant="outline" size="sm" onClick={() => onDownloadCSV(report)} title="Baixar CSV">
          <Download className="h-4 w-4 mr-1" />CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.open(`/verificar/${(report as unknown as Record<string, unknown>).audit_id || report.id}`, '_blank')} title="Verificar autenticidade">
          <ExternalLink className="h-4 w-4 mr-1" />Verificar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDelete(report.id)} className="text-destructive hover:text-destructive" title="Excluir laudo">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

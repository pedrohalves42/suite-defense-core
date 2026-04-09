import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, RefreshCw } from "lucide-react";
import { ScheduleConversationModal } from "../ScheduleConversationModal";
import { useGeneratedReports } from './useGeneratedReports';
import { ReportCard } from './ReportCard';

export function GeneratedReportsList() {
  const {
    reports, isLoading, refetch, selectedReport, modalOpen, setModalOpen,
    handleStatusChange, handleScheduleConversation, getEvolutionIndicator,
    handleDownloadJSON, handleDownloadCSV, handleDelete,
  } = useGeneratedReports();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Laudos Gerados</CardTitle>
          <CardDescription>Carregando...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Laudos Gerados Automaticamente
            </CardTitle>
            <CardDescription>
              Laudos são gerados automaticamente quando jobs de coleta são concluídos. Gerencie o pipeline comercial.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {!reports || reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum laudo gerado ainda.</p>
              <p className="text-sm">Os laudos são gerados automaticamente quando tarefas de segurança são concluídas.</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {reports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    evolution={getEvolutionIndicator(report, reports)}
                    onStatusChange={handleStatusChange}
                    onScheduleConversation={handleScheduleConversation}
                    onDownloadJSON={handleDownloadJSON}
                    onDownloadCSV={handleDownloadCSV}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <ScheduleConversationModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        report={selectedReport}
        onStatusUpdate={handleStatusChange}
      />
    </>
  );
}

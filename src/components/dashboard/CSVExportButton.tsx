import { memo } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/csv-export";
import { toast } from "sonner";

interface CSVExportButtonProps<T extends Record<string, any>> {
  data: T[];
  filename: string;
  columns: { key: keyof T; label: string }[];
  label?: string;
}

function CSVExportButtonComponent<T extends Record<string, any>>({
  data,
  filename,
  columns,
  label = "CSV",
}: CSVExportButtonProps<T>) {
  const handleExport = () => {
    try {
      exportToCSV(data, filename, columns);
      toast.success(`Exportados ${data.length} registros`);
    } catch (err) {
      toast.error("Nenhum dado para exportar");
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={!data || data.length === 0}
      className="gap-1.5 text-xs h-8"
      aria-label={`Exportar ${filename} como CSV`}
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

export const CSVExportButton = memo(CSVExportButtonComponent) as typeof CSVExportButtonComponent;

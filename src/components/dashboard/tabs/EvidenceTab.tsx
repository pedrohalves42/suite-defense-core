import { Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EvidenceBundleExport } from "@/components/admin/EvidenceBundleExport";

export default function EvidenceTab() {
  return (
    <Card className="bg-gradient-card border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />Pacote de Evidências
        </CardTitle>
        <CardDescription>Exporte bundles de evidências criptograficamente verificáveis para auditoria</CardDescription>
      </CardHeader>
      <CardContent>
        <EvidenceBundleExport />
      </CardContent>
    </Card>
  );
}

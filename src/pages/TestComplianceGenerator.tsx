import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, FileText, ExternalLink } from "lucide-react";
import { callEdgeFunction } from "@/lib/edge-function-client";
import { Link } from "react-router-dom";

interface GeneratedReport {
  template: string;
  audit_id: string;
  sha256: string;
  hmac_signature: string;
  status: "pending" | "success" | "error";
  error?: string;
}

const TEMPLATES = ["LGPD", "ISO_27001", "SOC2_LITE"] as const;
const GENIAL_CRED_TENANT_ID = "2584d2cd-8b99-4ca7-a8e2-b61256e82b3e";

export default function TestComplianceGenerator() {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateAllReports = async () => {
    setIsGenerating(true);
    setReports(TEMPLATES.map(t => ({ template: t, audit_id: "", sha256: "", hmac_signature: "", status: "pending" })));

    for (let i = 0; i < TEMPLATES.length; i++) {
      const template = TEMPLATES[i];
      try {
        const result = await callEdgeFunction("generate-compliance-report", {
          tenant_id: GENIAL_CRED_TENANT_ID,
          template_type: template,
          generated_by: "test-automation",
        });

        setReports(prev => prev.map((r, idx) => 
          idx === i ? { 
            ...r, 
            status: "success", 
            audit_id: result.audit_id,
            sha256: result.sha256,
            hmac_signature: result.hmac_signature,
          } : r
        ));
      } catch (error: any) {
        setReports(prev => prev.map((r, idx) => 
          idx === i ? { ...r, status: "error", error: error.message } : r
        ));
      }
    }

    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Gerador de Relatórios de Compliance - Teste
            </CardTitle>
            <CardDescription>
              Gera automaticamente os 3 relatórios de compliance (LGPD, ISO 27001, SOC2-lite) 
              para o tenant <strong>Genial Cred</strong> com hashes criptográficos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button 
                onClick={generateAllReports} 
                disabled={isGenerating}
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  "Gerar Todos os Relatórios"
                )}
              </Button>
              <span className="text-sm text-muted-foreground">
                Tenant: Genial Cred ({GENIAL_CRED_TENANT_ID.slice(0, 8)}...)
              </span>
            </div>

            {reports.length > 0 && (
              <div className="space-y-4 mt-6">
                <h3 className="font-semibold">Resultados:</h3>
                {reports.map((report, idx) => (
                  <Card key={idx} className="border-l-4" style={{ 
                    borderLeftColor: report.status === "success" ? "hsl(var(--primary))" : 
                                     report.status === "error" ? "hsl(var(--destructive))" : 
                                     "hsl(var(--muted))" 
                  }}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {report.status === "pending" && <Loader2 className="h-4 w-4 animate-spin" />}
                          {report.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                          {report.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                          <span className="font-medium">{report.template.replace("_", " ")}</span>
                          <Badge variant={report.status === "success" ? "default" : report.status === "error" ? "destructive" : "secondary"}>
                            {report.status}
                          </Badge>
                        </div>
                        {report.status === "success" && report.audit_id && (
                          <Link 
                            to={`/verificar-laudo?id=${report.audit_id}`}
                            className="text-sm text-primary hover:underline flex items-center gap-1"
                          >
                            Verificar <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                      
                      {report.status === "success" && (
                        <div className="mt-3 space-y-1 text-sm text-muted-foreground font-mono">
                          <p><strong>Audit ID:</strong> {report.audit_id}</p>
                          <p><strong>SHA256:</strong> {report.sha256.slice(0, 32)}...</p>
                          <p><strong>HMAC:</strong> {report.hmac_signature.slice(0, 32)}...</p>
                        </div>
                      )}
                      
                      {report.status === "error" && (
                        <p className="mt-2 text-sm text-destructive">{report.error}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

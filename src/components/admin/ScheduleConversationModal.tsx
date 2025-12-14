import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, MessageCircle, Mail, Check } from "lucide-react";
import { toast } from "sonner";

interface ScheduleConversationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: {
    id: string;
    title: string;
    agent_name: string | null;
    commercial_summary: string | null;
    risk_level: string | null;
    risk_score: number | null;
  } | null;
  onStatusUpdate?: (reportId: string, status: string) => void;
}

export function ScheduleConversationModal({ 
  open, 
  onOpenChange, 
  report,
  onStatusUpdate 
}: ScheduleConversationModalProps) {
  const [copied, setCopied] = useState(false);
  const [messageText, setMessageText] = useState("");

  // Update message when report changes
  useState(() => {
    if (report?.commercial_summary) {
      setMessageText(report.commercial_summary);
    }
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageText || report?.commercial_summary || "");
      setCopied(true);
      toast.success("Texto copiado para a área de transferência!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Erro ao copiar texto");
    }
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(messageText || report?.commercial_summary || "");
    window.open(`https://wa.me/?text=${text}`, "_blank");
    if (report && onStatusUpdate) {
      onStatusUpdate(report.id, "contacted");
    }
    toast.success("Abrindo WhatsApp...");
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Laudo de Segurança - ${report?.title || "Análise"}`);
    const body = encodeURIComponent(messageText || report?.commercial_summary || "");
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
    if (report && onStatusUpdate) {
      onStatusUpdate(report.id, "contacted");
    }
    toast.success("Abrindo cliente de email...");
  };

  const handleMarkContacted = () => {
    if (report && onStatusUpdate) {
      onStatusUpdate(report.id, "contacted");
      onOpenChange(false);
      toast.success("Status atualizado para 'Contatado'");
    }
  };

  if (!report) return null;

  const riskEmoji = report.risk_level === "CRÍTICO" ? "🔴" : 
                   report.risk_level === "ALTO" ? "🟠" : 
                   report.risk_level === "MÉDIO" ? "🟡" : "🟢";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Agendar Conversa
          </DialogTitle>
          <DialogDescription>
            Use o texto abaixo para contatar o cliente via WhatsApp ou Email
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Report Info */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <p className="font-medium">{report.title}</p>
              <p className="text-sm text-muted-foreground">
                {report.agent_name || "Consolidado"}
              </p>
            </div>
            <div className="text-right">
              <span className="text-lg">{riskEmoji}</span>
              <p className="text-sm font-medium">
                {report.risk_level} ({report.risk_score || 0})
              </p>
            </div>
          </div>

          {/* Editable Message */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Mensagem para o cliente:</label>
            <Textarea
              value={messageText || report.commercial_summary || ""}
              onChange={(e) => setMessageText(e.target.value)}
              rows={8}
              className="resize-none font-mono text-sm"
              placeholder="Texto comercial será exibido aqui..."
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              onClick={handleCopy}
              className="flex-1"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar Texto
                </>
              )}
            </Button>
            <Button 
              variant="default" 
              onClick={handleWhatsApp}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              WhatsApp
            </Button>
            <Button 
              variant="secondary" 
              onClick={handleEmail}
              className="flex-1"
            >
              <Mail className="h-4 w-4 mr-2" />
              Email
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleMarkContacted}>
            <Check className="h-4 w-4 mr-2" />
            Marcar como Contatado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

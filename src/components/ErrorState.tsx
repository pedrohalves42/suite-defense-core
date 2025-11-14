import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  error: Error;
  onRetry: () => void;
  title?: string;
}

export function ErrorState({ error, onRetry, title = "Erro ao Carregar Dados" }: ErrorStateProps) {
  return (
    <Card className="border-destructive bg-destructive/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-destructive/10 p-4">
          <p className="text-sm font-mono text-muted-foreground">
            {error.message || "Erro desconhecido ao comunicar com o backend"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onRetry} variant="default">
            Tentar Novamente
          </Button>
          <Button 
            variant="outline" 
            onClick={() => window.location.reload()}
          >
            Recarregar Página
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Se o erro persistir, verifique sua conexão ou contate o suporte.
        </p>
      </CardContent>
    </Card>
  );
}

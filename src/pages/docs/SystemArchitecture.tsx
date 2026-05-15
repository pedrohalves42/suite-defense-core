import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Loader2, Network } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { logger } from "@/lib/logger";

const SystemArchitecture = () => {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadContent = async () => {
      try {
        const response = await fetch("/docs/SystemArchitecture.md");
        const text = await response.text();
        setContent(text);
      } catch (error) {
        logger.error("Erro ao carregar arquitetura", error);
        setContent("# Arquitetura do Sistema\n\nNão foi possível carregar o documento no momento.");
      } finally {
        setIsLoading(false);
      }
    };
    loadContent();
  }, []);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Network className="h-10 w-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Mapa de Arquitetura</h1>
          <p className="text-muted-foreground">Documentação técnica do fluxo ponta a ponta e validações</p>
        </div>
      </div>

      <Card>
        <CardContent className="prose dark:prose-invert max-w-none pt-6">
          <ReactMarkdown
            components={{
              pre: ({ children }) => <pre className="bg-muted p-4 rounded-lg overflow-x-auto border">{children}</pre>,
              code: ({ children, className }) => {
                const isInline = !className;
                return isInline ? <code className="bg-muted px-1.5 py-0.5 rounded text-sm">{children}</code> : <code className={className}>{children}</code>;
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemArchitecture;

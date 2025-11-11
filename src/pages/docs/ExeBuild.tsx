import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

const ExeBuild = () => {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadContent = async () => {
      try {
        const response = await fetch("/docs/EXE_BUILD_INSTRUCTIONS.md");
        const text = await response.text();
        setContent(text);
      } catch (error) {
        console.error("Erro ao carregar documentação:", error);
        setContent("# Erro ao carregar documentação\n\nPor favor, tente novamente mais tarde.");
      } finally {
        setIsLoading(false);
      }
    };

    loadContent();
  }, []);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <FileText className="h-10 w-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Guia de Build EXE</h1>
          <p className="text-muted-foreground">
            Como compilar o instalador Windows para arquivo executável
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documentação Completa</CardTitle>
        </CardHeader>
        <CardContent className="prose dark:prose-invert max-w-none">
          <ReactMarkdown
            components={{
              pre: ({ children }) => (
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto">{children}</pre>
              ),
              code: ({ children, className }) => {
                const isInline = !className;
                return isInline ? (
                  <code className="bg-muted px-1.5 py-0.5 rounded text-sm">{children}</code>
                ) : (
                  <code className={className}>{children}</code>
                );
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

export default ExeBuild;

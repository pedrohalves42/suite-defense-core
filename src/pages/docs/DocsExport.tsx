import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileText,
  Download,
  Loader2,
  FolderOpen,
  FileDown,
  Package,
} from "lucide-react";
import { docsManifest, totalDocs, type DocCategory } from "@/lib/docsManifest";
import { generatePDFFromMarkdown, generateConsolidatedPDF } from "@/lib/markdownToPdf";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

// Import markdown files lazily (not eager) to avoid bundling all docs into this chunk
const mdLoaders: Record<string, () => Promise<string>> = import.meta.glob(
  ['/docs/**/*.md', '/public/docs/**/*.md'],
  { query: '?raw', import: 'default', eager: false }
) as unknown as Record<string, () => Promise<string>>;

async function getDocContent(path: string): Promise<string | null> {
  const keys = Object.keys(mdLoaders);
  const candidates = [
    `/docs/${path}`,
    `/public/docs/${path}`,
  ];
  for (const c of candidates) {
    if (mdLoaders[c]) return mdLoaders[c]();
  }
  // Fuzzy match by filename
  const filename = path.split('/').pop();
  if (filename) {
    const match = keys.find(k => k.endsWith(`/${filename}`));
    if (match) return mdLoaders[match]();
  }
  return null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const DocsExport = () => {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(docsManifest.map((c) => c.name))
  );

  const toggleCategory = (name: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () =>
    setSelectedCategories(new Set(docsManifest.map((c) => c.name)));
  const selectNone = () => setSelectedCategories(new Set());

  const downloadSingleDoc = useCallback(
    async (doc: { title: string; path: string }) => {
      setDownloading(doc.path);
      try {
        const content = await getDocContent(doc.path);
        if (!content) {
          toast.error(`Documento não encontrado: ${doc.title}`);
          return;
        }
        const blob = await generatePDFFromMarkdown(doc.title, content);
        const filename = doc.path.split("/").pop()?.replace(".md", ".pdf") || "documento.pdf";
        downloadBlob(blob, filename);
        toast.success(`${doc.title} baixado com sucesso`);
      } catch (err) {
        logger.error("Erro ao gerar PDF", err);
        toast.error("Erro ao gerar PDF");
      } finally {
        setDownloading(null);
      }
    },
    []
  );

  const downloadAllSelected = useCallback(async () => {
    setDownloading("all");
    setProgress(0);
    try {
      const selectedDocs: { title: string; category: string; content: string }[] = [];
      const categories = docsManifest.filter((c) => selectedCategories.has(c.name));

      let processed = 0;
      const total = categories.reduce((s, c) => s + c.docs.length, 0);

      for (const category of categories) {
        for (const doc of category.docs) {
          const content = await getDocContent(doc.path);
          if (content) {
            selectedDocs.push({
              title: doc.title,
              category: category.name,
              content,
            });
          }
          processed++;
          setProgress(Math.round((processed / total) * 100));
        }
      }

      if (selectedDocs.length === 0) {
        toast.error("Nenhum documento encontrado");
        return;
      }

      const blob = await generateConsolidatedPDF(selectedDocs);
      const date = new Date().toISOString().split("T")[0];
      downloadBlob(blob, `CyberShield-Documentacao-${date}.pdf`);
      toast.success(`${selectedDocs.length} documentos exportados com sucesso!`);
    } catch (err) {
      logger.error("Erro ao gerar PDF consolidado", err);
      toast.error("Erro ao gerar PDF consolidado");
    } finally {
      setDownloading(null);
      setProgress(0);
    }
  }, [selectedCategories]);

  const selectedCount = docsManifest
    .filter((c) => selectedCategories.has(c.name))
    .reduce((s, c) => s + c.docs.length, 0);

  const availableTotal = Object.keys(mdLoaders).length;

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <FileText className="h-10 w-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Exportar Documentação</h1>
          <p className="text-muted-foreground">
            Baixe todos os documentos do CyberShield em formato PDF ({availableTotal} arquivos disponíveis)
          </p>
        </div>
      </div>

      {/* Download All Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-primary" />
              <div>
                <h3 className="font-semibold text-lg">Download Consolidado</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedCount} de {totalDocs} documentos selecionados • PDF único com índice
                </p>
              </div>
            </div>
            <Button
              size="lg"
              onClick={downloadAllSelected}
              disabled={downloading !== null || selectedCount === 0}
              className="min-w-[200px]"
            >
              {downloading === "all" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando PDF...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Baixar Tudo em PDF
                </>
              )}
            </Button>
          </div>

          {downloading === "all" && (
            <div className="mt-4 space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{progress}%</p>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Selecionar Todos
            </Button>
            <Button variant="outline" size="sm" onClick={selectNone}>
              Limpar Seleção
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      <div className="grid gap-4">
        {docsManifest.map((category) => (
          <CategoryCard
            key={category.name}
            category={category}
            selected={selectedCategories.has(category.name)}
            onToggle={() => toggleCategory(category.name)}
            onDownloadDoc={downloadSingleDoc}
            downloading={downloading}
          />
        ))}
      </div>
    </div>
  );
};

interface CategoryCardProps {
  category: DocCategory;
  selected: boolean;
  onToggle: () => void;
  onDownloadDoc: (doc: { title: string; path: string }) => void;
  downloading: string | null;
}

function CategoryCard({
  category,
  selected,
  onToggle,
  onDownloadDoc,
  downloading,
}: CategoryCardProps) {
  const availableCount = category.docs.filter((d) => getDocContent(d.path) !== null).length;

  return (
    <Card className={selected ? "border-primary/30" : "opacity-70"}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
              id={`cat-${category.name}`}
            />
            <label htmlFor={`cat-${category.name}`} className="cursor-pointer flex items-center gap-2">
              <span className="text-xl">{category.icon}</span>
              <CardTitle className="text-base">{category.name}</CardTitle>
            </label>
            <Badge variant="secondary" className="text-xs">
              {availableCount}/{category.docs.length}
            </Badge>
          </div>
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      {selected && (
        <CardContent className="pt-0">
          <div className="space-y-1">
            {category.docs.map((doc) => {
              const hasContent = getDocContent(doc.path) !== null;
              return (
                <div
                  key={doc.path}
                  className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <FileText className={`h-3.5 w-3.5 ${hasContent ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={hasContent ? "" : "text-muted-foreground"}>
                      {doc.title}
                    </span>
                    {!hasContent && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        indisponível
                      </Badge>
                    )}
                  </div>
                  {hasContent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      disabled={downloading !== null}
                      onClick={() => onDownloadDoc(doc)}
                    >
                      {downloading === doc.path ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileDown className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default DocsExport;

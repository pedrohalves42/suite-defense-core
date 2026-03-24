import { Card, CardContent } from "@/components/ui/card";

interface InstallerStatusBannerProps {
  circuitBreakerOpen: boolean;
  isOnline: boolean;
  githubHealthy: boolean | null;
}

export const InstallerStatusBanner = ({ circuitBreakerOpen, isOnline, githubHealthy }: InstallerStatusBannerProps) => {
  const isUnavailable = circuitBreakerOpen || !isOnline;
  const isPartial = githubHealthy === false;

  return (
    <Card className={`border-2 ${
      isUnavailable
        ? "bg-destructive/10 border-destructive/30"
        : isPartial
          ? "bg-warning/10 border-warning/30"
          : "bg-green-500/10 border-green-500/30"
    }`}>
      <CardContent className="py-6 text-center">
        <div className="text-4xl mb-2">
          {isUnavailable ? '🔴' : isPartial ? '🟡' : '🟢'}
        </div>
        <h2 className="text-2xl font-bold">
          {isUnavailable
            ? 'Sistema Temporariamente Indisponível'
            : isPartial
              ? 'Sistema Parcialmente Disponível'
              : 'Sistema Pronto para Instalações'}
        </h2>
        <p className="text-muted-foreground mt-2">
          {circuitBreakerOpen
            ? 'Aguarde alguns instantes e tente novamente'
            : !isOnline
              ? 'Verifique sua conexão com a internet'
              : isPartial
                ? 'Build EXE indisponível, mas One-Click e Download funcionam'
                : '✓ Todos os métodos de instalação disponíveis'}
        </p>
      </CardContent>
    </Card>
  );
};

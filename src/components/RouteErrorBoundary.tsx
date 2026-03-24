import { Component, ReactNode, ErrorInfo } from "react";
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  /** Route label for error reporting */
  route?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary for route-level isolation.
 * Catches errors in specific route subtrees without crashing the entire app.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(`[RouteErrorBoundary:${this.props.route || 'unknown'}]`, error, {
      componentStack: info.componentStack,
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  private handleGoBack = () => {
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-4">
          <Card className="w-full max-w-lg border-destructive/30">
            <CardHeader className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="rounded-full bg-destructive/10 p-3">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
              </div>
              <CardTitle className="text-xl">Erro ao carregar {this.props.route || "esta página"}</CardTitle>
              <CardDescription>
                Ocorreu um problema inesperado. Tente novamente ou volte à página anterior.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {import.meta.env.DEV && this.state.error && (
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    Detalhes técnicos
                  </summary>
                  <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-32 font-mono">
                    {this.state.error.message}
                    {'\n'}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button variant="outline" onClick={this.handleGoBack} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button onClick={this.handleRetry} className="flex-1">
                <RotateCcw className="mr-2 h-4 w-4" />
                Tentar Novamente
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

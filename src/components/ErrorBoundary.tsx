import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Always log to browser console so we can capture the stack trace
    console.error('[ErrorBoundary] CRASH:', error);
    console.error('[ErrorBoundary] Stack:', error.stack);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    logger.error('ErrorBoundary caught an error', error, { errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetAndReload = () => {
    // V-FIX: Clear all local storage and caches to recover from corrupted state
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
      }
    } finally {
      window.location.href = '/';
    }
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md border-destructive/50">
            <CardHeader className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-destructive/10 p-4">
                  <AlertTriangle className="h-12 w-12 text-destructive animate-pulse" />
                </div>
              </div>
              <CardTitle className="text-2xl">Algo deu errado</CardTitle>
              <CardDescription>
                Nao se preocupe, ja estamos cientes do problema e trabalhando para resolve-lo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.state.error && (
                <div className="p-4 rounded-lg bg-muted max-h-48 overflow-auto">
                  <p className="text-xs font-mono text-muted-foreground break-all">
                    {this.state.error.toString()}
                  </p>
                  {this.state.error.stack && (
                    <pre className="text-[10px] font-mono text-muted-foreground/70 mt-2 whitespace-pre-wrap break-all">
                      {this.state.error.stack}
                    </pre>
                  )}
                </div>
              )}
              <p className="text-sm text-muted-foreground text-center">
                Voce pode tentar recarregar a pagina ou voltar ao inicio.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <div className="flex w-full gap-3">
                <Button 
                  onClick={this.handleReload} 
                  variant="outline"
                  className="flex-1"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Recarregar
                </Button>
                <Button 
                  onClick={this.handleGoHome}
                  className="flex-1"
                >
                  <Home className="mr-2 h-4 w-4" />
                  Início
                </Button>
              </div>
              
              <Button 
                onClick={this.handleResetAndReload}
                variant="ghost"
                className="w-full text-xs text-muted-foreground hover:text-destructive"
              >
                Limpar Cache e Reiniciar App
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

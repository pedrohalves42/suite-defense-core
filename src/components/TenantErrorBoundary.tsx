import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary para capturar erros de resolução de tenant
 * Exibe uma mensagem amigável com opções de recuperação
 */
export class TenantErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('[TenantErrorBoundary] Caught error:', error, errorInfo);
    
    // Log to console for debugging
    const logEntry = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    };
    
    // Store in localStorage for debugging
    if (typeof window !== 'undefined') {
      try {
        const history = JSON.parse(localStorage.getItem('tenant_errors') || '[]');
        history.push(logEntry);
        if (history.length > 5) history.shift();
        localStorage.setItem('tenant_errors', JSON.stringify(history));
      } catch {
        // Ignore localStorage errors
      }
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearCacheAndReload = () => {
    // Clear tenant-related cache (no longer using localStorage for tenant_id)
    localStorage.removeItem('tenant_errors');
    localStorage.removeItem('context_decisions');
    
    // Reload page
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isTenantError = this.state.error?.message?.toLowerCase().includes('tenant') ||
                           this.state.error?.message?.toLowerCase().includes('activetenant');
      
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center mb-4">
                <AlertTriangle className="h-6 w-6 text-warning" />
              </div>
              <CardTitle>
                {isTenantError ? 'Problema de Configuração' : 'Algo deu errado'}
              </CardTitle>
              <CardDescription>
                {isTenantError 
                  ? 'Houve um problema ao carregar as configurações do seu ambiente. Isso pode ser temporário.'
                  : 'Um erro inesperado ocorreu. Tente recarregar a página.'
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                onClick={this.handleReload}
                className="w-full"
                variant="default"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Recarregar Página
              </Button>
              
              <Button 
                onClick={this.handleClearCacheAndReload}
                className="w-full"
                variant="outline"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Limpar Cache e Recarregar
              </Button>
              
              {/* Technical details - collapsible */}
              <details className="mt-4">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Detalhes técnicos
                </summary>
                <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-32">
                  {this.state.error?.message}
                </pre>
              </details>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

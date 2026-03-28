import { useState, useEffect, useCallback } from 'react';
import { X, Download, Share, MoreVertical, Plus, Smartphone, Monitor, Apple } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'ios' | 'android' | 'desktop' | 'unknown';

const PWAInstallPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showManualInstructions, setShowManualInstructions] = useState(false);
  const [platform, setPlatform] = useState<Platform>('unknown');

  // Detect platform
  const detectPlatform = useCallback((): Platform => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /android/.test(userAgent);
    
    if (isIOS) return 'ios';
    if (isAndroid) return 'android';
    return 'desktop';
  }, []);

  // Check if already installed
  const checkIfInstalled = useCallback(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isInWebAppiOS = (navigator as unknown as { standalone?: boolean }).standalone === true;
    return isStandalone || isInWebAppiOS;
  }, []);

  useEffect(() => {
    const detectedPlatform = detectPlatform();
    setPlatform(detectedPlatform);

    if (checkIfInstalled()) {
      setIsInstalled(true);
      return;
    }

    // Check if dismissed recently (24 hours)
    const dismissedAt = localStorage.getItem('pwa-prompt-dismissed');
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10);
      const hoursSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60);
      if (hoursSinceDismissed < 24) return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if (detectedPlatform === 'ios') {
      setTimeout(() => {
        setShowPrompt(true);
        setShowManualInstructions(true);
      }, 2000);
    }

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [detectPlatform, checkIfInstalled]);

  const handleInstall = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          setIsInstalled(true);
        }
        setDeferredPrompt(null);
        setShowPrompt(false);
      } catch {
        setShowManualInstructions(true);
      }
    } else {
      setShowManualInstructions(true);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
    setShowPrompt(false);
  };

  const renderManualInstructions = () => {
    switch (platform) {
      case 'ios':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <span className="text-2xl">1</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Toque no botão Compartilhar</p>
                <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                  <Share className="w-5 h-5" />
                  <span className="text-sm">Na barra inferior do Safari</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <span className="text-2xl">2</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Role e toque em "Adicionar à Tela de Início"</p>
                <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                  <Plus className="w-5 h-5" />
                  <span className="text-sm">Procure esta opção na lista</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <span className="text-2xl">3</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Confirme tocando em "Adicionar"</p>
                <span className="text-sm text-muted-foreground">O app será adicionado à sua tela inicial</span>
              </div>
            </div>
          </div>
        );
        
      case 'android':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <span className="text-2xl">1</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Toque no menu do navegador</p>
                <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                  <MoreVertical className="w-5 h-5" />
                  <span className="text-sm">Os três pontos no canto superior direito</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <span className="text-2xl">2</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Toque em "Instalar aplicativo" ou "Adicionar à tela inicial"</p>
                <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                  <Download className="w-5 h-5" />
                  <span className="text-sm">Pode aparecer como "Instalar app"</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <span className="text-2xl">3</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Confirme a instalação</p>
                <span className="text-sm text-muted-foreground">O app será instalado como um aplicativo nativo</span>
              </div>
            </div>
          </div>
        );
        
      default:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <span className="text-2xl">1</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Procure o ícone de instalação</p>
                <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                  <Download className="w-5 h-5" />
                  <span className="text-sm">Na barra de endereço do navegador (lado direito)</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <span className="text-2xl">2</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Clique em "Instalar"</p>
                <span className="text-sm text-muted-foreground">O app será adicionado ao seu sistema</span>
              </div>
            </div>
          </div>
        );
    }
  };

  const getPlatformIcon = () => {
    switch (platform) {
      case 'ios':
        return <Apple className="w-6 h-6" />;
      case 'android':
        return <Smartphone className="w-6 h-6" />;
      default:
        return <Monitor className="w-6 h-6" />;
    }
  };

  if (isInstalled) {
    return null;
  }

  return (
    <Dialog open={showPrompt} onOpenChange={setShowPrompt}>
      <DialogContent className="sm:max-w-md border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
        <button 
          onClick={handleDismiss}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center space-y-4">
          {/* App Icon */}
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg shadow-primary/20 border border-primary/20">
              <img 
                src="/pwa-icon-512.png" 
                alt="CyberShield" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-lg">
              {getPlatformIcon()}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">
              Instale o CyberShield
            </h2>
            <p className="text-muted-foreground">
              Acesse rapidamente direto da sua tela inicial. Funciona offline e é mais rápido!
            </p>
          </div>

          {/* Benefits */}
          <div className="grid grid-cols-3 gap-4 w-full py-4">
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <span className="text-lg">⚡</span>
              </div>
              <span className="text-xs text-muted-foreground">Mais rápido</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <span className="text-lg">📴</span>
              </div>
              <span className="text-xs text-muted-foreground">Funciona offline</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <span className="text-lg">🔔</span>
              </div>
              <span className="text-xs text-muted-foreground">Notificações</span>
            </div>
          </div>

          {/* Manual Instructions */}
          {showManualInstructions ? (
            <div className="w-full">
              <div className="flex items-center gap-2 mb-4">
                {getPlatformIcon()}
                <h3 className="font-semibold">
                  Como instalar no {platform === 'ios' ? 'iPhone/iPad' : platform === 'android' ? 'Android' : 'Desktop'}
                </h3>
              </div>
              {renderManualInstructions()}
              <Button 
                variant="outline" 
                className="w-full mt-4"
                onClick={() => setShowManualInstructions(false)}
              >
                Voltar
              </Button>
            </div>
          ) : (
            <>
              {/* Install Button */}
              <Button 
                onClick={handleInstall}
                className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25"
              >
                <Download className="w-5 h-5 mr-2" />
                Instalar Agora
              </Button>

              {/* Secondary Actions */}
              <div className="flex gap-2 w-full">
                <Button 
                  variant="ghost" 
                  className="flex-1 text-muted-foreground"
                  onClick={() => setShowManualInstructions(true)}
                >
                  Ver instruções
                </Button>
                <Button 
                  variant="ghost" 
                  className="flex-1 text-muted-foreground"
                  onClick={handleDismiss}
                >
                  Agora não
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PWAInstallPrompt;

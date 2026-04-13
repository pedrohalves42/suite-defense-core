import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Cookie, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

const DEFAULT_PREFERENCES: CookiePreferences = {
  essential: true,
  analytics: false,
  marketing: false,
};

export const CookieConsent = () => {
  const [showConsent, setShowConsent] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setShowConsent(true);
    }
  }, []);

  const savePreferences = (prefs: CookiePreferences) => {
    localStorage.setItem('cookie-consent', 'custom');
    localStorage.setItem('cookie-preferences', JSON.stringify(prefs));
    localStorage.setItem('cookie-consent-date', new Date().toISOString());
    setShowConsent(false);
  };

  const acceptAll = () => {
    const allAccepted = { essential: true, analytics: true, marketing: true };
    localStorage.setItem('cookie-consent', 'accepted');
    localStorage.setItem('cookie-preferences', JSON.stringify(allAccepted));
    localStorage.setItem('cookie-consent-date', new Date().toISOString());
    setShowConsent(false);
  };

  const acceptEssentialOnly = () => {
    const essentialOnly = { essential: true, analytics: false, marketing: false };
    localStorage.setItem('cookie-consent', 'essential');
    localStorage.setItem('cookie-preferences', JSON.stringify(essentialOnly));
    localStorage.setItem('cookie-consent-date', new Date().toISOString());
    setShowConsent(false);
  };

  if (!showConsent) return null;

  const cookieCategories = [
    {
      id: 'essential' as const,
      label: 'Essenciais',
      description: 'Mantêm sua sessão ativa e o sistema funcionando. Não podem ser desativados.',
      locked: true,
    },
    {
      id: 'analytics' as const,
      label: 'Análise e melhoria',
      description: 'Nos ajudam a entender como você usa o sistema para melhorá-lo.',
      locked: false,
    },
    {
      id: 'marketing' as const,
      label: 'Marketing',
      description: 'Permitem mostrar conteúdo relevante e medir campanhas.',
      locked: false,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
      <Card className="max-w-2xl mx-auto p-6 shadow-glow-primary border-primary/20">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-primary/10 rounded-lg shrink-0">
            <Cookie className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 space-y-3">
            <h3 className="text-lg font-semibold">Sua privacidade importa</h3>
            <p className="text-sm text-muted-foreground">
              Usamos cookies para manter você logado e melhorar sua experiência. 
              Você escolhe o que aceitar.{' '}
              <Link to="/privacy" className="text-primary hover:underline">
                Política de Privacidade
              </Link>
            </p>

            {/* Toggle details */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showDetails ? 'Ocultar opções' : 'Personalizar cookies'}
            </button>

            {showDetails && (
              <div className="space-y-3 pt-2 border-t border-border/30">
                {cookieCategories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{cat.label}</p>
                      <p className="text-xs text-muted-foreground">{cat.description}</p>
                    </div>
                    <Switch
                      checked={preferences[cat.id]}
                      disabled={cat.locked}
                      onCheckedChange={(checked) =>
                        setPreferences((prev) => ({ ...prev, [cat.id]: checked }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={acceptAll} size="sm" className="bg-primary hover:bg-primary/90">
                Aceitar todos
              </Button>
              {showDetails ? (
                <Button onClick={() => savePreferences(preferences)} size="sm" variant="outline">
                  Salvar preferências
                </Button>
              ) : (
                <Button onClick={acceptEssentialOnly} size="sm" variant="outline">
                  Apenas essenciais
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Cookie } from 'lucide-react';
import { Link } from 'react-router-dom';

export const CookieConsent = () => {
  const [showConsent, setShowConsent] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setShowConsent(true);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem('cookie-consent', 'accepted');
    localStorage.setItem('cookie-consent-date', new Date().toISOString());
    setShowConsent(false);
  };

  const declineCookies = () => {
    localStorage.setItem('cookie-consent', 'declined');
    localStorage.setItem('cookie-consent-date', new Date().toISOString());
    setShowConsent(false);
  };

  if (!showConsent) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
      <Card className="max-w-4xl mx-auto p-6 shadow-glow-primary border-primary/20">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Cookie className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 space-y-3">
            <h3 className="text-lg font-semibold">Uso de Cookies e Dados</h3>
            <p className="text-sm text-muted-foreground">
              Utilizamos cookies e armazenamento local para melhorar sua experiência, manter sua sessão ativa e analisar o uso do sistema. 
              Seus dados são tratados de acordo com a LGPD e GDPR. Ao continuar, você concorda com nossa{' '}
              <Link to="/privacy" className="text-primary hover:underline">
                Política de Privacidade
              </Link>{' '}
              e{' '}
              <Link to="/terms" className="text-primary hover:underline">
                Termos de Serviço
              </Link>.
            </p>
            <div className="flex gap-3 pt-2">
              <Button onClick={acceptCookies} className="bg-primary hover:bg-primary/90">
                Aceitar
              </Button>
              <Button onClick={declineCookies} variant="outline">
                Recusar
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

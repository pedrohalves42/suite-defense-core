import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, MessageSquare, Bell } from 'lucide-react';

const tips = [
  { icon: Mail, color: 'blue', title: 'Email', text: 'Configure um email da equipe de TI ou segurança para receber alertas críticos.' },
  { icon: MessageSquare, color: 'cyan', title: 'Telegram', text: 'Crie um bot com @BotFather e adicione-o ao grupo/canal desejado.' },
  { icon: MessageSquare, color: 'green', title: 'WhatsApp', text: 'Requer integração com WhatsApp Business API (Twilio, MessageBird, etc).' },
  { icon: Bell, color: 'purple', title: 'Webhook', text: 'Integre com sistemas como Slack, Discord, PagerDuty ou seu próprio sistema.' },
];

export default function TipsCard() {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg">Dicas de Configuração</CardTitle>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-4">
        {tips.map(({ icon: Icon, color, title, text }) => (
          <div key={title} className={`p-4 rounded-lg bg-${color}-500/5 border border-${color}-500/20`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-4 w-4 text-${color}-500`} />
              <span className="font-medium">{title}</span>
            </div>
            <p className="text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

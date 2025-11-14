import { AlertTriangle, Download, HelpCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";

interface ManualInstallationCardProps {
  agentName: string;
  onDownloadPs1?: () => void;
}

export const ManualInstallationCard = ({ agentName, onDownloadPs1 }: ManualInstallationCardProps) => {
  return (
    <Alert className="border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/30">
      <HelpCircle className="h-5 w-5" />
      <AlertTitle className="text-lg font-bold text-orange-900 dark:text-orange-100">
        📥 Próximos Passos - IMPORTANTE!
      </AlertTitle>
      <AlertDescription className="space-y-4 mt-3">
        <p className="font-medium text-orange-900 dark:text-orange-100">
          O instalador foi baixado. Para instalá-lo, siga estas etapas:
        </p>

        <div className="bg-white dark:bg-gray-900 p-4 rounded border space-y-2">
          <p className="font-bold flex items-center gap-2">
            <span className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
            Localize o arquivo baixado
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 ml-8">
            Vá para sua pasta <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded text-xs">Downloads</code> ou 
            clique no arquivo baixado na barra do navegador.
          </p>
          <p className="text-xs text-gray-500 ml-8">
            Nome do arquivo: <code className="font-mono">cybershield-agent-{agentName}.exe</code>
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 rounded border space-y-2">
          <p className="font-bold flex items-center gap-2">
            <span className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
            Execute como Administrador
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 ml-8">
            <strong>Clique com botão direito</strong> no arquivo <code className="font-mono">.exe</code> e selecione
            <code className="bg-yellow-100 dark:bg-yellow-900 px-2 py-1 rounded mx-1 font-medium">
              "Executar como Administrador"
            </code>
          </p>
          <p className="text-xs text-red-600 dark:text-red-400 ml-8 font-semibold">
            ⚠️ Privilégios de administrador são necessários para instalar o agente!
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 rounded border space-y-2">
          <p className="font-bold flex items-center gap-2">
            <span className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
            Aguarde a instalação
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 ml-8">
            O instalador irá:
          </p>
          <ul className="text-sm text-gray-600 dark:text-gray-400 ml-12 space-y-1 list-disc">
            <li>Criar diretório <code className="font-mono">C:\CyberShield</code></li>
            <li>Configurar firewall e TLS 1.2</li>
            <li>Criar tarefa agendada do agente</li>
            <li>Iniciar o agente automaticamente</li>
          </ul>
          <p className="text-xs text-gray-500 ml-8 mt-2">
            ⏱️ Tempo estimado: 30-60 segundos
          </p>
        </div>

        <div className="bg-green-50 dark:bg-green-950 p-3 rounded border border-green-500">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            ✅ Após a instalação, o agente aparecerá neste dashboard em até 2 minutos.
          </p>
        </div>

        {/* Link de troubleshooting */}
        <details className="border-t pt-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-orange-600">
            🔧 Problemas na instalação? Clique aqui
          </summary>
          <div className="mt-3 space-y-3 text-sm text-gray-600 dark:text-gray-400 pl-4 border-l-2 border-orange-300">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">Windows Defender bloqueou?</p>
              <ol className="ml-4 mt-1 space-y-1 list-decimal">
                <li>Clique em "Mais informações"</li>
                <li>Clique em "Executar mesmo assim"</li>
                <li>O arquivo é seguro (validado por SHA-256)</li>
              </ol>
            </div>
            
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">Erro de permissões?</p>
              <p className="ml-4 mt-1">
                Certifique-se de ter clicado com <strong>botão direito</strong> e escolhido "Executar como Administrador".
              </p>
            </div>

            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">Instalação não funciona?</p>
              <p className="ml-4 mt-1">
                Tente usar o script PowerShell (.ps1) como alternativa:
              </p>
              {onDownloadPs1 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="ml-4 mt-2"
                  onClick={onDownloadPs1}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar Script PowerShell
                </Button>
              )}
            </div>

            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">Precisa de ajuda?</p>
              <div className="ml-4 mt-1 space-y-1">
                <p>Contato: <a href="mailto:gamehousetecnologia@gmail.com" className="text-blue-600 hover:underline font-medium">gamehousetecnologia@gmail.com</a></p>
                <p>WhatsApp: <a href="https://wa.me/5534984432835" className="text-blue-600 hover:underline font-medium">(34) 98443-2835</a></p>
              </div>
            </div>
          </div>
        </details>
      </AlertDescription>
    </Alert>
  );
};

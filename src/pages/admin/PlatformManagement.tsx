import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePlatformConfigs } from '@/hooks/usePlatformConfigs';
import { Loader2, Monitor, Apple, Terminal, Copy } from 'lucide-react';
import { toast } from 'sonner';

const platforms = [
  {
    key: 'windows',
    label: 'Windows',
    icon: Monitor,
    color: 'text-blue-500',
    defaultPath: 'C:\\CyberShield',
    defaultService: 'CyberShieldAgent',
    installTemplate: `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$installDir = "C:\\CyberShield"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Invoke-WebRequest -Uri "{{DOWNLOAD_URL}}" -OutFile "$installDir\\agent.exe"
# Register scheduled task...`,
  },
  {
    key: 'macos',
    label: 'macOS',
    icon: Apple,
    color: 'text-gray-700',
    defaultPath: '/usr/local/cybershield',
    defaultService: 'com.cybershield.agent',
    installTemplate: `#!/bin/bash
set -e
INSTALL_DIR="/usr/local/cybershield"
sudo mkdir -p "$INSTALL_DIR"
curl -fsSL "{{DOWNLOAD_URL}}" -o "$INSTALL_DIR/cybershield-agent"
sudo chmod +x "$INSTALL_DIR/cybershield-agent"
# Create launchd plist...`,
  },
  {
    key: 'linux',
    label: 'Linux',
    icon: Terminal,
    color: 'text-orange-500',
    defaultPath: '/opt/cybershield',
    defaultService: 'cybershield-agent',
    installTemplate: `#!/bin/bash
set -e
INSTALL_DIR="/opt/cybershield"
sudo mkdir -p "$INSTALL_DIR"
curl -fsSL "{{DOWNLOAD_URL}}" -o "$INSTALL_DIR/cybershield-agent"
sudo chmod +x "$INSTALL_DIR/cybershield-agent"
# Create systemd service...`,
  },
];

const PlatformManagement = () => {
  const { configs, agentsByPlatform, savePlatformConfig } = usePlatformConfigs();

  const getConfigForPlatform = (platform: string) =>
    configs.data?.find(c => c.platform === platform);

  const handleToggle = (platform: string, enabled: boolean) => {
    savePlatformConfig.mutate({
      platform,
      is_enabled: enabled,
      default_install_path: platforms.find(p => p.key === platform)?.defaultPath,
      service_name: platforms.find(p => p.key === platform)?.defaultService,
    });
  };

  const copyInstallCommand = (template: string) => {
    navigator.clipboard.writeText(template);
    toast.success('Comando copiado para a área de transferência');
  };

  const counts = agentsByPlatform.data || { windows: 0, macos: 0, linux: 0 };
  const total = counts.windows + counts.macos + counts.linux;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gestão Multi-Plataforma</h1>
        <p className="text-muted-foreground">Configure e gerencie agentes em Windows, macOS e Linux</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-sm text-muted-foreground">Total de Agentes</p>
          </CardContent>
        </Card>
        {platforms.map(p => {
          const Icon = p.icon;
          const count = counts[p.key as keyof typeof counts] || 0;
          return (
            <Card key={p.key}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`h-8 w-8 ${p.color}`} />
                <div>
                  <p className="text-xl font-bold">{count}</p>
                  <p className="text-sm text-muted-foreground">{p.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Platform Tabs */}
      <Tabs defaultValue="windows">
        <TabsList>
          {platforms.map(p => {
            const Icon = p.icon;
            return (
              <TabsTrigger key={p.key} value={p.key}>
                <Icon className="h-4 w-4 mr-1" />{p.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {platforms.map(p => {
          const config = getConfigForPlatform(p.key);
          const Icon = p.icon;
          const isEnabled = config?.is_enabled ?? (p.key === 'windows');

          return (
            <TabsContent key={p.key} value={p.key} className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon className={`h-6 w-6 ${p.color}`} />
                      <div>
                        <CardTitle>{p.label}</CardTitle>
                        <CardDescription>
                          {counts[p.key as keyof typeof counts]} agentes ativos
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Habilitado</span>
                      <Switch checked={isEnabled} onCheckedChange={(v) => handleToggle(p.key, v)} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Caminho de Instalação:</span>
                      <p className="font-mono">{config?.default_install_path || p.defaultPath}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Nome do Serviço:</span>
                      <p className="font-mono">{config?.service_name || p.defaultService}</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Comando de Instalação</span>
                      <Button variant="outline" size="sm" onClick={() => copyInstallCommand(config?.install_command_template || p.installTemplate)}>
                        <Copy className="h-3 w-3 mr-1" />Copiar
                      </Button>
                    </div>
                    <pre className="bg-muted/50 p-3 rounded-md text-xs font-mono overflow-x-auto max-h-40">
                      {config?.install_command_template || p.installTemplate}
                    </pre>
                  </div>

                  <Badge variant={isEnabled ? "default" : "outline"} className="text-xs">
                    {isEnabled ? 'Plataforma ativa' : 'Plataforma desabilitada'}
                  </Badge>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};

export default PlatformManagement;

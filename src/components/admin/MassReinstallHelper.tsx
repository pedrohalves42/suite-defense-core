import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  RefreshCw, 
  Copy, 
  Check, 
  AlertTriangle, 
  Terminal, 
  FileText,
  Download,
  Shield,
  Zap
} from "lucide-react";
import { toast } from "sonner";

const SERVER_URL = "https://iavbnmduxpxhwubqrzzn.supabase.co";

interface MassReinstallHelperProps {
  enrollmentKey?: string;
}

export function MassReinstallHelper({ enrollmentKey: initialKey = "" }: MassReinstallHelperProps) {
  const [enrollmentKey, setEnrollmentKey] = useState(initialKey);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(label);
    toast.success(`${label} copiado!`);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  // One-liner command for quick reinstall
  const oneLineCommand = `$K="${enrollmentKey || 'XXXX-XXXX-XXXX-XXXX'}"; $S="${SERVER_URL}"; Get-ScheduledTask | ? {$_.TaskName -like "CyberShield*"} | Unregister-ScheduledTask -Confirm:$false -EA 0; Remove-Item "C:\\CyberShield" -Recurse -Force -EA 0; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $sp="$env:TEMP\\cs-install-$(Get-Random).ps1"; Invoke-WebRequest -Uri "$S/functions/v1/serve-installer/$K" -OutFile $sp -UseBasicParsing; & $sp; Remove-Item $sp -Force`;

  // Full script command
  const fullScriptCommand = `# CyberShield Mass Reinstall - v4.1.2
# Execute como Administrador

$EnrollmentKey = "${enrollmentKey || 'XXXX-XXXX-XXXX-XXXX'}"
$ServerUrl = "${SERVER_URL}"

# Phase 1: Complete Cleanup
Write-Host "[1/4] Cleaning existing installation..." -ForegroundColor Yellow
Get-ScheduledTask | Where-Object {$_.TaskName -like "CyberShield*"} | ForEach-Object {
    Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
}
Get-Process -Name powershell -ErrorAction SilentlyContinue | Where-Object { 
    $_.CommandLine -like "*cybershield*" -and $_.Id -ne $PID 
} | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item "C:\\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\\install-windows*" -Force -ErrorAction SilentlyContinue
Write-Host "[OK] Cleanup complete" -ForegroundColor Green

# Phase 2: Enable TLS 1.2
Write-Host "[2/4] Enabling TLS 1.2..." -ForegroundColor Yellow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Write-Host "[OK] TLS 1.2 enabled" -ForegroundColor Green

# Phase 3: Download and Execute Installer
Write-Host "[3/4] Installing agent v4.1.2..." -ForegroundColor Yellow
try {
    $sp = "$env:TEMP\\cs-install-$(Get-Random).ps1"
    Invoke-WebRequest -Uri "$ServerUrl/functions/v1/serve-installer/$EnrollmentKey" -OutFile $sp -UseBasicParsing
    & $sp
    Remove-Item $sp -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Installation complete" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Installation failed: $_" -ForegroundColor Red
    exit 1
}

# Phase 4: Verify
Write-Host "[4/4] Verifying installation..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
$task = Get-ScheduledTask | Where-Object {$_.TaskName -like "CyberShield*"} | Select-Object -First 1
if ($task) {
    Write-Host "[OK] Scheduled task: $($task.TaskName) - State: $($task.State)" -ForegroundColor Green
    if ($task.State -ne "Running") {
        Start-ScheduledTask -TaskName $task.TaskName
        Write-Host "[OK] Task started" -ForegroundColor Green
    }
} else {
    Write-Host "[WARN] Scheduled task not found" -ForegroundColor Yellow
}

if (Test-Path "C:\\CyberShield") {
    Write-Host "[OK] Installation directory exists" -ForegroundColor Green
} else {
    Write-Host "[WARN] Installation directory not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== REINSTALLATION COMPLETE ===" -ForegroundColor Cyan
Write-Host "Check dashboard for agent status (1-2 minutes)" -ForegroundColor Gray
Write-Host "View logs: Get-Content C:\\CyberShield\\logs\\agent.log -Tail 30" -ForegroundColor Gray`;

  // Cleanup only command
  const cleanupCommand = `# Cleanup Only - Run as Administrator
Get-ScheduledTask | Where-Object {$_.TaskName -like "CyberShield*"} | ForEach-Object {
    Write-Host "Removing: $($_.TaskName)"
    Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false
}
Get-Process -Name powershell | Where-Object { $_.CommandLine -like "*cybershield*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item "C:\\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Cleanup complete. Verify:"
Write-Host "  Tasks: $(Get-ScheduledTask | Where-Object {$_.TaskName -like 'CyberShield*'} | Measure-Object | Select-Object -ExpandProperty Count)"
Write-Host "  Directory: $(Test-Path 'C:\\CyberShield')"`;

  // Verification command
  const verifyCommand = `# Verification - Run after installation
Write-Host "=== CyberShield Agent Verification ===" -ForegroundColor Cyan

# Check scheduled task
$task = Get-ScheduledTask | Where-Object {$_.TaskName -like "CyberShield*"} | Select-Object -First 1
if ($task) {
    Write-Host "[OK] Task: $($task.TaskName) - $($task.State)" -ForegroundColor Green
    $info = Get-ScheduledTaskInfo -TaskName $task.TaskName
    Write-Host "     Last Run: $($info.LastRunTime)" -ForegroundColor Gray
} else {
    Write-Host "[ERROR] No scheduled task found" -ForegroundColor Red
}

# Check directory
if (Test-Path "C:\\CyberShield") {
    $scripts = Get-ChildItem "C:\\CyberShield\\*.ps1"
    Write-Host "[OK] Directory exists - $($scripts.Count) script(s)" -ForegroundColor Green
    $scripts | ForEach-Object { Write-Host "     $($_.Name)" -ForegroundColor Gray }
} else {
    Write-Host "[ERROR] Directory not found" -ForegroundColor Red
}

# Check logs
$logFile = "C:\\CyberShield\\logs\\agent.log"
if (Test-Path $logFile) {
    Write-Host "[OK] Log file exists" -ForegroundColor Green
    Write-Host "     Last 5 lines:" -ForegroundColor Gray
    Get-Content $logFile -Tail 5 | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkGray }
} else {
    Write-Host "[WARN] Log file not yet created" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "View full logs: Get-Content $logFile -Tail 50 -Wait" -ForegroundColor Cyan`;

  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-500" />
              Mass Reinstall Helper
              <Badge variant="outline" className="ml-2">v4.1.2</Badge>
            </CardTitle>
            <CardDescription>
              Gere comandos de reinstalação para agentes stuck em v4.0.x
            </CardDescription>
          </div>
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Requires Admin
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enrollment Key Input */}
        <div className="space-y-2">
          <Label htmlFor="enrollmentKey">Enrollment Key</Label>
          <div className="flex gap-2">
            <Input
              id="enrollmentKey"
              value={enrollmentKey}
              onChange={(e) => setEnrollmentKey(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="font-mono"
            />
            {!enrollmentKey && (
              <Button variant="outline" size="sm" asChild>
                <a href="/settings?tab=enrollment" target="_blank">
                  Generate Key
                </a>
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Cole a enrollment key gerada em Settings → Enrollment Keys
          </p>
        </div>

        {/* Warning */}
        <Alert variant="destructive" className="bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Atenção</AlertTitle>
          <AlertDescription>
            Este procedimento remove completamente o agente existente antes de reinstalar.
            Execute apenas em máquinas que precisam ser atualizadas de v4.0.x para v4.1.2.
          </AlertDescription>
        </Alert>

        {/* Command Tabs */}
        <Tabs defaultValue="oneliner" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="oneliner" className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              One-Liner
            </TabsTrigger>
            <TabsTrigger value="full" className="flex items-center gap-1">
              <Terminal className="h-3 w-3" />
              Full Script
            </TabsTrigger>
            <TabsTrigger value="cleanup" className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Cleanup Only
            </TabsTrigger>
            <TabsTrigger value="verify" className="flex items-center gap-1">
              <Check className="h-3 w-3" />
              Verify
            </TabsTrigger>
          </TabsList>

          <TabsContent value="oneliner" className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">One-Liner (Rápido)</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(oneLineCommand, "One-liner")}
                className="flex items-center gap-1"
              >
                {copiedCommand === "One-liner" ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                Copy
              </Button>
            </div>
            <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto whitespace-pre-wrap font-mono">
              {oneLineCommand}
            </pre>
            <p className="text-xs text-muted-foreground">
              ⚡ Comando único que faz cleanup + instalação. Ideal para reinstalação rápida.
            </p>
          </TabsContent>

          <TabsContent value="full" className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Full Script (Detalhado)</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(fullScriptCommand, "Full script")}
                className="flex items-center gap-1"
              >
                {copiedCommand === "Full script" ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                Copy
              </Button>
            </div>
            <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto max-h-64 font-mono">
              {fullScriptCommand}
            </pre>
            <p className="text-xs text-muted-foreground">
              📝 Script completo com feedback visual de cada etapa. Melhor para troubleshooting.
            </p>
          </TabsContent>

          <TabsContent value="cleanup" className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Cleanup Only (Sem Reinstalar)</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(cleanupCommand, "Cleanup")}
                className="flex items-center gap-1"
              >
                {copiedCommand === "Cleanup" ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                Copy
              </Button>
            </div>
            <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto max-h-48 font-mono">
              {cleanupCommand}
            </pre>
            <p className="text-xs text-muted-foreground">
              🧹 Apenas remove o agente existente. Use quando quiser fazer a instalação manualmente depois.
            </p>
          </TabsContent>

          <TabsContent value="verify" className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Verification Script</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(verifyCommand, "Verify")}
                className="flex items-center gap-1"
              >
                {copiedCommand === "Verify" ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                Copy
              </Button>
            </div>
            <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto max-h-48 font-mono">
              {verifyCommand}
            </pre>
            <p className="text-xs text-muted-foreground">
              ✅ Execute após instalação para verificar que tudo está funcionando corretamente.
            </p>
          </TabsContent>
        </Tabs>

        {/* Documentation Link */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            Documentação completa disponível
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href="/docs/AGENT_MASS_REINSTALL_V412.md" target="_blank" className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              Ver Documentação
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

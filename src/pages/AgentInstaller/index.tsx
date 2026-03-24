import { Package } from "lucide-react";
import { useAgentInstaller } from "./hooks/useAgentInstaller";
import { InstallerStatusBanner } from "./components/InstallerStatusBanner";
import { InstallerAlerts } from "./components/InstallerAlerts";
import { AgentConfigStep } from "./components/AgentConfigStep";
import { InstallMethodTabs } from "./components/InstallMethodTabs";
import { BuildStatusStep } from "./components/BuildStatusStep";
import { InstallerTutorial } from "./components/InstallerTutorial";

const AgentInstaller = () => {
  const installer = useAgentInstaller();

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 rounded-lg">
          <Package className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Gerador de Instaladores CyberShield</h1>
          <p className="text-muted-foreground">Instalacao simplificada em 3 passos - sem configuracao manual</p>
        </div>
      </div>

      <InstallerStatusBanner
        circuitBreakerOpen={installer.circuitBreakerOpen}
        isOnline={installer.isOnline}
        githubHealthy={installer.githubHealthy}
      />

      <InstallerAlerts
        circuitBreakerOpen={installer.circuitBreakerOpen}
        isOnline={installer.isOnline}
        isRetrying={installer.isRetrying}
        isRegenerated={installer.searchParams.get("regenerated") === "true"}
        agentName={installer.agentName}
        enrollmentCircuitBreaker={installer.enrollmentCircuitBreaker}
        onNavigateToDiagnostics={() => installer.navigate("/admin/diagnostics")}
      />

      <AgentConfigStep
        agentName={installer.agentName}
        setAgentName={installer.setAgentName}
        platform={installer.platform}
        setPlatform={installer.setPlatform}
        agentNameError={installer.agentNameError}
        isCheckingName={installer.isCheckingName}
        isGenerating={installer.isGenerating}
        exeBuildStatus={installer.exeBuildStatus}
        previewCredentials={installer.previewCredentials}
      />

      <InstallMethodTabs
        platform={installer.platform}
        isNameValid={installer.isNameValid}
        isGenerating={installer.isGenerating}
        isValidatingPs1={installer.isValidatingPs1}
        circuitBreakerOpen={installer.circuitBreakerOpen}
        installCommand={installer.installCommand}
        lastEnrollmentKey={installer.lastEnrollmentKey}
        exeBuildStatus={installer.exeBuildStatus}
        exeDownloadUrl={installer.exeDownloadUrl}
        exeFileSize={installer.exeFileSize}
        exeSha256={installer.exeSha256}
        ps1Sha256={installer.ps1Sha256}
        ps1SizeBytes={installer.ps1SizeBytes}
        onGenerateCommand={installer.generateCopyPasteCommand}
        onGenerateInstaller={installer.generateInstaller}
        onDownloadAndVerifyScript={installer.downloadAndVerifyScript}
        onGeneratePortable={installer.handleGeneratePortableInstaller}
        onCopyCommand={installer.copyToClipboard}
      />

      <BuildStatusStep
        exeBuildStatus={installer.exeBuildStatus}
        buildProgress={installer.buildProgress}
        exeDownloadUrl={installer.exeDownloadUrl}
        exeSha256={installer.exeSha256}
        exeFileSize={installer.exeFileSize}
        githubActionsUrl={installer.githubActionsUrl}
        retryCount={installer.retryCount}
        onRefreshBuildStatus={installer.refreshBuildStatus}
        onDownloadAndVerifyExe={installer.downloadAndVerifyExe}
        onRetryBuild={() => installer.handleBuildExe()}
      />

      <InstallerTutorial defaultOpen={installer.tutorialDefaultOpen} />
    </div>
  );
};

export default AgentInstaller;

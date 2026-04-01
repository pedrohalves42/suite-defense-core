import { useClientOnboarding } from './hooks/useClientOnboarding';
import { OnboardingHeader } from './components/OnboardingHeader';
import { OnboardingSidebar } from './components/OnboardingSidebar';
import { OnboardingContent } from './components/OnboardingContent';

const ClientOnboarding = () => {
  const {
    navigate, user, copied, agentCount, hasOnlineAgent,
    activeSection, setActiveSection, copyCommand, onboardingProgress,
  } = useClientOnboarding();

  return (
    <div className="min-h-screen bg-background">
      <OnboardingHeader
        agentCount={agentCount}
        hasOnlineAgent={hasOnlineAgent}
        onBack={() => navigate(-1)}
      />
      <div className="container py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <OnboardingSidebar
            activeSection={activeSection}
            setActiveSection={setActiveSection}
            progress={onboardingProgress()}
          />
          <OnboardingContent
            user={user}
            agentCount={agentCount}
            hasOnlineAgent={hasOnlineAgent}
            copied={copied}
            copyCommand={copyCommand}
          />
        </div>
      </div>
    </div>
  );
};

export default ClientOnboarding;

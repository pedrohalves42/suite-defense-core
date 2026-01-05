import { Navbar } from "@/components/Navbar";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import {
  HeroSection,
  TargetAudienceSection,
  PainPointsSection,
  SocialProofSection,
  DiagnosticPreviewSection,
  BenefitsSection,
  TechnologySection,
  UseCasesSection,
  HowItWorksSection,
  FeaturesSection,
  PricingSection,
  TestimonialsSection,
  FAQSection,
  CalculatorSection,
  CTASection,
  ContactSection
} from "@/components/landing";

const Landing = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <WhatsAppButton />

      <HeroSection />
      <TargetAudienceSection />
      <PainPointsSection />
      <SocialProofSection />
      <DiagnosticPreviewSection />
      <BenefitsSection />
      <TechnologySection />
      <UseCasesSection />
      <HowItWorksSection />
      <FeaturesSection />
      <PricingSection />
      <TestimonialsSection />
      <FAQSection />
      <CalculatorSection />
      <CTASection />
      <ContactSection />
    </div>
  );
};

export default Landing;

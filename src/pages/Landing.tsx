import { Navbar } from "@/components/Navbar";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { SEOHead } from "@/components/SEOHead";
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
  ContactSection,
  MiniDiagnosticSection,
  ProductPreviewSection
} from "@/components/landing";

const Landing = () => {
  return (
    <>
      <SEOHead 
        title="CyberShield - Seguranca Cibernetica Inteligente para PMEs Brasileiras"
        description="Protecao completa para sua empresa: antivirus, monitoramento 24/7 e compliance LGPD em um so lugar. Empresa 100% brasileira com suporte em portugues. Trial gratuito de 14 dias."
        keywords="seguranca cibernetica, antivirus empresarial, PME Brasil, protecao de dados, compliance LGPD, monitoramento de rede"
        canonicalUrl="/"
      />
      <div className="min-h-screen bg-background">
        <Navbar />
        <WhatsAppButton />

        <main>
          <HeroSection />
          <PainPointsSection />
          <MiniDiagnosticSection />
          <ProductPreviewSection />
          <BenefitsSection />
          <HowItWorksSection />
          <PricingSection />
          <TestimonialsSection />
          <FAQSection />
          <CTASection />
          <ContactSection />
        </main>
      </div>
    </>
  );
};

export default Landing;

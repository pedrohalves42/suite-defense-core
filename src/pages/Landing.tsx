import { lazy, Suspense } from "react";
import { Navbar } from "@/components/Navbar";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { SEOHead } from "@/components/SEOHead";
import { HeroSection } from "@/components/landing/HeroSection";

// PERF: Lazy load below-the-fold sections to improve FCP
const PainPointsSection = lazy(() => import("@/components/landing/PainPointsSection").then(m => ({ default: m.PainPointsSection })));
const MiniDiagnosticSection = lazy(() => import("@/components/landing/MiniDiagnosticSection").then(m => ({ default: m.MiniDiagnosticSection })));
const ProductPreviewSection = lazy(() => import("@/components/landing/ProductPreviewSection").then(m => ({ default: m.ProductPreviewSection })));
const UnifiedPlatformSection = lazy(() => import("@/components/landing/UnifiedPlatformSection").then(m => ({ default: m.UnifiedPlatformSection })));
const BenefitsSection = lazy(() => import("@/components/landing/BenefitsSection").then(m => ({ default: m.BenefitsSection })));
const HowItWorksSection = lazy(() => import("@/components/landing/HowItWorksSection").then(m => ({ default: m.HowItWorksSection })));
const PricingSection = lazy(() => import("@/components/landing/PricingSection").then(m => ({ default: m.PricingSection })));
const TestimonialsSection = lazy(() => import("@/components/landing/TestimonialsSection").then(m => ({ default: m.TestimonialsSection })));
const FAQSection = lazy(() => import("@/components/landing/FAQSection").then(m => ({ default: m.FAQSection })));
const CTASection = lazy(() => import("@/components/landing/CTASection").then(m => ({ default: m.CTASection })));
const ContactSection = lazy(() => import("@/components/landing/ContactSection").then(m => ({ default: m.ContactSection })));

const SectionFallback = () => <div className="h-32" />;

const LANDING_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "CyberShield",
  "applicationCategory": "SecurityApplication",
  "operatingSystem": "Windows",
  "description": "Plataforma de segurança cibernética inteligente para PMEs brasileiras. Proteção EDR, monitoramento 24/7 e compliance LGPD integrados.",
  "url": "https://cybershield.com.br",
  "offers": {
    "@type": "AggregateOffer",
    "priceCurrency": "BRL",
    "lowPrice": "149",
    "highPrice": "499",
    "offerCount": "3"
  },
  "provider": {
    "@type": "Organization",
    "name": "CyberShield",
    "url": "https://cybershield.com.br",
    "areaServed": {
      "@type": "Country",
      "name": "Brazil"
    }
  },
  "featureList": [
    "Proteção EDR em tempo real",
    "Monitoramento 24/7",
    "Compliance LGPD automático",
    "Relatórios executivos com IA",
    "Inventário de software",
    "Detecção de ameaças"
  ]
};

const Landing = () => {
  return (
    <>
      <SEOHead 
        title="CyberShield - Segurança Cibernética Inteligente para PMEs Brasileiras"
        description="Proteção completa para sua empresa: antivírus, monitoramento 24/7 e compliance LGPD em um só lugar. Empresa 100% brasileira com suporte em português. Trial gratuito de 14 dias."
        keywords="segurança cibernética, antivírus empresarial, PME Brasil, proteção de dados, compliance LGPD, monitoramento de rede, EDR, endpoint protection"
        canonicalUrl="/"
        jsonLd={LANDING_JSON_LD}
      />
      <div className="min-h-screen bg-background">
        <Navbar />
        <WhatsAppButton />

        <main>
          <HeroSection />
          <Suspense fallback={<SectionFallback />}>
            <PainPointsSection />
            <UnifiedPlatformSection />
            <MiniDiagnosticSection />
            <ProductPreviewSection />
            <BenefitsSection />
            <HowItWorksSection />
            <PricingSection />
            <TestimonialsSection />
            <FAQSection />
            <CTASection />
            <ContactSection />
          </Suspense>
        </main>
      </div>
    </>
  );
};

export default Landing;

import { lazy, Suspense } from "react";
import { SEOHead } from "@/components/SEOHead";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { HeroSection } from "@/components/landing/HeroSection";
import { LandingNavbar } from "@/components/landing/LandingNavbar";

// PERF: Lazy load below-the-fold sections
const PainPointsSection = lazy(() => import("@/components/landing/PainPointsSection").then(m => ({ default: m.PainPointsSection })));
const ValuePropSection = lazy(() => import("@/components/landing/ValuePropSection").then(m => ({ default: m.ValuePropSection })));
const HowItWorksSection = lazy(() => import("@/components/landing/HowItWorksSection").then(m => ({ default: m.HowItWorksSection })));
const AssessmentSection = lazy(() => import("@/components/landing/AssessmentSection").then(m => ({ default: m.AssessmentSection })));
const BenefitsSection = lazy(() => import("@/components/landing/BenefitsSection").then(m => ({ default: m.BenefitsSection })));
const FeaturesSection = lazy(() => import("@/components/landing/FeaturesSection").then(m => ({ default: m.FeaturesSection })));
const TargetAudienceSection = lazy(() => import("@/components/landing/TargetAudienceSection").then(m => ({ default: m.TargetAudienceSection })));
const TrustProofSection = lazy(() => import("@/components/landing/TrustProofSection").then(m => ({ default: m.TrustProofSection })));
const ComparisonSection = lazy(() => import("@/components/landing/ComparisonSection").then(m => ({ default: m.ComparisonSection })));
const ProductPreviewSection = lazy(() => import("@/components/landing/ProductPreviewSection").then(m => ({ default: m.ProductPreviewSection })));
const PricingSection = lazy(() => import("@/components/landing/PricingSection").then(m => ({ default: m.PricingSection })));
const OfferFormSection = lazy(() => import("@/components/landing/OfferFormSection").then(m => ({ default: m.OfferFormSection })));
const FAQSection = lazy(() => import("@/components/landing/FAQSection").then(m => ({ default: m.FAQSection })));
const CTASection = lazy(() => import("@/components/landing/CTASection").then(m => ({ default: m.CTASection })));

const SectionFallback = () => <div className="h-32" />;

const LANDING_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "CyberShield",
  "applicationCategory": "SecurityApplication",
  "operatingSystem": "Windows",
  "description": "Plataforma de segurança cibernética para empresas. Proteção de endpoints, detecção de ameaças, automação de resposta e evidências de compliance em uma única operação.",
  "url": "https://cybershield.com.br",
  "provider": {
    "@type": "Organization",
    "name": "CyberShield",
    "url": "https://cybershield.com.br",
    "areaServed": { "@type": "Country", "name": "Brazil" }
  },
  "featureList": [
    "Gestão de endpoints",
    "EDR integrado",
    "Automação e remediação",
    "Compliance e auditoria",
    "Operação multi-tenant",
    "Histórico confiável de ações"
  ]
};

const Landing = () => {
  return (
    <>
      <SEOHead 
        title="CyberShield - Segurança Operacional e Compliance em Uma Única Plataforma"
        description="Descubra em 48h onde sua empresa está exposta. Centralize monitoramento de endpoints, detecção de ameaças, automação de resposta e evidências de compliance. Assessment gratuito."
        keywords="segurança cibernética, proteção de endpoints, EDR, compliance, auditoria, automação de segurança, monitoramento, assessment gratuito"
        canonicalUrl="/"
        jsonLd={LANDING_JSON_LD}
      />
      <div className="min-h-screen bg-background">
        <LandingNavbar />
        <WhatsAppButton />

        <main>
          {/* 1. Hero */}
          <HeroSection />
          
          <Suspense fallback={<SectionFallback />}>
            {/* 2. Dor do mercado */}
            <PainPointsSection />
            {/* 3. Proposta de valor */}
            <ValuePropSection />
            {/* 4. Como funciona */}
            <HowItWorksSection />
            {/* 5. Assessment */}
            <AssessmentSection />
            {/* 6. Benefícios */}
            <BenefitsSection />
            {/* 7. Funcionalidades */}
            <FeaturesSection />
            {/* 8. Para quem é */}
            <TargetAudienceSection />
            {/* 9. Prova e confiança */}
            <TrustProofSection />
            {/* 10. Comparativo */}
            <ComparisonSection />
            {/* 11. Preview do produto */}
            <ProductPreviewSection />
            {/* 11.5. Planos e preços */}
            <PricingSection />
            {/* 12. Oferta + Formulário */}
            <OfferFormSection />
            {/* 13. FAQ */}
            <FAQSection />
            {/* 14. CTA final */}
            <CTASection />
          </Suspense>
        </main>

        {/* Footer */}
        <footer className="bg-[hsl(220,18%,8%)] border-t border-white/5 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <p className="text-sm text-white/40">© {new Date().getFullYear()} CyberShield. Todos os direitos reservados.</p>
              <div className="flex gap-6 text-sm text-white/40">
                <a href="/privacidade" className="hover:text-white/70 transition-colors">Política de Privacidade</a>
                <a href="/terms" className="hover:text-white/70 transition-colors">Termos de Uso</a>
                <a href="#contato" className="hover:text-white/70 transition-colors">Contato</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default Landing;

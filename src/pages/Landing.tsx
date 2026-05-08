import { lazy, Suspense } from "react";
import { SectionSkeleton } from "@/components/landing/SectionSkeleton";
import { SEOHead } from "@/components/SEOHead";
import { HeroSection } from "@/components/landing/HeroSection";
import { LandingNavbar } from "@/components/landing/LandingNavbar";

// Eager load critical above-fold components for better LCP
import { PainPointsSection } from "@/components/landing/PainPointsSection";
import { ValuePropSection } from "@/components/landing/ValuePropSection";

// Lazy load non-critical above-fold elements
const WhatsAppButton = lazy(() => import("@/components/WhatsAppButton").then(m => ({ default: m.WhatsAppButton })));

// Below-the-fold sections — lazy loaded to reduce initial bundle
const HowItWorksSection = lazy(() => import("@/components/landing/HowItWorksSection").then(m => ({ default: m.HowItWorksSection })));
const AssessmentSection = lazy(() => import("@/components/landing/AssessmentSection").then(m => ({ default: m.AssessmentSection })));
const BenefitsSection = lazy(() => import("@/components/landing/BenefitsSection").then(m => ({ default: m.BenefitsSection })));
const FeaturesSection = lazy(() => import("@/components/landing/FeaturesSection").then(m => ({ default: m.FeaturesSection })));
const DifferentiatorsSection = lazy(() => import("@/components/landing/DifferentiatorsSection").then(m => ({ default: m.DifferentiatorsSection })));
const TargetAudienceSection = lazy(() => import("@/components/landing/TargetAudienceSection").then(m => ({ default: m.TargetAudienceSection })));
const TrustProofSection = lazy(() => import("@/components/landing/TrustProofSection").then(m => ({ default: m.TrustProofSection })));
const ComparisonSection = lazy(() => import("@/components/landing/ComparisonSection").then(m => ({ default: m.ComparisonSection })));
const ProductPreviewSection = lazy(() => import("@/components/landing/ProductPreviewSection").then(m => ({ default: m.ProductPreviewSection })));
const PricingSection = lazy(() => import("@/components/landing/PricingSection").then(m => ({ default: m.PricingSection })));
const OfferFormSection = lazy(() => import("@/components/landing/OfferFormSection").then(m => ({ default: m.OfferFormSection })));
const FAQSection = lazy(() => import("@/components/landing/FAQSection").then(m => ({ default: m.FAQSection })));
const CTASection = lazy(() => import("@/components/landing/CTASection").then(m => ({ default: m.CTASection })));

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
        <Suspense fallback={null}>
          <WhatsAppButton />
        </Suspense>

        <main>
          {/* 1. Hero */}
          <HeroSection />
          
          {/* 2. Dor do mercado - Eager loaded */}
          <PainPointsSection />
          {/* 3. Proposta de valor - Eager loaded */}
          <ValuePropSection />
          
          <Suspense fallback={<SectionSkeleton />}>
            {/* 4. Como funciona */}
            <HowItWorksSection />
            {/* 5. Assessment */}
            <AssessmentSection />
            {/* 6. Benefícios */}
            <BenefitsSection />
            {/* 7. Funcionalidades */}
            <FeaturesSection />
            {/* 7.5 Diferenciais exclusivos */}
            <DifferentiatorsSection />
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

        {/* Premium Refined Footer */}
        <footer className="bg-[hsl(220,18%,8%)] border-t border-white/5 py-20 relative overflow-hidden">
          <div className="absolute top-0 left-1/4 w-[300px] h-[300px] bg-cta-positive/5 rounded-full blur-[120px] pointer-events-none" />
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
              <div className="col-span-1 md:col-span-2 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-cta-positive/10 rounded-xl flex items-center justify-center border border-cta-positive/20">
                    <img src="/logo-cybshield-new.webp" alt="CyberShield" className="w-6 h-6 object-contain" />
                  </div>
                  <span className="text-xl font-bold tracking-tight text-white">CyberShield</span>
                </div>
                <p className="text-white/40 max-w-sm leading-relaxed">
                  A plataforma unificada que transforma segurança cibernética em vantagem competitiva através de automação inteligente e compliance matemático.
                </p>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-6">Plataforma</h4>
                <ul className="space-y-4 text-sm text-white/40">
                  <li><a href="#recursos" className="hover:text-cta-positive transition-colors">Recursos</a></li>
                  <li><a href="/pricing" className="hover:text-cta-positive transition-colors">Preços</a></li>
                  <li><a href="/security" className="hover:text-cta-positive transition-colors">Segurança</a></li>
                  <li><a href="/tutorials" className="hover:text-cta-positive transition-colors">Tutoriais</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-6">Jurídico</h4>
                <ul className="space-y-4 text-sm text-white/40">
                  <li><a href="/privacidade" className="hover:text-cta-positive transition-colors">Privacidade</a></li>
                  <li><a href="/terms" className="hover:text-cta-positive transition-colors">Termos</a></li>
                  <li><a href="#contato" className="hover:text-cta-positive transition-colors">Contato</a></li>
                </ul>
              </div>
            </div>
            
            <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
              <p className="text-sm text-white/40">© {new Date().getFullYear()} CyberShield Operational Security. Registros auditáveis e integridade de dados garantidos.</p>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/5">
                  <div className="w-1.5 h-1.5 rounded-full bg-cta-positive animate-pulse" />
                  <span className="text-[10px] uppercase tracking-wider text-white/60 font-bold">System Status: Optimal</span>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default Landing;
import { lazy, Suspense } from "react";
import { SectionSkeleton } from "@/components/landing/SectionSkeleton";
import { SEOHead } from "@/components/SEOHead";
import { HeroSection } from "@/components/landing/HeroSection";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { useTranslation } from "react-i18next";

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

const Landing = () => {
  const { t } = useTranslation();

  return (
    <>
      <SEOHead
        title={t('landing.seo.title', 'CyberShield | Segurança Cibernética para PMEs - Proteção 24/7')}
        description={t('landing.seo.description', 'Proteja sua empresa HOJE de ataques cibernéticos. Monitoramento 24/7, conformidade LGPD e resposta imediata a ameaças. Comece seu diagnóstico GRATUITO em 48h!')}
        keywords={t('landing.seo.keywords', 'segurança cibernética, proteção PME, antivírus empresarial, monitoramento 24/7, LGPD, resposta a incidentes')}
        canonicalUrl="/"
      />

      <div className="min-h-screen bg-background">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(45,158,140,0.02),transparent_60%)] pointer-events-none" />
          <div className="container mx-auto px-4 py-12 md:py-20">
            <LandingNavbar />
            <HeroSection />
          </div>
        </section>

        {/* Pain Points Section - URGENCY TRIGGER */}
        <section className="py-16 px-4">
          <div className="container mx-auto">
            <PainPointsSection />
            {/* Added urgency trigger phrases */}
            <div className="mt-12 text-center">
              <h3 className="text-xl font-bold text-destructive mb-4">⚠️ ATAQUES CIBERNÉTICOS NÃO ESPERAM!
                <span className="text-cta-positive ml-2">Seus concorrentes já estão protegidos — você também precisa agir AGORA!</span></h3>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                Cada minuto sem proteção é um risco para seus dados, sua reputação e a continuidade do seu negócio.
                <span className="text-cta-positive font-semibold"> Não deixe para amanhã o que pode destruir sua empresa HOJE.</span>
              </p>
            </div>
          </div>
        </section>

        {/* Value Proposition Section */}
        <section className="py-16 px-4">
          <div className="container mx-auto">
            <ValuePropSection />
            {/* Added FOMO trigger */}
            <div className="mt-12 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-cta-positive/10 border border-cta-positive/20 rounded-full text-sm font-medium text-cta-positive">
                <span>🚨</span>
                <span>EMPRESAS QUE NÃO PROTEGEM SEUS DADOS PERDEM CLIENTES E REPUTAÇÃO EM 72 HORAS!</span>
                <span>🚨</span>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-16 px-4">
          <Suspense fallback={<SectionSkeleton />}>
            <HowItWorksSection />
          </Suspense>
        </section>

        {/* Assessment Section - URGENCY TRIGGER */}
        <section className="py-16 px-4">
          <div className="container mx-auto">
            <AssessmentSection />
            {/* Added urgency trigger */}
            <div className="mt-12 text-center">
              <h3 className="text-2xl font-bold text-destructive mb-6">🔥 VOCÊ SABE QUÃO VULNERÁVEL SUA EMPRESA ESTÁ AGORA MESMO?
                <span className="text-cta-positive block mt-2">Faça uma varredura GRATUITA e descubra em 10 minutos!</span></h3>
              <p className="text-lg text-muted-foreground max-w-4xl mx-auto">
                Hackers estão testando suas defesas NESTE EXATO MOMENTO. <span className="text-cta-positive font-semibold">Cada segundo conta — sua segurança não pode esperar!</span>
              </p>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-16 px-4">
          <Suspense fallback={<SectionSkeleton />}>
            <BenefitsSection />
          </Suspense>
        </section>

        {/* Features Section */}
        <section className="py-16 px-4">
          <Suspense fallback={<SectionSkeleton />}>
            <FeaturesSection />
          </Suspense>
        </section>

        {/* Differentiators Section */}
        <section className="py-16 px-4">
          <Suspense fallback={<SectionSkeleton />}>
            <DifferentiatorsSection />
          </Suspense>
        </section>

        {/* Target Audience Section */}
        <section className="py-16 px-4">
          <Suspense fallback={<SectionSkeleton />}>
            <TargetAudienceSection />
          </Suspense>
        </section>

        {/* Trust Proof Section */}
        <section className="py-16 px-4">
          <Suspense fallback={<SectionSkeleton />}>
            <TrustProofSection />
          </Suspense>
        </section>

        {/* Comparison Section */}
        <section className="py-16 px-4">
          <Suspense fallback={<SectionSkeleton />}>
            <ComparisonSection />
          </Suspense>
        </section>

        {/* Product Preview Section */}
        <section className="py-16 px-4">
          <Suspense fallback={<SectionSkeleton />}>
            <ProductPreviewSection />
          </Suspense>
        </section>

        {/* Pricing Section */}
        <section className="py-16 px-4">
          <Suspense fallback={<SectionSkeleton />}>
            <PricingSection />
          </Suspense>
        </section>

        {/* Offer Form Section - STRONGEST URGENCY TRIGGER */}
        <section className="py-16 px-4">
          <Suspense fallback={<SectionSkeleton />}>
            <OfferFormSection />
            {/* Added strongest urgency triggers */}
            <div className="mt-12 text-center">
              <div className="inline-flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-destructive/20 to-cta-positive/20 border border-destructive/30 rounded-xl text-base font-bold">
                <span className="text-destructive">⚠️</span>
                <span className="text-destructive">SEU NEGÓCIO NÃO PODE PARAR POR FALHA DE TI!</span>
                <span className="text-cta-positive">🚨</span>
                <span className="text-cta-positive">PROTEJA AGORA ANTES QUE SEJA TARDE!</span>
                <span className="text-destructive">⚠️</span>
              </div>
              <p className="mt-4 text-lg text-muted-foreground max-w-4xl mx-auto">
                <span className="text-cta-positive font-semibold">68% das pequenas empresas fecham em 6 meses após um ataque cibernético sério.</span>
                <span className="text-destructive font-semibold ml-2">Não seja a próxima estatística!</span>
              </p>
            </div>
          </Suspense>
        </section>

        {/* FAQ Section */}
        <section className="py-16 px-4">
          <Suspense fallback={<SectionSkeleton />}>
            <FAQSection />
          </Suspense>
        </section>

        {/* CTA Section */}
        <section className="py-16 px-4">
          <Suspense fallback={<SectionSkeleton />}>
            <CTASection />
          </Suspense>
        </section>

        {/* Footer */}
        <footer className="py-16 px-4 border-t">
          <div className="container mx-auto">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
              <div className="space-y-4">
                <h3 className="text-xl font-bold">🚨 PROTEJA SUA EMPRESA HOJE MESMO!</h3>
                <p className="text-muted-foreground max-w-md">
                  Hackers não tiram férias. Sua segurança também não pode esperar.
                  <span className="text-cta-positive font-semibold"> Comece agora com diagnóstico GRATUITO e descubra suas vulnerabilidades em 48h!</span>
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <WhatsAppButton />
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
              <p className="text-sm text-white/40">
                © {new Date().getFullYear()} CyberShield Global Security
              </p>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/5">
                  <div className="w-1.5 h-1.5 rounded-full bg-cta-positive animate-pulse" />
                  <span className="text-[10px] uppercase tracking-wider text-white/60 font-bold">
                    System Status: Optimal
                  </span>
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
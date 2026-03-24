import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import {
  Shield, Building2, Scale, Stethoscope, Laptop, Globe,
  BarChart, FileText, AlertTriangle, CheckCircle, RefreshCw,
  FileCheck, Undo2, Server, ShieldCheck, Lock, Activity,
  Package, Cpu, HardDrive, Globe2
} from "lucide-react";

/**
 * Hook that returns LANDING_CONTENT translated via i18n.
 * Replaces direct import of LANDING_CONTENT in landing components.
 */
export function useLandingContent() {
  const { t } = useTranslation();

  return useMemo(() => ({
    unifiedPlatform: {
      title: t('landing.unifiedPlatform.title'),
      subtitle: t('landing.unifiedPlatform.subtitle'),
      before: t('landing.unifiedPlatform.before'),
      after: t('landing.unifiedPlatform.after'),
      oldTools: [
        t('landing.unifiedPlatform.oldTools.0'),
        t('landing.unifiedPlatform.oldTools.1'),
        t('landing.unifiedPlatform.oldTools.2'),
      ],
      oldCosts: [
        t('landing.unifiedPlatform.oldCosts.0'),
        t('landing.unifiedPlatform.oldCosts.1'),
        t('landing.unifiedPlatform.oldCosts.2'),
      ],
      totalLabel: t('landing.unifiedPlatform.totalLabel'),
      totalOld: t('landing.unifiedPlatform.totalOld'),
      painPoints: [
        t('landing.unifiedPlatform.painPoints.0'),
        t('landing.unifiedPlatform.painPoints.1'),
        t('landing.unifiedPlatform.painPoints.2'),
      ],
      productName: t('landing.unifiedPlatform.productName'),
      productTagline: t('landing.unifiedPlatform.productTagline'),
      fromLabel: t('landing.unifiedPlatform.fromLabel'),
      price: t('landing.unifiedPlatform.price'),
      advantages: [
        t('landing.unifiedPlatform.advantages.0'),
        t('landing.unifiedPlatform.advantages.1'),
        t('landing.unifiedPlatform.advantages.2'),
        t('landing.unifiedPlatform.advantages.3'),
      ],
      capabilities: [
        { emoji: "🖥️", badge: "RMM", title: t('landing.unifiedPlatform.capabilities.0.title'), description: t('landing.unifiedPlatform.capabilities.0.description') },
        { emoji: "🛡️", badge: "EDR", title: t('landing.unifiedPlatform.capabilities.1.title'), description: t('landing.unifiedPlatform.capabilities.1.description') },
        { emoji: "⚡", badge: "MDR", title: t('landing.unifiedPlatform.capabilities.2.title'), description: t('landing.unifiedPlatform.capabilities.2.description') },
      ],
    },
    hero: {
      badge: t('landing.hero.badge'),
      title1: t('landing.hero.title1'),
      title2: t('landing.hero.title2'),
      description: t('landing.hero.description'),
      descriptionBold: t('landing.hero.descriptionBold'),
      ctaButton: t('landing.hero.ctaButton'),
      ctaSecondary: t('landing.hero.ctaSecondary'),
      reassurance: t('landing.hero.reassurance'),
      stats: [
        { value: t('landing.hero.stats.0.value'), label: t('landing.hero.stats.0.label') },
        { value: t('landing.hero.stats.1.value'), label: t('landing.hero.stats.1.label') },
        { value: t('landing.hero.stats.2.value'), label: t('landing.hero.stats.2.label') },
      ],
      benefits: [
        t('landing.hero.benefits.0'),
        t('landing.hero.benefits.1'),
        t('landing.hero.benefits.2'),
        t('landing.hero.benefits.3'),
      ],
    },
    targetAudience: {
      title: t('landing.targetAudience.title'),
      subtitle: t('landing.targetAudience.subtitle'),
      segments: [
        { icon: Building2, title: t('landing.targetAudience.segments.0.title'), description: t('landing.targetAudience.segments.0.description') },
        { icon: Scale, title: t('landing.targetAudience.segments.1.title'), description: t('landing.targetAudience.segments.1.description') },
        { icon: Stethoscope, title: t('landing.targetAudience.segments.2.title'), description: t('landing.targetAudience.segments.2.description') },
        { icon: Laptop, title: t('landing.targetAudience.segments.3.title'), description: t('landing.targetAudience.segments.3.description') },
        { icon: Globe, title: t('landing.targetAudience.segments.4.title'), description: t('landing.targetAudience.segments.4.description') },
      ],
    },
    painPoints: {
      badge: t('landing.painPoints.badge'),
      questions: [
        t('landing.painPoints.questions.0'),
        t('landing.painPoints.questions.1'),
        t('landing.painPoints.questions.2'),
        t('landing.painPoints.questions.3'),
      ],
      conclusion: t('landing.painPoints.conclusion'),
      stats: [
        { emoji: "💸", title: t('landing.painPoints.stats.0.title'), description: t('landing.painPoints.stats.0.description') },
        { emoji: "⏱️", title: t('landing.painPoints.stats.1.title'), description: t('landing.painPoints.stats.1.description') },
        { emoji: "📋", title: t('landing.painPoints.stats.2.title'), description: t('landing.painPoints.stats.2.description') },
        { emoji: "☠️", title: t('landing.painPoints.stats.3.title'), description: t('landing.painPoints.stats.3.description') },
      ],
      cta: t('landing.painPoints.cta'),
    },
    socialProof: {
      stats: [
        { value: t('landing.socialProof.stats.0.value'), label: t('landing.socialProof.stats.0.label') },
        { value: t('landing.socialProof.stats.1.value'), label: t('landing.socialProof.stats.1.label') },
        { value: t('landing.socialProof.stats.2.value'), label: t('landing.socialProof.stats.2.label') },
        { value: t('landing.socialProof.stats.3.value'), label: t('landing.socialProof.stats.3.label') },
      ],
    },
    diagnostic: {
      title: t('landing.diagnostic.title'),
      subtitle: t('landing.diagnostic.subtitle'),
      items: [
        { title: t('landing.diagnostic.items.0.title'), description: t('landing.diagnostic.items.0.description') },
        { title: t('landing.diagnostic.items.1.title'), description: t('landing.diagnostic.items.1.description') },
        { title: t('landing.diagnostic.items.2.title'), description: t('landing.diagnostic.items.2.description') },
        { title: t('landing.diagnostic.items.3.title'), description: t('landing.diagnostic.items.3.description') },
        { title: t('landing.diagnostic.items.4.title'), description: t('landing.diagnostic.items.4.description') },
      ],
    },
    benefits: {
      title: t('landing.benefits.title'),
      subtitle: t('landing.benefits.subtitle'),
      cards: [
        { icon: Package, title: t('landing.benefits.cards.0.title'), description: t('landing.benefits.cards.0.description') },
        { icon: Cpu, title: t('landing.benefits.cards.1.title'), description: t('landing.benefits.cards.1.description') },
        { icon: HardDrive, title: t('landing.benefits.cards.2.title'), description: t('landing.benefits.cards.2.description') },
        { icon: Globe2, title: t('landing.benefits.cards.3.title'), description: t('landing.benefits.cards.3.description') },
      ],
    },
    technology: {
      badge: t('landing.technology.badge'),
      title: t('landing.technology.title'),
      subtitle: t('landing.technology.subtitle'),
      features: [
        { icon: RefreshCw, title: t('landing.technology.features.0.title'), description: t('landing.technology.features.0.description') },
        { icon: FileCheck, title: t('landing.technology.features.1.title'), description: t('landing.technology.features.1.description') },
        { icon: Undo2, title: t('landing.technology.features.2.title'), description: t('landing.technology.features.2.description') },
        { icon: Server, title: t('landing.technology.features.3.title'), description: t('landing.technology.features.3.description') },
      ],
      comparison: [
        { feature: t('landing.technology.comparison.0'), cybershield: true, competitors: false },
        { feature: t('landing.technology.comparison.1'), cybershield: true, competitors: false },
        { feature: t('landing.technology.comparison.2'), cybershield: true, competitors: false },
        { feature: t('landing.technology.comparison.3'), cybershield: true, competitors: false },
      ],
    },
    useCases: {
      title: t('landing.useCases.title'),
      subtitle: t('landing.useCases.subtitle'),
      cases: [
        { icon: Laptop, title: t('landing.useCases.cases.0.title'), description: t('landing.useCases.cases.0.description') },
        { icon: Building2, title: t('landing.useCases.cases.1.title'), description: t('landing.useCases.cases.1.description') },
        { icon: ShieldCheck, title: t('landing.useCases.cases.2.title'), description: t('landing.useCases.cases.2.description') },
      ],
    },
    howItWorks: {
      title: t('landing.howItWorks.title'),
      subtitle: t('landing.howItWorks.subtitle'),
      steps: [
        { number: 1, title: t('landing.howItWorks.steps.0.title'), description: t('landing.howItWorks.steps.0.description') },
        { number: 2, title: t('landing.howItWorks.steps.1.title'), description: t('landing.howItWorks.steps.1.description') },
        { number: 3, title: t('landing.howItWorks.steps.2.title'), description: t('landing.howItWorks.steps.2.description') },
      ],
    },
    features: {
      title: t('landing.features.title'),
      subtitle: t('landing.features.subtitle'),
      items: [
        { icon: ShieldCheck, title: t('landing.features.items.0.title'), description: t('landing.features.items.0.description') },
        { icon: Package, title: t('landing.features.items.1.title'), description: t('landing.features.items.1.description') },
        { icon: FileCheck, title: t('landing.features.items.2.title'), description: t('landing.features.items.2.description') },
        { icon: Globe2, title: t('landing.features.items.3.title'), description: t('landing.features.items.3.description') },
      ],
      dashboard: {
        stats: [
          { label: t('landing.features.dashboard.stats.0.label'), value: "248" },
          { label: t('landing.features.dashboard.stats.1.label'), value: "17" },
          { label: t('landing.features.dashboard.stats.2.label'), value: "1.2k" },
        ],
        status: { label: t('landing.features.dashboard.status.label'), value: t('landing.features.dashboard.status.value') },
      },
    },
    pricing: {
      badge: t('landing.pricing.badge'),
      title: t('landing.pricing.title'),
      subtitle: t('landing.pricing.subtitle'),
      plans: [
        {
          id: "starter", name: t('landing.pricing.plans.starter.name'), price: 499, period: t('landing.pricing.perMonth'),
          baseDevices: 10, maxDevices: 50, pricePerExtra: 39,
          description: t('landing.pricing.plans.starter.description'),
          features: Array.from({ length: 6 }, (_, i) => t(`landing.pricing.plans.starter.features.${i}`)),
          cta: t('landing.pricing.plans.starter.cta'), highlighted: false,
        },
        {
          id: "business", name: t('landing.pricing.plans.business.name'), price: 899, period: t('landing.pricing.perMonth'),
          baseDevices: 20, maxDevices: 200, pricePerExtra: 24,
          description: t('landing.pricing.plans.business.description'),
          features: Array.from({ length: 6 }, (_, i) => t(`landing.pricing.plans.business.features.${i}`)),
          cta: t('landing.pricing.plans.business.cta'), highlighted: true, badge: t('landing.pricing.plans.business.badge'),
        },
        {
          id: "enterprise", name: t('landing.pricing.plans.enterprise.name'), price: 2000,
          priceLabel: t('landing.pricing.plans.enterprise.priceLabel'),
          description: t('landing.pricing.plans.enterprise.description'),
          features: Array.from({ length: 6 }, (_, i) => t(`landing.pricing.plans.enterprise.features.${i}`)),
          cta: t('landing.pricing.plans.enterprise.cta'), highlighted: false, isEnterprise: true,
        },
      ],
    },
    testimonials: {
      title: t('landing.testimonials.title'),
      subtitle: t('landing.testimonials.subtitle'),
      items: [
        { quote: t('landing.testimonials.items.0.quote'), name: t('landing.testimonials.items.0.name'), role: t('landing.testimonials.items.0.role'), devices: t('landing.testimonials.items.0.devices'), metric: t('landing.testimonials.items.0.metric'), initials: "RC" },
        { quote: t('landing.testimonials.items.1.quote'), name: t('landing.testimonials.items.1.name'), role: t('landing.testimonials.items.1.role'), devices: t('landing.testimonials.items.1.devices'), metric: t('landing.testimonials.items.1.metric'), initials: "ACS" },
        { quote: t('landing.testimonials.items.2.quote'), name: t('landing.testimonials.items.2.name'), role: t('landing.testimonials.items.2.role'), devices: t('landing.testimonials.items.2.devices'), metric: t('landing.testimonials.items.2.metric'), initials: "MF" },
      ],
    },
    faq: {
      title: t('landing.faq.title'),
      subtitle: t('landing.faq.subtitle'),
      items: Array.from({ length: 9 }, (_, i) => ({
        question: t(`landing.faq.items.${i}.question`),
        answer: t(`landing.faq.items.${i}.answer`),
      })),
    },
    calculator: {
      title: t('landing.calculator.title'),
      label: t('landing.calculator.label'),
    },
    ctaFinal: {
      title: t('landing.ctaFinal.title'),
      cta: t('landing.ctaFinal.cta'),
      ctaSecondary: t('landing.ctaFinal.ctaSecondary'),
      subtitle: t('landing.ctaFinal.subtitle'),
    },
    contact: {
      title: t('landing.contact.title'),
    },
  }), [t]);
}

import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import {
  Shield, Building2, Scale, Stethoscope, Laptop,
  BarChart, FileText, CheckCircle,
  FileCheck, Server, ShieldCheck, Lock, Activity,
  Package, Cpu, HardDrive, Globe2, Zap, Eye, Clock, Users
} from "lucide-react";

/**
 * Hook that returns LANDING_CONTENT translated via i18n.
 */
export function useLandingContent() {
  const { t } = useTranslation();

  return useMemo(() => ({
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
    painPoints: {
      badge: t('landing.painPoints.badge'),
      title: t('landing.painPoints.title'),
      text: t('landing.painPoints.text'),
      questions: [
        t('landing.painPoints.questions.0'),
        t('landing.painPoints.questions.1'),
        t('landing.painPoints.questions.2'),
        t('landing.painPoints.questions.3'),
      ],
      conclusion: t('landing.painPoints.conclusion'),
      stats: [
        { emoji: t('landing.painPoints.stats.0.emoji'), title: t('landing.painPoints.stats.0.title'), description: t('landing.painPoints.stats.0.description') },
        { emoji: t('landing.painPoints.stats.1.emoji'), title: t('landing.painPoints.stats.1.title'), description: t('landing.painPoints.stats.1.description') },
        { emoji: t('landing.painPoints.stats.2.emoji'), title: t('landing.painPoints.stats.2.title'), description: t('landing.painPoints.stats.2.description') },
        { emoji: t('landing.painPoints.stats.3.emoji'), title: t('landing.painPoints.stats.3.title'), description: t('landing.painPoints.stats.3.description') },
      ],
      cta: t('landing.painPoints.cta'),
    },
    valueProp: {
      title: t('landing.valueProp.title'),
      text: t('landing.valueProp.text'),
      tagline: t('landing.valueProp.tagline'),
    },
    howItWorks: {
      title: t('landing.howItWorks.title'),
      subtitle: t('landing.howItWorks.subtitle'),
      steps: [
        { number: 1, title: t('landing.howItWorks.steps.0.title'), description: t('landing.howItWorks.steps.0.description') },
        { number: 2, title: t('landing.howItWorks.steps.1.title'), description: t('landing.howItWorks.steps.1.description') },
        { number: 3, title: t('landing.howItWorks.steps.2.title'), description: t('landing.howItWorks.steps.2.description') },
        { number: 4, title: t('landing.howItWorks.steps.3.title'), description: t('landing.howItWorks.steps.3.description') },
      ],
    },
    assessment: {
      title: t('landing.assessment.title'),
      text: t('landing.assessment.text'),
      items: Array.from({ length: 5 }, (_, i) => t(`landing.assessment.items.${i}`)),
      cta: t('landing.assessment.cta'),
    },
    benefits: {
      title: t('landing.benefits.title'),
      subtitle: t('landing.benefits.subtitle'),
      cards: [
        { icon: Zap, title: t('landing.benefits.cards.0.title'), description: t('landing.benefits.cards.0.description') },
        { icon: Activity, title: t('landing.benefits.cards.1.title'), description: t('landing.benefits.cards.1.description') },
        { icon: BarChart, title: t('landing.benefits.cards.2.title'), description: t('landing.benefits.cards.2.description') },
        { icon: ShieldCheck, title: t('landing.benefits.cards.3.title'), description: t('landing.benefits.cards.3.description') },
      ],
    },
    features: {
      title: t('landing.features.title'),
      subtitle: t('landing.features.subtitle'),
      items: [
        { icon: Server, title: t('landing.features.items.0.title'), description: t('landing.features.items.0.description') },
        { icon: Shield, title: t('landing.features.items.1.title'), description: t('landing.features.items.1.description') },
        { icon: Zap, title: t('landing.features.items.2.title'), description: t('landing.features.items.2.description') },
        { icon: FileCheck, title: t('landing.features.items.3.title'), description: t('landing.features.items.3.description') },
        { icon: Users, title: t('landing.features.items.4.title'), description: t('landing.features.items.4.description') },
        { icon: Clock, title: t('landing.features.items.5.title'), description: t('landing.features.items.5.description') },
      ],
    },
    targetAudience: {
      title: t('landing.targetAudience.title'),
      subtitle: t('landing.targetAudience.subtitle'),
      segments: [
        { icon: Building2, title: t('landing.targetAudience.segments.0.title'), description: t('landing.targetAudience.segments.0.description') },
        { icon: Laptop, title: t('landing.targetAudience.segments.1.title'), description: t('landing.targetAudience.segments.1.description') },
        { icon: Stethoscope, title: t('landing.targetAudience.segments.2.title'), description: t('landing.targetAudience.segments.2.description') },
        { icon: Scale, title: t('landing.targetAudience.segments.3.title'), description: t('landing.targetAudience.segments.3.description') },
      ],
    },
    trustProof: {
      title: t('landing.trustProof.title'),
      text: t('landing.trustProof.text'),
      blocks: [
        { icon: Lock, title: t('landing.trustProof.blocks.0.title'), description: t('landing.trustProof.blocks.0.description') },
        { icon: Eye, title: t('landing.trustProof.blocks.1.title'), description: t('landing.trustProof.blocks.1.description') },
        { icon: FileText, title: t('landing.trustProof.blocks.2.title'), description: t('landing.trustProof.blocks.2.description') },
        { icon: CheckCircle, title: t('landing.trustProof.blocks.3.title'), description: t('landing.trustProof.blocks.3.description') },
      ],
    },
    comparison: {
      title: t('landing.comparison.title'),
      text: t('landing.comparison.text'),
      before: {
        label: t('landing.comparison.before.label'),
        items: Array.from({ length: 5 }, (_, i) => t(`landing.comparison.before.items.${i}`)),
      },
      after: {
        label: t('landing.comparison.after.label'),
        items: Array.from({ length: 5 }, (_, i) => t(`landing.comparison.after.items.${i}`)),
      },
    },
    offer: {
      title: t('landing.offer.title'),
      text: t('landing.offer.text'),
      items: Array.from({ length: 4 }, (_, i) => t(`landing.offer.items.${i}`)),
      cta: t('landing.offer.cta'),
      microcopy: t('landing.offer.microcopy'),
    },
    faq: {
      title: t('landing.faq.title'),
      subtitle: t('landing.faq.subtitle'),
      items: Array.from({ length: 6 }, (_, i) => ({
        question: t(`landing.faq.items.${i}.question`),
        answer: t(`landing.faq.items.${i}.answer`),
      })),
    },
    ctaFinal: {
      title: t('landing.ctaFinal.title'),
      subtitle: t('landing.ctaFinal.subtitle'),
      cta: t('landing.ctaFinal.cta'),
      ctaSecondary: t('landing.ctaFinal.ctaSecondary'),
    },
    contact: {
      title: t('landing.contact.title'),
    },
  }), [t]);
}

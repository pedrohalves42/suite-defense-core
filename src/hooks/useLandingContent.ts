import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import {
  Shield, Building2, Scale, Stethoscope, Laptop,
  BarChart, FileText, CheckCircle,
  FileCheck, Server, ShieldCheck, Lock, Activity,
  Package, Cpu, HardDrive, Globe2, Zap, Eye, Clock, Users,
  Link2, Brain, Fingerprint, Layers
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
      steps: (t('landing.howItWorks.steps', { returnObjects: true }) as { title: string; description: string }[] || []).map((step, i) => ({
        number: i + 1,
        ...step
      })),
    },
    assessment: {
      title: t('landing.assessment.title'),
      text: t('landing.assessment.text'),
      items: (t('landing.assessment.items', { returnObjects: true }) as string[]) || [],
      cta: t('landing.assessment.cta'),
    },
    benefits: {
      title: t('landing.benefits.title'),
      subtitle: t('landing.benefits.subtitle'),
      cards: (t('landing.benefits.cards', { returnObjects: true }) as { title: string; description: string }[] || []).map((card, i) => ({
        icon: [Zap, Activity, BarChart, ShieldCheck][i] || ShieldCheck,
        ...card
      })),
    },
    features: {
      title: t('landing.features.title'),
      subtitle: t('landing.features.subtitle'),
      items: (t('landing.features.items', { returnObjects: true }) as { title: string; description: string }[] || []).map((item, i) => ({
        icon: [Server, Shield, Zap, FileCheck, Users, Clock][i] || Shield,
        ...item
      })),
    },
    targetAudience: {
      title: t('landing.targetAudience.title'),
      subtitle: t('landing.targetAudience.subtitle'),
      segments: (t('landing.targetAudience.segments', { returnObjects: true }) as { title: string; description: string }[] || []).map((segment, i) => ({
        icon: [Building2, Laptop, Stethoscope, Scale][i] || Building2,
        ...segment
      })),
    },
    trustProof: {
      title: t('landing.trustProof.title'),
      text: t('landing.trustProof.text'),
      blocks: (t('landing.trustProof.blocks', { returnObjects: true }) as { title: string; description: string }[] || []).map((block, i) => ({
        icon: [Lock, Eye, FileText, CheckCircle][i] || Lock,
        ...block
      })),
    },
    comparison: {
      title: t('landing.comparison.title'),
      text: t('landing.comparison.text'),
      before: {
        label: t('landing.comparison.before.label'),
        items: (t('landing.comparison.before.items', { returnObjects: true }) as string[]) || [],
      },
      after: {
        label: t('landing.comparison.after.label'),
        items: (t('landing.comparison.after.items', { returnObjects: true }) as string[]) || [],
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
      items: (t('landing.faq.items', { returnObjects: true }) as { question: string; answer: string }[]) || [],
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
    differentiators: {
      title: t('landing.differentiators.title'),
      subtitle: t('landing.differentiators.subtitle'),
      items: Array.isArray(t('landing.differentiators.items', { returnObjects: true })) ? (t('landing.differentiators.items', { returnObjects: true }) as any[]) : Object.values(t('landing.differentiators.items', { returnObjects: true }) || {}),
    },
  }), [t]);
}

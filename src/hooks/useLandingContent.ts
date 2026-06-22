import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import {
  Shield, Building2, Scale, Stethoscope, Laptop,
  BarChart, FileText, CheckCircle,
  FileCheck, Server, ShieldCheck, Lock, Activity,
  Zap, Eye, Clock, Users,
} from "lucide-react";

type LandingItem = Record<string, string>;

/**
 * Hook that returns LANDING_CONTENT translated via i18n.
 */
export function useLandingContent() {
  const { t } = useTranslation();

  return useMemo(() => {
    // Helper to get translated items safely
    const getItems = (key: string) => {
      const val = t(key, { returnObjects: true });
      if (!val || typeof val === 'string') return [];
      return Array.isArray(val) ? val : Object.values(val);
    };

    return {
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
        benefits: getItems('landing.hero.benefits'),
      },
      painPoints: {
        badge: t('landing.painPoints.badge'),
        title: t('landing.painPoints.title'),
        text: t('landing.painPoints.text'),
        questions: getItems('landing.painPoints.questions'),
        conclusion: t('landing.painPoints.conclusion'),
        stats: getItems('landing.painPoints.stats'),
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
        steps: (getItems('landing.howItWorks.steps') as LandingItem[]).map((step, i) => ({
          number: step.number || i + 1,
          ...step
        })),
      },
      assessment: {
        title: t('landing.assessment.title'),
        text: t('landing.assessment.text'),
        items: getItems('landing.assessment.items'),
        cta: t('landing.assessment.cta'),
      },
      benefits: {
        title: t('landing.benefits.title'),
        subtitle: t('landing.benefits.subtitle'),
        cards: (getItems('landing.benefits.cards') as LandingItem[]).map((card, i) => ({
          icon: [Zap, Activity, BarChart, ShieldCheck][i] || ShieldCheck,
          ...card
        })),
      },
      features: {
        title: t('landing.features.title'),
        subtitle: t('landing.features.subtitle'),
        items: (getItems('landing.features.items') as LandingItem[]).map((item, i) => ({
          icon: [Server, Shield, Zap, FileCheck, Users, Clock][i] || Shield,
          ...item
        })),
      },
      targetAudience: {
        title: t('landing.targetAudience.title'),
        subtitle: t('landing.targetAudience.subtitle'),
        segments: (getItems('landing.targetAudience.segments') as LandingItem[]).map((segment, i) => ({
          icon: [Building2, Laptop, Stethoscope, Scale][i] || Building2,
          ...segment
        })),
      },
      trustProof: {
        title: t('landing.trustProof.title'),
        text: t('landing.trustProof.text'),
        blocks: (getItems('landing.trustProof.blocks') as LandingItem[]).map((block, i) => ({
          icon: [Lock, Eye, FileText, CheckCircle][i] || Lock,
          ...block
        })),
      },
      comparison: {
        title: t('landing.comparison.title'),
        text: t('landing.comparison.text'),
        before: {
          label: t('landing.comparison.before.label'),
          items: getItems('landing.comparison.before.items'),
        },
        after: {
          label: t('landing.comparison.after.label'),
          items: getItems('landing.comparison.after.items'),
        },
      },
      offer: {
        title: t('landing.offer.title'),
        text: t('landing.offer.text'),
        items: getItems('landing.offer.items'),
        cta: t('landing.offer.cta'),
        microcopy: t('landing.offer.microcopy'),
      },
      faq: {
        title: t('landing.faq.title'),
        subtitle: t('landing.faq.subtitle'),
        items: getItems('landing.faq.items'),
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
        items: getItems('landing.differentiators.items'),
      },
    };
  }, [t]);
}

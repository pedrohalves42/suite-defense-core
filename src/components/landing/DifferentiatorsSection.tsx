import { useLandingContent } from "@/hooks/useLandingContent";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { DifferentiatorsDecorations } from "./shared/AnimatedDecorations";
import { Shield, Link2, Brain, Zap, Fingerprint, Layers } from "lucide-react";

const ICONS = [Shield, Link2, Brain, Zap, Fingerprint, Layers];

export function DifferentiatorsSection() {
  const { differentiators } = useLandingContent();
  const { t } = useTranslation();

  if (!differentiators) return null;

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Premium dark background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,20%,8%)] via-[hsl(200,18%,10%)] to-[hsl(160,15%,8%)]" />
      <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-cta-positive/5 rounded-full blur-[200px]" />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-info/5 rounded-full blur-[150px]" />
      <DifferentiatorsDecorations />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16 space-y-4"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cta-positive/15 border border-cta-positive/25 mb-4">
            <Shield className="w-4 h-4 text-cta-positive" />
            <span className="text-sm font-medium text-cta-positive">{t('landing.differentiators.badge', 'O que nos torna únicos')}</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
            {differentiators.title}
          </h2>
          <p className="text-lg text-white/60 max-w-3xl mx-auto leading-relaxed">
            {differentiators.subtitle}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {differentiators.items.map((item: { title: string; description: string; metric: string; metricLabel: string }, index: number) => {
            const Icon = ICONS[index] || Shield;
            return (
              <motion.div
                key={index}
                className="group relative p-6 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-cta-positive/40 transition-all duration-300"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
              >
                {/* Hover glow */}
                <div className="absolute inset-0 rounded-2xl bg-cta-positive/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="relative">
                  {/* Metric badge */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-cta-positive/10 rounded-xl flex items-center justify-center group-hover:bg-cta-positive/20 transition-colors">
                      <Icon className="w-6 h-6 text-cta-positive" />
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-cta-positive">{item.metric}</div>
                      <div className="text-xs text-white/40">{item.metricLabel}</div>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{item.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

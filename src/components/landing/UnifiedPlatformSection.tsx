import { Shield, Monitor, Zap, X, ArrowRight, CheckCircle } from "lucide-react";
import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";

const oldTools = [
  { icon: Monitor, labelKey: "rmm" as const, color: "text-info" },
  { icon: Shield, labelKey: "antivirus" as const, color: "text-warning" },
  { icon: Zap, labelKey: "compliance" as const, color: "text-destructive" },
];

export function UnifiedPlatformSection() {
  const { unifiedPlatform } = useLandingContent();

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-cta-positive/[0.03] to-background" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title={unifiedPlatform.title}
          subtitle={unifiedPlatform.subtitle}
        />

        {/* Before vs After */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-16">
          {/* BEFORE — fragmented */}
          <motion.div
            className="p-8 rounded-2xl bg-card border border-destructive/20 relative"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="absolute -top-3 left-6 px-3 py-1 bg-destructive/10 text-destructive text-xs font-bold rounded-full border border-destructive/20">
              {unifiedPlatform.before}
            </div>
            <div className="space-y-4 mt-2">
              {oldTools.map((tool, i) => {
                const Icon = tool.icon;
                return (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border">
                    <Icon className={`w-6 h-6 ${tool.color}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{unifiedPlatform.oldTools[i]}</p>
                    </div>
                    <span className="text-xs text-destructive font-medium">{unifiedPlatform.oldCosts[i]}</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-sm text-muted-foreground">{unifiedPlatform.totalLabel}</span>
                <span className="text-lg font-bold text-destructive line-through">{unifiedPlatform.totalOld}</span>
              </div>
              <ul className="space-y-2 pt-2">
                {unifiedPlatform.painPoints.map((pain, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <X className="w-4 h-4 text-destructive shrink-0" />
                    {pain}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          {/* AFTER — unified */}
          <motion.div
            className="p-8 rounded-2xl bg-card border-2 border-cta-positive/30 relative shadow-lg shadow-cta-positive/5"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="absolute -top-3 left-6 px-3 py-1 bg-cta-positive/15 text-cta-positive text-xs font-bold rounded-full border border-cta-positive/25">
              {unifiedPlatform.after}
            </div>
            <div className="space-y-4 mt-2">
              <div className="p-5 rounded-xl bg-cta-positive/5 border border-cta-positive/15 text-center">
                <Shield className="w-10 h-10 text-cta-positive mx-auto mb-2" />
                <p className="font-bold text-foreground text-lg">{unifiedPlatform.productName}</p>
                <p className="text-sm text-muted-foreground mt-1">{unifiedPlatform.productTagline}</p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-sm text-muted-foreground">{unifiedPlatform.fromLabel}</span>
                <span className="text-2xl font-bold text-cta-positive">{unifiedPlatform.price}</span>
              </div>

              <ul className="space-y-2 pt-2">
                {unifiedPlatform.advantages.map((adv, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                    <CheckCircle className="w-4 h-4 text-cta-positive shrink-0" />
                    {adv}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>

        {/* 3-in-1 capability cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {unifiedPlatform.capabilities.map((cap, index) => (
            <motion.div
              key={index}
              className="p-6 rounded-2xl bg-card border border-border hover:border-cta-positive/30 transition-all group"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <div className="w-12 h-12 bg-cta-positive/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cta-positive/15 transition-colors">
                <span className="text-xl">{cap.emoji}</span>
              </div>
              <div className="inline-block px-2 py-0.5 bg-cta-positive/10 rounded text-xs font-bold text-cta-positive mb-3">
                {cap.badge}
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{cap.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{cap.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

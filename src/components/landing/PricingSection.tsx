import { useTranslation } from "react-i18next";
import { CheckCircle, ArrowRight, Star, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { SectionHeader } from "./shared/SectionHeader";

const PLAN_KEYS = ["starter", "business", "enterprise"] as const;

export function PricingSection() {
  const { t } = useTranslation();

  return (
    <section id="planos" className="py-32 relative overflow-hidden bg-background">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-cta-positive/[0.04] to-background" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <SectionHeader 
          badge={{ text: t("landing.pricing.badge"), icon: ShieldCheck }}
          title={t("landing.pricing.title")}
          subtitle={t("landing.pricing.subtitle")}
        />

        <div className="grid md:grid-cols-3 gap-10 max-w-7xl mx-auto">
          {PLAN_KEYS.map((key, index) => {
            const planBadge = t(`landing.pricing.plans.${key}.badge`);
            const isPopular = !!planBadge;
            const price = t(`landing.pricing.plans.${key}.price`);
            const isCustomPrice = isNaN(Number(price));
            const features = Array.from({ length: 6 }, (_, i) =>
              t(`landing.pricing.plans.${key}.features.${i}`)
            );

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.8 }}
                className={`relative rounded-[2.5rem] border p-10 flex flex-col glass-card transition-all duration-700 ${
                  isPopular
                    ? "border-cta-positive/30 shadow-[0_20px_50px_rgba(16,185,129,0.1)] scale-[1.05] z-10"
                    : "border-white/5 opacity-90"
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-cta-positive text-white text-[10px] font-black uppercase tracking-[0.2em] px-6 py-2 rounded-full shadow-glow">
                    {planBadge}
                  </div>
                )}

                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-white mb-3 tracking-tight">
                    {t(`landing.pricing.plans.${key}.name`)}
                  </h3>
                  <p className="text-sm text-white/50 mb-6 font-medium leading-relaxed">
                    {t(`landing.pricing.plans.${key}.description`)}
                  </p>

                  <div className="flex items-baseline gap-1 mb-3">
                    {!isCustomPrice && (
                      <span className="text-xl font-bold text-white/40">R$</span>
                    )}
                    <span className="text-5xl font-black text-white tracking-tighter">
                      {price}
                    </span>
                    {!isCustomPrice && (
                      <span className="text-white/40 font-bold ml-2">
                        {t("landing.pricing.perMonth")}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-white/40 font-medium">
                      {t(`landing.pricing.plans.${key}.baseInfo`)}
                    </p>
                    <p className="text-xs font-bold text-cta-positive/80 uppercase tracking-widest">
                      {t(`landing.pricing.plans.${key}.maxInfo`)}
                    </p>
                  </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent mb-8" />

                <ul className="space-y-4 mb-10 flex-1">
                  {features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 group/item">
                      <div className="w-5 h-5 rounded-full bg-cta-positive/10 flex items-center justify-center mt-0.5 group-hover/item:scale-110 transition-transform">
                        <CheckCircle className="w-3.5 h-3.5 text-cta-positive" />
                      </div>
                      <span className="text-[15px] text-white/60 group-hover/item:text-white/80 transition-colors font-medium">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  size="lg"
                  variant={isPopular ? "cta" : "outline"}
                  className={`w-full h-14 rounded-full font-bold text-base transition-all duration-500 border border-white/10 ${
                    isPopular ? "shadow-glow hover:shadow-[0_0_30px_rgba(16,185,129,0.4)]" : "bg-white/[0.02] hover:bg-white/[0.05]"
                  }`}
                  onClick={() =>
                    document
                      .getElementById("contato")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  {t(`landing.pricing.plans.${key}.cta`)}
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

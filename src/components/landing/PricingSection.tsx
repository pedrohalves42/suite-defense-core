import { useTranslation } from "react-i18next";
import { CheckCircle, ArrowRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

const PLAN_KEYS = ["starter", "business", "enterprise"] as const;

export function PricingSection() {
  const { t } = useTranslation();

  return (
    <section id="planos" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/[0.02] to-background" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <Badge variant="outline" className="mb-4">
            {t("landing.pricing.badge")}
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t("landing.pricing.title")}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("landing.pricing.subtitle")}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {PLAN_KEYS.map((key, index) => {
            const badge = t(`landing.pricing.plans.${key}.badge`);
            const isPopular = !!badge;
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
                transition={{ delay: index * 0.1 }}
                className={`relative rounded-2xl border p-8 flex flex-col ${
                  isPopular
                    ? "border-primary bg-card shadow-xl shadow-primary/10 scale-[1.02]"
                    : "border-border bg-card"
                }`}
              >
                {isPopular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1">
                    <Star className="w-3 h-3 mr-1" />
                    {badge}
                  </Badge>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-bold text-foreground mb-2">
                    {t(`landing.pricing.plans.${key}.name`)}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t(`landing.pricing.plans.${key}.description`)}
                  </p>

                  <div className="flex items-baseline gap-1 mb-2">
                    {!isCustomPrice && (
                      <span className="text-sm text-muted-foreground">R$</span>
                    )}
                    <span className="text-4xl font-bold text-foreground">
                      {isCustomPrice ? price : price}
                    </span>
                    {!isCustomPrice && (
                      <span className="text-muted-foreground">
                        {t("landing.pricing.perMonth")}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {t(`landing.pricing.plans.${key}.baseInfo`)}
                  </p>
                  <p className="text-xs font-medium text-foreground/70">
                    {t(`landing.pricing.plans.${key}.maxInfo`)}
                  </p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-cta-positive mt-0.5 shrink-0" />
                      <span className="text-sm text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  size="lg"
                  variant={isPopular ? "cta" : "outline"}
                  className={`w-full font-semibold ${
                    isPopular ? "shadow-lg shadow-cta-positive/25" : ""
                  }`}
                  onClick={() =>
                    document
                      .getElementById("contato")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  {t(`landing.pricing.plans.${key}.cta`)}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";

export function FeaturesSection() {
  const { features } = useLandingContent();

  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader title={features.title} subtitle={features.subtitle} />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {features.items.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div key={index} className="group p-6 rounded-2xl bg-card border border-border hover:border-cta-positive/30 transition-all" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }}>
                <div className="w-12 h-12 bg-cta-positive/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cta-positive/15 transition-colors">
                  <Icon className="w-6 h-6 text-cta-positive" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

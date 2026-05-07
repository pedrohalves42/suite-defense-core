import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";

export function BenefitsSection() {
  const { benefits } = useLandingContent();

  return (
    <section id="recursos" className="py-24 relative">
      {/* Green tinted background — "you're now in the safe zone" */}
      <div className="absolute inset-0 bg-gradient-to-b from-cta-positive/[0.03] via-background to-background" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={benefits.title}
          subtitle={benefits.subtitle}
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {benefits.cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div 
                key={index}
                className="group relative p-8 rounded-2xl bg-card border border-border hover:border-cta-positive/30 transition-all duration-300 hover:shadow-elevated"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                {/* Hover glow — green = security */}
                <div className="absolute inset-0 rounded-2xl bg-cta-positive/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="relative">
                  <div className="w-14 h-14 bg-cta-positive/10 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-cta-positive/15 transition-colors">
                    <Icon className="w-7 h-7 text-cta-positive" />
                  </div>
                  <h3 className="text-lg font-semibold mb-3 text-foreground">{card.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
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
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto stagger-visible">
          {features.items.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={index} className="group relative p-8 rounded-3xl bg-card border border-border shadow-premium hover:shadow-float hover:border-cta-positive/20 transition-all duration-500 ease-premium">
                <div className="absolute inset-0 premium-gradient rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-cta-positive/5 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-cta-positive/10 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 ease-premium">
                    <Icon className="w-7 h-7 text-cta-positive brightness-110 shadow-glow" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3 tracking-tight">{item.title}</h3>
                  <p className="text-[15px] text-muted-foreground leading-relaxed font-medium">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";
import { safeMap } from "@/lib/safe-data";

export function TargetAudienceSection() {
  const { targetAudience } = useLandingContent();

  if (!targetAudience || !Array.isArray(targetAudience.segments)) return null;

  return (
    <section className="py-24 relative bg-background">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-info/[0.04] to-background" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader title={targetAudience.title} subtitle={targetAudience.subtitle} />
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {safeMap(targetAudience.segments, (segment, index) => {
            const Icon = segment.icon;
            return (
              <motion.div key={index} className="group p-8 rounded-2xl bg-card border border-border hover:border-info/30 transition-all" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }}>
                <div className="w-14 h-14 bg-info/10 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-info/15 transition-colors">
                  {Icon ? (
                    <Icon className="w-7 h-7 text-info" />
                  ) : (
                    <div className="w-7 h-7 bg-info/20 rounded-lg animate-pulse" />
                  )}
                </div>
                <h3 className="text-lg font-semibold mb-3 text-foreground">{segment.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{segment.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

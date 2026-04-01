import { X, CheckCircle } from "lucide-react";
import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";

export function ComparisonSection() {
  const { comparison } = useLandingContent();

  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16 space-y-4"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
            {comparison.title}
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            {comparison.text}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Before */}
          <motion.div
            className="p-8 rounded-2xl bg-card border border-destructive/20"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="inline-block px-3 py-1 bg-destructive/10 text-destructive text-xs font-bold rounded-full border border-destructive/20 mb-6">
              {comparison.before.label}
            </div>
            <ul className="space-y-4">
              {comparison.before.items.map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-muted-foreground">
                  <X className="w-5 h-5 text-destructive shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* After */}
          <motion.div
            className="p-8 rounded-2xl bg-card border-2 border-cta-positive/30 shadow-lg shadow-cta-positive/5"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="inline-block px-3 py-1 bg-cta-positive/15 text-cta-positive text-xs font-bold rounded-full border border-cta-positive/25 mb-6">
              {comparison.after.label}
            </div>
            <ul className="space-y-4">
              {comparison.after.items.map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-foreground">
                  <CheckCircle className="w-5 h-5 text-cta-positive shrink-0" />
                  <span className="font-medium">{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

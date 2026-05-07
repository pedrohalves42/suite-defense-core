import { useLandingContent } from "@/hooks/useLandingContent";
import { motion } from "framer-motion";

export function ValuePropSection() {
  const { valueProp } = useLandingContent();

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-cta-positive/[0.03] to-background" />
      
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="space-y-8"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
            {valueProp.title}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl mx-auto">
            {valueProp.text}
          </p>
          
          {/* Tagline strip */}
          <motion.div
            className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-cta-positive/10 border border-cta-positive/20"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <span className="text-xl md:text-2xl font-bold text-cta-positive tracking-wide">
              {valueProp.tagline}
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

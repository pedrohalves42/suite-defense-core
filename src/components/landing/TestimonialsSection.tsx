import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";
import { Quote, CheckCircle, TrendingUp } from "lucide-react";
import { useState } from "react";
import screenshot1 from "@/assets/testimonial-screenshot-1.jpg";
import screenshot2 from "@/assets/testimonial-screenshot-2.jpg";
import screenshot3 from "@/assets/testimonial-screenshot-3.jpg";

const screenshots = [screenshot1, screenshot2, screenshot3];

export function TestimonialsSection() {
  const { testimonials } = useLandingContent();
  const [expandedImage, setExpandedImage] = useState<number | null>(null);

  return (
    <section id="depoimentos" className="py-24 relative">
      {/* Blue tint — blue = trust, credibility (psicologia: azul = confiança) */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-info/[0.03] to-background" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={testimonials.title}
          subtitle={testimonials.subtitle}
        />

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.items.map((testimonial, index) => (
            <motion.div
              key={index}
              className="relative flex flex-col rounded-2xl bg-card border border-border hover:border-info/30 transition-all duration-300 group overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.15 }}
            >
              {/* Screenshot preview */}
              <div 
                className="relative cursor-pointer overflow-hidden"
                onClick={() => setExpandedImage(expandedImage === index ? null : index)}
              >
                <img 
                  src={screenshots[index]} 
                  alt={`Dashboard do cliente ${testimonial.name}`}
                  className="w-full h-40 object-cover object-top transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                <div className="absolute bottom-2 left-3 right-3">
                  {/* Green metric badge — "proven results" */}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cta-positive/20 text-cta-positive text-[11px] font-semibold backdrop-blur-sm border border-cta-positive/20">
                    <CheckCircle className="w-3 h-3" />
                    {testimonial.metric}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 flex flex-col flex-1">
                <Quote className="w-7 h-7 text-info/25 mb-3 flex-shrink-0" />
                
                <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-1">
                  "{testimonial.quote}"
                </p>
                
                <div className="flex items-center gap-3 pt-4 border-t border-border/50">
                  <div className="w-11 h-11 bg-info/10 rounded-full flex items-center justify-center ring-2 ring-info/20 flex-shrink-0">
                    <span className="font-bold text-xs text-info">{testimonial.initials}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{testimonial.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{testimonial.role}</p>
                    <p className="text-[11px] text-cta-positive/80 font-medium truncate">{testimonial.devices}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Trust bar — green numbers = positive proof */}
        <motion.div
          className="mt-12 flex flex-wrap justify-center items-center gap-6 md:gap-10 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          {[
            { value: "98%", label: "Taxa de satisfação" },
            { value: "<2h", label: "Tempo médio de resposta" },
            { value: "0", label: "Incidentes em clientes ativos" },
          ].map((stat, i) => (
            <div key={i} className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cta-positive" />
              <span className="text-sm font-bold text-cta-positive">{stat.value}</span>
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
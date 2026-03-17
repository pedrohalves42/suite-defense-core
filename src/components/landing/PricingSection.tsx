import { Zap, Crown, CheckCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { CONTACT } from "@/constants/config";
import { motion } from "framer-motion";

export function PricingSection() {
  const { pricing } = useLandingContent();
  const whatsappLink = `${CONTACT.WHATSAPP_LINK}?text=${CONTACT.WHATSAPP_TEXT_DEFAULT}`;

  const planIcons = {
    starter: Zap,
    business: Crown,
    enterprise: Shield
  };

  return (
    <section id="precos" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          badge={{ icon: Shield, text: pricing.badge }}
          title={pricing.title}
          subtitle={pricing.subtitle}
        />

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto items-stretch">
          {pricing.plans.map((plan, index) => {
            const Icon = planIcons[plan.id as keyof typeof planIcons];
            const isHighlighted = plan.highlighted;
            const isEnterprise = plan.isEnterprise;

            return (
              <motion.div 
                key={plan.id}
                className={`relative flex flex-col p-8 rounded-2xl transition-all duration-300 ${
                  isHighlighted 
                    ? 'bg-gradient-to-b from-[hsl(160,20%,12%)] to-[hsl(220,16%,14%)] text-white border-2 border-cta-positive/40 shadow-float shadow-cta-positive/10 scale-[1.03] z-10' 
                    : 'bg-card border border-border hover:border-cta-positive/20'
                }`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                {/* Badge — green = best value */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cta-positive text-cta-positive-foreground px-5 py-1.5 rounded-full text-xs font-bold shadow-lg shadow-cta-positive/20">
                    {plan.badge}
                  </div>
                )}

                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                  <div className={`p-2.5 rounded-xl ${isHighlighted ? 'bg-cta-positive/20' : 'bg-cta-positive/10'}`}>
                    <Icon className={`w-6 h-6 ${isHighlighted ? 'text-cta-positive' : 'text-accent'}`} />
                  </div>
                  <h3 className={`text-xl font-bold ${isHighlighted ? 'text-white' : 'text-foreground'}`}>{plan.name}</h3>
                </div>

                {/* Price */}
                <div className="mb-2 min-h-[3rem] flex items-baseline">
                {plan.price ? (
                    <>
                      {isEnterprise && plan.priceLabel && (
                        <span className={`text-sm mr-1 ${isHighlighted ? 'text-white/60' : 'text-muted-foreground'}`}>
                          {plan.priceLabel}
                        </span>
                      )}
                      <span className={`text-4xl font-bold ${isHighlighted ? 'text-white' : 'text-foreground'}`}>
                        R$ {plan.price.toLocaleString('pt-BR')}
                      </span>
                      <span className={`text-sm ml-1 ${isHighlighted ? 'text-white/60' : 'text-muted-foreground'}`}>
                        {plan.period || '/mês'}
                      </span>
                    </>
                  ) : (
                    <span className={`text-3xl font-bold ${isHighlighted ? 'text-white' : 'text-foreground'}`}>
                      {plan.priceLabel}
                    </span>
                  )}
                </div>

                {/* Device Info */}
                <div className={`text-xs mb-6 min-h-[2.5rem] ${isHighlighted ? 'text-white/50' : 'text-muted-foreground'}`}>
                  {plan.baseDevices && plan.pricePerExtra ? (
                    <>
                      Base: {plan.baseDevices} dispositivos • +R$ {plan.pricePerExtra}/adicional<br />
                      <span className={`font-medium ${isHighlighted ? 'text-cta-positive' : 'text-cta-positive'}`}>
                        Até {plan.maxDevices} dispositivos
                      </span>
                    </>
                  ) : isEnterprise ? (
                    <>
                      Para empresas +200 dispositivos ou MSPs<br />
                      <span className={`font-medium ${isHighlighted ? 'text-cta-positive' : 'text-accent'}`}>
                        Dispositivos ilimitados
                      </span>
                    </>
                  ) : null}
                </div>

                {/* Description */}
                <p className={`text-sm mb-8 ${isHighlighted ? 'text-white/65' : 'text-muted-foreground'}`}>
                  {plan.description}
                </p>

                {/* Features — green checks = "included, safe" */}
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className={`w-4 h-4 shrink-0 mt-0.5 ${isHighlighted ? 'text-cta-positive' : 'text-cta-positive'}`} />
                      <span className={`text-sm ${isHighlighted ? 'text-white/90' : 'text-foreground'}`}>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isHighlighted ? (
                  <Button variant="cta" className="w-full h-12 font-semibold mt-auto shadow-lg shadow-cta-positive/20" asChild>
                    <Link to="/signup">{plan.cta}</Link>
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full h-12 mt-auto hover:border-cta-positive/30 hover:text-cta-positive" asChild>
                    {isEnterprise ? (
                      <a href={whatsappLink} target="_blank" rel="noopener noreferrer">{plan.cta}</a>
                    ) : (
                      <Link to="/signup">{plan.cta}</Link>
                    )}
                  </Button>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
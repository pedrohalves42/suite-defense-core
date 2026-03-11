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
                    ? 'bg-primary text-primary-foreground border-2 border-accent/40 shadow-float scale-[1.03] z-10' 
                    : 'bg-card border border-border hover:border-accent/20'
                }`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-5 py-1.5 rounded-full text-xs font-bold shadow-lg">
                    {plan.badge}
                  </div>
                )}

                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                  <div className={`p-2.5 rounded-xl ${isHighlighted ? 'bg-accent/20' : 'bg-accent/10'}`}>
                    <Icon className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className={`text-xl font-bold ${isHighlighted ? '' : 'text-foreground'}`}>{plan.name}</h3>
                </div>

                {/* Price — consistent sizing */}
                <div className="mb-2 min-h-[3rem] flex items-baseline">
                {plan.price ? (
                    <>
                      {isEnterprise && plan.priceLabel && (
                        <span className={`text-sm mr-1 ${isHighlighted ? 'opacity-70' : 'text-muted-foreground'}`}>
                          {plan.priceLabel}
                        </span>
                      )}
                      <span className={`text-4xl font-bold ${isHighlighted ? '' : 'text-foreground'}`}>
                        R$ {plan.price.toLocaleString('pt-BR')}
                      </span>
                      <span className={`text-sm ml-1 ${isHighlighted ? 'opacity-70' : 'text-muted-foreground'}`}>
                        {plan.period || '/mês'}
                      </span>
                    </>
                  ) : (
                    <span className={`text-3xl font-bold ${isHighlighted ? '' : 'text-foreground'}`}>
                      {plan.priceLabel}
                    </span>
                  )}
                </div>

                {/* Device Info — consistent height for all cards */}
                <div className={`text-xs mb-6 min-h-[2.5rem] ${isHighlighted ? 'opacity-60' : 'text-muted-foreground'}`}>
                  {plan.baseDevices && plan.pricePerExtra ? (
                    <>
                      Base: {plan.baseDevices} dispositivos • +R$ {plan.pricePerExtra}/adicional<br />
                      <span className={`font-medium ${isHighlighted ? 'opacity-80' : 'text-accent'}`}>
                        Até {plan.maxDevices} dispositivos
                      </span>
                    </>
                  ) : isEnterprise ? (
                    <>
                      Para empresas +200 dispositivos ou MSPs<br />
                      <span className={`font-medium ${isHighlighted ? 'opacity-80' : 'text-accent'}`}>
                        Dispositivos ilimitados
                      </span>
                    </>
                  ) : null}
                </div>

                {/* Description */}
                <p className={`text-sm mb-8 ${isHighlighted ? 'opacity-75' : 'text-muted-foreground'}`}>
                  {plan.description}
                </p>

                {/* Features — flex-1 pushes CTA to bottom */}
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-accent" />
                      <span className={`text-sm ${isHighlighted ? '' : 'text-foreground'}`}>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA — always at bottom */}
                {isHighlighted ? (
                  <Button className="w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold mt-auto" asChild>
                    <Link to="/signup">{plan.cta}</Link>
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full h-12 mt-auto" asChild>
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

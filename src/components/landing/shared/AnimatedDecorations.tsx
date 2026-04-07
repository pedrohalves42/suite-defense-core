import { motion } from "framer-motion";
import { Shield, Lock, Eye, Wifi, Server, Database, Cloud, Cpu, Globe, Fingerprint, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const floatAnimation = {
  y: [0, -12, 0],
  transition: { duration: 4, repeat: Infinity, ease: "easeInOut" as const }
};

const floatSlowAnimation = {
  y: [0, -8, 0],
  transition: { duration: 6, repeat: Infinity, ease: "easeInOut" as const }
};

const pulseAnimation = {
  scale: [1, 1.08, 1],
  opacity: [0.15, 0.25, 0.15],
  transition: { duration: 3, repeat: Infinity, ease: "easeInOut" as const }
};

const rotateAnimation = {
  rotate: [0, 360],
  transition: { duration: 20, repeat: Infinity, ease: "linear" as const }
};

const rotateSlow = {
  rotate: [0, 360],
  transition: { duration: 40, repeat: Infinity, ease: "linear" as const }
};

interface FloatingIconProps {
  icon: React.ElementType;
  className?: string;
  size?: number;
  animation?: "float" | "floatSlow" | "pulse" | "rotate" | "rotateSlow";
  delay?: number;
  color?: string;
}

export function FloatingIcon({ icon: Icon, className, size = 24, animation = "float", delay = 0, color = "text-cta-positive/20" }: FloatingIconProps) {
  const animations = {
    float: floatAnimation,
    floatSlow: floatSlowAnimation,
    pulse: pulseAnimation,
    rotate: rotateAnimation,
    rotateSlow: rotateSlow,
  };

  const base = animations[animation];
  const animateProps = {
    ...base,
    transition: { ...base.transition, delay },
  };

  return (
    <motion.div
      className={cn("absolute pointer-events-none", color, className)}
      animate={animateProps}
    >
      <Icon size={size} />
    </motion.div>
  );
}

// Orb pulsante decorativo
export function PulsingOrb({ className, color = "bg-cta-positive/10" }: { className?: string; color?: string }) {
  return (
    <motion.div
      className={cn("absolute rounded-full pointer-events-none blur-2xl", color, className)}
      animate={{
        scale: [1, 1.3, 1],
        opacity: [0.3, 0.6, 0.3],
      }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

// Anel rotativo decorativo
export function RotatingRing({ className, size = 200 }: { className?: string; size?: number }) {
  return (
    <motion.div
      className={cn("absolute pointer-events-none border border-dashed border-cta-positive/10 rounded-full", className)}
      style={{ width: size, height: size }}
      animate={{ rotate: 360 }}
      transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
    />
  );
}

// Presets para cada seção
export function HeroDecorations() {
  return (
    <>
      <FloatingIcon icon={Shield} className="top-[15%] right-[8%]" size={32} animation="float" color="text-cta-positive/15" />
      <FloatingIcon icon={Lock} className="top-[60%] right-[5%]" size={20} animation="floatSlow" delay={1} color="text-info/15" />
      <FloatingIcon icon={Eye} className="bottom-[20%] right-[15%]" size={24} animation="pulse" delay={0.5} color="text-cta-positive/10" />
      <RotatingRing className="top-[10%] right-[2%]" size={120} />
      <PulsingOrb className="w-16 h-16 top-[30%] right-[12%]" color="bg-cta-positive/8" />
    </>
  );
}

export function PainPointsDecorations() {
  return (
    <>
      <FloatingIcon icon={ShieldCheck} className="top-[10%] right-[5%]" size={28} animation="float" delay={0.3} color="text-destructive/15" />
      <FloatingIcon icon={Zap} className="bottom-[15%] left-[3%]" size={22} animation="pulse" delay={1} color="text-destructive/12" />
      <RotatingRing className="bottom-[5%] right-[8%]" size={100} />
    </>
  );
}

export function ValuePropDecorations() {
  return (
    <>
      <FloatingIcon icon={Globe} className="top-[15%] left-[5%]" size={28} animation="floatSlow" color="text-cta-positive/12" />
      <FloatingIcon icon={Cpu} className="top-[20%] right-[8%]" size={22} animation="float" delay={0.7} color="text-cta-positive/15" />
      <PulsingOrb className="w-20 h-20 bottom-[10%] right-[10%]" color="bg-cta-positive/6" />
    </>
  );
}

export function HowItWorksDecorations() {
  return (
    <>
      <FloatingIcon icon={Server} className="top-[8%] right-[3%]" size={26} animation="float" delay={0.2} color="text-info/15" />
      <FloatingIcon icon={Database} className="bottom-[12%] left-[4%]" size={22} animation="floatSlow" delay={1.2} color="text-info/12" />
      <RotatingRing className="top-[5%] left-[8%]" size={80} />
    </>
  );
}

export function AssessmentDecorations() {
  return (
    <>
      <FloatingIcon icon={Fingerprint} className="top-[12%] right-[6%]" size={30} animation="pulse" delay={0.5} color="text-info/15" />
      <FloatingIcon icon={Cloud} className="bottom-[18%] left-[5%]" size={24} animation="float" delay={0.8} color="text-cta-positive/12" />
    </>
  );
}

export function BenefitsDecorations() {
  return (
    <>
      <FloatingIcon icon={ShieldCheck} className="top-[5%] left-[3%]" size={28} animation="float" color="text-cta-positive/12" />
      <FloatingIcon icon={Wifi} className="top-[10%] right-[5%]" size={22} animation="floatSlow" delay={0.6} color="text-cta-positive/10" />
      <PulsingOrb className="w-24 h-24 bottom-[5%] left-[15%]" color="bg-cta-positive/5" />
    </>
  );
}

export function FeaturesDecorations() {
  return (
    <>
      <FloatingIcon icon={Cpu} className="top-[8%] left-[4%]" size={26} animation="float" delay={0.3} color="text-cta-positive/12" />
      <FloatingIcon icon={Lock} className="bottom-[10%] right-[3%]" size={20} animation="pulse" delay={1} color="text-cta-positive/10" />
      <RotatingRing className="bottom-[8%] left-[5%]" size={90} />
    </>
  );
}

export function TrustProofDecorations() {
  return (
    <>
      <FloatingIcon icon={Shield} className="top-[8%] left-[4%]" size={30} animation="float" color="text-cta-positive/15" />
      <FloatingIcon icon={Eye} className="bottom-[12%] right-[6%]" size={24} animation="floatSlow" delay={0.9} color="text-white/10" />
      <RotatingRing className="top-[15%] right-[3%]" size={140} />
    </>
  );
}

export function CTADecorations() {
  return (
    <>
      <FloatingIcon icon={ShieldCheck} className="top-[15%] left-[8%]" size={32} animation="float" color="text-cta-positive/20" />
      <FloatingIcon icon={Zap} className="top-[20%] right-[10%]" size={24} animation="pulse" delay={0.5} color="text-white/15" />
      <FloatingIcon icon={Globe} className="bottom-[20%] left-[12%]" size={22} animation="floatSlow" delay={1.2} color="text-cta-positive/12" />
      <RotatingRing className="bottom-[10%] right-[5%]" size={110} />
    </>
  );
}

export function FAQDecorations() {
  return (
    <>
      <FloatingIcon icon={Lock} className="top-[10%] right-[4%]" size={24} animation="floatSlow" color="text-cta-positive/10" />
      <PulsingOrb className="w-16 h-16 bottom-[15%] left-[8%]" color="bg-info/5" />
    </>
  );
}

export function OfferFormDecorations() {
  return (
    <>
      <FloatingIcon icon={Shield} className="top-[8%] right-[5%]" size={28} animation="float" delay={0.4} color="text-info/12" />
      <FloatingIcon icon={Fingerprint} className="bottom-[10%] left-[3%]" size={22} animation="pulse" delay={1} color="text-cta-positive/10" />
      <RotatingRing className="top-[20%] left-[5%]" size={70} />
    </>
  );
}

export function TargetAudienceDecorations() {
  return (
    <>
      <FloatingIcon icon={Server} className="top-[5%] right-[4%]" size={24} animation="float" delay={0.3} color="text-info/12" />
      <FloatingIcon icon={Cloud} className="bottom-[8%] left-[5%]" size={22} animation="floatSlow" delay={0.8} color="text-info/10" />
    </>
  );
}

export function DifferentiatorsDecorations() {
  return (
    <>
      <FloatingIcon icon={Shield} className="top-[6%] left-[3%]" size={30} animation="float" color="text-cta-positive/15" />
      <FloatingIcon icon={Database} className="bottom-[8%] right-[4%]" size={24} animation="floatSlow" delay={0.6} color="text-white/10" />
      <RotatingRing className="top-[10%] right-[6%]" size={100} />
    </>
  );
}

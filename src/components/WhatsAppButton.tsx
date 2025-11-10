import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const WhatsAppButton = () => {
  const whatsappLink = "https://wa.me/5534984432835?text=Olá!%20Tenho%20interesse%20no%20CyberShield";

  return (
    <a
      href={whatsappLink}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "fixed bottom-6 right-6 z-40",
        "w-14 h-14 bg-green-500 hover:bg-green-600",
        "rounded-full shadow-2xl",
        "flex items-center justify-center",
        "transition-all duration-300",
        "hover:scale-110 active:scale-95",
        "animate-pulse-glow"
      )}
      aria-label="Falar no WhatsApp"
    >
      <MessageCircle className="w-7 h-7 text-white" />
    </a>
  );
};

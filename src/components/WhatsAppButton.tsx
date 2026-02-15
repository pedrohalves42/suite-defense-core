import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTACT } from "@/constants/config";

export const WhatsAppButton = () => {
  const whatsappLink = `${CONTACT.WHATSAPP_LINK}?text=${CONTACT.WHATSAPP_TEXT_SUPPORT}`;

  return (
    <a
      href={whatsappLink}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "fixed bottom-6 right-6 z-40",
        "w-14 h-14 bg-success hover:bg-success/90",
        "rounded-full shadow-elevated",
        "flex items-center justify-center",
        "transition-all duration-200",
        "hover:shadow-float active:scale-95"
      )}
      aria-label="Falar no WhatsApp"
    >
      <MessageCircle className="w-6 h-6 text-success-foreground" />
    </a>
  );
};

import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandSignature } from "@/components/auth/SecurityFooter";
import { useTranslation } from "react-i18next";

const NotFound = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Subtle enterprise background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(45,158,140,0.02),transparent_60%)] pointer-events-none" />
      
      <div className="text-center space-y-8 relative z-10">
        <div className="relative mx-auto w-fit">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-accent/10 rounded-full blur-2xl scale-150" />
          <Shield className="h-20 w-20 text-muted-foreground/20 relative" />
        </div>
        
        <div className="space-y-3">
          <h1 className="text-7xl font-bold text-foreground/10 tracking-tight">{t('notFoundPage.title')}</h1>
          <p className="text-lg text-muted-foreground/60 font-medium">
            {t('notFoundPage.heading')}
          </p>
          <p className="text-sm text-muted-foreground/40 max-w-xs mx-auto">
            {t('notFoundPage.description')}
          </p>
        </div>
        
        <Button 
          variant="outline" 
          asChild
          className="border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
        >
          <Link to="/login">
            {t('notFoundPage.backToLogin')}
          </Link>
        </Button>
        
        <div className="pt-4">
          <BrandSignature />
        </div>
      </div>
    </div>
  );
};

export default NotFound;

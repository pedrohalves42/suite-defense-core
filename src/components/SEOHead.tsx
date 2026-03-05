import { Helmet } from "react-helmet-async";

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: "website" | "article" | "product";
  noIndex?: boolean;
}

const DEFAULT_TITLE = "CyberShield - Seguranca Cibernetica Inteligente para PMEs Brasileiras";
const DEFAULT_DESCRIPTION = "Protecao completa para sua empresa: antivirus, monitoramento 24/7 e compliance LGPD em um so lugar. Empresa 100% brasileira com suporte em portugues. Trial gratuito de 14 dias.";
const DEFAULT_KEYWORDS = "seguranca cibernetica, antivirus empresarial, PME Brasil, protecao de dados, compliance LGPD, monitoramento de rede, seguranca da informacao";
const DEFAULT_OG_IMAGE = "https://cybershield.com.br/og-image.png";
const BASE_URL = "https://cybershield.com.br";

export function SEOHead({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  keywords = DEFAULT_KEYWORDS,
  canonicalUrl,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = "website",
  noIndex = false,
}: SEOHeadProps) {
  const fullCanonicalUrl = canonicalUrl ? `${BASE_URL}${canonicalUrl}` : BASE_URL;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      
      {/* Robots */}
      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}
      
      {/* Canonical */}
      <link rel="canonical" href={fullCanonicalUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={fullCanonicalUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:locale" content="pt_BR" />
      <meta property="og:site_name" content="CyberShield" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={fullCanonicalUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
}

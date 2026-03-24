import { Helmet } from "react-helmet-async";

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: "website" | "article" | "product";
  noIndex?: boolean;
  jsonLd?: Record<string, unknown>;
}

const DEFAULT_TITLE = "CyberShield - Segurança Cibernética Inteligente para PMEs Brasileiras";
const DEFAULT_DESCRIPTION = "Proteção completa para sua empresa: antivírus, monitoramento 24/7 e compliance LGPD em um só lugar. Empresa 100% brasileira com suporte em português. Trial gratuito de 14 dias.";
const DEFAULT_KEYWORDS = "segurança cibernética, antivírus empresarial, PME Brasil, proteção de dados, compliance LGPD, monitoramento de rede, segurança da informação, EDR, endpoint protection";
const DEFAULT_OG_IMAGE = "https://cybershield.com.br/og-image.png";
const BASE_URL = "https://cybershield.com.br";

const DEFAULT_ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "CyberShield",
  "url": BASE_URL,
  "logo": `${BASE_URL}/logo.png`,
  "description": DEFAULT_DESCRIPTION,
  "foundingDate": "2025",
  "areaServed": {
    "@type": "Country",
    "name": "Brazil"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "sales",
    "availableLanguage": ["Portuguese"]
  },
  "sameAs": []
};

export function SEOHead({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  keywords = DEFAULT_KEYWORDS,
  canonicalUrl,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = "website",
  noIndex = false,
  jsonLd,
}: SEOHeadProps) {
  const fullCanonicalUrl = canonicalUrl ? `${BASE_URL}${canonicalUrl}` : BASE_URL;
  const structuredData = jsonLd || DEFAULT_ORG_JSON_LD;

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
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
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

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </Helmet>
  );
}

import React from 'react';
import { serializeJsonLd } from '@/lib/safe-json-ld';

interface JsonLdProps {
  data: Record<string, unknown>;
}

/**
 * Renders a JSON-LD <script> block.
 *
 * Uses the centralized serializeJsonLd helper which escapes `<`, `>`, `&`,
 * U+2028 and U+2029 — making the payload safe to inline. This is the only
 * file (other than the DOMPurify-backed FormattedText) allowed by the Bloco C
 * gate to call dangerouslySetInnerHTML.
 */
export const JsonLd: React.FC<JsonLdProps> = ({ data }) => {
  return (
    <script
      type="application/ld+json"
      // payload sanitized via serializeJsonLd (bloco-c allowlist)
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
};

export const CyberShieldSchema = () => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "CyberShield",
    "applicationCategory": "SecurityApplication",
    "operatingSystem": "Windows, Linux, macOS",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "reviewCount": "120"
    }
  };

  return <JsonLd data={schema} />;
};

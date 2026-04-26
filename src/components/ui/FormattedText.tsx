import React from 'react';
import DOMPurify from 'dompurify';

/**
 * Safely renders text with allowed inline HTML tags (<strong>, <code>, <em>).
 * Uses DOMPurify to prevent XSS (SOC 2 CC6.1).
 */
export function FormattedText({ text }: { text: string }) {
  const sanitizedHtml = React.useMemo(() => {
    return DOMPurify.sanitize(text, {
      ALLOWED_TAGS: ['strong', 'code', 'em', 'span'],
      ALLOWED_ATTR: ['class'],
    });
  }, [text]);

  return <span dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
}

import React from 'react';

/**
 * Safely renders text with allowed inline HTML tags (<strong>, <code>, <em>).
 * Replaces dangerouslySetInnerHTML to prevent XSS (SOC 2 CC6.1).
 */
export function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(<strong>.*?<\/strong>|<code[^>]*>.*?<\/code>|<em>.*?<\/em>)/g);

  return (
    <>
      {parts.map((part, i) => {
        const strongMatch = part.match(/^<strong>(.*)<\/strong>$/);
        if (strongMatch) return <strong key={i}>{strongMatch[1]}</strong>;

        const codeMatch = part.match(/^<code[^>]*>(.*)<\/code>$/);
        if (codeMatch) return <code key={i} className="bg-muted px-1 rounded">{codeMatch[1]}</code>;

        const emMatch = part.match(/^<em>(.*)<\/em>$/);
        if (emMatch) return <em key={i}>{emMatch[1]}</em>;

        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

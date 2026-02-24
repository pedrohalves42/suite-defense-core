/**
 * Helper to load the CyberShield logo as a base64 data URL for use in jsPDF reports.
 * Loads the logo from /favicon-cybshield.png (public folder).
 */

let cachedLogoDataUrl: string | null = null;

export async function loadLogoForPDF(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;

  try {
    const response = await fetch('/favicon-cybshield.png');
    if (!response.ok) return null;
    
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        cachedLogoDataUrl = reader.result as string;
        resolve(cachedLogoDataUrl);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    console.warn('Could not load CyberShield logo for PDF');
    return null;
  }
}

/**
 * Adds the CyberShield logo to a jsPDF document.
 * @param doc - jsPDF instance
 * @param logoDataUrl - base64 data URL from loadLogoForPDF()
 * @param x - X position (center of logo)
 * @param y - Y position (top of logo)  
 * @param size - Width/height of the logo (square)
 */
export function addLogoToPDF(
  doc: any,
  logoDataUrl: string | null,
  x: number,
  y: number,
  size: number = 20
) {
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', x - size / 2, y, size, size);
      return true;
    } catch {
      // Fallback: draw a text placeholder
    }
  }
  // Fallback: draw shield text
  doc.setFontSize(size * 0.8);
  doc.setFont('helvetica', 'bold');
  doc.text('🛡️', x, y + size * 0.7, { align: 'center' });
  return false;
}

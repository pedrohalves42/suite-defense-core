/**
 * Type augmentation for jspdf-autotable plugin.
 * Eliminates ~30 `(doc as any).lastAutoTable` casts across PDF generators.
 */
import 'jspdf';

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: {
      finalY: number;
    };
  }
}

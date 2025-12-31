/**
 * Mock jsPDF for E2E tests
 * 
 * Playwright runs in Node.js but jsPDF expects browser environment with dynamic imports.
 * This mock prevents import errors during E2E testing.
 */

export function mockJsPDF() {
  (window as any).jspdf = {
    jsPDF: class MockJsPDF {
      internal = {
        pageSize: {
          getWidth: () => 210,
          getHeight: () => 297,
        },
      };
      
      text() { return this; }
      setFontSize() { return this; }
      setFont() { return this; }
      setTextColor() { return this; }
      setDrawColor() { return this; }
      setFillColor() { return this; }
      rect() { return this; }
      line() { return this; }
      addPage() { return this; }
      save() { return this; }
      output() { return new Blob(['mock-pdf'], { type: 'application/pdf' }); }
    },
  };
}

/**
 * Use this in test files:
 * 
 * import { mockJsPDF } from './fixtures/mock-jspdf';
 * 
 * test.beforeEach(async ({ page }) => {
 *   await page.addInitScript(mockJsPDF);
 * });
 */

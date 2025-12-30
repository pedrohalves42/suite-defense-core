import '@testing-library/jest-dom';

declare module 'vitest' {
  interface Assertion<T = any> {
    toBeInTheDocument(): T;
    toHaveClass(className: string): T;
    toHaveAttribute(attr: string, value?: string): T;
    toBeDisabled(): T;
    toBeVisible(): T;
    toHaveTextContent(text: string | RegExp): T;
    toBeEnabled(): T;
    toHaveStyle(style: Record<string, any>): T;
    toHaveFocus(): T;
    toContainElement(element: HTMLElement | null): T;
    toBeEmptyDOMElement(): T;
  }
}

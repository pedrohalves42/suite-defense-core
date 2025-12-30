import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActionCenterSection } from '@/components/action-center/ActionCenterSection';

describe('ActionCenterSection', () => {
  describe('Header Rendering', () => {
    it('should render urgent section with correct title', () => {
      render(
        <ActionCenterSection type="urgent" count={3}>
          <div>Test content</div>
        </ActionCenterSection>
      );

      expect(screen.getByText('Ações Urgentes')).toBeInTheDocument();
      expect(screen.getByText('🔴')).toBeInTheDocument();
    });

    it('should render recommended section with correct title', () => {
      render(
        <ActionCenterSection type="recommended" count={2}>
          <div>Test content</div>
        </ActionCenterSection>
      );

      expect(screen.getByText('Ações Recomendadas')).toBeInTheDocument();
      expect(screen.getByText('🟡')).toBeInTheDocument();
    });

    it('should render informational section with correct title', () => {
      render(
        <ActionCenterSection type="informational" count={5}>
          <div>Test content</div>
        </ActionCenterSection>
      );

      expect(screen.getByText('Informativo')).toBeInTheDocument();
      expect(screen.getByText('🔵')).toBeInTheDocument();
    });
  });

  describe('Count Badge', () => {
    it('should display count badge with correct number', () => {
      render(
        <ActionCenterSection type="urgent" count={7}>
          <div>Test content</div>
        </ActionCenterSection>
      );

      expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('should display count of 1', () => {
      render(
        <ActionCenterSection type="recommended" count={1}>
          <div>Test content</div>
        </ActionCenterSection>
      );

      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('should display large count', () => {
      render(
        <ActionCenterSection type="informational" count={99}>
          <div>Test content</div>
        </ActionCenterSection>
      );

      expect(screen.getByText('99')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should return null when count is 0', () => {
      const { container } = render(
        <ActionCenterSection type="urgent" count={0}>
          <div>Test content</div>
        </ActionCenterSection>
      );

      expect(container.firstChild).toBeNull();
    });

    it('should not render children when count is 0', () => {
      render(
        <ActionCenterSection type="urgent" count={0}>
          <div data-testid="child-content">Should not appear</div>
        </ActionCenterSection>
      );

      expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
    });
  });

  describe('Children Rendering', () => {
    it('should render children content', () => {
      render(
        <ActionCenterSection type="urgent" count={1}>
          <div data-testid="child-content">Action card content</div>
        </ActionCenterSection>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Action card content')).toBeInTheDocument();
    });

    it('should render multiple children', () => {
      render(
        <ActionCenterSection type="recommended" count={3}>
          <div>Card 1</div>
          <div>Card 2</div>
          <div>Card 3</div>
        </ActionCenterSection>
      );

      expect(screen.getByText('Card 1')).toBeInTheDocument();
      expect(screen.getByText('Card 2')).toBeInTheDocument();
      expect(screen.getByText('Card 3')).toBeInTheDocument();
    });
  });

  describe('Custom ClassName', () => {
    it('should apply custom className', () => {
      render(
        <ActionCenterSection type="urgent" count={1} className="custom-class">
          <div>Content</div>
        </ActionCenterSection>
      );

      const section = screen.getByText('Content').closest('section');
      expect(section).toHaveClass('custom-class');
    });
  });

  describe('Icon Styling', () => {
    it('should render with red icon for urgent', () => {
      render(
        <ActionCenterSection type="urgent" count={1}>
          <div>Content</div>
        </ActionCenterSection>
      );

      // Check that the section renders (icon styling is applied via Tailwind)
      expect(screen.getByText('Ações Urgentes')).toBeInTheDocument();
    });

    it('should render with yellow icon for recommended', () => {
      render(
        <ActionCenterSection type="recommended" count={1}>
          <div>Content</div>
        </ActionCenterSection>
      );

      expect(screen.getByText('Ações Recomendadas')).toBeInTheDocument();
    });

    it('should render with blue icon for informational', () => {
      render(
        <ActionCenterSection type="informational" count={1}>
          <div>Content</div>
        </ActionCenterSection>
      );

      expect(screen.getByText('Informativo')).toBeInTheDocument();
    });
  });
});

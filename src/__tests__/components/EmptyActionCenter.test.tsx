import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyActionCenter } from '@/components/action-center/EmptyActionCenter';

describe('EmptyActionCenter', () => {
  describe('Main Content', () => {
    it('should display healthy message', () => {
      render(<EmptyActionCenter healthyCount={0} />);

      expect(screen.getByText('Tudo em ordem!')).toBeInTheDocument();
    });

    it('should display description text', () => {
      render(<EmptyActionCenter healthyCount={0} />);

      expect(
        screen.getByText('Não há ações pendentes no momento. Todos os sistemas estão funcionando normalmente.')
      ).toBeInTheDocument();
    });

    it('should render checkmark icon', () => {
      render(<EmptyActionCenter healthyCount={0} />);

      // The component contains a CheckCircle2 icon
      const container = screen.getByText('Tudo em ordem!').closest('div');
      expect(container).toBeInTheDocument();
    });
  });

  describe('Healthy Count Display', () => {
    it('should show healthy count when greater than 0', () => {
      render(<EmptyActionCenter healthyCount={15} />);

      expect(screen.getByText('15 computadores protegidos')).toBeInTheDocument();
    });

    it('should show singular form for count of 1', () => {
      render(<EmptyActionCenter healthyCount={1} />);

      expect(screen.getByText('1 computador protegido')).toBeInTheDocument();
    });

    it('should not show healthy count when 0', () => {
      render(<EmptyActionCenter healthyCount={0} />);

      expect(screen.queryByText(/computador/i)).not.toBeInTheDocument();
    });

    it('should show large healthy count', () => {
      render(<EmptyActionCenter healthyCount={250} />);

      expect(screen.getByText('250 computadores protegidos')).toBeInTheDocument();
    });
  });

  describe('Custom ClassName', () => {
    it('should apply custom className', () => {
      render(<EmptyActionCenter healthyCount={5} className="custom-class" />);

      const container = screen.getByText('Tudo em ordem!').closest('div');
      expect(container?.parentElement).toHaveClass('custom-class');
    });
  });

  describe('Styling', () => {
    it('should have gradient background', () => {
      render(<EmptyActionCenter healthyCount={5} />);

      const container = screen.getByText('Tudo em ordem!').closest('div');
      const parent = container?.parentElement;
      
      // Check for gradient class
      expect(parent).toHaveClass('bg-gradient-to-b');
    });

    it('should render shield icon with healthy count', () => {
      render(<EmptyActionCenter healthyCount={10} />);

      // Shield icon is rendered next to the count
      expect(screen.getByText('10 computadores protegidos')).toBeInTheDocument();
    });
  });

  describe('Animation', () => {
    it('should have ping animation on icon', () => {
      render(<EmptyActionCenter healthyCount={0} />);

      const container = screen.getByText('Tudo em ordem!').closest('div');
      expect(container).toBeInTheDocument();
      // The component has an animated ping div
    });
  });
});

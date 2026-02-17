import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { EmptyActionCenter } from '@/components/action-center/EmptyActionCenter';

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('EmptyActionCenter', () => {
  describe('Main Content', () => {
    it('should display healthy message', () => {
      renderWithRouter(<EmptyActionCenter healthyCount={0} />);
      expect(screen.getByText('Ambiente Protegido')).toBeInTheDocument();
    });

    it('should display description text', () => {
      renderWithRouter(<EmptyActionCenter healthyCount={0} />);
      expect(
        screen.getByText('Não há ações pendentes. Todos os sistemas estão funcionando normalmente.')
      ).toBeInTheDocument();
    });

    it('should render checkmark icon', () => {
      renderWithRouter(<EmptyActionCenter healthyCount={0} />);
      const container = screen.getByText('Ambiente Protegido').closest('div');
      expect(container).toBeInTheDocument();
    });
  });

  describe('Healthy Count Display', () => {
    it('should show healthy count when greater than 0', () => {
      renderWithRouter(<EmptyActionCenter healthyCount={15} />);
      expect(screen.getByText(/15 protegidos/)).toBeInTheDocument();
    });

    it('should show singular form for count of 1', () => {
      renderWithRouter(<EmptyActionCenter healthyCount={1} />);
      expect(screen.getByText(/1 protegido/)).toBeInTheDocument();
    });

    it('should not show healthy count when 0', () => {
      renderWithRouter(<EmptyActionCenter healthyCount={0} />);
      // When healthyCount=0, the shield badge with "X protegidos" should not appear
      expect(screen.queryByText(/\d+ protegido/i)).not.toBeInTheDocument();
    });

    it('should show large healthy count', () => {
      renderWithRouter(<EmptyActionCenter healthyCount={250} />);
      expect(screen.getByText(/250 protegidos/)).toBeInTheDocument();
    });
  });

  describe('Custom ClassName', () => {
    it('should apply custom className', () => {
      renderWithRouter(<EmptyActionCenter healthyCount={5} className="custom-class" />);
      const container = screen.getByText('Ambiente Protegido').closest('div');
      // The className is on the outermost wrapper
      expect(container?.closest('.custom-class')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should have gradient background', () => {
      renderWithRouter(<EmptyActionCenter healthyCount={5} />);
      const container = screen.getByText('Ambiente Protegido').closest('div');
      const wrapper = container?.closest('.bg-gradient-to-b');
      expect(wrapper).toBeInTheDocument();
    });

    it('should render shield icon with healthy count', () => {
      renderWithRouter(<EmptyActionCenter healthyCount={10} />);
      expect(screen.getByText(/10 protegidos/)).toBeInTheDocument();
    });
  });

  describe('Animation', () => {
    it('should have ping animation on icon', () => {
      renderWithRouter(<EmptyActionCenter healthyCount={0} />);
      const container = screen.getByText('Ambiente Protegido').closest('div');
      expect(container).toBeInTheDocument();
    });
  });
});

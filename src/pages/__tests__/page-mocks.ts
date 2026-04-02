/**
 * Centralized mocks for page smoke tests.
 * Must be imported BEFORE any page component.
 */
import { vi } from 'vitest';

// Mock useActiveTenant
vi.mock('@/hooks/useActiveTenant', () => ({
  useActiveTenant: () => ({
    tenant: { id: 'test-tenant-id', name: 'Test Tenant' },
    tenants: [{ id: 'test-tenant-id', name: 'Test Tenant' }],
    activeTenantId: 'test-tenant-id',
    loading: false,
    isFetched: true,
    setActiveTenantId: vi.fn(),
  }),
  ActiveTenantProvider: ({ children }: any) => children,
}));

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', email: 'test@test.com', user_metadata: {} },
    loading: false,
    session: { access_token: 'test-token' },
  }),
}));

// Mock SimpleModeProvider context
vi.mock('@/components/layout/SimpleModeProvider', () => ({
  SimpleModeProvider: ({ children }: any) => children,
  useSimpleModeContext: () => ({
    isSimple: false,
    isSimpleMode: false,
    setIsSimpleMode: vi.fn(),
    toggleSimpleMode: vi.fn(),
    toggleMode: vi.fn(),
  }),
}));

// Mock useSimpleMode (actual hook location)
vi.mock('@/hooks/useSimpleMode', () => ({
  useSimpleModeContext: () => ({
    isSimple: false,
    isSimpleMode: false,
    setIsSimpleMode: vi.fn(),
    toggleMode: vi.fn(),
  }),
  SimpleModeContext: { Provider: ({ children }: any) => children },
}));

// Mock useSuperAdmin (uses supabase.rpc)
vi.mock('@/hooks/useSuperAdmin', () => ({
  useSuperAdmin: () => ({ isSuperAdmin: false, loading: false }),
}));


// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => {
      if (opts?.returnObjects) return [];
      return key;
    },
    i18n: {
      language: 'pt-BR',
      changeLanguage: vi.fn(),
      exists: () => true,
    },
  }),
  Trans: ({ children }: any) => children,
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

// Mock react-helmet-async
vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: any) => children,
  HelmetProvider: ({ children }: any) => children,
}));

// Mock recharts (heavy SVG rendering)
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => children,
  LineChart: () => null,
  BarChart: () => null,
  PieChart: () => null,
  AreaChart: () => null,
  RadarChart: () => null,
  ComposedChart: () => null,
  Line: () => null,
  Bar: () => null,
  Pie: () => null,
  Area: () => null,
  Radar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Cell: () => null,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
  RadialBar: () => null,
  RadialBarChart: () => null,
  FunnelChart: () => null,
  Funnel: () => null,
  Treemap: () => null,
  LabelList: () => null,
  ReferenceArea: () => null,
  ReferenceLine: () => null,
  Scatter: () => null,
  ScatterChart: () => null,
  Brush: () => null,
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
  Toaster: () => null,
}));

// Mock image/asset imports
vi.mock('@/assets/logo-cybshield-new.png', () => ({ default: '' }));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, prop) => {
      // Return a forwardRef component for any HTML element
      const { forwardRef } = require('react');
      return forwardRef((props: any, ref: any) => {
        const { initial, animate, exit, variants, whileHover, whileTap, whileInView, transition, layout, layoutId, ...rest } = props;
        const tag = String(prop);
        const React = require('react');
        return React.createElement(tag, { ...rest, ref });
      });
    },
  }),
  AnimatePresence: ({ children }: any) => children,
  useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
  useInView: () => true,
  useMotionValue: () => ({ get: () => 0, set: vi.fn() }),
  useTransform: () => ({ get: () => 0 }),
  useSpring: () => ({ get: () => 0 }),
}));

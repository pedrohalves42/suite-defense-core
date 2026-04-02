/**
 * Phase 1: Public & Auth pages smoke tests
 */
import './page-mocks';
import { describe, it, expect } from 'vitest';
import { renderPage } from './page-test-helpers';
import { lazy, Suspense } from 'react';

// Helper to test a lazily imported page
function smokeTest(name: string, importFn: () => Promise<any>, route = '/') {
  it(`${name} renders without crashing`, async () => {
    const mod = await importFn();
    const Component = mod.default || mod[Object.keys(mod).find(k => k !== '__esModule') || ''];
    expect(() => renderPage(
      <Suspense fallback={<div>loading</div>}>
        <Component />
      </Suspense>,
      { route }
    )).not.toThrow();
  });
}

describe('Public Pages – Smoke Render', () => {
  smokeTest('NotFound', () => import('@/pages/NotFound'));
  smokeTest('Landing', () => import('@/pages/Landing'));
  smokeTest('Terms', () => import('@/pages/Terms'));
  smokeTest('Privacidade', () => import('@/pages/Privacidade'));
  smokeTest('Pricing', () => import('@/pages/Pricing'));
  smokeTest('VerificarLaudo', () => import('@/pages/VerificarLaudo/index'));
});

describe('Auth Pages – Smoke Render', () => {
  smokeTest('Login', () => import('@/pages/Login'));
  smokeTest('Signup', () => import('@/pages/Signup'));
  smokeTest('ForgotPassword', () => import('@/pages/ForgotPassword'));
  smokeTest('UpdatePassword', () => import('@/pages/UpdatePassword'));
  smokeTest('ForcePasswordChange', () => import('@/pages/ForcePasswordChange'));
  smokeTest('AcceptInvite', () => import('@/pages/AcceptInvite'));
  smokeTest('NoTenant', () => import('@/pages/NoTenant'));
});

describe('Checkout & Misc Pages – Smoke Render', () => {
  smokeTest('CheckoutSuccess', () => import('@/pages/CheckoutSuccess'));
  smokeTest('CheckoutCancel', () => import('@/pages/CheckoutCancel'));
  smokeTest('ApprovePage', () => import('@/pages/ApprovePage'));
  smokeTest('Tutorials', () => import('@/pages/Tutorials'));
  smokeTest('Quarantine', () => import('@/pages/Quarantine'));
  smokeTest('ServerDashboard', () => import('@/pages/ServerDashboard'));
  smokeTest('DataExport', () => import('@/pages/DataExport/index'));
  smokeTest('VirusScans', () => import('@/pages/VirusScans'));
});

import { describe, it, expect } from 'vitest';
import { APP_ROLES, isValidRole, assertValidRole, ROLE_PRIORITY } from './roles';

describe('Role System', () => {
  describe('APP_ROLES', () => {
    it('deve conter todos os roles do banco de dados', () => {
      const expectedRoles = ['viewer', 'operator', 'admin', 'super_admin'];
      expect(APP_ROLES).toEqual(expectedRoles);
    });

    it('deve ter 4 roles no total', () => {
      expect(APP_ROLES).toHaveLength(4);
    });
  });

  describe('isValidRole', () => {
    it('deve aceitar todos os roles válidos', () => {
      expect(isValidRole('viewer')).toBe(true);
      expect(isValidRole('operator')).toBe(true);
      expect(isValidRole('admin')).toBe(true);
      expect(isValidRole('super_admin')).toBe(true);
    });

    it('deve rejeitar roles inválidos', () => {
      expect(isValidRole('invalid')).toBe(false);
      expect(isValidRole('owner')).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole(null)).toBe(false);
      expect(isValidRole(undefined)).toBe(false);
    });

    it('deve ser case-sensitive', () => {
      expect(isValidRole('ADMIN')).toBe(false);
      expect(isValidRole('Super_Admin')).toBe(false);
    });
  });

  describe('assertValidRole', () => {
    it('deve retornar role válido sem erro', () => {
      expect(assertValidRole('admin')).toBe('admin');
      expect(assertValidRole('super_admin')).toBe('super_admin');
    });

    it('deve lançar erro para role inválido', () => {
      expect(() => assertValidRole('invalid')).toThrow('Invalid role');
    });

    it('deve incluir o nome do campo na mensagem de erro', () => {
      expect(() => assertValidRole('invalid', 'user_role')).toThrow('Invalid user_role');
    });
  });

  describe('ROLE_PRIORITY', () => {
    it('deve ter prioridades corretas', () => {
      expect(ROLE_PRIORITY.viewer).toBe(1);
      expect(ROLE_PRIORITY.operator).toBe(2);
      expect(ROLE_PRIORITY.admin).toBe(3);
      expect(ROLE_PRIORITY.super_admin).toBe(4);
    });

    it('super_admin deve ter maior prioridade', () => {
      expect(ROLE_PRIORITY.super_admin).toBeGreaterThan(ROLE_PRIORITY.admin);
      expect(ROLE_PRIORITY.super_admin).toBeGreaterThan(ROLE_PRIORITY.operator);
      expect(ROLE_PRIORITY.super_admin).toBeGreaterThan(ROLE_PRIORITY.viewer);
    });
  });
});

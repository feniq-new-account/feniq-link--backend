import { describe, expect, it } from 'vitest';
import { accountName } from './accountName';

describe('accountName', () => {
  const warehouse = { warehouse: { nameAr: 'مستودع النجاح', nameEn: 'Al-Najah Warehouse' }, user: { name: 'Owner' } };

  it('uses the Arabic name in Arabic and the English one in English', () => {
    expect(accountName(warehouse, 'ar')).toBe('مستودع النجاح');
    expect(accountName(warehouse, 'en')).toBe('Al-Najah Warehouse');
  });

  it('falls back to the other language, then to the owner name', () => {
    expect(accountName({ pharmacy: { nameEn: 'Only English' }, user: { name: 'O' } }, 'ar')).toBe('Only English');
    expect(accountName({ user: { name: 'Owner' } }, 'ar')).toBe('Owner');
  });
});

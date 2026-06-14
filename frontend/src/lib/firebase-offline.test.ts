import { initializeOfflineDatabase } from './firebase-offline';
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/database', () => ({
  getDatabase: vi.fn((app: any) => ({
    setPersistenceEnabled: vi.fn(),
  })),
}));

vi.mock('./firebase', () => ({
  app: {},
}));

describe('initializeOfflineDatabase', () => {
  it('should initialize successfully when firebase app is configured', () => {
    const db = initializeOfflineDatabase();
    expect(db).toBeDefined();
  });

  it('should return null when firebase app is not configured', async () => {
    const firebaseMock = await import('./firebase');
    (firebaseMock as any).app = null;
    const db = initializeOfflineDatabase();
    expect(db).toBeNull();
  });
});

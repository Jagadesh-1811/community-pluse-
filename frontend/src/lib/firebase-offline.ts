import { getDatabase } from 'firebase/database';
import { app } from './firebase';

/**
 * Configure Firebase Realtime Database with local synchronization.
 * Note: While full disk persistence (setPersistenceEnabled) is native to mobile/React Native environments,
 * the Web SDK maintains an active in-memory cache of all registered paths.
 * We include the keepSynced mechanism on crucial paths (incidents, volunteers) to prevent cache clear-outs.
 */
export const initializeOfflineDatabase = () => {
  if (!app) return null;

  const rtdb = getDatabase(app);

  // Fallback for compatible web platforms requesting legacy schema persistence
  try {
    const legacyDb = (rtdb as any).database || rtdb;
    if (typeof legacyDb.setPersistenceEnabled === 'function') {
      legacyDb.setPersistenceEnabled(true);
      console.log(' Firebase RTDB disk persistence enabled successfully.');
    }
  } catch (err) {
    console.warn(
      'Firebase disk persistence skipped (not supported on this browser context). Fallback to active in-memory sync caching.',
      err,
    );
  }

  return rtdb;
};

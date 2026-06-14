'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, rtdb } from './firebase';
import { onAuthStateChanged, signOut as firebaseSignOut, User } from 'firebase/auth';
import { ref, onValue } from 'firebase/database';

type UserRole = 'REPORTER' | 'VOLUNTEER' | 'ADMIN' | null;

interface AuthContextType {
  user: User | null;
  role: UserRole;
  domain: 'human' | 'animal' | null;
  categories: string[] | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [domain, setDomain] = useState<'human' | 'animal' | null>(null);
  const [userCategories, setUserCategories] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        setLoading(true);
        const userRef = ref(rtdb, `users/${currentUser.uid}`);
        const unsubscribeRole = onValue(
          userRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.val();
              setRole(data.role as UserRole);
              setDomain(data.domain || null);
              setUserCategories(data.categories || null);
            } else {
              setRole('REPORTER');
              setDomain(null);
              setUserCategories(null);
            }
            setLoading(false);
          },
          (err) => {
            const error = err as Error & { code?: string };
            // Silently handle permission denied errors on logout
            if (error.code !== 'PERMISSION_DENIED') {
              console.error('Error fetching user role:', error);
            }
            setRole('REPORTER');
            setLoading(false);
          },
        );

        return () => unsubscribeRole();
      } else {
        setRole(null);
        setDomain(null);
        setUserCategories(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const value = {
    user,
    role,
    domain,
    categories: userCategories,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

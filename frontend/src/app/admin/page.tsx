'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRealtimeNeeds } from '@/hooks/useRealtimeNeeds';
import { rtdb, auth } from '@/lib/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { ref, onValue, push, set, remove, get } from 'firebase/database';
import {
  Shield,
  Plus,
  Trash2,
  Send,
  Loader2,
  LogOut,
  Mail,
  UserCheck,
  CheckCircle,
  AlertTriangle,
  FolderPlus,
  Key,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
  color: string;
}

export default function AdminPage() {
  const { user, role, loading: globalAuthLoading, signOut } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#facc15');

  const [volEmail, setVolEmail] = useState('');
  const [volDomain, setVolDomain] = useState<'human' | 'animal'>('human');
  const [volCategories, setVolCategories] = useState<string[]>([]);
  const [volPassword, setVolPassword] = useState('');

  const [isSubmittingVol, setIsSubmittingVol] = useState(false);
  const [isSubmittingCat, setIsSubmittingCat] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  // INLINE ADMIN AUTH STATES
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);

  // REALTIME NEEDS LOGIC FOR ANALYTICS
  const { needs } = useRealtimeNeeds();

  // Dynamic Stats calculations for Analytics tab
  const totalIncidents = needs.length;
  const activeMissions = needs.filter(
    (n) => n.status === 'in-progress' || n.status === 'in_progress',
  ).length;
  const resolvedMissions = needs.filter((n) => n.status === 'resolved').length;
  const pendingIncidents = needs.filter((n) => !n.status || n.status === 'open').length;

  const categoriesCount = needs.reduce((acc: Record<string, number>, curr) => {
    const type = curr.need_type || 'unclassified';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const sourcesCount = needs.reduce((acc: Record<string, number>, curr) => {
    const src = curr.source || 'web';
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {});

  const urgencyAvg =
    totalIncidents > 0
      ? (needs.reduce((sum, n) => sum + (n.urgency_score || 0), 0) / totalIncidents).toFixed(1)
      : '0.0';

  const escalatedCount = needs.filter((n) => n.sla_escalated).length;
  const clusteredCount = needs.filter((n) => n.is_major_incident || n.parent_incident_id).length;

  // LISTEN TO CATEGORIES
  useEffect(() => {
    if (role !== 'ADMIN') return;

    const categoriesRef = ref(rtdb, 'categories');
    const unsubscribe = onValue(categoriesRef, (snapshot) => {
      const list: Category[] = [];
      snapshot.forEach((child) => {
        list.push({ id: child.key!, ...child.val() });
      });
      setCategories(list);
    });

    return () => unsubscribe();
  }, [role]);

  // CATEGORY MANAGEMENT
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    setIsSubmittingCat(true);
    try {
      const categoriesRef = ref(rtdb, 'categories');
      const newCatRef = push(categoriesRef);
      await set(newCatRef, {
        name: newCatName.trim(),
        color: newCatColor,
      });
      setNewCatName('');
      setFeedback({ type: 'success', message: `Category "${newCatName}" added successfully.` });
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setFeedback({ type: 'error', message: 'Failed to add category.' });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setIsSubmittingCat(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      const catRef = ref(rtdb, `categories/${id}`);
      await remove(catRef);
      setFeedback({ type: 'success', message: 'Category removed successfully.' });
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setFeedback({ type: 'error', message: 'Failed to remove category.' });
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // CREATE VOLUNTEER API SUBMIT
  const handleCreateVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!volEmail.trim()) return;

    setIsSubmittingVol(true);
    setFeedback(null);

    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

    try {
      const token = user ? await user.getIdToken() : '';
      const response = await fetch(`${apiBaseUrl}/admin/create-volunteer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: volEmail.trim(),
          domain: volDomain,
          categories: volCategories,
          password: volPassword.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to create volunteer');
      }

      const result = await response.json();
      setVolEmail('');
      setVolPassword('');
      setVolCategories([]);
      setFeedback({
        type: 'success',
        message: `VOLUNTEER COMMISSIONED! Account created for ${volEmail.trim()}. Credentials dispatched via Gmail. Default Password: ${result.generated_password}`,
      });
    } catch (err: unknown) {
      const error = err as Error;
      setFeedback({
        type: 'error',
        message: error.message || 'Failed to create volunteer account.',
      });
    } finally {
      setIsSubmittingVol(false);
    }
  };

  // INLINE ADMIN SIGNUP
  const handleAdminSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
      const user = userCredential.user;

      // Send verification email with redirect back to admin portal
      const actionCodeSettings = {
        url: window.location.origin + '/admin',
        handleCodeInApp: true,
      };
      await sendEmailVerification(user, actionCodeSettings);

      // Save user details with role: ADMIN directly in RTDB
      await set(ref(rtdb, `users/${user.uid}`), {
        email: adminEmail,
        role: 'ADMIN',
        created_at: new Date().toISOString(),
      });

      setVerificationSent(true);
    } catch (err: unknown) {
      const error = err as Error;
      setAuthError(error.message || 'Failed to create Admin account');
    } finally {
      setAuthLoading(false);
    }
  };

  // INLINE ADMIN SIGNIN
  const handleAdminSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      const user = userCredential.user;

      if (!user.emailVerified) {
        setAuthError('ACCESS DENIED: Please verify your email first. Check your inbox.');
        // Resend email verification
        const actionCodeSettings = {
          url: window.location.origin + '/admin',
          handleCodeInApp: true,
        };
        await sendEmailVerification(user, actionCodeSettings);
        await firebaseSignOut(auth);
        return;
      }

      // Check if role is ADMIN in database
      const snapshot = await get(ref(rtdb, `users/${user.uid}`));
      const userData = snapshot.val();
      if (userData?.role !== 'ADMIN') {
        await firebaseSignOut(auth);
        setAuthError('ACCESS DENIED: You do not have administrator privileges.');
      }
    } catch (err: unknown) {
      const error = err as Error;
      setAuthError(error.message || 'Invalid credentials');
    } finally {
      setAuthLoading(false);
    }
  };

  const toggleCategorySelection = (name: string) => {
    setVolCategories((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
  };

  // LOADING STATE
  if (globalAuthLoading) {
    return (
      <div className="min-h-screen bg-(--background) flex flex-col items-center justify-center font-outfit">
        <Loader2 className="animate-spin text-yellow mb-4" size={40} />
        <span className="text-sm font-black uppercase tracking-widest text-(--foreground)/60">
          Decrypting Security Clearance...
        </span>
      </div>
    );
  }

  // RENDER DEDICATED INLINE AUTH PAGE IF NOT AN ADMIN
  if (!user || role !== 'ADMIN') {
    return (
      <main className="min-h-screen bg-(--background) brutalist-grid flex items-center justify-center p-6 relative overflow-hidden font-outfit">
        <div className="w-full max-w-5xl mx-auto flex flex-col lg:flex-row gap-12 items-center z-10">
          {/* LEFT: Branding */}
          <div className="lg:w-1/2 flex flex-col text-left">
            <div className="w-20 h-20 bg-charcoal rounded-xl mb-8 flex items-center justify-center brutalist-border shadow-2xl transform -rotate-3">
              <Shield className="text-yellow" size={40} />
            </div>
            <h1 className="text-6xl md:text-8xl font-anton uppercase tracking-normal leading-[0.9] mb-4 text-(--foreground)">
              Admin Panel
              <br />
              <span className="text-yellow">Gateway</span>
            </h1>
            <p className="text-sm text-(--foreground) opacity-50 font-bold uppercase tracking-[0.2em] mt-6">
              Authorized Administrators Only
            </p>
          </div>

          {/* RIGHT: Login Card */}
          <div className="lg:w-1/2 w-full bg-(--background) border border-(--border-color) rounded-2xl p-8 lg:p-12 shadow-2xl brutalist-border">
            <h2 className="text-4xl font-anton uppercase text-(--foreground) mb-8 tracking-wide">
              {authMode === 'signin' ? 'Admin Sign In' : 'Register Admin'}
            </h2>

            {verificationSent ? (
              <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center space-y-4 animate-in zoom-in duration-300">
                <CheckCircle className="text-emerald-400 mx-auto" size={48} />
                <h3 className="text-xl font-anton uppercase text-emerald-400">
                  VERIFICATION DISPATCHED
                </h3>
                <p className="text-sm text-sage leading-relaxed">
                  We have sent an authentication link to <strong>{adminEmail}</strong>. Please
                  verify your email, then return here to log in.
                </p>
                <button
                  onClick={() => {
                    setVerificationSent(false);
                    setAuthMode('signin');
                  }}
                  className="w-full py-4 bg-yellow text-charcoal font-anton uppercase tracking-widest rounded-xl transition-all"
                >
                  Continue to Sign In
                </button>
              </div>
            ) : (
              <form
                onSubmit={authMode === 'signin' ? handleAdminSignin : handleAdminSignup}
                className="space-y-6"
              >
                <div>
                  <label className="block text-xs text-(--foreground) font-bold uppercase tracking-widest mb-2.5 opacity-60">
                    Administrator ID (Email)
                  </label>
                  <div className="relative">
                    <Mail
                      className="absolute left-5 top-1/2 -translate-y-1/2 text-(--foreground)/30"
                      size={18}
                    />
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="w-full bg-(--background) border border-(--border-color) rounded-xl py-4 pl-14 pr-6 text-lg focus:outline-none focus:border-yellow transition-all font-semibold"
                      placeholder="admin@emergency.net"
                      aria-label="Administrator ID Email"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-(--foreground) font-bold uppercase tracking-widest mb-2.5 opacity-60">
                    Security Key (Password)
                  </label>
                  <div className="relative">
                    <Key
                      className="absolute left-5 top-1/2 -translate-y-1/2 text-(--foreground)/30"
                      size={18}
                    />
                    <input
                      type="password"
                      required
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full bg-(--background) border border-(--border-color) rounded-xl py-4 pl-14 pr-6 text-lg focus:outline-none focus:border-yellow transition-all font-semibold tracking-widest"
                      placeholder="••••••••••••"
                      aria-label="Security Key Password"
                    />
                  </div>
                </div>

                {authError && (
                  <div className="text-red-500 font-bold text-sm text-center bg-red-500/10 py-3 rounded-lg border border-red-500/20 font-outfit animate-in zoom-in duration-300">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-yellow text-charcoal font-anton uppercase tracking-widest text-2xl py-6 rounded-xl shadow-lg hover:-translate-y-0.5 active:translate-y-0.5 transition-all flex items-center justify-center gap-3"
                >
                  {authLoading ? (
                    <Loader2 className="animate-spin" size={24} />
                  ) : (
                    <>
                      {authMode === 'signin' ? 'Verify Admin' : 'Register Admin'}
                      <ArrowRight size={24} strokeWidth={3} />
                    </>
                  )}
                </button>

                <div className="text-center pt-6 border-t border-(--border-color)">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError(null);
                      setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
                    }}
                    className="text-xs text-sage uppercase font-black tracking-widest hover:text-yellow transition-colors"
                  >
                    {authMode === 'signin'
                      ? 'Register New Administrator Node →'
                      : 'Already registered? Sign In →'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    );
  }

  // RENDER ACTUAL ADMIN DASHBOARD UPON AUTHENTICATION
  return (
    <main className="min-h-screen bg-(--background) p-8 lg:p-16 font-outfit text-(--foreground) relative overflow-hidden brutalist-grid">
      <div className="max-w-7xl mx-auto space-y-12 z-10 relative">
        {/* Header */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center p-8 bg-(--card-bg) border border-(--border-color) rounded-3xl shadow-xl gap-6">
          <div className="flex items-center gap-6">
            <div className="p-4 bg-yellow rounded-2xl border border-black/10 shadow-lg shadow-yellow/20">
              <Shield className="text-charcoal" size={32} />
            </div>
            <div>
              <h1 className="text-4xl font-anton uppercase tracking-wide leading-none mb-2">
                Operational Command Center
              </h1>
              <p className="text-[10px] text-yellow font-black uppercase tracking-[0.3em]">
                System Administrator Console
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-3 px-6 py-3.5 bg-red-500/10 hover:bg-red-500 hover:text-white rounded-2xl transition-all border border-red-500/20 text-red-400 font-bold uppercase text-xs tracking-widest cursor-pointer"
          >
            <LogOut size={16} /> Log Out
          </button>
        </header>

        {/* Feedback Messages */}
        {feedback && (
          <div
            className={cn(
              'p-6 rounded-2xl border font-bold text-sm flex items-start gap-4 animate-in fade-in slide-in-from-top-4 duration-300',
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400',
            )}
          >
            {feedback.type === 'success' ? (
              <CheckCircle size={20} className="shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={20} className="shrink-0 mt-0.5" />
            )}
            <p className="leading-relaxed">{feedback.message}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT: Category Manager (Column span 5) */}
          <section className="lg:col-span-5 bg-(--card-bg) border border-(--border-color) rounded-4xl p-8 lg:p-10 shadow-xl space-y-8 flex flex-col">
            <div className="flex items-center gap-4 border-b border-(--border-color) pb-6">
              <div className="p-3 bg-(--foreground)/5 rounded-xl border border-(--border-color)">
                <FolderPlus className="text-yellow" size={20} />
              </div>
              <h2 className="text-2xl font-anton uppercase tracking-wide">Volunteer Sectors</h2>
            </div>

            {/* Category Form */}
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-(--foreground)/60 pl-1">
                  Sector/Category Name
                </label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Medical, Rescue, Fire..."
                  className="w-full bg-(--background) border border-(--border-color) rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-yellow transition-all font-semibold"
                  aria-label="New Sector Category Name"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-(--foreground)/60 pl-1">
                  Branding Color
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    type="color"
                    value={newCatColor}
                    onChange={(e) => setNewCatColor(e.target.value)}
                    className="w-14 h-14 bg-transparent border-0 rounded-2xl cursor-pointer"
                    aria-label="New Sector Color Selector"
                  />
                  <span className="font-mono text-xs uppercase text-(--foreground)/60">
                    {newCatColor}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingCat}
                className="w-full py-4 bg-yellow text-charcoal font-anton uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 text-sm"
              >
                {isSubmittingCat ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    <Plus size={16} /> Add Sector
                  </>
                )}
              </button>
            </form>

            {/* Category List */}
            <div className="flex-1 space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-(--foreground)/60 pl-1">
                Configured Sectors ({categories.length})
              </h3>
              {categories.length === 0 ? (
                <p className="text-xs text-sage italic p-4 bg-(--background) rounded-2xl border border-(--border-color) text-center">
                  No custom sectors added yet.
                </p>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto no-scrollbar pr-1">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex justify-between items-center p-4 bg-(--background) border border-(--border-color) rounded-2xl hover:border-(--foreground)/20 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/10"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-sm font-black tracking-wide text-(--foreground)">
                          {cat.name}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-2.5 text-red-400 hover:text-white hover:bg-red-500 rounded-xl transition-all border border-red-500/10 hover:border-red-500 cursor-pointer"
                        aria-label={`Delete sector ${cat.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* RIGHT: Volunteer Provisioner (Column span 7) */}
          <section className="lg:col-span-7 bg-(--card-bg) border border-(--border-color) rounded-4xl p-8 lg:p-10 shadow-xl space-y-8">
            <div className="flex items-center gap-4 border-b border-(--border-color) pb-6">
              <div className="p-3 bg-(--foreground)/5 rounded-xl border border-(--border-color)">
                <UserCheck className="text-yellow" size={20} />
              </div>
              <h2 className="text-2xl font-anton uppercase tracking-wide">Onboard Personnel</h2>
            </div>

            <form onSubmit={handleCreateVolunteer} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-(--foreground)/60 pl-1">
                  Volunteer Gateway Email
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-5 top-1/2 -translate-y-1/2 text-(--foreground)/40"
                    size={18}
                  />
                  <input
                    type="email"
                    required
                    value={volEmail}
                    onChange={(e) => setVolEmail(e.target.value)}
                    placeholder="agent.name@emergency.net"
                    className="w-full bg-(--background) border border-(--border-color) rounded-2xl py-4.5 pl-14 pr-6 text-sm focus:outline-none focus:border-yellow transition-all font-semibold"
                    aria-label="Volunteer Gateway Email Address"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-(--foreground)/60 pl-1">
                  Operational Domain
                </label>
                <div className="flex gap-4 p-1 bg-(--foreground)/5 rounded-2xl border border-(--border-color)">
                  <button
                    type="button"
                    onClick={() => setVolDomain('human')}
                    aria-label="Set Operational Domain to Human Health"
                    className={cn(
                      'flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer',
                      volDomain === 'human'
                        ? 'bg-(--foreground) text-(--background) shadow-lg'
                        : 'text-(--foreground) hover:text-(--foreground)',
                    )}
                  >
                    Human Health
                  </button>
                  <button
                    type="button"
                    onClick={() => setVolDomain('animal')}
                    aria-label="Set Operational Domain to Animal Health"
                    className={cn(
                      'flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer',
                      volDomain === 'animal'
                        ? 'bg-blue-500 text-white shadow-lg'
                        : 'text-(--foreground) hover:text-blue-400',
                    )}
                  >
                    Animal Health
                  </button>
                </div>
              </div>

              {/* Assign Categories */}
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-(--foreground)/60 pl-1">
                  Assign Custom Sectors / Categories
                </label>
                {categories.length === 0 ? (
                  <p className="text-xs text-sage italic p-4 bg-yellow/5 border border-yellow/10 rounded-2xl">
                    Configure sectors first on the left panel before assigning them to volunteers.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2.5">
                    {categories.map((cat) => {
                      const isSelected = volCategories.includes(cat.name);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => toggleCategorySelection(cat.name)}
                          aria-label={`Assign sector ${cat.name}`}
                          className={cn(
                            'px-4 py-2 text-xs font-black uppercase tracking-widest border rounded-xl transition-all cursor-pointer',
                            isSelected
                              ? 'bg-(--foreground) border-(--foreground) text-(--background) shadow-md'
                              : 'bg-(--background) border-(--border-color) text-(--foreground)/70 hover:border-(--foreground)/20',
                          )}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Custom Access Token */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-(--foreground)/60 pl-1">
                  Custom Password (Optional)
                </label>
                <input
                  type="password"
                  value={volPassword}
                  onChange={(e) => setVolPassword(e.target.value)}
                  placeholder="Auto-generated if left blank"
                  className="w-full bg-(--background) border border-(--border-color) rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-yellow transition-all font-semibold"
                  aria-label="Custom Password for Volunteer"
                />
                <p className="text-[9px] text-sage/70 pl-1 uppercase font-bold tracking-wider">
                  Leave empty to generate a secure random 12-character token.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmittingVol}
                className="w-full py-5 bg-yellow text-charcoal font-anton uppercase tracking-widest text-lg rounded-3xl flex items-center justify-center gap-3 hover:-translate-y-0.5 active:translate-y-0.5 transition-all shadow-[0_15px_40px_rgba(250,204,21,0.15)] disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingVol ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <Send size={20} /> Commission & Email Credentials
                  </>
                )}
              </button>
            </form>
          </section>
        </div>

        {/* Command Analytics Section */}
        <section className="bg-(--card-bg) border border-(--border-color) rounded-4xl p-8 lg:p-10 shadow-xl space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-(--border-color) pb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-(--foreground)/5 rounded-xl border border-(--border-color)">
                <Shield className="text-yellow" size={20} />
              </div>
              <div>
                <h2 className="text-2xl font-anton uppercase tracking-wide">
                  Strategic Intelligence & Analytics
                </h2>
                <p className="text-[10px] text-sage font-black uppercase tracking-widest mt-1">
                  Real-time Ground Operations & AI Audit Analytics
                </p>
              </div>
            </div>
            <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center gap-3">
              <Loader2 className="animate-spin text-blue-400" size={16} />
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                Real-time Telemetry Sync
              </span>
            </div>
          </div>

          {/* KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-linear-to-b from-(--foreground)/5 to-transparent border border-(--border-color) rounded-3xl p-6 flex flex-col justify-between">
              <span className="text-sage text-[10px] font-black uppercase tracking-wider">
                Total Reports Intake
              </span>
              <span className="text-5xl font-black mt-2 font-anton tracking-wide text-(--foreground)">
                {totalIncidents}
              </span>
            </div>
            <div className="bg-linear-to-b from-orange-500/10 to-transparent border border-orange-500/20 rounded-3xl p-6 flex flex-col justify-between">
              <span className="text-orange-500 dark:text-orange-400 text-[10px] font-black uppercase tracking-wider">
                Active Dispatched Missions
              </span>
              <span className="text-5xl font-black mt-2 font-anton tracking-wide text-orange-500 dark:text-orange-400">
                {activeMissions}
              </span>
            </div>
            <div className="bg-linear-to-b from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-3xl p-6 flex flex-col justify-between">
              <span className="text-emerald-500 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                Resolved Disasters
              </span>
              <span className="text-5xl font-black mt-2 font-anton tracking-wide text-emerald-500 dark:text-emerald-400">
                {resolvedMissions}
              </span>
            </div>
            <div className="bg-linear-to-b from-red-500/10 to-transparent border border-red-500/20 rounded-3xl p-6 flex flex-col justify-between">
              <span className="text-red-500 dark:text-red-400 text-[10px] font-black uppercase tracking-wider">
                Unassigned Emergencies
              </span>
              <span className="text-5xl font-black mt-2 font-anton tracking-wide text-red-500 dark:text-red-400">
                {pendingIncidents}
              </span>
            </div>
          </div>

          {/* Breakdown Metrics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
            {/* Needs Category breakdown */}
            <div className="bg-(--background) border border-(--border-color) rounded-4xl p-8 shadow-inner">
              <h3 className="text-sm font-black uppercase tracking-wider mb-6 text-yellow">
                Incident Domain & Need Classification
              </h3>
              <div className="space-y-4">
                {[
                  'medical',
                  'food',
                  'water',
                  'shelter',
                  'animal',
                  'safety',
                  'education',
                  'unclassified',
                ].map((cat) => {
                  const count = categoriesCount[cat] || 0;
                  const percent =
                    totalIncidents > 0 ? ((count / totalIncidents) * 100).toFixed(0) : '0';
                  if (count === 0 && cat !== 'medical' && cat !== 'food' && cat !== 'animal')
                    return null;
                  return (
                    <div key={cat} className="space-y-2">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                        <span className="text-sage">{cat}</span>
                        <span className="text-(--foreground)">
                          {count} ({percent}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-(--foreground)/5 rounded-full overflow-hidden border border-(--border-color)">
                        <div
                          className="h-full bg-yellow transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Response Channels Breakdown */}
            <div className="bg-(--background) border border-(--border-color) rounded-4xl p-8 flex flex-col justify-between gap-6 shadow-inner">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider mb-6 text-blue-500">
                  Intake Channels Distribution
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  {['web', 'voice_agent', 'telegram', 'whatsapp'].map((src) => {
                    const count = sourcesCount[src] || 0;
                    const percent =
                      totalIncidents > 0 ? ((count / totalIncidents) * 100).toFixed(0) : '0';
                    return (
                      <div
                        key={src}
                        className="bg-(--foreground)/5 border border-(--border-color) rounded-2xl p-5 flex flex-col justify-between"
                      >
                        <span className="text-sage text-[10px] font-black uppercase tracking-wider">
                          {src.replace('_', ' ')}
                        </span>
                        <div className="flex justify-between items-end mt-4">
                          <span className="text-2xl font-anton text-(--foreground)">{count}</span>
                          <span className="text-[10px] text-sage font-black">{percent}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AI Ops Telemetry */}
              <div className="border-t border-(--border-color) pt-6">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-sage mb-4">
                  Autonomous AI Operations Telemetry
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-(--foreground)/5 rounded-xl border border-(--border-color)">
                    <span className="text-[8px] font-black uppercase tracking-wider text-sage">
                      Avg Urgency Index
                    </span>
                    <div className="text-lg font-black mt-1 text-(--foreground) font-mono">
                      {urgencyAvg}/10
                    </div>
                  </div>
                  <div className="text-center p-3 bg-(--foreground)/5 rounded-xl border border-(--border-color)">
                    <span className="text-[8px] font-black uppercase tracking-wider text-sage">
                      SLA Escalations
                    </span>
                    <div className="text-lg font-black mt-1 text-indigo-500 dark:text-indigo-400 font-mono">
                      {escalatedCount}
                    </div>
                  </div>
                  <div className="text-center p-3 bg-(--foreground)/5 rounded-xl border border-(--border-color)">
                    <span className="text-[8px] font-black uppercase tracking-wider text-sage">
                      Clustered Events
                    </span>
                    <div className="text-lg font-black mt-1 text-emerald-600 dark:text-emerald-400 font-mono">
                      {clusteredCount}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

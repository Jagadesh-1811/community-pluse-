"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRealtimeNeeds, Need } from "@/hooks/useRealtimeNeeds";
import Image from "next/image";

const LiveMap = dynamic(() => import("@/components/map/LiveMap"), {
  ssr: false,
});
import {
  LayoutDashboard,
  ShieldAlert,
  Truck,
  CheckCircle2,
  Activity,
  MapPin,
  Phone,
  Navigation2,
  X,
  Signal,
  LogOut,
  Bot,
  ChevronUp,
  Loader2,
  Mic,
  User,
  BarChart2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { rtdb, auth } from "@/lib/firebase";
import {
  ref,
  update,
  onValue,
  query,
  limitToLast,
  get,
  set,
} from "firebase/database";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { Mail, Key, ArrowRight, Shield } from "lucide-react";
import ChatPanel from "@/components/chat/ChatPanel";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
    "http://localhost:8000";
  const { needs, loading: needsLoading, refresh } = useRealtimeNeeds();
  const {
    user,
    role,
    domain,
    categories: volunteerCategories,
    loading: authLoading,
    signOut,
  } = useAuth();
  const [now] = useState(() => Date.now());

  // Dynamic Stats calculations for Analytics tab
  const totalIncidents = needs.length;
  const activeMissions = needs.filter(
    (n) => n.status === "in-progress" || n.status === "in_progress",
  ).length;
  const resolvedMissions = needs.filter((n) => n.status === "resolved").length;
  const pendingIncidents = needs.filter(
    (n) => !n.status || n.status === "open",
  ).length;

  const categoriesCount = needs.reduce((acc: Record<string, number>, curr) => {
    const type = curr.need_type || "unclassified";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const sourcesCount = needs.reduce((acc: Record<string, number>, curr) => {
    const src = curr.source || "web";
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {});

  const urgencyAvg =
    totalIncidents > 0
      ? (
          needs.reduce((sum, n) => sum + (n.urgency_score || 0), 0) /
          totalIncidents
        ).toFixed(1)
      : "0.0";

  const escalatedCount = needs.filter((n) => n.sla_escalated).length;
  const clusteredCount = needs.filter(
    (n) => n.is_major_incident || n.parent_incident_id,
  ).length;

  // AUTH PROTECTION
  // Handled inline in the render block to allow dedicated volunteer authentication.

  interface DispatchRecommendation {
    volunteer_name?: string;
    route_source?: string;
    distance_km?: string | number;
    duration_min?: string | number;
    reasoning?: string;
    polyline?: [number, number][];
  }

  const [selectedNeed, setSelectedNeed] = useState<Need | null>(null);
  const [collapsedNeed, setCollapsedNeed] = useState<Need | null>(null);
  const [activeTab, setActiveTab] = useState<
    | "map"
    | "alerts"
    | "dispatched"
    | "resolved"
    | "comms"
    | "intel"
    | "analytics"
  >("map");
  const [manualSector, setManualSector] = useState<"all" | "human" | "animal">(
    "all",
  );
  const [categories, setCategories] = useState<
    { id: string; name: string; color: string }[]
  >([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] =
    useState<string>("all");
  const [glitchingCategory, setGlitchingCategory] = useState<string | null>(
    null,
  );
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<
    "all" | "voice_agent" | "telegram" | "web"
  >("all");
  const [selectedDateFilter, setSelectedDateFilter] = useState<
    "all" | "today" | "24h" | "7d"
  >("all");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationData, setRecommendationData] =
    useState<DispatchRecommendation | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(
    null,
  );

  // INLINE VOLUNTEER AUTH STATES
  const [volEmail, setVolEmail] = useState("");
  const [volPassword, setVolPassword] = useState("");
  const [volAccessCode, setVolAccessCode] = useState("");
  const [volDomainSelect, setVolDomainSelect] = useState<"human" | "animal">(
    "human",
  );
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [localAuthLoading, setLocalAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);

  // Derived state: Use domain if locked, otherwise use manual selection
  const activeSector = domain || manualSector;

  // Listen to categories from Firebase Realtime Database
  useEffect(() => {
    const categoriesRef = ref(rtdb, "categories");
    const unsubscribe = onValue(categoriesRef, (snapshot) => {
      const list: { id: string; name: string; color: string }[] = [];
      snapshot.forEach((child) => {
        list.push({ id: child.key!, ...child.val() });
      });
      setCategories(list);
    });
    return () => unsubscribe();
  }, []);
  const [volunteerLocation, setVolunteerLocation] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
  } | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "detecting" | "found" | "denied" | "idle"
  >("idle");
  const [showLocationToast, setShowLocationToast] = useState(false);
  const [actionToast, setActionToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isManualMode, setIsManualMode] = useState(false);
  const [watchId] = useState<number | null>(null);
  const [trackingNeedId, setTrackingNeedId] = useState<string | null>(null);

  useEffect(() => {
    if (!actionToast) return;
    const timeoutId = window.setTimeout(() => setActionToast(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [actionToast]);

  const formatDate = (ts: number | string | null | undefined) => {
    if (!ts) return "Unknown Time";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "Invalid Date";
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };
  interface CommMessage {
    id: string;
    need_id: string;
    type: string;
    body: string;
    status: string;
    created_at: number;
  }

  interface TelegramAction {
    id: string;
    type: "report" | "animal" | "start" | "other";
    user_id: number;
    username: string;
    text: string;
    sentiment?: string;
    urgency?: number;
    created_at: number;
    source?: string;
  }

  const [commsMessages, setCommsMessages] = useState<CommMessage[]>([]);
  const [telegramActions, setTelegramActions] = useState<TelegramAction[]>([]);

  useEffect(() => {
    if (isManualMode) {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      return;
    }

    // 1. Hardware Geolocation Hook
    if ("geolocation" in navigator) {
      if (locationStatus === "idle") {
        setTimeout(() => {
          setLocationStatus("detecting");
          setShowLocationToast(true);
        }, 0);
      }

      const id = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;

          // Only accept high-accuracy locks (< 100m) for field coordination
          if (accuracy > 100) {
            console.warn(
              `Low accuracy GPS: ${accuracy}m. Waiting for better lock...`,
            );
            return;
          }

          if (!isNaN(latitude) && !isNaN(longitude)) {
            setVolunteerLocation({
              lat: latitude,
              lng: longitude,
              accuracy: accuracy,
            });
            setLocationStatus("found");
            // Auto-hide toast after 3s if it was just found
            if (showLocationToast) {
              setTimeout(() => setShowLocationToast(false), 3000);
            }
          }
        },
        async (err) => {
          console.warn("Volunteer GPS error:", err);
          setLocationStatus("denied");
          setTimeout(() => setShowLocationToast(false), 4000);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );

      return () => {
        navigator.geolocation.clearWatch(id);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManualMode]);

  const handleManualLocationSet = (lat: number, lng: number) => {
    setVolunteerLocation({ lat, lng, accuracy: 0 });
    setLocationStatus("found");
    setIsManualMode(true);
    setShowLocationToast(true);
    setTimeout(() => setShowLocationToast(false), 2000);
  };

  const clearManualOverride = () => {
    setIsManualMode(false);
    setLocationStatus("idle");
  };

  // Haversine Distance Formula
  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) => {
    const R = 6371; // Earth Radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(1);
  };

  // SYNC VOLUNTEER LOCATION TO FIREBASE
  // This allows the reporter (user) to see the volunteer's live position on their map
  useEffect(() => {
    if (trackingNeedId && volunteerLocation) {
      const syncLocation = async () => {
        const needRef = ref(rtdb, `needs/${trackingNeedId}`);
        await update(needRef, {
          volunteer_lat: volunteerLocation.lat,
          volunteer_lng: volunteerLocation.lng,
        });
      };

      // Sync every 3 seconds or on location change
      const interval = setInterval(syncLocation, 3000);
      syncLocation(); // immediate initial sync

      return () => clearInterval(interval);
    }
  }, [trackingNeedId, volunteerLocation]);

  const openNeed = (
    need: Need,
    tab: "map" | "alerts" | "dispatched" | "resolved" = "map",
  ) => {
    setSelectedNeed(need);
    setCollapsedNeed(null);
    setActiveTab(tab);
    setRecommendationData(null);
    setRecommendationLoading(false);
    setRecommendationError(null);
  };

  const closeNeedPanel = () => {
    if (selectedNeed) {
      setCollapsedNeed(selectedNeed);
    }
    setSelectedNeed(null);
    setRecommendationData(null);
    setRecommendationLoading(false);
    setRecommendationError(null);
  };

  const fetchVolunteerRecommendation = async (incidentId: string) => {
    setRecommendationLoading(true);
    setRecommendationError(null);
    setRecommendationData(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/incidents/${incidentId}/recommend-volunteer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.detail || `Server responded with ${res.status}`,
        );
      }
      const data = await res.json();
      if (data.status === "success" && data.recommendation) {
        setRecommendationData(data.recommendation);
      } else {
        throw new Error(
          "Invalid response from dispatch recommendation service.",
        );
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Failed to fetch volunteer recommendation:", error);
      setRecommendationError(error.message || "Failed to load recommendation.");
    } finally {
      setRecommendationLoading(false);
    }
  };

  const handleDeploy = async (needId: string, status: string) => {
    try {
      const needRef = ref(rtdb, `needs/${needId}`);
      await update(needRef, { status });

      if (status === "in-progress" || status === "resolved") {
        if (status === "in-progress") setTrackingNeedId(needId);
        else setTrackingNeedId(null);
        // Trigger automated dispatch notification
        try {
          await fetch(`${apiBaseUrl}/status/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ need_id: needId, status }),
          });
        } catch (err) {
          console.error("Failed to notify dispatch:", err);
        }
      } else if (status === "resolved" || status === "open") {
        setTrackingNeedId(null);
      }
      if (status === "in-progress") {
        setActionToast({
          type: "success",
          message: "Dispatch initiated successfully.",
        });
        setActiveTab("dispatched");
      } else if (status === "resolved") {
        setActionToast({
          type: "success",
          message: "Issue resolved successfully.",
        });
        setActiveTab("resolved");
      }
      setSelectedNeed(null);
      setCollapsedNeed(null);
      refresh();
    } catch (error) {
      console.error("Error updating status:", error);
      setActionToast({
        type: "error",
        message: "Failed to update mission status.",
      });
    }
  };

  // FETCH & LISTEN FOR COMMUNICATIONS LOGS
  useEffect(() => {
    // In RTDB, we might want to listen to all messages for all needs if that's what was happening before
    // Or just a specific node. Let's assume a global 'all_messages' for the dashboard or listen to the messages root.
    const messagesRef = ref(rtdb, "messages");
    const q = query(messagesRef, limitToLast(50));

    const unsubscribe = onValue(q, (snapshot) => {
      const allMsgs: CommMessage[] = [];
      snapshot.forEach((needMessages) => {
        needMessages.forEach((msg) => {
          allMsgs.push({ id: msg.key, ...msg.val() });
        });
      });
      // Sort by created_at desc
      allMsgs.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      setCommsMessages(allMsgs.slice(0, 50));
    });

    return () => unsubscribe();
  }, []);

  // LISTEN FOR TELEGRAM ACTIONS
  useEffect(() => {
    const actionsRef = ref(rtdb, "telegram_actions");
    const q = query(actionsRef, limitToLast(20));

    const unsubscribe = onValue(q, (snapshot) => {
      const actions: TelegramAction[] = [];
      snapshot.forEach((child) => {
        actions.push({ id: child.key, ...child.val() } as TelegramAction);
      });
      // Newest first
      setTelegramActions(actions.reverse());
    });

    return () => unsubscribe();
  }, []);

  // Filter needs by sector (Strictly locked to volunteer domain if set) and custom categories
  const filteredNeeds = needs.filter((need) => {
    // 1. Domain Filter
    if (domain) {
      if (domain === "animal") {
        if (need.need_type !== "animal") return false;
      } else {
        if (need.need_type === "animal") return false;
      }
    } else {
      if (activeSector === "animal") {
        if (need.need_type !== "animal") return false;
      } else if (activeSector === "human") {
        if (need.need_type === "animal") return false;
      }
    }

    // 1.5. Volunteer Category Filter
    if (
      role === "VOLUNTEER" &&
      volunteerCategories &&
      volunteerCategories.length > 0
    ) {
      const needType = need.need_type || "general";
      const isMatched = volunteerCategories.some(
        (cat) => cat.toLowerCase() === needType.toLowerCase(),
      );
      if (!isMatched) return false;
    }

    // 2. Custom Category Filter
    if (selectedCategoryFilter !== "all") {
      const needType = need.need_type || "general";
      if (needType.toLowerCase() !== selectedCategoryFilter.toLowerCase())
        return false;
    }

    // 3. Source Channel Filter
    if (selectedSourceFilter !== "all") {
      if (need.source !== selectedSourceFilter) return false;
    }

    // 4. Date & Time Filter
    if (selectedDateFilter !== "all") {
      const createdAt = need.created_at || 0;
      if (selectedDateFilter === "today") {
        const todayStart = new Date().setHours(0, 0, 0, 0);
        if (createdAt < todayStart) return false;
      } else if (selectedDateFilter === "24h") {
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        if (createdAt < oneDayAgo) return false;
      } else if (selectedDateFilter === "7d") {
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        if (createdAt < sevenDaysAgo) return false;
      }
    }

    return true;
  });

  // Sort filtered needs by urgency
  const sortedNeeds = [...filteredNeeds]
    .filter((n) => n.status === "open" || !n.status)
    .sort((a, b) => b.urgency_score - a.urgency_score);
  const dispatchedNeeds = [...filteredNeeds]
    .filter((n) => n.status === "in-progress")
    .sort((a, b) => b.urgency_score - a.urgency_score);
  const resolvedNeeds = [...filteredNeeds]
    .filter((n) => n.status === "resolved")
    .sort((a, b) => b.urgency_score - a.urgency_score);

  // INLINE VOLUNTEER AUTH HANDLERS
  const handleVolSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalAuthLoading(true);
    setAuthError(null);
    try {
      // 1. Verify code on backend
      const verifyRes = await fetch(`${apiBaseUrl}/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: volAccessCode, role: "VOLUNTEER" }),
      });
      if (!verifyRes.ok) {
        throw new Error(
          "INVALID ACCESS CODE: Volunteer commissioning requires a valid tactical code.",
        );
      }

      // 2. Create User in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        volEmail,
        volPassword,
      );
      const userObj = userCredential.user;

      // 3. Send Verification Email
      const actionCodeSettings = {
        url: window.location.origin + "/volunteer",
        handleCodeInApp: true,
      };
      await sendEmailVerification(userObj, actionCodeSettings);

      // 4. Save User details in RTDB
      await set(ref(rtdb, `users/${userObj.uid}`), {
        email: volEmail,
        role: "VOLUNTEER",
        domain: volDomainSelect,
        created_at: new Date().toISOString(),
      });

      setVerificationSent(true);
    } catch (err: unknown) {
      const error = err as Error;
      setAuthError(error.message || "Failed to create Volunteer account");
    } finally {
      setLocalAuthLoading(false);
    }
  };

  const handleVolSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalAuthLoading(true);
    setAuthError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        volEmail,
        volPassword,
      );
      const userObj = userCredential.user;

      if (!userObj.emailVerified) {
        setAuthError(
          "ACCESS DENIED: Please verify your email first. Check your inbox.",
        );
        // Resend email verification
        const actionCodeSettings = {
          url: window.location.origin + "/volunteer",
          handleCodeInApp: true,
        };
        await sendEmailVerification(userObj, actionCodeSettings);
        await firebaseSignOut(auth);
        return;
      }

      // Check database role
      const snapshot = await get(ref(rtdb, `users/${userObj.uid}`));
      const userData = snapshot.val();
      if (userData?.role !== "VOLUNTEER" && userData?.role !== "ADMIN") {
        await firebaseSignOut(auth);
        setAuthError(
          "ACCESS DENIED: This account is not registered as a volunteer.",
        );
      }
    } catch (err: unknown) {
      const error = err as Error;
      setAuthError(error.message || "Invalid credentials");
    } finally {
      setLocalAuthLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="fixed inset-0 z-200 bg-(--background) brutalist-grid flex flex-col items-center justify-center gap-10">
        <div className="relative animate-pulse">
          <div className="absolute inset-x-[-10px] inset-y-[10px] bg-yellow -rotate-3 scale-105 z-[-1]"></div>
          <div className="p-8 bg-(--background) border border-(--border-color) shadow-2xl relative z-10 glass">
            <Activity className="text-yellow" size={80} />
          </div>
        </div>
        <p className="text-sm font-black uppercase tracking-[0.3em] opacity-40 font-roboto">
          Verifying Credentials...
        </p>
      </div>
    );
  }

  // RENDER DEDICATED INLINE AUTH PAGE IF NOT A VOLUNTEER/ADMIN
  if (!user || (role !== "VOLUNTEER" && role !== "ADMIN")) {
    return (
      <main className="min-h-screen bg-(--background) brutalist-grid flex items-center justify-center p-6 relative overflow-hidden font-roboto pt-20">
        <div className="w-full max-w-5xl mx-auto flex flex-col lg:flex-row gap-12 items-center z-10">
          {/* LEFT: Branding */}
          <div className="lg:w-1/2 flex flex-col text-left">
            <div className="w-20 h-20 bg-charcoal rounded-xl mb-8 flex items-center justify-center brutalist-border shadow-2xl transform -rotate-3">
              <Shield className="text-yellow" size={40} />
            </div>
            <h1 className="text-6xl md:text-8xl font-anton uppercase tracking-normal leading-[0.9] mb-4 text-(--foreground)">
              Volunteer
              <br />
              <span className="text-yellow">Gateway</span>
            </h1>
            <p className="text-sm text-(--foreground) opacity-50 font-bold uppercase tracking-[0.2em] mt-6">
              Authorized Response Personnel Only
            </p>
          </div>

          {/* RIGHT: Login Card */}
          <div className="lg:w-1/2 w-full bg-(--background) border border-(--border-color) rounded-2xl p-8 lg:p-12 shadow-2xl brutalist-border">
            {user && role !== "VOLUNTEER" && role !== "ADMIN" ? (
              <div className="text-center space-y-6 animate-in zoom-in duration-300">
                <ShieldAlert className="text-red-500 mx-auto" size={48} />
                <h3 className="text-xl font-anton uppercase text-red-500">
                  ACCESS DENIED
                </h3>
                <p className="text-sm text-sage leading-relaxed">
                  Your current account (<strong>{user.email}</strong>) is
                  registered as a <strong>Reporter</strong>. Standard reporters
                  do not have command clearance.
                </p>
                <button
                  onClick={() => signOut()}
                  className="w-full py-4 bg-red-500 text-white font-anton uppercase tracking-widest rounded-xl transition-all">
                  Log Out / Switch Account
                </button>
              </div>
            ) : verificationSent ? (
              <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center space-y-4 animate-in zoom-in duration-300">
                <CheckCircle2 className="text-emerald-400 mx-auto" size={48} />
                <h3 className="text-xl font-anton uppercase text-emerald-400 font-black">
                  COMMISSION DISPATCHED
                </h3>
                <p className="text-sm text-sage leading-relaxed">
                  We have sent an authentication link to{" "}
                  <strong>{volEmail}</strong>. Please verify your email, then
                  return here to log in.
                </p>
                <button
                  onClick={() => {
                    setVerificationSent(false);
                    setAuthMode("signin");
                  }}
                  className="w-full py-4 bg-yellow text-charcoal font-anton uppercase tracking-widest rounded-xl transition-all">
                  Continue to Sign In
                </button>
              </div>
            ) : (
              <form
                onSubmit={
                  authMode === "signin" ? handleVolSignin : handleVolSignup
                }
                className="space-y-6">
                <h2 className="text-4xl font-anton uppercase text-(--foreground) mb-6 tracking-wide">
                  {authMode === "signin"
                    ? "Volunteer Sign In"
                    : "Register Volunteer"}
                </h2>

                <div>
                  <label className="block text-xs text-(--foreground) font-bold uppercase tracking-widest mb-2.5 opacity-60">
                    Personnel ID (Email)
                  </label>
                  <div className="relative">
                    <Mail
                      className="absolute left-5 top-1/2 -translate-y-1/2 text-(--foreground)/30"
                      size={18}
                    />
                    <input
                      type="email"
                      required
                      value={volEmail}
                      onChange={(e) => setVolEmail(e.target.value)}
                      className="w-full bg-(--background) border border-(--border-color) rounded-xl py-4 pl-14 pr-6 text-lg focus:outline-none focus:border-yellow transition-all font-semibold"
                      placeholder="agent.name@emergency.net"
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
                      value={volPassword}
                      onChange={(e) => setVolPassword(e.target.value)}
                      className="w-full bg-(--background) border border-(--border-color) rounded-xl py-4 pl-14 pr-6 text-lg focus:outline-none focus:border-yellow transition-all font-semibold tracking-widest"
                      placeholder="••••••••••••"
                    />
                  </div>
                </div>

                {authMode === "signup" && (
                  <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                    <div>
                      <label className="block text-xs text-yellow font-black uppercase tracking-widest mb-2.5">
                        Operational Domain
                      </label>
                      <div className="flex gap-4 p-1 bg-white/5 rounded-xl border border-white/10">
                        <button
                          type="button"
                          onClick={() => setVolDomainSelect("human")}
                          className={cn(
                            "flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all cursor-pointer",
                            volDomainSelect === "human"
                              ? "bg-yellow text-charcoal shadow-md"
                              : "text-(--foreground) opacity-40 hover:opacity-100",
                          )}>
                          Human Health
                        </button>
                        <button
                          type="button"
                          onClick={() => setVolDomainSelect("animal")}
                          className={cn(
                            "flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all cursor-pointer",
                            volDomainSelect === "animal"
                              ? "bg-blue-500 text-white shadow-md"
                              : "text-(--foreground) opacity-40 hover:opacity-100",
                          )}>
                          Animal Health
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-yellow font-black uppercase tracking-widest mb-2.5">
                        Tactical Clearance Code
                      </label>
                      <input
                        type="text"
                        required
                        value={volAccessCode}
                        onChange={(e) => setVolAccessCode(e.target.value)}
                        className="w-full bg-yellow/5 border border-yellow/30 rounded-xl py-4 px-6 text-yellow text-lg focus:outline-none focus:border-yellow transition-all placeholder:text-yellow/20 font-black tracking-widest"
                        placeholder="ENTER ACCESS CODE"
                      />
                    </div>
                  </div>
                )}

                {authError && (
                  <div className="text-red-500 font-bold text-sm text-center bg-red-500/10 py-3 rounded-lg border border-red-500/20 font-outfit animate-in zoom-in duration-300">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={localAuthLoading}
                  className="w-full bg-yellow text-charcoal font-anton uppercase tracking-widest text-2xl py-6 rounded-xl shadow-lg hover:-translate-y-0.5 active:translate-y-0.5 transition-all flex items-center justify-center gap-3">
                  {localAuthLoading ? (
                    <Loader2 className="animate-spin" size={24} />
                  ) : (
                    <>
                      {authMode === "signin"
                        ? "Verify Identity"
                        : "Commission Account"}
                      <ArrowRight size={24} strokeWidth={3} />
                    </>
                  )}
                </button>

                <div className="text-center pt-6 border-t border-(--border-color)">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError(null);
                      setAuthMode(authMode === "signin" ? "signup" : "signin");
                    }}
                    className="text-xs text-sage uppercase font-black tracking-widest hover:text-yellow transition-colors">
                    {authMode === "signin"
                      ? "Request Volunteer Commissioning →"
                      : "Already commissioned? Sign In →"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-(--background) overflow-hidden flex font-roboto -mt-20 pt-20">
      {/* 
          UNIFIED SIDEBAR SYSTEM 
          Contains both Navigation icons and the expandable Intake Form
      */}
      <aside className="fixed left-0 top-20 bottom-0 z-40 flex transition-all duration-500 ease-out translate-x-0">
        {/* Persistent Nav Strip */}
        <nav className="h-full w-24 flex flex-col items-center gap-8 py-10 glass border-r border-(--border-color) border-t-0 relative z-20 brutalist-grid">
          {/* Dashboard Icon */}
          <div className="relative group">
            <button
              onClick={() => setActiveTab("map")}
              className={cn(
                "p-4 rounded-2xl transition-all border border-transparent hover:scale-105 active:scale-95",
                activeTab === "map"
                  ? "bg-yellow text-black border-black/10 shadow-[0_5px_15px_rgba(255,225,124,0.3)]"
                  : "text-(--foreground)/60 hover:text-(--foreground) hover:bg-(--foreground)/10",
              )}>
              <LayoutDashboard size={24} />
            </button>
            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-(--foreground) text-(--background) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
              Operation Map
            </div>
          </div>

          <div className="w-8 h-px bg-white/10 my-4"></div>

          {/* Priority Intelligence Icon */}
          <div className="relative group">
            <button
              onClick={() => setActiveTab("alerts")}
              className={cn(
                "p-4 rounded-2xl transition-all relative hover:scale-105 active:scale-95",
                activeTab === "alerts"
                  ? "bg-emergency text-(--background) border border-emergency/50 shadow-[0_0_15px_var(--color-emergency-glow)]"
                  : "text-(--foreground)/60 hover:text-(--foreground) hover:bg-(--foreground)/10",
              )}>
              <ShieldAlert size={24} />
              {needs.filter((n) => n.urgency_score >= 8).length > 0 && (
                <div className="absolute top-2 right-2 w-3 h-3 bg-white rounded-full animate-pulse border-2 border-emergency shadow-[0_0_10px_white]"></div>
              )}
            </button>
            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-(--foreground) text-(--background) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
              Priority Queue
            </div>
          </div>

          {/* Dispatched Icon */}
          <div className="relative group">
            <button
              onClick={() => setActiveTab("dispatched")}
              className={cn(
                "p-4 rounded-2xl transition-all hover:scale-105 active:scale-95",
                activeTab === "dispatched"
                  ? "bg-orange-500 text-(--background) shadow-[0_0_15px_rgba(249,115,22,0.4)]"
                  : "text-(--foreground)/60 hover:text-(--foreground) hover:bg-(--foreground)/10",
              )}>
              <Truck size={24} />
            </button>
            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-(--foreground) text-(--background) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
              Active Dispatch
            </div>
          </div>

          {/* Resolved Icon */}
          <div className="relative group">
            <button
              onClick={() => setActiveTab("resolved")}
              className={cn(
                "p-4 rounded-2xl transition-all hover:scale-105 active:scale-95",
                activeTab === "resolved"
                  ? "bg-success text-(--background) shadow-[0_0_15px_var(--color-success-glow)]"
                  : "text-(--foreground)/60 hover:text-(--foreground) hover:bg-(--foreground)/10",
              )}>
              <CheckCircle2 size={24} />
            </button>
            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-(--foreground) text-(--background) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
              Resolved Missions
            </div>
          </div>

          {/* Analytics Icon */}
          <div className="relative group">
            <button
              onClick={() => setActiveTab("analytics")}
              className={cn(
                "p-4 rounded-2xl transition-all hover:scale-105 active:scale-95",
                activeTab === "analytics"
                  ? "bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]"
                  : "text-(--foreground)/60 hover:text-(--foreground) hover:bg-(--foreground)/10",
              )}>
              <BarChart2 size={24} />
            </button>
            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-(--foreground) text-(--background) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
              Command Analytics
            </div>
          </div>

          <div className="mt-auto flex flex-col items-center gap-6">
            <div className="relative group">
              <button
                onClick={() => setActiveTab("comms")}
                className={cn(
                  "p-4 transition-all rounded-2xl hover:scale-105 active:scale-95",
                  activeTab === "comms"
                    ? "bg-(--foreground) text-(--background) shadow-xl"
                    : "text-(--foreground)/60 hover:text-(--foreground) hover:bg-(--foreground)/10",
                )}>
                <Phone size={24} />
              </button>
              <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-(--foreground) text-(--background) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                Comms Center
              </div>
            </div>

            <div className="relative group">
              <button
                onClick={() => setActiveTab("intel")}
                className={cn(
                  "p-4 transition-all rounded-2xl hover:scale-105 active:scale-95",
                  activeTab === "intel"
                    ? "bg-yellow text-black shadow-xl"
                    : "text-(--foreground)/60 hover:text-(--foreground) hover:bg-(--foreground)/10",
                )}>
                <Bot size={24} />
              </button>
              <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-(--foreground) text-(--background) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                Telegram Intel
              </div>
            </div>

            <div className="w-10 h-px bg-(--border-color)"></div>

            <div className="relative group">
              <button
                onClick={() => signOut()}
                className="p-4 rounded-2xl text-(--foreground)/50 hover:text-(--background) hover:bg-emergency transition-all hover:scale-105 active:scale-95">
                <LogOut size={20} />
              </button>
              <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-emergency text-(--foreground) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                Terminate Link
              </div>
            </div>
          </div>
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 transition-all duration-500 ease-out h-[calc(100vh-80px)] relative flex flex-col pl-24">
        {/* Header */}
        <header className="px-12 py-8 flex justify-between items-center border-b border-(--border-color) glass z-30">
          <div className="flex items-center gap-6">
            <div className="p-3 bg-emergency rounded-[1.25rem] border border-black/10 shadow-lg shadow-emergency/20">
              <Activity className="text-(--foreground)" size={28} />
            </div>
            <div>
              <h1 className="text-4xl font-anton text-(--foreground) tracking-wide uppercase leading-none mb-1 shadow-sm">
                {activeTab === "map"
                  ? "Operational Hub"
                  : activeTab === "alerts"
                    ? "Priority Queue"
                    : activeTab === "dispatched"
                      ? "Active Dispatch"
                      : activeTab === "resolved"
                        ? "Mission Archive"
                        : activeTab === "comms"
                          ? "AI Watch Chatbot"
                          : activeTab === "intel"
                            ? "Signals Intel"
                            : activeTab === "analytics"
                              ? "Command Analytics"
                              : "Command Center"}
              </h1>
              <div className="flex items-center gap-4">
                <p className="text-[10px] text-sage font-bold uppercase tracking-widest pl-0.5">
                  CommunityPulse Response Network
                </p>
                <div className="flex bg-white/5 p-1 rounded-lg border border-white/10 ml-2">
                  {/* If domain is assigned, only show that specific domain and hide others */}
                  {domain ? (
                    <div
                      className={cn(
                        "px-4 py-1.5 rounded-md text-[9px] font-black uppercase tracking-[0.3em] shadow-lg",
                        domain === "human"
                          ? "bg-yellow text-black"
                          : "bg-blue-500 text-white",
                      )}>
                      Locked Domain:{" "}
                      {domain === "human" ? "Human Health" : "Animal Health"}
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setManualSector("human")}
                        className={cn(
                          "px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all",
                          activeSector === "human"
                            ? "bg-yellow text-black"
                            : "text-sage hover:text-yellow",
                        )}>
                        Human Health
                      </button>
                      <button
                        onClick={() => setManualSector("animal")}
                        className={cn(
                          "px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all",
                          activeSector === "animal"
                            ? "bg-blue-500 text-white"
                            : "text-sage hover:text-blue-400",
                        )}>
                        Animal Health
                      </button>
                      <button
                        onClick={() => setManualSector("all")}
                        className={cn(
                          "px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all",
                          activeSector === "all"
                            ? "bg-white/10 text-(--foreground)"
                            : "text-sage hover:text-(--foreground)",
                        )}>
                        All
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-10">
            {/* Volunteer GPS Status */}
            <div className="flex flex-col items-end border-r border-(--border-color) pr-10">
              <span className="text-[10px] text-(--foreground)/60 font-black uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Navigation2 size={9} />
                Your Position
              </span>
              {volunteerLocation ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_6px_rgba(96,165,250,0.8)]"></div>
                  <span className="text-sm font-black text-blue-400 font-mono tracking-tighter tabular-nums">
                    {volunteerLocation.lat.toFixed(4)},{" "}
                    {volunteerLocation.lng.toFixed(4)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-600 animate-pulse"></div>
                  <span className="text-sm font-black text-sage uppercase tracking-widest">
                    Locating...
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-10 border-r border-(--border-color) pr-10">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-(--foreground)/60 font-black uppercase tracking-widest mb-1">
                  Life Threats
                </span>
                <span className="text-3xl font-anton text-emergency tracking-widest tabular-nums">
                  {needs.filter((n) => n.urgency_score >= 8).length}
                </span>
              </div>
              <div className="flex flex-col items-end pl-4">
                <span className="text-[10px] text-(--foreground)/60 font-black uppercase tracking-widest mb-1">
                  Active Feed
                </span>
                <span className="text-3xl font-anton text-success tracking-widest tabular-nums">
                  {filteredNeeds.length}
                </span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-linear-to-r from-yellow to-yellow border border-(--border-color) shadow-lg p-0.5">
              <div className="w-full h-full rounded-[0.9rem] bg-(--background)/80 backdrop-blur-sm"></div>
            </div>
          </div>
        </header>

        {/* View Selection Content */}
        <div className="flex-1 p-6 lg:p-12 overflow-hidden relative flex flex-col">
          <AnimatePresence mode="wait">
            {activeTab === "map" ? (
              <motion.div
                key="map-view"
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.01 }}
                className="w-full flex-1 overflow-hidden rounded-4xl border border-(--border-color) shadow-2xl glass brutalist-grid">
                <LiveMap
                  needs={filteredNeeds}
                  onMarkerClick={(need) => openNeed(need, "map")}
                  volunteerLocation={volunteerLocation}
                  focusNeed={selectedNeed}
                  onRecenter={() => {}}
                  isManualMode={isManualMode}
                  onManualLocationSet={handleManualLocationSet}
                  recommendedRoute={recommendationData?.polyline}
                />

                {/* Manual Mode Toggle & Status */}
                <div className="absolute top-6 right-6 z-50 flex flex-col items-end gap-3">
                  {!isManualMode ? (
                    <button
                      onClick={() => setIsManualMode(true)}
                      className="px-4 py-2 bg-dark-gray/80 backdrop-blur-md border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-sage/80 hover:text-(--foreground) hover:border-yellow/50 transition-all flex items-center gap-2 shadow-xl">
                      <MapPin size={12} className="text-yellow" />
                      Correct Location
                    </button>
                  ) : (
                    <div className="flex flex-col items-end gap-2">
                      <div className="px-4 py-2 bg-yellow/20 backdrop-blur-md border border-yellow/50 rounded-xl text-[10px] font-black uppercase tracking-widest text-(--foreground) flex items-center gap-2 shadow-xl">
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                        Placement Mode: Click Map
                      </div>
                      <button
                        onClick={clearManualOverride}
                        className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[8px] font-black uppercase tracking-widest text-sage hover:text-(--foreground) transition-all">
                        Use GPS Logic
                      </button>
                    </div>
                  )}
                </div>

                {/* GPS Location Detection Toast */}
                <AnimatePresence>
                  {showLocationToast && (
                    <motion.div
                      initial={{ opacity: 0, y: -20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 0.95 }}
                      transition={{
                        type: "spring",
                        damping: 20,
                        stiffness: 200,
                      }}
                      className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl border shadow-2xl backdrop-blur-xl"
                      style={{
                        background:
                          locationStatus === "found"
                            ? "rgba(0,230,118,0.12)"
                            : locationStatus === "denied"
                              ? "rgba(255,77,0,0.12)"
                              : "rgba(59,130,246,0.12)",
                        borderColor:
                          locationStatus === "found"
                            ? "rgba(0,230,118,0.3)"
                            : locationStatus === "denied"
                              ? "rgba(255,77,0,0.3)"
                              : "rgba(59,130,246,0.3)",
                      }}>
                      {locationStatus === "detecting" && (
                        <>
                          <div className="w-3.5 h-3.5 rounded-full bg-blue-500 animate-ping"></div>
                          <span className="text-xs font-black text-blue-400 uppercase tracking-widest">
                            Detecting your location...
                          </span>
                        </>
                      )}
                      {locationStatus === "found" && (
                        <>
                          <div className="w-3.5 h-3.5 rounded-full bg-success shadow-[0_0_10px_rgba(0,230,118,0.5)]"></div>
                          <span className="text-xs font-black text-success uppercase tracking-widest">
                            {isManualMode
                              ? "Location Overridden Manually"
                              : "Location locked — map centered on you"}
                          </span>
                        </>
                      )}
                      {locationStatus === "denied" && (
                        <>
                          <div className="w-3.5 h-3.5 rounded-full bg-emergency shadow-[0_0_10px_rgba(255,77,0,0.5)]"></div>
                          <span className="text-xs font-black text-emergency uppercase tracking-widest">
                            Location access denied
                          </span>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : activeTab === "alerts" ||
              activeTab === "dispatched" ||
              activeTab === "resolved" ? (
              <motion.div
                key={`${activeTab}-view`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full glass rounded-[3rem] p-12 overflow-y-auto no-scrollbar shadow-2xl">
                <div className="flex flex-col gap-4 mb-8 p-6 bg-white/5 rounded-3xl border border-white/5">
                  {/* Row 1: Need Categories / Sectors */}
                  {categories.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-sage/75 w-24">
                        Sector:
                      </span>
                      <button
                        onClick={() => {
                          setSelectedCategoryFilter("all");
                          setGlitchingCategory("all");
                          setTimeout(() => setGlitchingCategory(null), 450);
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer select-none",
                          glitchingCategory === "all"
                            ? "animate-glitch-bw"
                            : selectedCategoryFilter === "all"
                              ? "bg-yellow text-charcoal shadow-md"
                              : "bg-white/5 text-sage",
                        )}>
                        All Sectors
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => {
                            setSelectedCategoryFilter(cat.name);
                            setGlitchingCategory(cat.id);
                            setTimeout(() => setGlitchingCategory(null), 450);
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer select-none",
                            glitchingCategory === cat.id
                              ? "animate-glitch-bw"
                              : selectedCategoryFilter.toLowerCase() ===
                                  cat.name.toLowerCase()
                                ? "bg-white text-black shadow-md"
                                : "bg-white/5 text-sage",
                          )}>
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Row 2: Date & Time Filters */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-sage/75 w-24">
                      Date Range:
                    </span>
                    {[
                      { value: "all", label: "All Time" },
                      { value: "today", label: "Today" },
                      { value: "24h", label: "Last 24 Hours" },
                      { value: "7d", label: "Last 7 Days" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() =>
                          setSelectedDateFilter(
                            opt.value as "all" | "today" | "24h" | "7d",
                          )
                        }
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer select-none",
                          selectedDateFilter === opt.value
                            ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                            : "bg-white/5 text-sage",
                        )}>
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Row 3: Response Channels (Source Category Filters) */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-sage/75 w-24">
                      Channel:
                    </span>
                    {[
                      { value: "all", label: "All Channels" },
                      { value: "voice_agent", label: "WebRTC Voice" },
                      { value: "telegram", label: "Telegram Bot" },
                      { value: "web", label: "Web Portal" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() =>
                          setSelectedSourceFilter(
                            opt.value as
                              | "all"
                              | "voice_agent"
                              | "telegram"
                              | "web",
                          )
                        }
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer select-none",
                          selectedSourceFilter === opt.value
                            ? "bg-blue-500 text-white shadow-md shadow-blue-500/20"
                            : "bg-white/5 text-sage",
                        )}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-32">
                  {(activeTab === "alerts"
                    ? sortedNeeds
                    : activeTab === "dispatched"
                      ? dispatchedNeeds
                      : resolvedNeeds
                  ).map((need) => (
                    <div
                      key={need.id}
                      onClick={() => openNeed(need, "map")}
                      className="group relative p-6 bg-(--card-bg) rounded-4xl border border-(--border-color) hover:border-emergency/30 hover:bg-(--foreground)/5 cursor-pointer transition-all duration-500 shadow-xl flex flex-col">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex flex-col gap-1.5">
                          <div
                            className={cn(
                              "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest self-start",
                              need.urgency_score >= 8
                                ? "bg-emergency/20 text-emergency border border-emergency/30"
                                : need.urgency_score >= 5
                                  ? "bg-orange-500/20 text-orange-500 border border-orange-500/30"
                                  : "bg-success/20 text-success border border-success/30",
                            )}>
                            {need.urgency_score >= 8
                              ? "CRITICAL"
                              : need.urgency_score >= 5
                                ? "URGENT"
                                : "STABLE"}
                          </div>
                          {need.is_major_incident && (
                            <span className="px-2 py-0.5 bg-red-500/25 text-red-400 text-[8px] font-black rounded uppercase tracking-widest border border-red-500/50 animate-pulse self-start">
                              ⚠️ MAJOR CLUSTER
                            </span>
                          )}
                          {need.child_reports_count !== undefined &&
                            need.child_reports_count > 0 && (
                              <span className="px-2 py-0.5 bg-amber-500/25 text-amber-400 text-[8px] font-black rounded uppercase tracking-widest border border-amber-500/50 self-start">
                                👥 CLUSTERED ({1 + need.child_reports_count})
                              </span>
                            )}
                          {need.sla_escalated && (
                            <span className="px-2 py-0.5 bg-indigo-500/25 text-indigo-400 text-[8px] font-black rounded uppercase tracking-widest border border-indigo-500/50 animate-bounce self-start">
                              ⚡ SLA ESCALATED
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {need.source === "telegram" && (
                            <div className="flex flex-col items-end gap-1">
                              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-black rounded uppercase tracking-widest border border-blue-500/20">
                                via Telegram
                              </span>
                              <span className="text-[7px] font-black text-(--foreground) opacity-60 uppercase">
                                {formatDate(need.created_at)}
                              </span>
                            </div>
                          )}
                          {need.source === "voice_agent" && (
                            <div className="flex flex-col items-end gap-1">
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[8px] font-black rounded uppercase tracking-widest border border-emerald-500/20 flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span>
                                via WebRTC
                              </span>
                              <span className="text-[7px] font-black text-(--foreground) opacity-60 uppercase">
                                {formatDate(need.created_at)}
                              </span>
                            </div>
                          )}
                          {need.source !== "telegram" &&
                            need.source !== "voice_agent" && (
                              <div className="flex flex-col items-end gap-1">
                                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[8px] font-black rounded uppercase tracking-widest border border-amber-500/20">
                                  via Web Portal
                                </span>
                                <span className="text-[7px] font-black text-(--foreground) opacity-60 uppercase">
                                  {formatDate(need.created_at)}
                                </span>
                              </div>
                            )}
                          <span className="text-[10px] font-bold text-(--foreground) uppercase tracking-widest font-mono">
                            #{need.id.slice(0, 5)}
                          </span>
                        </div>
                      </div>
                      <h4 className="text-lg font-black text-(--foreground) mb-1 group-hover:text-emergency transition-colors leading-tight">
                        {need.ai_heading ||
                          need.location_name ||
                          (need.raw_text
                            ? need.raw_text.split(" ").slice(0, 5).join(" ") +
                              "..."
                            : "Field Report")}
                      </h4>
                      {need.lat && need.lng && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                          <span className="text-[9px] font-mono font-bold text-(--foreground) bg-(--foreground)/5 py-0.5 px-2 rounded">
                            {need.lat.toFixed(4)}, {need.lng.toFixed(4)}
                          </span>
                          {volunteerLocation && (
                            <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 py-0.5 px-2 rounded flex items-center gap-1">
                              <Navigation2 size={9} />
                              {calculateDistance(
                                volunteerLocation.lat,
                                volunteerLocation.lng,
                                need.lat,
                                need.lng,
                              )}{" "}
                              km
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-(--foreground)/70 text-sm italic line-clamp-2 mb-4 leading-relaxed font-medium flex-1">
                        &ldquo;{need.raw_text}&rdquo;
                      </p>
                      <div className="flex items-center justify-between border-t border-(--border-color) pt-4 mt-auto">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-[9px] text-(--foreground) font-black uppercase tracking-widest">
                            <Activity size={10} className="text-emergency" />
                            {need.need_type || "general"}
                          </div>
                          <div className="text-[8px] font-black text-(--foreground) uppercase tracking-widest opacity-70">
                            {formatDate(need.created_at)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openNeed(need, "map");
                            }}
                            className="px-2.5 py-1 bg-(--foreground)/5 hover:bg-(--foreground)/10 rounded-full text-[8px] font-black uppercase tracking-widest text-yellow flex items-center gap-1 transition-colors border border-(--border-color)">
                            <MapPin size={9} /> Locate
                          </button>
                          <span className="text-xl font-black text-(--foreground) italic">
                            {need.urgency_score}
                          </span>
                          {need.life_threat && (
                            <ShieldAlert size={16} className="text-emergency" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : activeTab === "comms" ? (
              <motion.div
                key="comms-view"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full glass rounded-[3rem] p-8 overflow-hidden shadow-2xl flex flex-col relative">
                <div className="flex items-center justify-between mb-8 px-4">
                  <div>
                    <h2 className="text-3xl font-black text-(--foreground) uppercase tracking-tighter font-outfit">
                      Comms Hub
                    </h2>
                    <div className="flex items-center gap-4 mt-1">
                      <p className="text-[10px] text-sage font-black uppercase tracking-widest">
                        Satellite Transmission Log & AI Response Feed
                      </p>
                      <div className="flex items-center gap-3">
                        <a
                          href="https://t.me/CPFieldBot"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] font-black text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-[0.2em] bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                          Connect Bot
                        </a>
                        <div className="text-[9px] font-black text-emergency uppercase tracking-[0.2em] bg-emergency/10 px-2 py-0.5 rounded border border-emergency/20">
                          Voice Agent :+91 91705 60759
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">
                      Realtime Feed Active
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 px-4 pb-20">
                  {commsMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                      <Bot size={48} className="text-sage mb-4" />
                      <p className="text-xs font-bold text-sage uppercase tracking-[0.2em]">
                        Awaiting first transmission...
                      </p>
                    </div>
                  ) : (
                    commsMessages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="bg-(--card-bg) border border-(--border-color) rounded-2xl p-5 flex gap-5 hover:bg-(--foreground)/5 transition-colors">
                        <div className="w-10 h-10 rounded-xl bg-dark-gray border border-white/10 flex items-center justify-center shrink-0">
                          <Signal size={18} className="text-yellow" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-(--foreground) uppercase tracking-widest">
                                {msg.type}
                              </span>
                              <span className="text-[8px] font-mono text-(--foreground) font-bold">
                                #{msg.need_id.slice(0, 8)}
                              </span>
                            </div>
                            <span className="text-[8px] font-mono text-(--foreground) font-bold">
                              {formatDate(msg.created_at)}
                            </span>
                          </div>
                          <p className="text-(--foreground)/80 text-xs font-medium leading-relaxed">
                            {msg.body}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <div
                              className={cn(
                                "px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-tighter",
                                msg.status === "sent"
                                  ? "bg-emerald-500/20 text-emerald-500"
                                  : "bg-orange-500/20 text-orange-500",
                              )}>
                              Status: {msg.status}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>

                {/* Aesthetic HUD Overlay */}
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-linear-to-t from-slate-950 to-transparent pointer-events-none"></div>
              </motion.div>
            ) : activeTab === "intel" ? (
              <motion.div
                key="intel-view"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="h-full glass rounded-[3rem] p-8 overflow-hidden shadow-2xl flex flex-col">
                <div className="flex items-center justify-between mb-8 px-4">
                  <div>
                    <h2 className="text-3xl font-black text-(--foreground) uppercase tracking-tighter font-outfit">
                      Signals Intel
                    </h2>
                    <p className="text-[10px] text-sage font-black uppercase tracking-widest mt-1">
                      AI-Decoded Ground Reports & Emotional Sentiment Feed
                    </p>
                  </div>
                  <div className="px-4 py-2 bg-yellow/10 border border-yellow/20 rounded-2xl flex items-center gap-3">
                    <Bot size={16} className="text-yellow" />
                    <span className="text-[10px] font-black text-yellow uppercase tracking-widest">
                      Ollama Pipeline Active
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 px-4 pb-20">
                  {telegramActions.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                      <Signal
                        size={48}
                        className="text-sage mb-4 animate-pulse"
                      />
                      <p className="text-xs font-bold text-sage uppercase tracking-[0.2em]">
                        Listening for field signals...
                      </p>
                    </div>
                  ) : (
                    telegramActions.map((action) => (
                      <motion.div
                        key={action.id}
                        className="bg-(--card-bg) border border-(--border-color) rounded-3xl p-6 hover:bg-(--foreground)/5 transition-all group">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-black/40 flex items-center justify-center border border-white/10 group-hover:border-yellow/50 transition-colors">
                              <Bot size={20} className="text-yellow" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-(--foreground) uppercase tracking-wide">
                                  @{action.username}
                                </span>
                                <div className="flex items-center gap-2">
                                  {action.source === "telegram" && (
                                    <div className="flex flex-col items-end gap-1">
                                      <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-black rounded uppercase tracking-widest border border-blue-500/20">
                                        via Telegram
                                      </span>
                                      <span className="text-[7px] font-black text-(--foreground) opacity-60 uppercase">
                                        {formatDate(action.created_at)}
                                      </span>
                                    </div>
                                  )}
                                  {action.source === "voice_agent" && (
                                    <div className="flex flex-col items-end gap-1">
                                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[8px] font-black rounded uppercase tracking-widest border border-emerald-500/20 flex items-center gap-1">
                                        <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span>
                                        via WebRTC
                                      </span>
                                      <span className="text-[7px] font-black text-(--foreground) opacity-60 uppercase">
                                        {formatDate(action.created_at)}
                                      </span>
                                    </div>
                                  )}
                                  {action.source !== "telegram" &&
                                    action.source !== "voice_agent" && (
                                      <div className="flex flex-col items-end gap-1">
                                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[8px] font-black rounded uppercase tracking-widest border border-amber-500/20">
                                          via Web Portal
                                        </span>
                                        <span className="text-[7px] font-black text-(--foreground) opacity-60 uppercase">
                                          {formatDate(action.created_at)}
                                        </span>
                                      </div>
                                    )}
                                  <span className="text-[10px] font-bold text-(--foreground) uppercase tracking-widest font-mono">
                                    #{action.id.slice(0, 5)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {action.urgency && (
                            <div
                              className={cn(
                                "px-3 py-1 rounded-xl text-[10px] font-black border",
                                action.urgency >= 8
                                  ? "bg-emergency/20 text-emergency border-emergency/30"
                                  : "bg-orange-500/10 text-orange-400 border-orange-500/20",
                              )}>
                              PRIORITY {action.urgency}/10
                            </div>
                          )}
                        </div>

                        <p className="text-sm font-medium text-(--foreground) leading-relaxed mb-4 bg-(--foreground)/5 p-4 rounded-2xl border border-(--border-color) italic">
                          &ldquo;{action.text}&rdquo;
                        </p>

                        {action.sentiment && (
                          <div className="flex items-center gap-4">
                            <div className="flex-1 flex items-center gap-3 bg-(--foreground)/5 px-4 py-2 rounded-xl border border-(--border-color)">
                              <Activity
                                size={14}
                                className="text-(--foreground) opacity-50"
                              />
                              <span className="text-[10px] font-black text-(--foreground) uppercase tracking-widest">
                                Sentiment:
                              </span>
                              <span className="text-[10px] font-black text-white uppercase tracking-widest bg-yellow/20 px-2 py-0.5 rounded italic">
                                {action.sentiment}
                              </span>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            ) : activeTab === "analytics" ? (
              <motion.div
                key="analytics-view"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full glass rounded-[3rem] p-8 overflow-y-auto no-scrollbar shadow-2xl flex flex-col gap-8 text-(--foreground)">
                <div className="flex justify-between items-center px-4">
                  <div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter font-outfit text-white">
                      Strategic Intelligence & Metrics
                    </h2>
                    <p className="text-[10px] text-sage font-black uppercase tracking-widest mt-1">
                      Real-time Ground Operations & AI Audit Analytics
                    </p>
                  </div>
                  <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center gap-3">
                    <Activity
                      size={16}
                      className="text-blue-400 animate-pulse"
                    />
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                      Real-time Telemetry Sync
                    </span>
                  </div>
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-4">
                  <div className="bg-linear-to-b from-white/5 to-transparent border border-white/10 rounded-3xl p-6 flex flex-col justify-between">
                    <span className="text-sage text-[10px] font-black uppercase tracking-wider">
                      Total Reports Intake
                    </span>
                    <span className="text-5xl font-black mt-2 font-anton tracking-wide text-white">
                      {totalIncidents}
                    </span>
                  </div>
                  <div className="bg-linear-to-b from-orange-500/10 to-transparent border border-orange-500/20 rounded-3xl p-6 flex flex-col justify-between">
                    <span className="text-orange-400 text-[10px] font-black uppercase tracking-wider">
                      Active Dispatched Missions
                    </span>
                    <span className="text-5xl font-black mt-2 font-anton tracking-wide text-orange-400">
                      {activeMissions}
                    </span>
                  </div>
                  <div className="bg-linear-to-b from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-3xl p-6 flex flex-col justify-between">
                    <span className="text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                      Resolved Disasters
                    </span>
                    <span className="text-5xl font-black mt-2 font-anton tracking-wide text-emerald-400">
                      {resolvedMissions}
                    </span>
                  </div>
                  <div className="bg-linear-to-b from-red-500/10 to-transparent border border-red-500/20 rounded-3xl p-6 flex flex-col justify-between">
                    <span className="text-red-400 text-[10px] font-black uppercase tracking-wider">
                      Unassigned Emergencies
                    </span>
                    <span className="text-5xl font-black mt-2 font-anton tracking-wide text-red-400">
                      {pendingIncidents}
                    </span>
                  </div>
                </div>

                {/* Breakdown Metrics Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-4 pb-20">
                  {/* Needs Category breakdown */}
                  <div className="bg-white/5 border border-white/10 rounded-4xl p-8">
                    <h3 className="text-sm font-black uppercase tracking-wider mb-6 text-yellow">
                      Incident Domain & Need Classification
                    </h3>
                    <div className="space-y-4">
                      {[
                        "medical",
                        "food",
                        "water",
                        "shelter",
                        "animal",
                        "safety",
                        "education",
                        "unclassified",
                      ].map((cat) => {
                        const count = categoriesCount[cat] || 0;
                        const percent =
                          totalIncidents > 0
                            ? ((count / totalIncidents) * 100).toFixed(0)
                            : "0";
                        if (
                          count === 0 &&
                          cat !== "medical" &&
                          cat !== "food" &&
                          cat !== "animal"
                        )
                          return null;
                        return (
                          <div key={cat} className="space-y-2">
                            <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                              <span className="text-sage">{cat}</span>
                              <span>
                                {count} ({percent}%)
                              </span>
                            </div>
                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-yellow transition-all duration-500"
                                style={{ width: `${percent}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Response Channels Breakdown */}
                  <div className="bg-white/5 border border-white/10 rounded-4xl p-8 flex flex-col justify-between gap-6">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider mb-6 text-blue-400">
                        Intake Channels Distribution
                      </h3>
                      <div className="grid grid-cols-2 gap-6">
                        {["web", "voice_agent", "telegram", "whatsapp"].map(
                          (src) => {
                            const count = sourcesCount[src] || 0;
                            const percent =
                              totalIncidents > 0
                                ? ((count / totalIncidents) * 100).toFixed(0)
                                : "0";
                            return (
                              <div
                                key={src}
                                className="bg-black/30 border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
                                <span className="text-sage text-[10px] font-black uppercase tracking-wider">
                                  {src.replace("_", " ")}
                                </span>
                                <div className="flex justify-between items-end mt-4">
                                  <span className="text-2xl font-anton text-white">
                                    {count}
                                  </span>
                                  <span className="text-[10px] text-sage font-black">
                                    {percent}%
                                  </span>
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    </div>

                    {/* AI Ops Telemetry */}
                    <div className="border-t border-white/10 pt-6">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-sage mb-4">
                        Autonomous AI Operations Telemetry
                      </h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 bg-white/5 rounded-xl border border-white/10">
                          <span className="text-[8px] font-black uppercase tracking-wider text-sage">
                            Avg Urgency Index
                          </span>
                          <div className="text-lg font-black mt-1 text-white font-mono">
                            {urgencyAvg}/10
                          </div>
                        </div>
                        <div className="text-center p-3 bg-white/5 rounded-xl border border-white/10">
                          <span className="text-[8px] font-black uppercase tracking-wider text-sage">
                            SLA Escalations
                          </span>
                          <div className="text-lg font-black mt-1 text-indigo-400 font-mono">
                            {escalatedCount}
                          </div>
                        </div>
                        <div className="text-center p-3 bg-white/5 rounded-xl border border-white/10">
                          <span className="text-[8px] font-black uppercase tracking-wider text-sage">
                            Clustered Events
                          </span>
                          <div className="text-lg font-black mt-1 text-emerald-400 font-mono">
                            {clusteredCount}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {actionToast && (
              <motion.div
                initial={{ opacity: 0, y: -16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.98 }}
                className={cn(
                  "absolute top-6 right-6 z-60 rounded-2xl border px-5 py-4 shadow-2xl backdrop-blur-xl",
                  actionToast.type === "success"
                    ? "bg-emerald-500/12 border-emerald-400/30 text-emerald-300"
                    : "bg-emergency/12 border-emergency/30 text-emergency",
                )}>
                <div className="flex items-center gap-3">
                  {actionToast.type === "success" ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <ShieldAlert size={18} />
                  )}
                  <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                    {actionToast.message}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {/* Summary Panel Overlay (Full-Width Tactical Slide) */}
      <AnimatePresence>
        {selectedNeed && (
          <motion.aside
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 250 }}
            className="fixed bottom-0 left-24 right-0 z-50 flex flex-col">
            <div className="w-full bg-(--background) rounded-t-5xl overflow-hidden border-t border-(--border-color) shadow-[0_-30px_80px_rgba(0,0,0,0.4)] relative no-scrollbar">
              {/* Header Accents */}
              <div
                className={cn(
                  "h-1.5 w-full",
                  selectedNeed.urgency_score >= 8
                    ? "bg-emergency shadow-[0_0_15px_var(--color-emergency-glow)]"
                    : "bg-primary",
                )}></div>

              <div className="p-8 lg:p-12 max-h-[85vh] overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-start mb-10">
                  <div className="flex items-center gap-6">
                    <div className="p-4 bg-(--foreground)/5 rounded-3xl border border-(--border-color)">
                      <MapPin
                        className={cn(
                          selectedNeed.urgency_score >= 8
                            ? "text-emergency"
                            : "text-yellow",
                        )}
                        size={32}
                      />
                    </div>
                    <div>
                      <h2 className="text-4xl font-black text-(--foreground) font-anton uppercase tracking-tight flex flex-wrap items-center gap-3">
                        {selectedNeed.ai_heading ||
                          (selectedNeed.source === "telegram"
                            ? "Signal Extraction"
                            : "Intake Incident")}
                        <span className="text-sage text-xl font-mono">
                          #{selectedNeed.id.slice(0, 8)}
                        </span>
                        {selectedNeed.is_major_incident && (
                          <span className="px-3 py-1 bg-red-500/20 border border-red-500 text-red-400 text-xs font-black uppercase tracking-wider rounded-lg animate-pulse flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                            <Activity size={12} /> MAJOR INCIDENT CLUSTER
                          </span>
                        )}
                        {selectedNeed.child_reports_count !== undefined &&
                          selectedNeed.child_reports_count > 0 && (
                            <span className="px-3 py-1 bg-amber-500/20 border border-amber-500 text-amber-400 text-xs font-black uppercase tracking-wider rounded-lg flex items-center gap-1.5">
                              <Signal size={12} /> CLUSTERED (
                              {1 + selectedNeed.child_reports_count} REPORTS)
                            </span>
                          )}
                        {selectedNeed.parent_incident_id && (
                          <span className="px-3 py-1 bg-gray-500/20 border border-gray-500 text-gray-400 text-xs font-black uppercase tracking-wider rounded-lg flex items-center gap-1.5 font-mono">
                            PARENT ID:{" "}
                            {selectedNeed.parent_incident_id.slice(0, 8)}
                          </span>
                        )}
                        {selectedNeed.sla_escalated && (
                          <span className="px-3 py-1 bg-indigo-500/20 border border-indigo-500 text-indigo-400 text-xs font-black uppercase tracking-wider rounded-lg animate-bounce flex items-center gap-1.5">
                            <ShieldAlert size={12} /> SLA AUTO-ESCALATED (+5KM
                            RANGE)
                          </span>
                        )}
                      </h2>
                      <p className="text-sage font-black uppercase text-[10px] tracking-[0.3em] mt-1">
                        Tactical Intelligence Dossier • Sector:{" "}
                        {selectedNeed.ai_heading ||
                          selectedNeed.location_name ||
                          "Field Report"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={closeNeedPanel}
                    className="p-4 bg-(--foreground)/5 hover:bg-emergency hover:text-white rounded-2xl transition-all border border-(--border-color) group">
                    <X
                      size={24}
                      className="group-hover:scale-110 transition-transform"
                    />
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pb-10">
                  {/* Left Column: Intelligence Data & Chat */}
                  <div className="lg:col-span-7 space-y-8">
                    {/* Raw Message */}
                    <div className="p-10 bg-(--card-bg) rounded-4xl border border-(--border-color) relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-2 h-full bg-linear-to-b from-emergency to-orange-500"></div>
                      <h3 className="text-xs font-black text-sage uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                        <Activity
                          size={16}
                          className="text-emergency animate-pulse"
                        />{" "}
                        Raw Transmission Feed
                      </h3>
                      <p className="text-(--foreground) text-3xl font-medium italic leading-relaxed font-outfit">
                        &ldquo;{selectedNeed.raw_text}&rdquo;
                      </p>
                    </div>

                    {/* Voice Recording & Call Log */}
                    {selectedNeed.source === "voice_agent" && (
                      <div className="p-8 bg-emerald-500/5 rounded-4xl border border-emerald-500/10 space-y-6">
                        <div className="flex justify-between items-center border-b border-emerald-500/10 pb-4">
                          <h3 className="text-xs font-black text-emerald-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Mic
                              size={16}
                              className="text-emerald-400 animate-pulse"
                            />{" "}
                            WebRTC Audio Recording
                          </h3>
                          {selectedNeed.caller_phone && (
                            <span className="text-[10px] font-mono text-emerald-400/70">
                              Caller: {selectedNeed.caller_phone}
                            </span>
                          )}
                        </div>

                        {selectedNeed.recording_url ? (
                          <div className="flex items-center gap-4 bg-(--background)/50 p-4 rounded-2xl border border-emerald-500/20">
                            <audio
                              src={selectedNeed.recording_url}
                              controls
                              className="w-full filter invert hue-rotate-180 opacity-90"
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-sage italic">
                            No audio recording available for this call.
                          </p>
                        )}

                        {/* Expandable WebRTC JSON Payload */}
                        {selectedNeed.webrtc_json && (
                          <details className="group border border-(--border-color) rounded-2xl bg-(--background)/30 overflow-hidden">
                            <summary className="px-5 py-4 text-xs font-black text-sage uppercase tracking-widest cursor-pointer select-none hover:bg-(--foreground)/5 transition-colors flex items-center justify-between">
                              <span>View Raw WebRTC Call JSON Data</span>
                              <span className="text-[10px] text-emerald-400/50 group-open:rotate-180 transition-transform">
                                ▼
                              </span>
                            </summary>
                            <div className="p-5 border-t border-(--border-color) bg-black/40 overflow-x-auto font-mono text-[10px] leading-relaxed text-emerald-300 max-h-60 no-scrollbar">
                              <pre>
                                {JSON.stringify(
                                  selectedNeed.webrtc_json,
                                  null,
                                  2,
                                )}
                              </pre>
                            </div>
                          </details>
                        )}

                        {/* WebRTC Conversation History Dialogue */}
                        {selectedNeed.webrtc_conversation &&
                          selectedNeed.webrtc_conversation.length > 0 && (
                            <div className="space-y-4 border-t border-emerald-500/10 pt-6">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
                                WebRTC Call Conversation Log (
                                {selectedNeed.webrtc_conversation.length})
                              </p>
                              <div className="flex flex-col gap-4 max-h-[350px] overflow-y-auto p-4 rounded-3xl bg-(--background)/50 border border-emerald-500/10 no-scrollbar">
                                {selectedNeed.webrtc_conversation.map(
                                  (entry, index) => (
                                    <div
                                      key={index}
                                      className={cn(
                                        "flex gap-3 items-start",
                                        entry.role === "assistant"
                                          ? "flex-row"
                                          : "flex-row-reverse",
                                      )}>
                                      {/* Avatar */}
                                      <div
                                        className={cn(
                                          "w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-md",
                                          entry.role === "assistant"
                                            ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                                            : "bg-white/10 border border-white/10 text-white/70",
                                        )}>
                                        {entry.role === "assistant" ? (
                                          <Bot size={13} />
                                        ) : (
                                          <User size={13} />
                                        )}
                                      </div>

                                      {/* Message Bubble */}
                                      <div
                                        className={cn(
                                          "px-4 py-3 rounded-2xl text-xs font-medium leading-relaxed max-w-[80%] shadow-md",
                                          entry.role === "assistant"
                                            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 rounded-tl-none"
                                            : "bg-white/5 border border-white/10 text-white/90 rounded-tr-none",
                                        )}>
                                        <span
                                          className={cn(
                                            "block text-[8px] font-black uppercase tracking-widest mb-1",
                                            entry.role === "assistant"
                                              ? "text-emerald-400"
                                              : "text-white/40",
                                          )}>
                                          {entry.role === "assistant"
                                            ? "AI Voice Agent"
                                            : "Reporter (User)"}
                                        </span>
                                        {entry.text}
                                      </div>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          )}
                      </div>
                    )}

                    <div className="flex gap-6">
                      {/* Urgency Score with Definition */}
                      <div className="flex-1 p-8 bg-emergency/10 rounded-4xl border border-emergency/20 relative backdrop-blur-sm shadow-inner group">
                        <div className="absolute top-4 right-4 text-[7px] font-black text-emergency border border-emergency/30 px-1.5 py-0.5 rounded opacity-40 group-hover:opacity-100 transition-opacity">
                          INTEL-01
                        </div>
                        <span className="text-[10px] text-emergency font-black uppercase tracking-[0.2em] block mb-2">
                          Urgency Score
                        </span>
                        <div className="flex items-end gap-2 mb-4">
                          <span className="text-6xl font-black text-(--foreground) italic leading-none">
                            {selectedNeed.urgency_score}
                          </span>
                          <span className="text-xl font-bold text-emergency/40 pb-1">
                            /10
                          </span>
                        </div>
                        <div className="pl-3 border-l-2 border-emergency/30">
                          <p className="text-[9px] font-bold text-emergency uppercase leading-tight tracking-tighter opacity-80">
                            What this means: AI-calculated priority. Scores 8+
                            indicate active life-threat keywords detected.
                          </p>
                        </div>
                      </div>

                      {/* Impact Score with Definition */}
                      <div className="flex-1 p-8 bg-success/10 rounded-4xl border border-success/20 relative backdrop-blur-sm shadow-inner group">
                        <div className="absolute top-4 right-4 text-[7px] font-black text-success border border-success/30 px-1.5 py-0.5 rounded opacity-40 group-hover:opacity-100 transition-opacity">
                          INTEL-02
                        </div>
                        <span className="text-[10px] text-success font-black uppercase tracking-[0.2em] block mb-2">
                          Impact Load
                        </span>
                        <div className="flex items-end gap-2 mb-4">
                          <span className="text-5xl font-black text-(--foreground) italic leading-none">
                            {selectedNeed.people_affected || "N/A"}
                          </span>
                        </div>
                        <div className="pl-3 border-l-2 border-success/30">
                          <p className="text-[9px] font-bold text-success uppercase leading-tight tracking-tighter opacity-80">
                            What this means: Estimated population (human or
                            animal) requiring immediate extraction or medical
                            aid.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Chat Hub (Now on the Left Side) */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-4">
                        <h3 className="text-xs font-black text-sage uppercase tracking-[0.3em] flex items-center gap-2">
                          <Signal
                            size={16}
                            className="text-yellow animate-pulse"
                          />{" "}
                          Live Comms Channel
                        </h3>
                        <span className="text-[8px] font-mono text-sage">
                          SECURE END-TO-END LINK
                        </span>
                      </div>
                      <div className="h-[380px] rounded-5xl overflow-hidden border border-(--border-color) shadow-2xl bg-(--background)">
                        <ChatPanel needId={selectedNeed.id} role="volunteer" />
                      </div>
                      <p className="text-[9px] font-black text-(--foreground) uppercase tracking-widest px-6 italic">
                        Instruction: Use this channel to verify GPS precision
                        and status updates with the reporter.
                      </p>
                    </div>
                  </div>

                  <div className="lg:col-span-5 space-y-8 flex flex-col">
                    {/* Tactical Assessment */}
                    {selectedNeed.tactical_assessment && (
                      <div className="p-10 bg-linear-to-br from-yellow/10 to-transparent rounded-4xl border border-yellow/20 relative overflow-hidden group shadow-xl">
                        <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-30 transition-opacity">
                          <Bot size={60} />
                        </div>
                        <h3 className="text-xs font-black text-yellow uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                          <Bot size={16} /> AI Tactical Intelligence Analysis
                        </h3>
                        <p className="text-(--foreground) text-xl font-bold leading-relaxed mb-6 font-outfit">
                          {selectedNeed.tactical_assessment}
                        </p>
                        <div className="flex gap-3">
                          <div className="px-4 py-2 bg-(--foreground)/5 rounded-full text-[10px] font-black uppercase text-sage border border-(--border-color) tracking-widest">
                            Sentiment:{" "}
                            <span className="text-yellow">
                              {selectedNeed.sentiment || "NEUTRAL"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Gemini Vision Visual Triage */}
                    {selectedNeed.image_url && (
                      <div className="p-10 bg-linear-to-br from-indigo-500/10 to-transparent rounded-4xl border border-indigo-500/20 relative overflow-hidden group shadow-xl space-y-6">
                        <h3 className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2">
                          <Bot size={16} /> Gemini Vision Visual Triage
                        </h3>
                        <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-white/10 bg-black/40">
                          <Image
                            src={
                              selectedNeed.image_url.startsWith("http")
                                ? selectedNeed.image_url
                                : `${apiBaseUrl}${selectedNeed.image_url}`
                            }
                            alt="Incident Evidence"
                            width={640}
                            height={360}
                            unoptimized
                            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                          />
                        </div>
                        {selectedNeed.visual_severity && (
                          <div className="flex flex-wrap gap-3 items-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                              Visual Severity:
                            </span>
                            <span
                              className={cn(
                                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                                selectedNeed.visual_severity ===
                                  "catastrophic" &&
                                  "bg-red-500/25 border-red-500/50 text-red-400",
                                selectedNeed.visual_severity === "high" &&
                                  "bg-orange-500/25 border-orange-500/50 text-orange-400",
                                selectedNeed.visual_severity === "medium" &&
                                  "bg-yellow/25 border-yellow/50 text-yellow",
                                selectedNeed.visual_severity === "low" &&
                                  "bg-green-500/25 border-green-500/50 text-green-400",
                              )}>
                              {selectedNeed.visual_severity}
                            </span>
                          </div>
                        )}
                        {selectedNeed.visual_hazards &&
                          selectedNeed.visual_hazards.length > 0 && (
                            <div className="space-y-2">
                              <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                                Spotted Hazards:
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {selectedNeed.visual_hazards.map(
                                  (hazard: string, idx: number) => (
                                    <span
                                      key={idx}
                                      className="px-3 py-1 bg-red-500/10 border border-red-500/30 rounded-lg text-[10px] font-mono text-red-400 flex items-center gap-1.5">
                                      <ShieldAlert size={12} /> {hazard}
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          )}
                      </div>
                    )}

                    {/* Routes API + Gemini Dispatch Recommendation */}
                    {selectedNeed.lat != null && selectedNeed.lng != null && (
                      <div className="p-10 bg-black/40 rounded-4xl border border-white/5 relative overflow-hidden group shadow-xl">
                        <h3 className="text-xs font-black text-emerald-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                          <Bot size={16} /> Intelligent AI Dispatch Engine
                          (Routes API)
                        </h3>

                        {!recommendationData && !recommendationLoading && (
                          <button
                            onClick={() =>
                              fetchVolunteerRecommendation(selectedNeed.id)
                            }
                            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-2xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest cursor-pointer">
                            <Navigation2 size={14} /> Calculate Best Dispatch
                            Route
                          </button>
                        )}

                        {recommendationLoading && (
                          <div className="flex flex-col items-center justify-center py-6 gap-3">
                            <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin"></div>
                            <span className="text-[10px] font-black uppercase text-emerald-400/75 tracking-widest animate-pulse">
                              Querying Google Routes API & Triage Engine...
                            </span>
                          </div>
                        )}

                        {recommendationError && (
                          <div className="text-xs text-red-400 border border-red-500/20 bg-red-500/5 p-4 rounded-2xl text-center">
                            {recommendationError}
                          </div>
                        )}

                        {recommendationData && (
                          <div className="space-y-4">
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-2">
                              <div className="flex justify-between items-center">
                                <span className="text-[9px] font-black text-sage uppercase tracking-widest">
                                  Recommended Responder
                                </span>
                                <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-black font-mono">
                                  {recommendationData.route_source ||
                                    "Routes API"}
                                </span>
                              </div>
                              <div className="text-lg font-black text-white uppercase tracking-tight">
                                {recommendationData.volunteer_name ||
                                  "Volunteer Responder"}
                              </div>
                              {recommendationData.distance_km != null && (
                                <div className="grid grid-cols-2 gap-4 mt-1 border-t border-white/5 pt-2">
                                  <div>
                                    <span className="text-[8px] text-sage font-black uppercase tracking-widest block">
                                      Travel Distance
                                    </span>
                                    <span className="text-sm font-black text-white font-mono">
                                      {recommendationData.distance_km} km
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[8px] text-sage font-black uppercase tracking-widest block">
                                      Est. Duration (Traffic)
                                    </span>
                                    <span className="text-sm font-black text-emerald-400 font-mono">
                                      {recommendationData.duration_min} min
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>

                            <p className="text-xs text-white/80 leading-relaxed italic bg-emerald-950/10 border border-emerald-500/10 p-5 rounded-2xl">
                              &ldquo;{recommendationData.reasoning}&rdquo;
                            </p>

                            <button
                              onClick={() => {
                                setRecommendationData(null);
                              }}
                              className="w-full py-2 bg-white/5 hover:bg-white/10 text-sage hover:text-white font-black rounded-xl text-[9px] uppercase tracking-widest transition-all cursor-pointer">
                              Reset Recommendation
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Telemetry Info */}
                    <div className="p-10 bg-(--card-bg) rounded-4xl border border-(--border-color) shadow-inner">
                      <h3 className="text-[10px] font-black text-sage uppercase tracking-[0.3em] mb-8 border-b border-(--border-color) pb-4">
                        Live Operational Telemetry
                      </h3>

                      <div className="space-y-6">
                        <div className="flex items-center gap-5">
                          <div className="w-5 h-5 rounded-full bg-emergency animate-pulse shadow-[0_0_20px_var(--color-emergency-glow)]"></div>
                          <span className="text-2xl font-black text-(--foreground) uppercase tracking-tighter italic">
                            {selectedNeed.need_type} Response Protocol
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-(--foreground)/5 rounded-2xl border border-(--border-color)">
                            <span className="text-[8px] font-black text-sage uppercase tracking-widest block mb-1">
                              Source Logic
                            </span>
                            <div className="flex items-center gap-2 text-xs font-black text-(--foreground)">
                              {selectedNeed.source === "telegram" ? (
                                <>
                                  <Bot size={14} className="text-blue-400" />
                                  <span>Telegram Bot</span>
                                </>
                              ) : selectedNeed.source === "voice_agent" ? (
                                <>
                                  <Mic
                                    size={14}
                                    className="text-emerald-400 animate-pulse"
                                  />
                                  <span>WebRTC Voice</span>
                                </>
                              ) : (
                                <>
                                  <Phone size={14} className="text-yellow" />
                                  <span>Web Portal</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="p-4 bg-(--foreground)/5 rounded-2xl border border-(--border-color)">
                            <span className="text-[8px] font-black text-sage uppercase tracking-widest block mb-1">
                              GPS Lock
                            </span>
                            <div className="flex items-center gap-2 text-xs font-mono font-bold text-(--foreground)">
                              <MapPin size={14} className="text-yellow" />
                              <span>
                                {selectedNeed.lat != null &&
                                selectedNeed.lng != null
                                  ? `${selectedNeed.lat.toFixed(4)}, ${selectedNeed.lng.toFixed(4)}`
                                  : "GPS unavailable"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons with Definitions */}
                    {selectedNeed.status !== "resolved" && (
                      <div className="flex flex-col gap-4 mt-auto">
                        <div className="flex items-center justify-between px-4">
                          <h4 className="text-[11px] text-(--foreground) font-black uppercase tracking-[0.3em]">
                            Watch these buttons ↓
                          </h4>
                          <span className="text-[9px] text-sage font-bold italic">
                            Critical Protocol
                          </span>
                        </div>

                        <div className="space-y-4">
                          {selectedNeed.status !== "in-progress" && (
                            <div className="group relative">
                              <button
                                onClick={() =>
                                  handleDeploy(selectedNeed.id, "in-progress")
                                }
                                className="w-full py-6 bg-orange-500 hover:bg-orange-400 text-black font-black rounded-3xl hover:scale-[0.99] active:scale-95 transition-all shadow-[0_15px_40px_rgba(249,115,22,0.3)] flex items-center justify-center gap-3 text-sm uppercase tracking-[0.2em]">
                                <Truck size={20} /> INITIATE DISPATCH
                              </button>
                              <div className="mt-2 px-6 border-l-2 border-orange-500/40">
                                <p className="text-[9px] font-black text-orange-500/80 uppercase tracking-widest leading-tight">
                                  Definition: En-route status. Locks your live
                                  GPS for the reporter to see your ETA.
                                </p>
                              </div>
                            </div>
                          )}

                          <div className="group relative">
                            <button
                              onClick={() =>
                                handleDeploy(selectedNeed.id, "resolved")
                              }
                              className="w-full py-6 bg-success hover:bg-green-400 text-black font-black rounded-3xl hover:scale-[0.99] active:scale-95 transition-all shadow-[0_15px_40px_rgba(0,230,118,0.3)] flex items-center justify-center gap-3 text-sm uppercase tracking-[0.2em]">
                              <CheckCircle2 size={20} /> MARK AS RESOLVED
                            </button>
                            <div className="mt-2 px-6 border-l-2 border-success/40">
                              <p className="text-[9px] font-black text-success/80 uppercase tracking-widest leading-tight">
                                Definition: Mission complete. Finalizes report
                                and archives data to history.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Audio recording if exists */}
                    {selectedNeed.source === "voice_agent" &&
                      selectedNeed.recording_url && (
                        <div className="bg-(--foreground)/5 p-6 rounded-4xl border border-(--border-color) space-y-4">
                          <div className="flex items-center gap-3">
                            <Activity size={16} className="text-emerald-400" />
                            <h4 className="text-[10px] font-black text-sage uppercase tracking-widest">
                              Tactical Audio
                            </h4>
                          </div>
                          <audio
                            controls
                            src={selectedNeed.recording_url}
                            className="w-full h-10 filter invert opacity-80"
                          />
                        </div>
                      )}
                  </div>
                </div>
              </div>
              <div className="h-3 w-full bg-linear-to-r from-emergency via-primary to-success"></div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!selectedNeed && collapsedNeed && (
          <motion.button
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            onClick={() => openNeed(collapsedNeed, "map")}
            className="fixed bottom-5 right-6 left-30 z-50 rounded-3xl border border-(--border-color) bg-(--background)/95 px-6 py-4 shadow-[0_-10px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl text-left">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-sage">
                  Mission Minimized
                </p>
                <div className="mt-1 flex items-center gap-3 min-w-0">
                  <span className="truncate text-sm font-black uppercase text-(--foreground)">
                    {collapsedNeed.ai_heading ||
                      collapsedNeed.location_name ||
                      (collapsedNeed.raw_text
                        ? collapsedNeed.raw_text
                            .split(" ")
                            .slice(0, 4)
                            .join(" ") + "..."
                        : "Active Mission")}
                  </span>
                  <span className="shrink-0 text-[10px] font-mono text-sage">
                    #{collapsedNeed.id.slice(0, 8)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest",
                    collapsedNeed.status === "resolved"
                      ? "bg-success/15 text-success"
                      : collapsedNeed.status === "in-progress"
                        ? "bg-orange-500/15 text-orange-400"
                        : "bg-emergency/15 text-emergency",
                  )}>
                  {collapsedNeed.status || "open"}
                </span>
                <div className="rounded-2xl bg-yellow p-3 text-black shadow-lg">
                  <ChevronUp size={18} />
                </div>
              </div>
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Loading Overlay (Fullscreen Boot) */}
      <AnimatePresence>
        {(needsLoading || authLoading) && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-200 bg-(--background) brutalist-grid flex flex-col items-center justify-center gap-10">
            <div className="relative group">
              <div className="absolute inset-x-[-10px] inset-y-[10px] bg-yellow -rotate-3 scale-105 z-[-1] animate-pulse"></div>
              <div className="p-8 bg-(--background) border border-(--border-color) shadow-2xl relative z-10 glass">
                <Activity className="text-yellow" size={80} />
              </div>
            </div>
            <div className="text-center relative z-10 mt-6">
              <h2 className="text-6xl md:text-8xl font-anton text-(--foreground) uppercase tracking-wide leading-none mb-6 drop-shadow-sm">
                COMMUNITYPULSE
              </h2>
              <div className="flex flex-col items-center gap-4">
                <p className="text-(--foreground) font-black uppercase tracking-[0.3em] text-[12px] font-roboto">
                  Optimizing Ground Logic...
                </p>
                <div className="w-64 h-1.5 bg-(--foreground)/10 overflow-hidden border border-(--border-color)">
                  <motion.div
                    className="h-full bg-yellow"
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}></motion.div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  Plane, 
  FileText, 
  UserPlus, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  HelpCircle, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle,
  KeyRound,
  ShieldAlert,
  Globe
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { auth } from "../lib/firebase";

interface AuthProps {
  onSignIn: (username: string, role: string) => void;
}

const DEFAULT_USERS = [
  { username: "Maverick", password: "password123", role: "Research Test Pilot" },
  { username: "Captain Smith", password: "password123", role: "Commercial Captain" },
  { username: "Cadet Miller", password: "password123", role: "Air Force Cadet" }
];

export default function Auth({ onSignIn }: AuthProps) {
  const [view, setView] = useState<"login" | "signup" | "forgot">("login");
  
  // Form values
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("Research Test Pilot");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Forgot password flow
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);

  // Success states
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  // Errors
  const [error, setError] = useState("");

  const roles = [
    "Research Test Pilot",
    "Commercial Captain",
    "Aeronautical Student",
    "Air Force Cadet",
  ];

  // Helper to map username or email input to a verified email address for Firebase Auth
  const getFirebaseEmail = (input: string) => {
    const trimmed = input.trim();
    if (trimmed.includes("@")) {
      return trimmed;
    }
    // Formulate a unique email domain for standard pilot callsigns
    return `${trimmed.toLowerCase().replace(/[^a-z0-9]/g, "")}@aero-lift-and-drag.firebaseapp.com`;
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) {
      setError("Pilot Callsign ID or Email is required.");
      return;
    }
    if (!password) {
      setError("Access Passcode is required.");
      return;
    }

    setAuthenticating(true);

    try {
      const email = getFirebaseEmail(username);
      let userCredential;

      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (signInErr: any) {
        // If the user does not exist in Firebase, check if they are requesting a pre-registered cadet
        const defaultPilot = DEFAULT_USERS.find(
          (u) => u.username.toLowerCase() === username.trim().toLowerCase()
        );
        
        // auth/user-not-found or auth/invalid-credential might be thrown
        if (
          (signInErr.code === "auth/user-not-found" || signInErr.code === "auth/invalid-credential") &&
          defaultPilot &&
          password === defaultPilot.password
        ) {
          // Auto-migrate standard pre-registered officer profiles to Firebase to make testing flawless!
          userCredential = await createUserWithEmailAndPassword(auth, email, password);
          await updateProfile(userCredential.user, {
            displayName: `${defaultPilot.username}||${defaultPilot.role}`
          });
        } else {
          throw signInErr;
        }
      }

      const user = userCredential.user;
      const displayName = user.displayName || "";
      const [parsedUsername, parsedRole] = displayName.includes("||")
        ? displayName.split("||")
        : [user.email?.split("@")[0] || username.trim(), "Research Test Pilot"];

      // Sync active pilot credentials in storage keys
      const sessionData = { username: parsedUsername, role: parsedRole };
      if (rememberMe) {
        localStorage.setItem("aero_active_pilot", JSON.stringify(sessionData));
        localStorage.setItem("aero_remember_me", "true");
      } else {
        sessionStorage.setItem("aero_active_pilot", JSON.stringify(sessionData));
        localStorage.removeItem("aero_remember_me");
      }

      onSignIn(parsedUsername, parsedRole);
    } catch (err: any) {
      console.error(err);
      let errMsg = "AUTHENTICATION REFUSED: Invalid callsign/passcode or connection conflict.";
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password"
      ) {
        errMsg = "ACCESS DENIED: Verification passcode does not match target profile.";
      } else if (err.code === "auth/invalid-email") {
        errMsg = "AUTHENTICATION REFUSED: Invalid callsgn or email format.";
      } else if (err.code === "auth/network-request-failed") {
        errMsg = "COMMUNICATION FAILURE: Verify secure satellite uplink connection.";
      } else if (err.message) {
        errMsg = `AUTHENTICATION REFUSED: ${err.message}`;
      }
      setError(errMsg);
    } finally {
      setAuthenticating(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) {
      setError("Registration calls for a non-blank Pilot Callsign.");
      return;
    }
    if (username.trim().length < 3) {
      setError("Officer Callsign must be at least 3 alphanumeric characters.");
      return;
    }
    if (username.trim().includes("@")) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(username.trim())) {
        setError("Cryptographic error: Invalid email format.");
        return;
      }
    }
    if (!password) {
      setError("Security passphrase cannot be empty.");
      return;
    }
    if (password.length < 6) {
      setError("Passphrase raises safety warnings. Must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Cryptographic validation error: Passwords do not match.");
      return;
    }

    setAuthenticating(true);

    try {
      const email = getFirebaseEmail(username);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      const customUsername = username.trim().includes("@") 
        ? username.trim().split("@")[0] 
        : username.trim();

      await updateProfile(userCredential.user, {
        displayName: `${customUsername}||${role}`
      });

      setSignupSuccess(true);
      setTimeout(() => {
        setSignupSuccess(false);
        setView("login");
        setPassword("");
        setConfirmPassword("");
        setAuthenticating(false);
      }, 1500);
    } catch (err: any) {
      console.error(err);
      let errMsg = "COMMISSION CONFLICT: Unable to establish profile log.";
      if (err.code === "auth/email-already-in-use") {
        errMsg = "COMMISSION CONFLICT: Callsign or Email is already registered on active duties.";
      } else if (err.code === "auth/weak-password") {
        errMsg = "SECURITY WARNING: Passphrase does not meet standard safety profiles.";
      } else if (err.message) {
        errMsg = `COMMISSION FAILURE: ${err.message}`;
      }
      setError(errMsg);
      setAuthenticating(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!forgotEmail.trim()) {
      setError("Please supply your registered Callsign or Recovery Beacon address.");
      return;
    }

    setAuthenticating(true);

    try {
      const email = getFirebaseEmail(forgotEmail);
      await sendPasswordResetEmail(auth, email);
      setForgotSuccess(true);
    } catch (err: any) {
      console.error(err);
      let errMsg = "RECOVERY REFUSED: Unable to dispatch reset signal.";
      if (err.code === "auth/user-not-found") {
        errMsg = "RECOVERY REFUSED: Target Callsign/Email not found in database logs.";
      } else if (err.code === "auth/invalid-email") {
        errMsg = "RECOVERY REFUSED: Invalid Callsign/Email format.";
      } else if (err.message) {
        errMsg = `RECOVERY REFUSED: ${err.message}`;
      }
      setError(errMsg);
    } finally {
      setAuthenticating(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setAuthenticating(true);
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;
      
      const displayName = user.displayName || "";
      const email = user.email || "";
      const defaultUsername = displayName || email.split("@")[0] || "Pilot";
      
      let parsedUsername = defaultUsername;
      let parsedRole = "Research Test Pilot";
      
      if (displayName.includes("||")) {
        const parts = displayName.split("||");
        parsedUsername = parts[0];
        parsedRole = parts[1];
      } else {
        parsedRole = role; // use currently selected role
        await updateProfile(user, {
          displayName: `${defaultUsername}||${parsedRole}`
        });
      }

      const sessionData = { username: parsedUsername, role: parsedRole };
      localStorage.setItem("aero_active_pilot", JSON.stringify(sessionData));
      
      onSignIn(parsedUsername, parsedRole);
    } catch (err: any) {
      console.error(err);
      let errMsg = "GOOGLE SIGN-IN REFUSED: Verification link declined or aborted.";
      if (err.code === "auth/popup-blocked") {
        errMsg = "POPUP BLOCKED: Allow browser popups to authenticate with Google.";
      } else if (err.code === "auth/popup-closed-by-user") {
        errMsg = "AUTHENTICATION CLOSED: The satellite gateway window was closed.";
      } else if (err.code === "auth/network-request-failed") {
        errMsg = "COMMUNICATION FAILURE: Verify secure satellite uplink connection.";
      } else if (err.message) {
        errMsg = `GOOGLE SIGN-IN REFUSED: ${err.message}`;
      }
      setError(errMsg);
    } finally {
      setAuthenticating(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#07090e] flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* High-fidelity layered midnight & space radial atmospheric glow */}
      <div className="absolute inset-0 bg-[#06080c]" />
      <div className="absolute top-[20%] left-[30%] w-[35rem] h-[35rem] bg-sky-500/10 rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[30%] w-[25rem] h-[25rem] bg-indigo-500/5 rounded-full blur-[90px] pointer-events-none" />
      <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[50rem] h-[50rem] bg-radial-gradient from-sky-400/5 via-sky-600/0 to-transparent rounded-full blur-[140px] pointer-events-none" />

      {/* Futuristic Tactical Dot Matrix and Navigation Graticules */}
      <div 
        className="absolute inset-0 bg-transparent pointer-events-none opacity-[0.06]"
        style={{
          backgroundImage: "linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }}
      />
      <div className="absolute inset-x-0 top-12 flex items-center justify-between px-10 text-[9px] font-mono text-slate-600 tracking-widest uppercase pointer-events-none">
        <span>SECTOR: GRID-AERO-NW</span>
        <span className="animate-pulse flex items-center gap-1.5 text-sky-500/40">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" /> SECURE LINK ESTABLISHED
        </span>
        <span>LATENCY: 12MS</span>
      </div>

      <AnimatePresence mode="wait">
        {view === "login" && (
          <motion.div
            key="login"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-full max-w-sm bg-[#0d121c]/80 border border-slate-805/90 border-slate-800/80 backdrop-blur-md rounded-lg p-5 shadow-2xl relative z-10"
          >
            {/* Corners detailing */}
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-sky-500/40 -mt-[1px] -ml-[1px]" />
            <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-sky-500/40 -mt-[1px] -mr-[1px]" />
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-sky-500/40 -mb-[1px] -ml-[1px]" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-sky-500/40 -mb-[1px] -mr-[1px]" />

            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded bg-sky-500/10 text-sky-400 border border-sky-500/35 mb-2.5">
                <Plane className="w-5 h-5 rotate-45" />
              </div>
              <h1 className="text-sm font-bold tracking-widest text-[#f8fafc] uppercase font-sans">
                Aero Flight Portal
              </h1>
              <p className="text-[10px] text-slate-500 tracking-wider uppercase mt-1 font-mono">
                Aerospace Science Verification & Terminal
              </p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                  Pilot Callsign ID
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <User className="w-3.5 h-3.5" />
                  </span>
                  <input
                    id="login-username-input"
                    type="text"
                    placeholder="e.g., Maverick, Captain Smith"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[#06080c] border border-slate-805/90 border-slate-800/80 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-white rounded px-3 py-2 pl-9 text-xs focus:outline-none transition-colors placeholder:text-slate-700 font-mono"
                    disabled={authenticating}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                    Verification Passcode
                  </label>
                  <button
                    id="toggle-pass-visibility"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[9px] font-mono text-slate-500 hover:text-sky-400 cursor-pointer transition-colors focus:outline-none"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <Lock className="w-3.5 h-3.5" />
                  </span>
                  <input
                    id="login-password-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="Secret commission code"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#06080c] border border-slate-805/90 border-slate-800/80 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-white rounded px-3 py-2 pl-9 text-xs focus:outline-none transition-colors placeholder:text-slate-700 font-mono"
                    disabled={authenticating}
                  />
                </div>
              </div>

              {/* Remember Me and Forgot Password Container */}
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    id="remember-me-checkbox"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3 h-3 rounded bg-slate-950 border-slate-800 text-sky-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span>Remember Pilot Session</span>
                </label>
                <button
                  id="forgot-password-trigger"
                  type="button"
                  onClick={() => {
                    setError("");
                    setView("forgot");
                  }}
                  className="text-slate-500 hover:text-sky-450 hover:text-sky-400 cursor-pointer transition-colors"
                >
                  Forgot Code?
                </button>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded p-2 text-[10px] flex items-start gap-1.5 font-mono">
                  <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                id="login-submit-btn"
                type="submit"
                disabled={authenticating}
                className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-slate-800 text-slate-950 font-bold uppercase py-2 rounded text-[11px] transition-all flex items-center justify-center gap-1.5 group cursor-pointer shadow-lg shadow-sky-500/10 tracking-widest font-sans"
              >
                {authenticating ? (
                  <>
                    <span className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Verifying Core...</span>
                  </>
                ) : (
                  <>
                    <span>Authenticate Credentials</span>
                    <Plane className="w-3 h-3 transition-transform group-hover:translate-x-0.5 rotate-45" />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center my-3.5 text-[9px] font-mono text-slate-600 uppercase tracking-widest">
              <div className="flex-1 h-[1px] bg-slate-800/80" />
              <span className="px-2">OR SECURE RE-ROUTE</span>
              <div className="flex-1 h-[1px] bg-slate-800/80" />
            </div>

            <button
              id="google-signin-btn-login"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authenticating}
              className="w-full bg-[#171f30]/60 hover:bg-[#1f2a40]/60 disabled:bg-slate-800 text-slate-200 border border-slate-800/80 hover:border-slate-700 font-medium py-2 rounded text-[11px] transition-all flex items-center justify-center gap-2 group cursor-pointer tracking-wider font-sans mb-4"
            >
              <Globe className="w-3.5 h-3.5 text-sky-400 group-hover:text-sky-300 transition-colors" />
              <span>Google Command Sign-In</span>
            </button>

            <div className="mt-4 pt-3.5 border-t border-slate-805/80 text-center">
              <span className="text-[10px] text-slate-500 font-mono">
                No active aviation credentials?{" "}
              </span>
              <button
                id="switch-to-signup-btn"
                type="button"
                onClick={() => {
                  setError("");
                  setView("signup");
                }}
                className="text-[10px] text-sky-400 font-bold hover:underline cursor-pointer font-mono"
              >
                Register Pilot Profile
              </button>
            </div>

            {/* Quick Login Assist Panel for easier testing */}
            <div className="mt-4 p-2.5 rounded bg-slate-950/60 border border-slate-800/60 font-mono text-[9px] text-slate-500">
              <span className="text-slate-400 font-bold block uppercase tracking-wider mb-1">
                PRE-REGISTERED CADET LINK:
              </span>
              <div className="space-y-0.5">
                <div>Callsign: <strong className="text-sky-400 hover:underline cursor-pointer" onClick={() => { setUsername("Maverick"); setPassword("password123"); }}>Maverick</strong> (Pass: password123)</div>
                <div>Callsign: <strong className="text-sky-400 hover:underline cursor-pointer" onClick={() => { setUsername("Captain Smith"); setPassword("password123"); }}>Captain Smith</strong></div>
              </div>
            </div>
          </motion.div>
        )}

        {view === "signup" && (
          <motion.div
            key="signup"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-full max-w-sm bg-[#0d121c]/80 border border-slate-805/90 border-slate-800/80 backdrop-blur-md rounded-lg p-5 shadow-2xl relative z-10"
          >
            {/* Corners detailing */}
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-sky-500/40 -mt-[1px] -ml-[1px]" />
            <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-sky-500/40 -mt-[1px] -mr-[1px]" />
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-sky-500/40 -mb-[1px] -ml-[1px]" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-sky-500/40 -mb-[1px] -mr-[1px]" />

            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/30 mb-2.5">
                <UserPlus className="w-5 h-5" />
              </div>
              <h1 className="text-sm font-bold tracking-widest text-[#f8fafc] uppercase font-sans">
                Pilot Commission Setup
              </h1>
              <p className="text-[10px] text-slate-500 tracking-wider uppercase mt-1 font-mono">
                Acquire Aerodynamics Research License
              </p>
            </div>

            {signupSuccess ? (
              <div className="py-8 text-center space-y-3">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 animate-bounce">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="font-sans font-bold text-xs text-white uppercase tracking-wider">
                    Registration Established
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">
                    Transferring credentials to Flight Gateway logs...
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSignupSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                    Your Callsign ID
                  </label>
                  <input
                    id="signup-username-input"
                    type="text"
                    placeholder="e.g., Iceman, FlyingViper"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[#06080c] border border-slate-805/90 border-slate-800/80 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-white rounded px-3 py-1.5 text-xs focus:outline-none transition-colors placeholder:text-slate-700 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                      Create Code
                    </label>
                    <input
                      id="signup-password-input"
                      type="password"
                      placeholder="Min 6 chars"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#06080c] border border-slate-805/90 border-slate-800/80 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-white rounded px-2.5 py-1.5 text-xs focus:outline-none transition-colors placeholder:text-slate-700 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                      Confirm Code
                    </label>
                    <input
                      id="signup-confirm-password-input"
                      type="password"
                      placeholder="Confirm"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-[#06080c] border border-slate-805/90 border-slate-800/80 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-white rounded px-2.5 py-1.5 text-xs focus:outline-none transition-colors placeholder:text-slate-700 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                    Aviation Certification Category
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {roles.map((r) => (
                      <button
                        id={`signup-role-${r.replace(/\s+/g, '-').toLowerCase()}`}
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`text-left px-2.5 py-1.5 rounded border text-[9px] font-mono transition-all flex items-center justify-between ${
                          role === r
                            ? "bg-emerald-500/10 border-emerald-500/70 text-emerald-300"
                            : "bg-[#06080c] border-slate-805/90 border-slate-800/80 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <span className="truncate">{r}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded p-2 text-[10px] flex items-start gap-1.5 font-mono">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  id="signup-submit-btn"
                  type="submit"
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold uppercase py-2 rounded text-[11px] transition-all flex items-center justify-center gap-1.5 group cursor-pointer tracking-widest font-sans shadow-lg shadow-emerald-500/10 mt-2"
                >
                  <span>Initialize Pilot Profile</span>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </button>
              </form>
            )}

            {!signupSuccess && (
              <>
                {/* Divider */}
                <div className="flex items-center my-3.5 text-[9px] font-mono text-slate-600 uppercase tracking-widest">
                  <div className="flex-1 h-[1px] bg-slate-800/80" />
                  <span className="px-2">OR SECURE RE-ROUTE</span>
                  <div className="flex-1 h-[1px] bg-slate-800/80" />
                </div>

                <button
                  id="google-signin-btn-signup"
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={authenticating}
                  className="w-full bg-[#171f30]/60 hover:bg-[#1f2a40]/60 disabled:bg-slate-800 text-slate-200 border border-slate-800/80 hover:border-slate-700 font-medium py-2 rounded text-[11px] transition-all flex items-center justify-center gap-2 group cursor-pointer tracking-wider font-sans mb-4"
                >
                  <Globe className="w-3.5 h-3.5 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
                  <span>Google Command Sign-In</span>
                </button>
              </>
            )}

            <div className="mt-4 pt-3.2 border-t border-slate-805/80 text-center">
              <span className="text-[10px] text-slate-500 font-mono">
                Already registered with sector?{" "}
              </span>
              <button
                id="switch-to-login-btn"
                type="button"
                onClick={() => {
                  setError("");
                  setView("login");
                }}
                className="text-[10px] text-sky-400 font-bold hover:underline cursor-pointer font-mono"
              >
                Sign In Instead
              </button>
            </div>
          </motion.div>
        )}

        {view === "forgot" && (
          <motion.div
            key="forgot"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-full max-w-sm bg-[#0d121c]/80 border border-slate-850 border-slate-800 backdrop-blur-md rounded-lg p-5 shadow-2xl relative z-10"
          >
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30 mb-2.5">
                <KeyRound className="w-5 h-5" />
              </div>
              <h1 className="text-sm font-bold tracking-widest text-[#f8fafc] uppercase font-sans">
                Passcode Transponder Lock
              </h1>
              <p className="text-[10px] text-slate-500 tracking-wider uppercase mt-1 font-mono">
                Recover security verification keys
              </p>
            </div>

            {forgotSuccess ? (
              <div className="space-y-3.5 p-1">
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded p-3 text-[10.5px] leading-relaxed font-mono">
                  <div className="flex items-center gap-1.5 font-bold uppercase text-emerald-400 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>RECOVERY SIGNAL DISPATCHED</span>
                  </div>
                  A secure password reset link was sent via Firebase to:
                  <strong className="text-white bg-emerald-500/20 px-1 py-0.5 rounded mx-1 block text-center mt-1.5 break-all">
                    {getFirebaseEmail(forgotEmail)}
                  </strong>
                  Check your inbox to recover your secure satellite clearance.
                </div>
                <button
                  id="forgot-success-back-btn"
                  onClick={() => {
                    setForgotSuccess(false);
                    setForgotEmail("");
                    setView("login");
                  }}
                  className="w-full bg-slate-900 border border-slate-800 text-slate-200 py-1.8 text-xs font-mono font-bold hover:bg-slate-800 transition-colors rounded text-[10px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Log-In Terminal
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-3.5">
                <p className="text-[10.5px] text-slate-400 leading-relaxed font-mono">
                  Enter your Pilot Callsign ID or registered aviation address below. We'll send instructions via the orbital secure transponder.
                </p>

                <div className="space-y-1">
                  <label className="block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                    Registered Callsign or Email
                  </label>
                  <input
                    id="forgot-email-input"
                    type="text"
                    placeholder="e.g. Maverick, Maverick@aero.mil"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full bg-[#06080c] border border-slate-805/90 border-slate-800/80 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-white rounded px-3 py-2 text-xs focus:outline-none transition-colors placeholder:text-slate-700 font-mono"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded p-2 text-[10px] flex items-start gap-1.5 font-mono">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    id="forgot-cancel-btn"
                    type="button"
                    onClick={() => {
                      setError("");
                      setView("login");
                    }}
                    className="flex-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 font-bold uppercase py-2 rounded text-[10px] tracking-wide font-sans transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="forgot-submit-btn"
                    type="submit"
                    className="flex-1 bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold uppercase py-2 rounded text-[10px] tracking-wide font-sans transition-all cursor-pointer shadow-lg shadow-sky-500/10"
                  >
                    Fire Transponder
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Security standard footnotes */}
      <div className="absolute inset-x-0 bottom-6 flex flex-col sm:flex-row items-center justify-between px-10 text-[9px] font-mono text-slate-600 gap-2 pointer-events-none md:flex">
        <span>© 2026 MIL-STD-810H CRITICAL FLIGHT ENVELOPE MODULE</span>
        <span>AERO-SEC-LINK: V3.9.15</span>
      </div>
    </div>
  );
}

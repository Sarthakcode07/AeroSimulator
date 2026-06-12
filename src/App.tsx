import { useState, useMemo, useEffect } from "react";
import {
  Wind,
  Plane,
  Gauge,
  Sliders,
  Settings,
  HelpCircle,
  TrendingUp,
  AlertTriangle,
  User,
  LogOut,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./lib/firebase";
import { testConnection } from "./lib/firebase-utils";
import Auth from "./components/Auth";
import AeroCharts from "./components/AeroCharts";
import TakeoffSimulator from "./components/TakeoffSimulator";
import AeroExpert from "./components/AeroExpert";
import { AircraftPreset, FlightContext } from "./types";

// Dynamic aeronautical presets
const AIRCRAFT_PRESETS: AircraftPreset[] = [
  {
    name: "Cessna 172 Skyhawk",
    wingArea: 16.2,
    emptyWeightKg: 767.0,
    maxVelocity: 70.0,
    defaultThrust: 1800,
    defaultCl: 0.45,
    defaultCd: 0.035,
    description: "Standard general aviation single-engine propeller plane, perfect for basic aerodynamic study.",
  },
  {
    name: "Boeing 737-800",
    wingArea: 125.0,
    emptyWeightKg: 41400.0,
    maxVelocity: 250.0,
    defaultThrust: 236000,
    defaultCl: 0.52,
    defaultCd: 0.022,
    description: "Twin-engine commercial jetliner. Heavy takeoff weight requires massive lift capabilities.",
  },
  {
    name: "F-16 Fighting Falcon",
    wingArea: 27.9,
    emptyWeightKg: 8570.0,
    maxVelocity: 700.0,
    defaultThrust: 130000,
    defaultCl: 0.35,
    defaultCd: 0.015,
    description: "Supersonic fighter jet. High thrust-to-weight ratio allows vertical climb capabilities.",
  },
];

export default function App() {
  // Authentication status
  const [pilot, setPilot] = useState<{ username: string; role: string } | null>(null);

  // Flight parameters
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const activePreset = AIRCRAFT_PRESETS[selectedPresetIndex];

  // Control Slider States
  const [velocity, setVelocity] = useState(35.0); // m/s
  const [wingArea, setWingArea] = useState(16.2); // S (m^2)
  const [cl, setCl] = useState(0.45); // Lift Coeff
  const [cd, setCd] = useState(0.035); // Drag Coeff
  const [rho, setRho] = useState(1.225); // Air density (kg/m^3) at sea level

  // Takeoff inputs
  const [runwayLength, setRunwayLength] = useState(1000); // m
  const [aircraftWeight, setAircraftWeight] = useState(767.0); // kg
  const [payloadWeight, setPayloadWeight] = useState(200.0); // kg (passengers, fuel, baggage)
  const [thrust, setThrust] = useState(1800); // N
  const [rollingFriction, setRollingFriction] = useState(0.02); // standard tire on asphalt

  // Simulation Outcome
  const [takeoffOutcome, setTakeoffOutcome] = useState("Run simulation to analyze takeoff profile.");

  // Check for saved pilot authentication state on mount
  useEffect(() => {
    testConnection(); // Verify connection to Cloud Firestore on boot
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const displayName = user.displayName || "";
        const [parsedUsername, parsedRole] = displayName.includes("||")
          ? displayName.split("||")
          : [user.email?.split("@")[0] || "Pilot", "Research Test Pilot"];
        
        setPilot({ username: parsedUsername, role: parsedRole });
      } else {
        const localSaved = localStorage.getItem("aero_active_pilot");
        const sessionSaved = sessionStorage.getItem("aero_active_pilot");
        const active = localSaved || sessionSaved;
        if (active) {
          try {
            const parsed = JSON.parse(active);
            if (parsed && parsed.username && parsed.role) {
              setPilot(parsed);
              return;
            }
          } catch (e) {
            console.error("Failed to parse saved pilot", e);
          }
        }
        setPilot(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync initial starting preset based on pilot's role
  useEffect(() => {
    if (!pilot) return;
    const r = pilot.role.toLowerCase();
    if (r.includes("student")) {
      setSelectedPresetIndex(0); // Cessna
    } else if (r.includes("commercial") || r.includes("captain")) {
      setSelectedPresetIndex(1); // Boeing 737
    } else if (r.includes("test") || r.includes("cadet")) {
      setSelectedPresetIndex(2); // F-16 Falcon
    }
  }, [pilot]);

  // Synchronize sliders on preset modification
  useEffect(() => {
    setVelocity(Math.round(activePreset.maxVelocity * 0.5));
    setWingArea(activePreset.wingArea);
    setCl(activePreset.defaultCl);
    setCd(activePreset.defaultCd);
    setAircraftWeight(activePreset.emptyWeightKg);
    setThrust(activePreset.defaultThrust);

    // Default payloads adjusted to airframe sizes
    if (activePreset.name.includes("Cessna")) {
      setPayloadWeight(180);
      setRunwayLength(800);
    } else if (activePreset.name.includes("Boeing")) {
      setPayloadWeight(18000);
      setRunwayLength(3000);
    } else {
      setPayloadWeight(1200);
      setRunwayLength(1500);
    }
    setTakeoffOutcome("Run simulation to analyze takeoff profile.");
  }, [selectedPresetIndex, activePreset]);

  // Handle Authentication callbacks
  const handleSignIn = (username: string, role: string) => {
    setPilot({ username, role });
  };

  const handleSignOut = () => {
    signOut(auth).catch((e) => console.error("Firebase SignOut error", e));
    setPilot(null);
    localStorage.removeItem("aero_active_pilot");
    sessionStorage.removeItem("aero_active_pilot");
  };

  const handleRestoreTelemetry = (params: {
    rho: number;
    wingArea: number;
    cl: number;
    cd: number;
    aircraftWeight: number;
    payloadWeight: number;
    runwayLength: number;
    thrust: number;
    rollingFriction: number;
  }) => {
    setRho(params.rho);
    setWingArea(params.wingArea);
    setCl(params.cl);
    setCd(params.cd);
    setAircraftWeight(params.aircraftWeight);
    setPayloadWeight(params.payloadWeight);
    setRunwayLength(params.runwayLength);
    setThrust(params.thrust);
    setRollingFriction(params.rollingFriction);
  };

  // Derive personalized flight directives and simulation metadata per user
  const personalizedBrief = useMemo(() => {
    if (!pilot) return null;
    const pName = pilot.username;
    
    // Seed parameters mathematically unique to pilot name lengths
    const seedHours = ((pName.length * 7) % 36) + 4;
    const seedTests = ((pName.length * 4) % 11) + 1;
    
    switch (pilot.role) {
      case "Research Test Pilot":
        return {
          title: "Supersonic Envelope Diagnostic",
          directives: "Investigate Mach-1 boundary stability & shock wave drag coefficients. Validate lift profile curves on dry runways.",
          badge: "MACH-TEST-PIC",
          badgeColor: "bg-orange-500/15 text-orange-400 border-orange-500/30",
          flightHours: seedHours,
          missionsCompleted: seedTests
        };
      case "Commercial Captain":
        return {
          title: "Heavy Transport Efficiency Optimization",
          directives: "Analyze high-inertia runway length limits, heavy taxiing friction rolls, and optimized passenger/payload margins.",
          badge: "HEAVY-JET-PIC",
          badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
          flightHours: seedHours * 10,
          missionsCompleted: seedTests + 12
        };
      case "Air Force Cadet":
        return {
          title: "High-G Combat Climb Evaluation",
          directives: "Establish takeoff climb margins. Conduct physical simulations under high-thrust configurations on tactical strips.",
          badge: "CADET-ACTIVE",
          badgeColor: "bg-sky-500/15 text-sky-400 border-sky-500/30",
          flightHours: seedHours,
          missionsCompleted: seedTests
        };
      case "Aeronautical Student":
      default:
        return {
          title: "Basic Boundary Aero Lab",
          directives: "Verify classical Lift-to-Drag linear formulas. Plot drag polar parabolas relative to Reynolds scale effects.",
          badge: "ACADEMIC-CADET",
          badgeColor: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
          flightHours: Math.max(1, Math.round(seedHours / 3)),
          missionsCompleted: Math.max(0, seedTests - 2)
        };
    }
  }, [pilot]);

  // Intermediate Physics Computations
  const liftN = useMemo(() => {
    // Lift Formula: L = 0.5 * rho * v^2 * S * Cl
    return 0.5 * rho * velocity * velocity * wingArea * cl;
  }, [rho, velocity, wingArea, cl]);

  const dragN = useMemo(() => {
    // Drag Formula: D = 0.5 * rho * v^2 * S * Cd
    return 0.5 * rho * velocity * velocity * wingArea * cd;
  }, [rho, velocity, wingArea, cd]);

  const ldRatio = useMemo(() => {
    if (dragN === 0) return Infinity;
    return liftN / dragN;
  }, [liftN, dragN]);

  // Fluid Dynamics Diagnostics
  const reynolds = useMemo(() => {
    // Re = (v * L) / nu where L is characteristic length (using sqrt(S) as general proxy)
    // nu for sea-level air at 15°C is approx 1.53e-5 m^2/s
    const charLen = Math.sqrt(wingArea) || 1.0;
    const nu = 1.53e-5;
    return (velocity * charLen) / nu;
  }, [velocity, wingArea]);

  const mach = useMemo(() => {
    // M = v / a where speed of sound 'a' ≈ 340.29 m/s at sea level
    const speedOfSound = 340.29;
    return velocity / speedOfSound;
  }, [velocity]);

  // Create unified flight context for the Aerospace AI Expert
  const flightContext: FlightContext = {
    aircraftName: activePreset.name,
    velocity,
    wingArea,
    liftCoefficient: cl,
    dragCoefficient: cd,
    rho,
    aircraftWeight,
    payloadWeight,
    totalWeight: aircraftWeight + payloadWeight,
    thrust,
    rollingFriction,
    liftN,
    dragN,
    ldRatio,
    reynolds,
    mach,
    takeoffOutcome,
  };

  // Render Authentication screen if not logged in
  if (!pilot) {
    return <Auth onSignIn={handleSignIn} />;
  }

  // Speed regime classification color accents
  const isSupersonic = mach >= 1.0;
  const isTransonic = mach >= 0.8 && mach < 1.0;
  const matchAccentColor = isSupersonic
    ? "text-orange-500 bg-orange-500/10 border-orange-500/20"
    : isTransonic
    ? "text-yellow-500 bg-yellow-500/10 border-yellow-500/20"
    : "text-sky-400 bg-sky-500/10 border-sky-500/20";

  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#cbd5e1] font-sans antialiased text-xs flex flex-col">
      {/* High Density header bar with System Status pulses */}
      <header className="h-14 border-b border-slate-800 bg-[#0d1117] sticky top-0 z-40 flex items-center">
        <div className="w-full max-w-7xl mx-auto px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Plane className="w-4 h-4 rotate-45" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-widest text-[#f8fafc] uppercase leading-none font-sans">
                Aero Lift &amp; Drag Simulator
              </h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5 font-mono">
                Aerospace Science &amp; Takeoff Dynamics Console
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5 bg-slate-900/60 p-1.5 rounded border border-slate-800 text-[11px]">
              <div className="flex items-center gap-2 px-1">
                <div className="w-6 h-6 rounded bg-sky-500/15 flex items-center justify-center text-sky-400 text-[10px]">
                  <User className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 font-mono leading-none">PIC Callsign</p>
                  <p className="text-xs font-semibold text-white leading-tight font-mono">{pilot.username}</p>
                </div>
              </div>
              <div className="h-5 w-px bg-slate-800" />
              <div className="hidden md:block pr-1">
                <p className="text-[9px] text-slate-500 font-mono leading-none">Clearance Status</p>
                <p className="text-xs text-sky-400 font-bold leading-tight uppercase font-mono">{pilot.role}</p>
              </div>
              <button
                id="pilot-signout-btn"
                onClick={handleSignOut}
                className="cursor-pointer bg-slate-950 hover:bg-red-500/15 hover:text-red-400 border border-slate-800 hover:border-red-500/30 p-1 rounded text-slate-400 transition-colors"
                title="Sign Out Pilot"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>


      {/* Main Grid Deck */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* LEFT TELEMETRY / CONTROL COLUMN - occupies 4 cols on large, full-width on mobile */}
          <div className="xl:col-span-4 space-y-6">
            {/* Box 0: Active Pilot Flight Brief */}
            {personalizedBrief && (
              <div id="pilot-brief-card" className="bg-[#0d1117] border border-slate-800 rounded-xl p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-bl-full pointer-events-none" />
                <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-2">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-sky-400" />
                    <h2 className="font-semibold text-slate-200 text-xs uppercase tracking-wider font-sans">Active Briefing</h2>
                  </div>
                  <span className={`text-[9px] font-mono uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${personalizedBrief.badgeColor}`}>
                    {personalizedBrief.badge}
                  </span>
                </div>
                <div className="space-y-2 font-mono text-[11px] text-slate-300">
                  <div>
                    <span className="text-slate-500 font-bold block text-[9px] uppercase tracking-widest">Pilot in Command</span>
                    <span className="text-white font-bold">{pilot.username}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold block text-[9px] uppercase tracking-widest">Active Operational Directives</span>
                    <p className="text-slate-300 leading-normal text-[10px] mt-0.5 italic">{personalizedBrief.directives}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Box 1: Airframe Presets */}
            <div id="airframe-presets-card" className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sliders className="w-3.5 h-3.5 text-sky-400" />
                <h2 className="font-semibold text-slate-200 text-xs uppercase tracking-wider font-sans">Select Airframe Profile</h2>
              </div>

              <div className="space-y-2">
                {AIRCRAFT_PRESETS.map((p, index) => (
                  <button
                    id={`preset-${p.name.replace(/\s+/g, '-').toLowerCase()}`}
                    key={p.name}
                    onClick={() => setSelectedPresetIndex(index)}
                    className={`w-full text-left p-2.5 rounded border text-xs transition-all duration-200 group relative ${
                      selectedPresetIndex === index
                        ? "bg-sky-500/10 border-sky-500/40 text-sky-300 shadow shadow-sky-500/5"
                        : "bg-slate-950/50 border-slate-800/80 hover:bg-slate-900 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold mb-0.5 text-[11px]">
                      <span className="text-white">{p.name}</span>
                      <ChevronRight className="w-3 h-3 text-slate-500 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-[10px] text-slate-500 line-clamp-1 leading-normal">{p.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Box 2: Flight Parameters Sliders */}
            <div id="flight-sliders-card" className="bg-[#0d1117] border border-slate-800 rounded-xl p-4 space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-805/80 pb-2 mb-0.5">
                <div className="flex items-center gap-2">
                  <Wind className="w-3.5 h-3.5 text-sky-400" />
                  <h2 className="font-semibold text-slate-200 text-xs uppercase tracking-wider font-sans">Aero Control Deck</h2>
                </div>
                <span className="text-[9px] font-mono text-slate-500">SI Units</span>
              </div>

              {/* Slider 1: Speed */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Airflow Speed (V)</span>
                  <span className="text-sky-400 font-semibold">{velocity.toFixed(0)} m/s <span className="text-slate-500 text-[9px]">({(velocity * 1.94384).toFixed(0)} kt)</span></span>
                </div>
                <input
                  id="speed-slider"
                  type="range"
                  min="0"
                  max={Math.max(activePreset.maxVelocity * 1.5, 300)}
                  step="1"
                  value={velocity}
                  onChange={(e) => setVelocity(parseFloat(e.target.value))}
                  className="w-full accent-sky-400 h-1 bg-slate-950 rounded cursor-pointer"
                />
              </div>

              {/* Slider 2: Wing Area */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Wing Surface Area (S)</span>
                  <span className="text-sky-400 font-semibold">{wingArea.toFixed(1)} m² <span className="text-slate-500 text-[9px]">({(wingArea * 10.7639).toFixed(0)} ft²)</span></span>
                </div>
                <input
                  id="wing-area-slider"
                  type="range"
                  min={(activePreset.wingArea * 0.2).toFixed(1)}
                  max={(activePreset.wingArea * 3.0).toFixed(1)}
                  step="0.1"
                  value={wingArea}
                  onChange={(e) => setWingArea(parseFloat(e.target.value))}
                  className="w-full accent-sky-400 h-1 bg-slate-950 rounded cursor-pointer"
                />
              </div>

              {/* Slider 3: Lift Coefficient CL */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Lift Coefficient (Cl)</span>
                  <span className="text-sky-400 font-semibold">{cl.toFixed(2)}</span>
                </div>
                <input
                  id="cl-slider"
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.01"
                  value={cl}
                  onChange={(e) => setCl(parseFloat(e.target.value))}
                  className="w-full accent-sky-400 h-1 bg-slate-950 rounded cursor-pointer"
                />
              </div>

              {/* Slider 4: Drag Coefficient CD */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Drag Coefficient (Cd)</span>
                  <span className="text-sky-400 font-semibold">{cd.toFixed(4)}</span>
                </div>
                <input
                  id="cd-slider"
                  type="range"
                  min="0.0"
                  max="0.5"
                  step="0.001"
                  value={cd}
                  onChange={(e) => setCd(parseFloat(e.target.value))}
                  className="w-full accent-sky-400 h-1 bg-slate-950 rounded cursor-pointer"
                />
              </div>

              {/* Slider 5: Air Density rho */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Air Density (ρ)</span>
                  <span className="text-sky-400 font-semibold">{rho.toFixed(3)} kg/m³</span>
                </div>
                <input
                  id="rho-slider"
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.005"
                  value={rho}
                  onChange={(e) => setRho(parseFloat(e.target.value))}
                  className="w-full accent-sky-400 h-1 bg-slate-950 rounded cursor-pointer"
                />
                <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">
                  ISA sea level value is 1.225 kg/m³. Decreases with high altitude.
                </p>
              </div>
            </div>

            {/* Box 3: Molecular Fluid Dynamics Diagnostics */}
            <div id="fluid-diagnostics-card" className="bg-[#0d1117] border border-slate-800 rounded-xl p-4 space-y-3.5">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                <h2 className="font-semibold text-slate-200 text-xs uppercase tracking-wider font-sans">Fluid Diagnostics</h2>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/50 p-2 rounded border border-slate-800/80">
                  <p className="text-[9px] font-mono uppercase text-slate-500 font-bold tracking-wider">Reynolds (Re)</p>
                  <p className="text-xs font-bold text-emerald-400 mt-1 font-mono">
                    {reynolds.toExponential(2)}
                  </p>
                </div>
                <div className={`p-2 rounded border ${matchAccentColor}`}>
                  <p className="text-[9px] font-mono uppercase text-slate-500 font-bold tracking-wider">Mach Speed (M)</p>
                  <p className="text-xs font-bold text-emerald-400 mt-1 font-mono">
                    {mach.toFixed(3)}
                  </p>
                </div>
              </div>

              {/* Warnings based on Speed boundaries */}
              {mach > 0.3 && (
                <div className="flex items-start gap-1 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] rounded leading-normal">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <span className="font-bold">Compressibility warning:</span> Mach &gt; 0.3. expect density fluctuation forces.
                  </div>
                </div>
              )}

              {mach >= 1.0 && (
                <div className="flex items-start gap-1 px-2.5 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] rounded leading-normal">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-orange-400" />
                  <div>
                    <span className="font-bold font-mono">SUPERSPEED SHOCK:</span> High drag escalation!
                  </div>
                </div>
              )}
            </div>

            {/* Box 4: Takeoff Simulator Physical Configuration */}
            <div id="takeoff-config-card" className="bg-[#0d1117] border border-slate-800 rounded-xl p-4 space-y-3.5">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <Settings className="w-3.5 h-3.5 text-teal-400" />
                <h2 className="font-semibold text-slate-200 text-xs uppercase tracking-wider font-sans">Takeoff Physical Settings</h2>
              </div>

              {/* Runway length */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>Runway Strip Length</span>
                  <span className="text-slate-200">{runwayLength} m</span>
                </div>
                <input
                  id="runway-length-slider"
                  type="range"
                  min="50"
                  max="5000"
                  step="50"
                  value={runwayLength}
                  onChange={(e) => setRunwayLength(parseInt(e.target.value))}
                  className="w-full accent-teal-400 h-1 bg-slate-950 rounded cursor-pointer"
                />
              </div>

              {/* Aircraft dry weight */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>Aircraft OEW</span>
                  <span className="text-slate-200">{aircraftWeight.toLocaleString()} kg</span>
                </div>
                <input
                  id="aircraft-weight-slider"
                  type="range"
                  min="100"
                  max="200000"
                  step="50"
                  value={aircraftWeight}
                  onChange={(e) => setAircraftWeight(parseFloat(e.target.value))}
                  className="w-full accent-teal-400 h-1 bg-slate-950 rounded cursor-pointer"
                />
              </div>

              {/* Payload + Fuel weight */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>Payload + Fuel weight</span>
                  <span className="text-slate-200">{payloadWeight.toLocaleString()} kg</span>
                </div>
                <input
                  id="payload-fuel-slider"
                  type="range"
                  min="0"
                  max="50000"
                  step="20"
                  value={payloadWeight}
                  onChange={(e) => setPayloadWeight(parseFloat(e.target.value))}
                  className="w-full accent-teal-400 h-1 bg-slate-950 rounded cursor-pointer"
                />
              </div>

              {/* Engine thrust */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>Core Static Thrust</span>
                  <span className="text-slate-200">{thrust.toLocaleString()} N</span>
                </div>
                <input
                  id="thrust-slider"
                  type="range"
                  min="0"
                  max="1000000"
                  step="100"
                  value={thrust}
                  onChange={(e) => setThrust(parseFloat(e.target.value))}
                  className="w-full accent-teal-400 h-1 bg-slate-950 rounded cursor-pointer"
                />
              </div>

              {/* Friction coefficient */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>Ground Rolling Friction</span>
                  <span className="text-slate-200">{rollingFriction.toFixed(3)}</span>
                </div>
                <input
                  id="rolling-friction-slider"
                  type="range"
                  min="0.0"
                  max="0.2"
                  step="0.002"
                  value={rollingFriction}
                  onChange={(e) => setRollingFriction(parseFloat(e.target.value))}
                  className="w-full accent-teal-400 h-1 bg-slate-950 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* RIGHT VIEWPORT / MAIN SIMS COLUMN - occupies 8 cols */}
          <div className="xl:col-span-8 space-y-6">
            {/* Box 1: Digital Force HUD cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div id="lift-hud-card" className="bg-[#0d1117] border border-slate-850 rounded-xl p-4 flex flex-col justify-between h-28 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-sky-500" />
                <div className="absolute top-0 right-0 w-16 h-16 bg-sky-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
                <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  <span>LIFT FORCE (L)</span>
                  <Plane className="w-3.5 h-3.5 text-sky-450 text-sky-400 rotate-45" />
                </div>
                <div className="mt-2">
                  <span className="text-3xl font-bold tracking-tight text-white">
                    {liftN.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                  <span className="text-xs text-sky-450 font-bold font-mono ml-1 text-sky-400">N</span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono">L = 0.5 ρ V² S Cl</p>
              </div>

              <div id="drag-hud-card" className="bg-[#0d1117] border border-slate-850 rounded-xl p-4 flex flex-col justify-between h-28 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-[#2dd4bf]" />
                <div className="absolute top-0 right-0 w-16 h-16 bg-teal-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
                <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  <span>DRAG RESISTANCE (D)</span>
                  <Wind className="w-3.5 h-3.5 text-teal-400" />
                </div>
                <div className="mt-2">
                  <span className="text-3xl font-bold tracking-tight text-white">
                    {dragN.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                  <span className="text-xs text-teal-400 font-bold font-mono ml-1">N</span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono">D = 0.5 ρ V² S Cd</p>
              </div>

              <div id="ratio-hud-card" className="bg-[#0d1117] border border-slate-850 rounded-xl p-4 flex flex-col justify-between h-28 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
                <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  <span>AERO LIFT/DRAG RATIO</span>
                  <TrendingUp className="w-3.5 h-3.5 text-yellow-400" />
                </div>
                <div className="mt-2">
                  <span className="text-3xl font-bold tracking-tight text-white">
                    {ldRatio === Infinity ? "∞" : ldRatio.toFixed(2)}
                  </span>
                  <span className="text-xs text-yellow-400 font-bold font-mono ml-1 font-semibold">L/D</span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono">Glider performance rating</p>
              </div>
            </div>

            {/* Operating Point Indicator Strip */}
            <div id="operating-point-strip" className="bg-[#0d1117] border border-slate-850 rounded-xl px-4 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                <span>Simulation Operating Envelope:</span>
                <strong className="text-slate-200">Speed = {velocity.toFixed(0)} m/s</strong> ·
                <strong className="text-slate-200">Wing S = {wingArea.toFixed(1)} m²</strong> ·
                <strong className="text-slate-200">M = {mach.toFixed(3)}</strong>
              </span>

              <span className={`text-[10px] font-mono uppercase font-bold tracking-wide px-2 py-0.5 rounded border ${matchAccentColor}`}>
                {mach > 1.0 ? "Supersonic Flight" : mach > 0.8 ? "Transonic" : "Subsonic"}
              </span>
            </div>

            {/* Box 2: Flight Dynamic Recharts Plots */}
            <AeroCharts
              velocity={velocity}
              wingArea={wingArea}
              cl={cl}
              cd={cd}
              rho={rho}
              maxVelocity={activePreset.maxVelocity}
            />

            {/* Box 3: Kinetic Takeoff Strip */}
            <TakeoffSimulator
              rho={rho}
              wingArea={wingArea}
              cl={cl}
              cd={cd}
              aircraftWeight={aircraftWeight}
              payloadWeight={payloadWeight}
              runwayLength={runwayLength}
              thrust={thrust}
              rollingFriction={rollingFriction}
              aircraftName={activePreset.name}
              onSimulationComplete={setTakeoffOutcome}
              onRestoreTelemetry={handleRestoreTelemetry}
            />

            {/* Box 4: Aerospace AI expert system */}
            <AeroExpert flightContext={flightContext} />
          </div>
        </div>
      </main>

      {/* Cockpit footer telemetry */}
      <footer className="border-t border-slate-800 bg-[#080d12] py-4 mt-8 text-center text-[10px] font-mono text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Aero Lift &amp; Drag Simulator. Conforms to ISA atmospheric kinetics.</p>
          <div className="flex gap-4">
            <span className="hover:text-slate-300 cursor-help flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-sky-400" /> System Guide
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

import { useState, useRef, useEffect, useMemo } from "react";
import { Play, RotateCcw, AlertTriangle, CheckCircle, Flame, RefreshCw, Cloud, Trash2, History } from "lucide-react";
import { TakeoffSimulationResult, TakeoffStep } from "../types";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import {
  collection,
  addDoc,
  query,
  where,
  deleteDoc,
  doc,
  onSnapshot
} from "firebase/firestore";
import { handleFirestoreError, OperationType } from "../lib/firebase-utils";

interface SavedSimulation {
  id: string;
  userId: string;
  username: string;
  timestamp: string;
  aircraftName: string;
  success: boolean;
  liftoffDistance?: number;
  liftoffTime?: number;
  finalDistance: number;
  finalVelocity: number;
  reason: string;
  parameters: {
    rho: number;
    wingArea: number;
    cl: number;
    cd: number;
    aircraftWeight: number;
    payloadWeight: number;
    runwayLength: number;
    thrust: number;
    rollingFriction: number;
  };
}

interface TakeoffSimulatorProps {
  rho: number;
  wingArea: number;
  cl: number;
  cd: number;
  aircraftWeight: number;
  payloadWeight: number;
  runwayLength: number;
  thrust: number;
  rollingFriction: number;
  aircraftName: string;
  onSimulationComplete: (outcome: string) => void;
  onRestoreTelemetry?: (params: {
    rho: number;
    wingArea: number;
    cl: number;
    cd: number;
    aircraftWeight: number;
    payloadWeight: number;
    runwayLength: number;
    thrust: number;
    rollingFriction: number;
  }) => void;
}

export default function TakeoffSimulator({
  rho,
  wingArea,
  cl,
  cd,
  aircraftWeight,
  payloadWeight,
  runwayLength,
  thrust,
  rollingFriction,
  aircraftName,
  onSimulationComplete,
  onRestoreTelemetry,
}: TakeoffSimulatorProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [simResult, setSimResult] = useState<TakeoffSimulationResult | null>(null);

  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [history, setHistory] = useState<SavedSimulation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [savingLog, setSavingLog] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }

    setHistoryLoading(true);
    const q = query(
      collection(db, "simulations"),
      where("userId", "==", currentUser.uid)
    );

    const unsubscribeSnapshot = onSnapshot(
      q,
      (snapshot) => {
        const runs: SavedSimulation[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          runs.push({
            id: doc.id,
            userId: data.userId || "",
            username: data.username || "",
            timestamp: data.timestamp || "",
            aircraftName: data.aircraftName || "",
            success: !!data.success,
            liftoffDistance: data.liftoffDistance,
            liftoffTime: data.liftoffTime,
            finalDistance: data.finalDistance || 0,
            finalVelocity: data.finalVelocity || 0,
            reason: data.reason || "",
            parameters: data.parameters || {},
          });
        });
        // Sort in memory to avoid index requirements
        runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setHistory(runs);
        setHistoryLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "simulations");
        setHistoryLoading(false);
      }
    );

    return () => unsubscribeSnapshot();
  }, [currentUser]);

  const saveLogToFirestore = async () => {
    if (!currentUser || !simResult) return;
    setSavingLog(true);
    setSaveSuccess(false);

    const displayName = currentUser.displayName || "";
    const parsedUsername = displayName.includes("||")
      ? displayName.split("||")[0]
      : currentUser.email?.split("@")[0] || "Pilot";

    const path = "simulations";
    try {
      const docPayload: any = {
        userId: currentUser.uid,
        username: parsedUsername,
        timestamp: new Date().toISOString(),
        aircraftName,
        success: simResult.success,
        finalDistance: simResult.finalDistance,
        finalVelocity: simResult.finalVelocity,
        reason: simResult.reason,
        parameters: {
          rho,
          wingArea,
          cl,
          cd,
          aircraftWeight,
          payloadWeight,
          runwayLength,
          thrust,
          rollingFriction
        }
      };

      if (simResult.liftoffDistance !== undefined) {
        docPayload.liftoffDistance = simResult.liftoffDistance;
      }
      if (simResult.liftoffTime !== undefined) {
        docPayload.liftoffTime = simResult.liftoffTime;
      }

      const simulationsRef = collection(db, path);
      await addDoc(simulationsRef, docPayload);
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setSavingLog(false);
    }
  };

  const deleteLog = async (logId: string) => {
    const path = `simulations/${logId}`;
    try {
      await deleteDoc(doc(db, "simulations", logId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Compile / compute the simulation immediately when parameters change
  const computeSimulation = useMemo(() => {
    const totalMass = aircraftWeight + payloadWeight;
    const gravity = 9.81;
    const weightForce = totalMass * gravity;

    const steps: TakeoffStep[] = [];
    let t = 0;
    let x = 0;
    let v = 0;
    const dt = 0.05; // 50ms intervals for high resolution physics
    const maxTime = 120; // 2 minutes cutoff

    let liftoffTime: number | undefined;
    let liftoffDistance: number | undefined;
    let success = false;
    let reason = "In progress";

    // Step 0
    steps.push({
      time: 0,
      position: 0,
      velocity: 0,
      lift: 0,
      drag: 0,
       thrust,
      friction: rollingFriction * weightForce,
      normalForce: weightForce,
      isAirborne: false,
    });

    while (t < maxTime) {
      t += dt;
      // L = 0.5 * rho * v^2 * S * Cl
      const lift = 0.5 * rho * v * v * wingArea * cl;
      // D = 0.5 * rho * v^2 * S * Cd
      const drag = 0.5 * rho * v * v * wingArea * cd;

      const isAirborne = lift >= weightForce;
      const normalForce = isAirborne ? 0 : weightForce - lift;
      const friction = isAirborne ? 0 : rollingFriction * normalForce;

      // Net Force = Thrust - Drag - Ground Friction
      const netForce = thrust - drag - friction;
      const acceleration = Math.max(0, netForce / totalMass);

      // Integrate
      v += acceleration * dt;
      x += v * dt;

      steps.push({
        time: parseFloat(t.toFixed(2)),
        position: parseFloat(x.toFixed(1)),
        velocity: parseFloat(v.toFixed(2)),
        lift: parseFloat(lift.toFixed(1)),
        drag: parseFloat(drag.toFixed(1)),
        thrust,
        friction: parseFloat(friction.toFixed(1)),
        normalForce: parseFloat(normalForce.toFixed(1)),
        isAirborne,
      });

      if (isAirborne && !success) {
        success = true;
        liftoffTime = t;
        liftoffDistance = x;
        reason = `LIFT-OFF SUCCESSFUL: Lift (${lift.toLocaleString(undefined, { maximumFractionDigits: 0 })} N) exceeded total weight (${weightForce.toLocaleString(undefined, { maximumFractionDigits: 0 })} N).`;

        // Run for 1.5 extra seconds of airborne flight, then cease simulation
        const stopTimeThreshold = t + 2.0;
        while (t < stopTimeThreshold && t < maxTime) {
          t += dt;
          const sampleLift = 0.5 * rho * v * v * wingArea * cl;
          const sampleDrag = 0.5 * rho * v * v * wingArea * cd;
          const airForceNet = thrust - sampleDrag;
          const airAccel = airForceNet / totalMass;
          v += airAccel * dt;
          x += v * dt;
          steps.push({
            time: parseFloat(t.toFixed(2)),
            position: parseFloat(x.toFixed(1)),
            velocity: parseFloat(v.toFixed(2)),
            lift: parseFloat(sampleLift.toFixed(1)),
            drag: parseFloat(sampleDrag.toFixed(1)),
            thrust,
            friction: 0,
            normalForce: 0,
            isAirborne: true,
          });
        }
        break;
      }

      if (x > runwayLength) {
        success = false;
        reason = `RUNWAY OVERRUN: Exhausted all ${runwayLength}m of runway before establishing critical lift force.`;
        break;
      }
    }

    if (t >= maxTime && !success) {
      success = false;
      reason = "TIME LIMIT EXCEEDED: Aircraft failed to accelerate or take off within the 120-second threshold.";
    }

    const payloadResult: TakeoffSimulationResult = {
      steps,
      success,
      liftoffTime,
      liftoffDistance,
      finalDistance: x,
      finalVelocity: v,
      reason,
    };

    return payloadResult;
  }, [rho, wingArea, cl, cd, aircraftWeight, payloadWeight, runwayLength, thrust, rollingFriction]);

  // Set simulation results and reset when parameters transform
  useEffect(() => {
    setSimResult(computeSimulation);
    setCurrentStepIndex(0);
    setIsPlaying(false);
  }, [computeSimulation]);

  // Handle Play Pause
  useEffect(() => {
    if (isPlaying && simResult) {
      intervalRef.current = setInterval(() => {
        setCurrentStepIndex((prevIndex) => {
          if (prevIndex >= simResult.steps.length - 1) {
            setIsPlaying(false);
            if (intervalRef.current) clearInterval(intervalRef.current);
            onSimulationComplete(simResult.reason);
            return prevIndex;
          }
          return prevIndex + 1;
        });
      }, 40); // 25 fps playback
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, simResult, onSimulationComplete]);

  // Continuous background canvas rendering
  useEffect(() => {
    if (!canvasRef.current || !simResult) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high density displays
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Get current simulation state
    const step = simResult.steps[currentStepIndex] || simResult.steps[0];
    const { position, isAirborne } = step;

    // Clear Canvas - Dark Aerospace Slate
    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(0, 0, width, height);

    // Draw Runway Outline and Perspective
    const runwayY = height * 0.7;
    const runwayHeight = 26;

    // Draw sky/horizon gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, runwayY);
    skyGrad.addColorStop(0, "#082f49"); // dark blue sky
    skyGrad.addColorStop(1, "#0a0c10"); // transition to runway
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, runwayY);

    // Draw Runway Asphalt
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, runwayY, width, runwayY + runwayHeight);

    // Draw Runway Grass (bottom half)
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, runwayY + runwayHeight, width, height - (runwayY + runwayHeight));

    // Draw Runway Border Lines
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, runwayY);
    ctx.lineTo(width, runwayY);
    ctx.moveTo(0, runwayY + runwayHeight);
    ctx.lineTo(width, runwayY + runwayHeight);
    ctx.stroke();

    // Draw Runway Center dashed lines
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(0, runwayY + runwayHeight / 2);
    ctx.lineTo(width, runwayY + runwayHeight / 2);
    ctx.stroke();
    ctx.setLineDash([]); // clear dash

    // Draw Runway Indicators (meters markers along strip)
    // Map physical runway length to canvas width (giving padding of 50px on each end)
    const scaleX = (width - 100) / runwayLength;
    const getCanvasX = (physX: number) => 50 + physX * scaleX;

    // Draw markers every 100 meters
    ctx.fillStyle = "#475569";
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    const markerInterval = runwayLength > 1500 ? 500 : 100;
    for (let markX = 0; markX <= runwayLength; markX += markerInterval) {
      const cx = getCanvasX(markX);
      ctx.fillRect(cx, runwayY + runwayHeight, 2, 4);
      ctx.fillText(`${markX}m`, cx, runwayY + runwayHeight + 12);
    }

    // Draw takeoff success point flag if applicable
    if (simResult.liftoffDistance) {
      const startLiftoffCX = getCanvasX(simResult.liftoffDistance);
      ctx.strokeStyle = "#2dd4bf";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(startLiftoffCX, runwayY - 40);
      ctx.lineTo(startLiftoffCX, runwayY + runwayHeight);
      ctx.stroke();

      // flag cap
      ctx.fillStyle = "rgba(45, 212, 191, 0.15)";
      ctx.fillRect(startLiftoffCX, runwayY - 40, 45, 15);
      ctx.fillStyle = "#2dd4bf";
      ctx.font = "bold 8px sans-serif";
      ctx.fillText("LIFT-OFF", startLiftoffCX + 22, runwayY - 30);
    }

    // Calculate Airplane Canvas Coordinates
    const planeX = getCanvasX(position);
    let planeY = runwayY - 8; // grounded plane elevation

    if (isAirborne && simResult.liftoffDistance) {
      // Calculate height of flight scaling based on distance traversed after lift-off
      const airborneDistance = position - simResult.liftoffDistance;
      const climbElevation = Math.min(35, airborneDistance * 0.15); // max climb view ceiling
      planeY -= climbElevation;
    }

    // DRAW THE AIRPLANE ICON / EMBLEM (Dynamic SVG representation rendered on Canvas)
    ctx.save();
    ctx.translate(planeX, planeY);

    // Rotation angle for ascent
    if (isAirborne) {
      ctx.rotate(-0.15); // angle up
    }

    // Thrust Fire particles if simulation is active
    if (isPlaying && position > 2) {
      const fireGrad = ctx.createLinearGradient(-15, 0, -4, 0);
      fireGrad.addColorStop(0, "transparent");
      fireGrad.addColorStop(0.5, "#f97316");
      fireGrad.addColorStop(1, "#facc15");
      ctx.fillStyle = fireGrad;
      ctx.beginPath();
      ctx.moveTo(-15, -1);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-4, 2);
      ctx.closePath();
      ctx.fill();
    }

    // Airplane fuselage
    ctx.fillStyle = "#f8fafc"; // White composite material
    ctx.beginPath();
    ctx.ellipse(4, -1, 14, 4, 0, 0, 2 * Math.PI);
    ctx.fill();

    // Cockpit windscreen
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.moveTo(12, -3);
    ctx.lineTo(15, -1);
    ctx.lineTo(10, -1);
    ctx.closePath();
    ctx.fill();

    // Wings (Main Wing)
    ctx.fillStyle = "#cbd5e1";
    ctx.beginPath();
    ctx.moveTo(2, -1);
    ctx.lineTo(-4, -11);
    ctx.lineTo(-1, -11);
    ctx.lineTo(6, -1);
    ctx.closePath();
    ctx.fill();

    // Wings (Shadow / Behind Wing)
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.moveTo(2, -1);
    ctx.lineTo(-4, 8);
    ctx.lineTo(-1, 8);
    ctx.lineTo(6, -1);
    ctx.closePath();
    ctx.fill();

    // Tail Stabilizer
    ctx.fillStyle = "#f1f5f9";
    ctx.beginPath();
    ctx.moveTo(-7, -3);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-9, -10);
    ctx.lineTo(-4, -2);
    ctx.closePath();
    ctx.fill();

    // Elevator stabilizer
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(-11, 4);
    ctx.lineTo(-9, 4);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Draw HUD metrics directly to canvas
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(15, 12, 120, 42, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "left";
    ctx.fillText("RUNWAY CORRIDOR", 22, 24);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "8px monospace";
    ctx.fillText(`DIST: ${position.toFixed(1)} m`, 22, 35);
    ctx.fillText(`VEL : ${step.velocity.toFixed(1)} m/s`, 22, 46);
  }, [simResult, currentStepIndex, isPlaying, runwayLength]);

  const activeStep = simResult?.steps[currentStepIndex] || {
    time: 0,
    position: 0,
    velocity: 0,
    lift: 0,
    drag: 0,
    thrust: 0,
    friction: 0,
    normalForce: 0,
    isAirborne: false,
  };

  const isCompleted = simResult && currentStepIndex >= simResult.steps.length - 1;

  const handlePlayToggle = () => {
    if (isCompleted) {
      // Re-trigger and playback
      setCurrentStepIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  };

  return (
    <div id="takeoff-simulator-card" className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-805/80 pb-3 mb-3 gap-3">
        <div>
          <h3 className="font-semibold text-slate-200 text-xs uppercase tracking-wider font-sans">Runway Takeoff Calculator</h3>
          <p className="text-[11px] text-slate-450 mt-0.5">
            Physical validation parameters modeled for: <span className="text-sky-400 font-bold uppercase">{aircraftName}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="sim-play-trigger"
            onClick={handlePlayToggle}
            className={`cursor-pointer px-3 py-1 rounded flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider font-sans border transition-colors ${
              isPlaying
                ? "bg-amber-500/20 border-amber-500/30 text-amber-300 hover:bg-amber-500/35"
                : isCompleted
                ? "bg-sky-500 border-sky-600 text-slate-950 hover:bg-sky-400"
                : "bg-emerald-500 border-emerald-600 text-slate-950 hover:bg-emerald-400"
            }`}
          >
            {isPlaying ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Simulating...</span>
              </>
            ) : isCompleted ? (
              <>
                <RotateCcw className="w-3 h-3" />
                <span>Re-Run</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                <span>Launch Takeoff</span>
              </>
            )}
          </button>

          <button
            id="sim-reset-trigger"
            onClick={handleReset}
            disabled={currentStepIndex === 0 && !isPlaying}
            className="cursor-pointer p-1 rounded border border-slate-800 bg-[#0a0c10] hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Reset simulation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Runway Visual Stage */}
      <div className="relative rounded overflow-hidden border border-slate-800 mb-3 bg-[#0a0c10]">
        <canvas
          ref={canvasRef}
          className="w-full h-36 block"
        />

        {/* Dynamic airborne indicator */}
         {activeStep.isAirborne && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-400/30 text-sky-400 text-[9px] font-mono leading-none tracking-wider uppercase font-bold animate-bounce">
            <Flame className="w-3 h-3 fill-sky-505/20" />
            Airborne flight established
          </div>
        )}
      </div>

      {/* Telemetry Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-2.5 bg-slate-950/40 rounded border border-slate-805/80 mb-4">
        <div className="space-y-0.5">
          <p className="text-[9px] font-mono uppercase text-slate-500 font-bold tracking-wider">T-Time</p>
          <p className="text-xs font-semibold font-mono text-slate-200">
            {activeStep.time.toFixed(2)} <span className="text-[10px] text-slate-500">sec</span>
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[9px] font-mono uppercase text-slate-500 font-bold tracking-wider">Speed</p>
          <p className="text-xs font-semibold font-mono text-slate-200">
            {activeStep.velocity.toFixed(1)} <span className="text-[10px] text-slate-500">m/s</span>
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[9px] font-mono uppercase text-slate-500 font-bold tracking-wider">Runway Position</p>
          <p className="text-xs font-semibold font-mono text-slate-200">
            {activeStep.position.toFixed(1)}m <span className="text-[10px] text-slate-500">/ {runwayLength}m</span>
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[9px] font-mono uppercase text-slate-500 font-bold tracking-wider">Normal force (Fn)</p>
          <p className="text-xs font-semibold font-mono text-slate-200">
            {activeStep.normalForce.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
            <span className="text-[10px] text-slate-500">N</span>
          </p>
        </div>
      </div>

      {/* Detailed simulated kinetics reports */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px] font-mono mb-3 text-slate-400">
        <div className="flex items-center justify-between border-b md:border-b-0 md:border-r border-slate-805/80 pb-1.5 md:pb-0 md:pr-3">
          <span>Active Lift Force Pin:</span>
          <span className="font-semibold text-sky-400">{activeStep.lift.toLocaleString()} N</span>
        </div>
        <div className="flex items-center justify-between border-b md:border-b-0 md:border-r border-slate-800 pb-1.5 md:pb-0 md:pr-3">
          <span>Aerodynamic Drag drag:</span>
          <span className="font-semibold text-teal-400">{activeStep.drag.toLocaleString()} N</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Ground Rolling Friction:</span>
          <span className={`font-semibold ${activeStep.friction > 0 ? "text-amber-500" : "text-slate-500"}`}>
            {activeStep.friction > 0 ? `${activeStep.friction.toLocaleString()} N` : "0 N (Airborne)"}
          </span>
        </div>
      </div>

      {/* Post-Run Outcome Banner */}
      {isCompleted && simResult && (
        <div className="space-y-3 mt-3">
          <div
            className={`flex items-start gap-2.5 rounded border p-2.5 ${
              simResult.success
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                : "bg-red-500/10 border-red-500/25 text-red-300"
            }`}
          >
            {simResult.success ? (
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
            )}
            <div className="space-y-0.5 flex-1">
              <h4 className="font-sans font-semibold text-xs uppercase tracking-wide">
                {simResult.success ? "Takeoff Validation Passed!" : "Simulation Overrun Warning"}
              </h4>
              <p className="text-[11px] text-slate-350 leading-normal">{simResult.reason}</p>
              {simResult.success && simResult.liftoffDistance && simResult.liftoffTime && (
                <p className="text-[10px] text-emerald-400/90 font-mono">
                  Liftoff: {simResult.liftoffDistance.toFixed(1)}m | Time: {simResult.liftoffTime.toFixed(2)}s | Velocity: {activeStep.velocity.toFixed(1)} m/s
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              id="log-to-firestore-btn"
              onClick={saveLogToFirestore}
              disabled={savingLog || saveSuccess}
              className={`cursor-pointer px-3 py-1.5 rounded flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider font-mono border transition-all ${
                saveSuccess
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-sky-500/15 hover:bg-sky-550/25 border-sky-500/35 text-sky-400"
              }`}
            >
              <Cloud className={`w-3.5 h-3.5 ${savingLog ? "animate-pulse" : ""}`} />
              <span>
                {savingLog
                  ? "Verifying Signal..."
                  : saveSuccess
                  ? "Sim Saved to Firestore ✓"
                  : "Save Run to Cloud Journal"}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Cloud-Synced Flight Log Section */}
      <div className="mt-6 pt-5 border-t border-slate-800/80">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
            <h4 className="font-semibold text-slate-200 text-xs uppercase tracking-wider font-sans">
              Telemetric Flight Journal (Firestore Cloud)
            </h4>
          </div>
          <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Cloud Link Synchronized
          </span>
        </div>

        {historyLoading ? (
          <div className="text-center py-4 text-slate-500 font-mono text-[10px] animate-pulse">
            Connecting telemetry stream to Firestore...
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-4 bg-slate-900/10 border border-dashed border-slate-800 rounded p-4 text-[10.5px] leading-relaxed font-mono text-slate-500">
            No cloud simulation logs found for callsign "{currentUser?.displayName?.split("||")[0] || currentUser?.email?.split("@")[0] || "Pilot"}". Run a takeoff simulation and save it above to persistent cloud archives.
          </div>
        ) : (
          <div className="space-y-2 mt-2 max-h-60 overflow-y-auto pr-1">
            {history.map((log) => (
              <div
                key={log.id}
                className="bg-[#0b0e14] border border-slate-800/60 rounded p-2.5 flex items-center justify-between gap-4 text-[10px] hover:border-slate-700 transition-colors"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold">{log.aircraftName}</span>
                    <span
                      className={`px-1 py-0.5 rounded font-mono text-[8px] font-bold tracking-wider uppercase border ${
                        log.success
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                          : "bg-red-500/10 border-red-500/20 text-red-400"
                      }`}
                    >
                      {log.success ? "Passed" : "Overrun"}
                    </span>
                    <span className="text-slate-600 font-mono text-[9px]">
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently"}
                    </span>
                  </div>
                  <p className="text-slate-400 font-mono text-[9px] line-clamp-1">{log.reason}</p>
                  <p className="text-slate-500 text-[8.5px] font-mono">
                    Air density (ρ): {log.parameters?.rho?.toFixed(3)} kg/m³ · Wing (S): {log.parameters?.wingArea?.toFixed(1)} m² · Cl: {log.parameters?.cl?.toFixed(2)} · Cd: {log.parameters?.cd?.toFixed(4)} · Mass: {((log.parameters?.aircraftWeight || 0) + (log.parameters?.payloadWeight || 0)).toLocaleString()} kg · Thrust: {(log.parameters?.thrust || 0).toLocaleString()} N
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  {onRestoreTelemetry && (
                    <button
                      onClick={() => onRestoreTelemetry(log.parameters)}
                      className="cursor-pointer font-mono font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 px-2 py-1 rounded border border-sky-500/20 hover:border-sky-500/40 text-[9px] transition-colors"
                      title="Load this telemetry configuration back into simulation deck"
                    >
                      Recall Settings
                    </button>
                  )}
                  <button
                    onClick={() => deleteLog(log.id)}
                    className="cursor-pointer text-slate-500 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded border border-transparent hover:border-red-500/20 transition-all"
                    title="Purge log"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

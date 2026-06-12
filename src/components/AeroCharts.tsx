import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot,
  LineChart,
  Line,
  Legend
} from "recharts";
import { Info } from "lucide-react";

interface AeroChartsProps {
  velocity: number;
  wingArea: number;
  cl: number;
  cd: number;
  rho: number;
  maxVelocity: number;
}

export default function AeroCharts({
  velocity,
  wingArea,
  cl,
  cd,
  rho,
  maxVelocity,
}: AeroChartsProps) {
  // Generate Performance Curve data: Lift and Drag over a velocity range
  const performanceData = useMemo(() => {
    const data = [];
    const steps = 30;
    const endVelocity = Math.max(maxVelocity, velocity * 1.2, 50);
    const stepSize = endVelocity / steps;

    for (let i = 0; i <= steps; i++) {
      const v = Math.round(i * stepSize);
      // Lift formula: L = 0.5 * rho * v^2 * S * Cl
      const lift = 0.5 * rho * v * v * wingArea * cl;
      // Drag formula: D = 0.5 * rho * v^2 * S * Cd
      const drag = 0.5 * rho * v * v * wingArea * cd;

      data.push({
        velocityValue: v,
        liftForce: parseFloat(lift.toFixed(1)),
        dragForce: parseFloat(drag.toFixed(1)),
      });
    }
    return data;
  }, [velocity, wingArea, cl, cd, rho, maxVelocity]);

  // Current Lift & Drag at operating point
  const currentLift = 0.5 * rho * velocity * velocity * wingArea * cl;
  const currentDrag = 0.5 * rho * velocity * velocity * wingArea * cd;

  // Generate Drag Polar data: Sweep Cl from 0 to 2.0 to calculate matching Cd
  // Parabolic polar: Cd = Cd0 + K * Cl^2
  // We calculate Cd0 based on current Cd & Cl: Cd0 = max(0.005, cd - K * cl^2)
  const dragPolarData = useMemo(() => {
    const data = [];
    const k = 0.05; // Induced drag coefficient factor approximation
    const cd0 = Math.max(0.005, cd - k * cl * cl);
    const clSweepMax = 2.0;
    const steps = 40;

    for (let i = 0; i <= steps; i++) {
      const sweepCl = (i * clSweepMax) / steps;
      const calculatedCd = cd0 + k * sweepCl * sweepCl;

      data.push({
        cdValue: parseFloat(calculatedCd.toFixed(4)),
        clValue: parseFloat(sweepCl.toFixed(2)),
      });
    }
    return data;
  }, [cl, cd]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Chart 1: Lift & Drag Performance vs Velocity */}
      <div id="performance-chart-card" className="bg-[#0d1117] border border-slate-800 rounded-xl p-4 relative">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-200 text-xs uppercase tracking-wide font-sans">Aerodynamic Force Spectrum</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Lift &amp; Drag forces (N) relative to velocity (m/s)
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950/50 border border-slate-800/80 text-slate-400 text-[10px] font-mono">
            <Info className="w-3.5 h-3.5 text-sky-450 text-sky-400" />
            <span>Speed Quadratic Dependency</span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={performanceData}
              margin={{ top: 10, right: 20, left: 5, bottom: 5 }}
            >
              <defs>
                <linearGradient id="liftGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="dragGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="velocityValue"
                stroke="#64748b"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                tickFormatter={(val) => `${val} m/s`}
              />
              <YAxis
                stroke="#64748b"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                tickFormatter={(val) => {
                  if (val >= 100000) return `${(val / 1000).toFixed(0)}k N`;
                  if (val >= 1000) return `${(val / 1000).toFixed(1)}k N`;
                  return `${val} N`;
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0a0c10",
                  borderColor: "#334155",
                  borderRadius: "6px",
                  color: "#cbd5e1",
                  fontSize: "11px",
                }}
                labelFormatter={(label) => `Speed: ${label} m/s`}
              />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Area
                name="Force: Lift (L)"
                type="monotone"
                dataKey="liftForce"
                stroke="#38bdf8"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#liftGrad)"
              />
              <Area
                name="Force: Drag (D)"
                type="monotone"
                dataKey="dragForce"
                stroke="#2dd4bf"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#dragGrad)"
              />

              {/* Highlight operating point */}
              <ReferenceDot
                x={Math.round(velocity)}
                y={parseFloat(currentLift.toFixed(1))}
                r={5}
                fill="#38bdf8"
                stroke="#ffffff"
                strokeWidth={1.5}
                isFront
              />
              <ReferenceDot
                x={Math.round(velocity)}
                y={parseFloat(currentDrag.toFixed(1))}
                r={5}
                fill="#2dd4bf"
                stroke="#ffffff"
                strokeWidth={1.5}
                isFront
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="absolute bottom-4 right-4 pointer-events-none text-[9px] font-mono text-slate-500 bg-[#0a0c10] px-2 py-0.5 rounded border border-slate-800">
          Current: V={velocity.toFixed(0)} m/s | L={currentLift.toLocaleString(undefined, { maximumFractionDigits: 0 })} N
        </div>
      </div>

      {/* Chart 2: Aerodynamic Drag Polar (Cl vs Cd) */}
      <div id="drag-polar-chart-card" className="bg-[#0d1117] border border-slate-800 rounded-xl p-4 relative">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-200 text-xs uppercase tracking-wide font-sans">Aeronautical Drag Polar</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Lift Coefficient (Cl) plotted against Drag Coefficient (Cd)
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950/50 border border-slate-800/80 text-slate-400 text-[10px] font-mono">
            <Info className="w-3.5 h-3.5 text-teal-400" />
            <span>Cd = Cd0 + K · Cl²</span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={dragPolarData}
              margin={{ top: 10, right: 30, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                type="number"
                dataKey="cdValue"
                domain={[0, 0.4]}
                stroke="#64748b"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                tickFormatter={(val) => val.toFixed(3)}
                label={{
                  value: "Drag Coefficient (Cd)",
                  position: "insideBottom",
                  offset: -5,
                  fill: "#64748b",
                  fontSize: 9,
                  fontFamily: "monospace"
                }}
              />
              <YAxis
                type="number"
                dataKey="clValue"
                domain={[0, 2.0]}
                stroke="#64748b"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                label={{
                  value: "Lift Coefficient (Cl)",
                  angle: -90,
                  position: "insideLeft",
                  offset: 0,
                  fill: "#64748b",
                  fontSize: 9,
                  fontFamily: "monospace"
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0a0c10",
                  borderColor: "#334155",
                  borderRadius: "6px",
                  color: "#cbd5e1",
                  fontSize: "11px",
                }}
                formatter={(val, name) => [
                  val,
                  name === "clValue" ? "Lift Coeff (Cl)" : "Drag Coeff (Cd)",
                ]}
              />
              <Line
                name="Flight Polar Curve"
                type="monotone"
                dataKey="clValue"
                stroke="#fbbf24"
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />

              {/* Mark current operating point coefficients on the polar */}
              <ReferenceDot
                x={cd}
                y={cl}
                r={6}
                fill="#fbbf24"
                stroke="#ffffff"
                strokeWidth={1.5}
                isFront
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="absolute bottom-4 right-4 pointer-events-none text-[9px] font-mono text-slate-500 bg-[#0a0c10] px-2 py-0.5 rounded border border-slate-800">
          Oper-Pt: (Cd={cd.toFixed(3)}, Cl={cl.toFixed(2)})
        </div>
      </div>
    </div>
  );
}

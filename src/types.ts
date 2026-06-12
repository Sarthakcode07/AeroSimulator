export interface AircraftPreset {
  name: string;
  wingArea: number; // S (m^2)
  emptyWeightKg: number; // operating empty weight (kg)
  maxVelocity: number; // top speed (m/s)
  defaultThrust: number; // N
  defaultCd: number;
  defaultCl: number;
  description: string;
}

export interface FlightContext {
  aircraftName: string;
  velocity: number; // m/s
  wingArea: number; // m2
  liftCoefficient: number; // Cl
  dragCoefficient: number; // Cd
  rho: number; // air density (kg/m3)
  aircraftWeight: number; // empty weight kg
  payloadWeight: number; // payload + fuel kg
  totalWeight: number; // combined weight kg
  thrust: number; // available thrust N
  rollingFriction: number; // ground friction coeff
  liftN: number;
  dragN: number;
  ldRatio: number;
  reynolds: number;
  mach: number;
  takeoffOutcome?: string;
}

export interface TakeoffStep {
  time: number;
  position: number;
  velocity: number;
  lift: number;
  drag: number;
  thrust: number;
  friction: number;
  normalForce: number;
  isAirborne: boolean;
}

export interface TakeoffSimulationResult {
  steps: TakeoffStep[];
  success: boolean;
  liftoffTime?: number;
  liftoffDistance?: number;
  finalDistance: number;
  finalVelocity: number;
  reason: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "expert";
  text: string;
  isLoading?: boolean;
}

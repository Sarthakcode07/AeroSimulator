#!/usr/bin/env python3
"""
Aerospace Flight Dynamics - Takeoff & Aerodynamics Simulator
Ported from TypeScript/React to Python.

This script implements continuous aircraft physics integration of lift, drag, 
ground friction, and thrust over a custom runway to simulate takeoff outcomes.
"""

import math
import sys
import argparse

# Aircraft preset configurations
AIRCRAFT_PRESETS = {
    "cessna": {
        "name": "Cessna 172 Skyhawk",
        "wing_area": 16.2,            # S (m^2)
        "empty_weight": 767.0,        # kg
        "default_thrust": 1800.0,     # N
        "cl": 0.45,                   # Lift Coefficient
        "cd": 0.035,                  # Drag Coefficient
        "runway_length": 800.0,       # m
        "default_payload": 180.0,     # kg
    },
    "boeing": {
        "name": "Boeing 737-800",
        "wing_area": 125.0,
        "empty_weight": 41400.0,
        "default_thrust": 236000.0,
        "cl": 0.52,
        "cd": 0.022,
        "runway_length": 3000.0,
        "default_payload": 18000.0,
    },
    "falcon": {
        "name": "F-16 Fighting Falcon",
        "wing_area": 27.9,
        "empty_weight": 8570.0,
        "default_thrust": 130000.0,
        "cl": 0.35,
        "cd": 0.015,
        "runway_length": 1500.0,
        "default_payload": 1200.0,
    }
}

class TakeoffSimulator:
    def __init__(self, rho, wing_area, cl, cd, empty_weight, payload_weight, runway_length, thrust, rolling_friction):
        self.rho = rho                          # Air density (kg/m^3)
        self.wing_area = wing_area              # Wing area S (m^2)
        self.cl = cl                            # Lift coefficient (Cl)
        self.cd = cd                            # Drag coefficient (Cd)
        self.empty_weight = empty_weight        # Airframe mass (kg)
        self.payload_weight = payload_weight    # Payload + fuel mass (kg)
        self.runway_length = runway_length      # Runway length (m)
        self.thrust = thrust                    # Applied engine thrust (N)
        self.rolling_friction = rolling_friction # Tire rolling friction coefficient

        self.gravity = 9.81
        self.total_mass = self.empty_weight + self.payload_weight
        self.weight_force = self.total_mass * self.gravity

    def run_simulation(self, dt=0.05, max_time=120.0):
        """
        Integrates aerodynamic and mechanical forces to model the takeoff roll.
        """
        steps = []
        t = 0.0
        x = 0.0
        v = 0.0

        liftoff_time = None
        liftoff_distance = None
        success = False
        reason = "In progress"

        # Step 0: Initial state
        steps.append({
            "time": 0.0,
            "position": 0.0,
            "velocity": 0.0,
            "lift": 0.0,
            "drag": 0.0,
            "thrust": self.thrust,
            "friction": self.rolling_friction * self.weight_force,
            "normal_force": self.weight_force,
            "is_airborne": False
        })

        while t < max_time:
            t += dt
            
            # Dynamic lift & drag calculations
            # L = 0.5 * rho * v^2 * S * Cl
            lift = 0.5 * self.rho * v * v * self.wing_area * self.cl
            # D = 0.5 * rho * v^2 * S * Cd
            drag = 0.5 * self.rho * v * v * self.wing_area * self.cd

            is_airborne = lift >= self.weight_force
            
            if is_airborne:
                normal_force = 0.0
                friction = 0.0
            else:
                normal_force = self.weight_force - lift
                friction = self.rolling_friction * normal_force

            # Net force equations along horizontal axis
            net_force = self.thrust - drag - friction
            acceleration = max(0.0, net_force / self.total_mass)

            # Numerical integration (Euler-Cromer)
            v += acceleration * dt
            x += v * dt

            steps.append({
                "time": round(t, 2),
                "position": round(x, 1),
                "velocity": round(v, 2),
                "lift": round(lift, 1),
                "drag": round(drag, 1),
                "thrust": self.thrust,
                "friction": round(friction, 1),
                "normal_force": round(normal_force, 1),
                "is_airborne": is_airborne
            })

            # Check if takeoff is completed
            if is_airborne and not success:
                success = True
                liftoff_time = t
                liftoff_distance = x
                reason = f"LIFT-OFF SUCCESSFUL: Lift ({lift:,.0f} N) exceeded total aircraft weight ({self.weight_force:,.0f} N)."

                # Track 2.0 subsequent seconds of airborne flight dynamics
                stop_threshold = t + 2.0
                while t < stop_threshold and t < max_time:
                    t += dt
                    lift_air = 0.5 * self.rho * v * v * self.wing_area * self.cl
                    drag_air = 0.5 * self.rho * v * v * self.wing_area * self.cd
                    net_force_air = self.thrust - drag_air
                    accel_air = net_force_air / self.total_mass
                    
                    v += accel_air * dt
                    x += v * dt

                    steps.append({
                        "time": round(t, 2),
                        "position": round(x, 1),
                        "velocity": round(v, 2),
                        "lift": round(lift_air, 1),
                        "drag": round(drag_air, 1),
                        "thrust": self.thrust,
                        "friction": 0.0,
                        "normal_force": 0.0,
                        "is_airborne": True
                    })
                break

            # Check for runway overrun
            if x > self.runway_length:
                success = False
                reason = f"RUNWAY OVERRUN: Exhausted all {self.runway_length}m of runway before establishing critical takeoff lift."
                break

        if t >= max_time and not success:
            success = False
            reason = "TIME LIMIT EXCEEDED: Aircraft failed to accelerate or lift off within limits."

        return {
            "steps": steps,
            "success": success,
            "liftoff_time": liftoff_time,
            "liftoff_distance": liftoff_distance,
            "final_distance": x,
            "final_velocity": v,
            "reason": reason
        }

def print_table(steps):
    """Prints a neat ASCII summary of simulation telemetry."""
    print("\n" + "="*85)
    print(f"{'Time (s)':^10} | {'Pos (m)':^10} | {'Speed (m/s)':^12} | {'Lift (N)':^12} | {'Drag (N)':^10} | {'Airborne?':^10}")
    print("="*85)
    
    # Sample steps to keep output tidy
    interval = max(1, len(steps) // 15)
    for i in range(0, len(steps), interval):
        step = steps[i]
        airborne_str = "YES" if step["is_airborne"] else "No"
        print(f"{step['time']:^10} | {step['position']:^10} | {step['velocity']:^12.1f} | {step['lift']:^12.1f} | {step['drag']:^10.1f} | {airborne_str:^10}")
    
    # Print final step if not printed
    if len(steps) % interval != 1:
        step = steps[-1]
        airborne_str = "YES" if step["is_airborne"] else "No"
        print(f"{step['time']:^10} | {step['position']:^10} | {step['velocity']:^12.1f} | {step['lift']:^12.1f} | {step['drag']:^10.1f} | {airborne_str:^10}")
    print("="*85)

def print_ascii_chart(steps, max_width=60):
    """Displays a basic ASCII visual runway of the takeoff process."""
    print("\nVisual Takeoff Roll Profile:")
    print("RUNWAY START [" + "-" * max_width + "] END")
    
    final_pos = steps[-1]["position"]
    if final_pos <= 0:
        return
        
    for i in range(0, len(steps), max(1, len(steps) // 8)):
        step = steps[i]
        pos = step["position"]
        percentage = min(1.0, pos / final_pos)
        num_markers = int(percentage * max_width)
        
        icon = "✈" if step["is_airborne"] else "⌸"
        line = " " * num_markers + icon + " " * (max_width - num_markers)
        print(f"t={step['time']:>5}s: [{line}] x={step['position']:.1f}m, v={step['velocity']:.1f}m/s")

def main():
    parser = argparse.ArgumentParser(description="Aerospace Flight Dynamics Takeoff & Aerodynamics Simulator")
    parser.add_argument("--preset", choices=list(AIRCRAFT_PRESETS.keys()), default="cessna",
                        help="Choose aircraft configuration preset")
    parser.add_argument("--rho", type=float, default=1.225, help="Air density in kg/m^3 (default: 1.225)")
    parser.add_argument("--wing-area", type=float, help="Custom wing area S in m^2")
    parser.add_argument("--cl", type=float, help="Custom lift coefficient Cl")
    parser.add_argument("--cd", type=float, help="Custom drag coefficient Cd")
    parser.add_argument("--mass", type=float, help="Custom empty weight mass in kg")
    parser.add_argument("--payload", type=float, help="Custom payload flight-weight in kg")
    parser.add_argument("--thrust", type=float, help="Custom applied engine thrust in N")
    parser.add_argument("--runway", type=float, help="Custom runway length in meters")
    parser.add_argument("--friction", type=float, default=0.02, help="Ground friction coefficient (default: 0.02)")

    args = parser.parse_args()

    # Load starting preset
    preset_df = AIRCRAFT_PRESETS[args.preset]
    
    rho = args.rho
    wing_area = args.wing_area or preset_df["wing_area"]
    cl = args.cl or preset_df["cl"]
    cd = args.cd or preset_df["cd"]
    mass = args.mass or preset_df["empty_weight"]
    payload = args.payload if args.payload is not None else preset_df["default_payload"]
    thrust = args.thrust or preset_df["default_thrust"]
    runway = args.runway or preset_df["runway_length"]
    friction = args.friction

    print("\n" + "="*85)
    print(f" AERODYNAMICS WORKBENCH: RUNNING PYTHON TAKEOFF PHYSICS SIMULATION ")
    print("="*85)
    print(f" Aircraft Profile  : {preset_df['name']}")
    print(f" Environment Density: {rho} kg/m³")
    print(f" Wing Area (S)      : {wing_area} m²")
    print(f" Lift Coefficient   : {cl}")
    print(f" Drag Coefficient   : {cd}")
    print(f" Empty Weight       : {mass} kg")
    print(f" Payload + Fuel     : {payload} kg")
    print(f" Total Flight Mass  : {mass + payload} kg")
    print(f" Engine Thrust      : {thrust} N")
    print(f" Runway Length      : {runway} m")
    print(f" Rolling Friction   : {friction}")
    print("="*85)

    simulator = TakeoffSimulator(
        rho=rho,
        wing_area=wing_area,
        cl=cl,
        cd=cd,
        empty_weight=mass,
        payload_weight=payload,
        runway_length=runway,
        thrust=thrust,
        rolling_friction=friction
    )

    result = simulator.run_simulation()
    
    # Print Telemetry Table
    print_table(result["steps"])
    
    # Print Visual Takeoff Progress
    print_ascii_chart(result["steps"])

    print("\n" + "="*85)
    print(f" SIMULATION OUTCOME: {'[ SUCCESS ]' if result['success'] else '[ OVERRUN / FAILURE ]'}")
    print(f" Decision Reason   : {result['reason']}")
    print(f" Total Time        : {result['steps'][-1]['time']} seconds")
    print(f" Final Distance    : {result['final_distance']:.1f} meters")
    print(f" Final Speed       : {result['final_velocity']:.1f} m/s ({(result['final_velocity']*3.6):.1f} km/h)")
    if result["liftoff_distance"]:
        print(f" Liftoff Location  : {result['liftoff_distance']:.1f} meters")
        print(f" Liftoff Duration  : {result['liftoff_time']:.2f} seconds")
    print("="*85 + "\n")

if __name__ == "__main__":
    main()

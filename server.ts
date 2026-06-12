import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

// Load environment variables
dotenv.config();

const isProduction = process.env.NODE_ENV === "production";
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // Server-side Gemini API Route
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, flightContext, history } = req.body;

      if (!message) {
        res.status(400).json({ error: "Message is required" });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        res.status(500).json({
          error: "Gemini API Key is not configured on the server. Please add your GEMINI_API_KEY to the AI Studio Secrets panel."
        });
        return;
      }

      // Initialize the official Google Gen AI SDK
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      // Format current operating context
      const contextString = `
Current Aerodynamic Operating Point & Configurations:
- Aircraft Profile Selected: ${flightContext.aircraftName || "Custom/None"}
- Velocity: ${flightContext.velocity?.toFixed(1) || 0} m/s
- Wing Area (S): ${flightContext.wingArea?.toFixed(2) || 0} m²
- Lift Coefficient (Cl): ${flightContext.liftCoefficient?.toFixed(2) || 0}
- Drag Coefficient (Cd): ${flightContext.dragCoefficient?.toFixed(4) || 0}
- Air density (rho): ${flightContext.rho?.toFixed(3) || 1.225} kg/m³
- Aircraft Weight: ${flightContext.aircraftWeight?.toFixed(1) || 0} kg
- Payload + Fuel Weight: ${flightContext.payloadWeight?.toFixed(1) || 0} kg
- Total Takeoff Weight: ${flightContext.totalWeight?.toFixed(1) || 0} kg
- Available Engine Thrust: ${flightContext.thrust?.toFixed(1) || 0} N
- Rolling friction (ground coefficient): ${flightContext.rollingFriction || 0.02}

Calculated Aerodynamic Outputs:
- Generated Lift Force (L): ${flightContext.liftN?.toLocaleString(undefined, { maximumFractionDigits: 1 }) || 0} N
- Generated Drag Force (D): ${flightContext.dragN?.toLocaleString(undefined, { maximumFractionDigits: 1 }) || 0} N
- Lift-to-Drag Ratio (L/D): ${flightContext.ldRatio === Infinity ? "Infinity" : flightContext.ldRatio?.toFixed(2) || 0}
- Reynolds Number (Re): ${flightContext.reynolds?.toExponential(2) || 0}
- Mach Number (M): ${flightContext.mach?.toFixed(3) || 0}
- Speed regime: ${flightContext.mach > 1.0 ? "Supersonic" : flightContext.mach > 0.8 ? "Transonic" : "Subsonic"}
- Simulation Takeoff Outcome: ${flightContext.takeoffOutcome || "Simulation has not been run yet in this session."}
`;

      const systemInstruction = `You are an elite Aerospace Engineer and Flight Dynamics Expert at NASA or a premier aeronautics facility. 
Your objective is to help the user understand the physics of flight, the lift and drag equations, takeoff dynamics, 
Reynolds numbers, Mach numbers, and how tweaking aerofoil shape coefficients (Cl, Cd), density, and scale affects performance.

Keep your tone professional, instructional, mathematically clear, and highly encouraging.
Refer back to the provided "Current Aerodynamic Operating Point" explicitly when analyzing their question. 
Use clear markdown layout, using bolding, headers, lists, and LaTeX equations where appropriate.
If the user asks questions outside aerodynamics or aircraft physics, politely guide them back to engineering and aerodynamics.`;

      // Build chat content using modern generateContent call
      const prompt = `
[FLIGHT SIMULATOR CONTEXT]
${contextString}

[CONVERSATION HISTORY]
${history || "No previous history."}

[PILOT REGISTRATION / CURRENT QUESTION]
User asks: "${message}"

Please analyze this question using our flight configuration and provide a highly detailed aerospace analysis.
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      res.json({ answer: response.text || "Could not generate content." });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "An internal error occurred while calling the Gemini API" });
    }
  });

  // Serve static application files
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

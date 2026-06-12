import os
import logging
from flask import Flask, request, jsonify, send_from_directory
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables (such as GEMINI_API_KEY)
load_dotenv()

# Initialize Flask application, matching the frontend build location
app = Flask(__name__, static_folder="dist")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Server-Side Ingress Port Integration
PORT = int(os.environ.get("PORT", 3000))

@app.route("/api/chat", methods=["POST"])
def chat():
    """
    Proxy endpoint routing pilot conversations to the Google Gemini API.
    Injects dynamic real-world flight dynamics context into responses.
    """
    try:
        data = request.get_json() or {}
        message = data.get("message")
        flight_context = data.get("flightContext", {})
        history = data.get("history", "")

        if not message:
            return jsonify({"error": "Message is required"}), 400

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key or api_key == "MY_GEMINI_API_KEY":
            return jsonify({
                "error": "Gemini API Key is not configured on the server. Please add your GEMINI_API_KEY."
            }), 500

        # Initialize the official modern Google Gen AI SDK
        client = genai.Client(api_key=api_key)

        # Format current operating context
        context_string = f"""
Current Aerodynamic Operating Point & Configurations:
- Aircraft Profile Selected: {flight_context.get("aircraftName", "Custom/None")}
- Velocity: {flight_context.get("velocity", 0):.1f} m/s
- Wing Area (S): {flight_context.get("wingArea", 0):.2f} m²
- Lift Coefficient (Cl): {flight_context.get("liftCoefficient", 0):.2f}
- Drag Coefficient (Cd): {flight_context.get("dragCoefficient", 0):.4f}
- Air density (rho): {flight_context.get("rho", 1.225):.3f} kg/m³
- Aircraft Weight: {flight_context.get("aircraftWeight", 0):.1f} kg
- Payload + Fuel Weight: {flight_context.get("payloadWeight", 0):.1f} kg
- Total Takeoff Weight: {flight_context.get("totalWeight", 0):.1f} kg
- Available Engine Thrust: {flight_context.get("thrust", 0):.1f} N
- Rolling friction (ground coefficient): {flight_context.get("rollingFriction", 0.02)}

Calculated Aerodynamic Outputs:
- Generated Lift Force (L): {flight_context.get("liftN", 0):,.1f} N
- Generated Drag Force (D): {flight_context.get("dragN", 0):,.1f} N
- Lift-to-Drag Ratio (L/D): {flight_context.get("ldRatio", 0):.2f}
- Reynolds Number (Re): {flight_context.get("reynolds", 0):.2e}
- Mach Number (M): {flight_context.get("mach", 0):.3f}
- Speed regime: {"Supersonic" if flight_context.get("mach", 0) > 1.0 else "Transonic" if flight_context.get("mach", 0) > 0.8 else "Subsonic"}
- Simulation Takeoff Outcome: {flight_context.get("takeoffOutcome", "Simulation has not been run yet in this session.")}
"""

        system_instruction = """You are an elite Aerospace Engineer and Flight Dynamics Expert at NASA or a premier aeronautics facility. 
Your objective is to help the user understand the physics of flight, the lift and drag equations, takeoff dynamics, 
Reynolds numbers, Mach numbers, and how tweaking aerofoil shape coefficients (Cl, Cd), density, and scale affects performance.

Keep your tone professional, instructional, mathematically clear, and highly encouraging.
Refer back to the provided "Current Aerodynamic Operating Point" explicitly when analyzing their question. 
Use clear markdown layout, using bolding, headers, lists, and LaTeX equations where appropriate.
If the user asks questions outside aerodynamics or aircraft physics, politely guide them back to engineering and aerodynamics."""

        prompt = f"""
[FLIGHT SIMULATOR CONTEXT]
{context_string}

[CONVERSATION HISTORY]
{history or "No previous history."}

[PILOT REGISTRATION / CURRENT QUESTION]
User asks: "{message}"

Please analyze this question using our flight configuration and provide a highly detailed aerospace analysis.
"""

        # Generate content using official standard SDK parameters
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7,
            )
        )

        return jsonify({"answer": response.text or "Could not generate content."})

    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

# Served built React files
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve(path):
    dist_dir = os.path.join(os.getcwd(), "dist")
    if not os.path.exists(dist_dir):
        return (
            "Frontend has not been built yet. Please make sure to compile the frontend "
            "using 'npm run build' or check your asset build path.",
            503
        )

    if path != "" and os.path.exists(os.path.join(dist_dir, path)):
        return send_from_directory(dist_dir, path)
    else:
        return send_from_directory(dist_dir, "index.html")

if __name__ == "__main__":
    logger.info(f"Starting Python server on port {PORT}")
    app.run(host="0.0.0.0", port=PORT)

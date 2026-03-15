from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
import time
import random
from enum import Enum

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# CONFIGURATION
# ============================================
TARGET_ANGLE = 52.5
ANGLE_TOLERANCE = 7.5

TARGET_PRESSURE = 50
PRESSURE_TOLERANCE = 10

STABILITY_WINDOW = 3
QUALITY_THRESHOLD = 70

class State(Enum):
    POSITIONING = "POSITIONING"
    SCANNING = "SCANNING"
    ANALYSIS = "ANALYSIS"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"

active_connections = []

# ============================================
# QUALITY SCORING ENGINE
# ============================================

class ScanQualityCalculator:
    """Calculate scan quality based on angle, pressure, and stability"""
    
    def __init__(self):
        self.angle_history = []
        self.pressure_history = []
        
    def calculate_angle_quality(self, angle: float) -> float:
        """Q_angle: 0-100 score"""
        optimal_min, optimal_max = 45, 60
        
        if optimal_min <= angle <= optimal_max:
            return 100.0
        elif 30 <= angle < optimal_min or optimal_max < angle <= 75:
            if angle < optimal_min:
                return 50 + (angle - 30) * 2
            else:
                return 50 + (75 - angle) * 2
        else:
            return max(0, 100 - abs(angle - 52.5) * 2)
    
    def calculate_pressure_quality(self, pressure: int) -> float:
        """Q_pressure: 0-100 score"""
        optimal_min, optimal_max = 40, 60
        
        if optimal_min <= pressure <= optimal_max:
            return 100.0
        elif 20 <= pressure < optimal_min or optimal_max < pressure <= 80:
            if pressure < optimal_min:
                return 50 + (pressure - 20) * 1.25
            else:
                return 50 + (80 - pressure) * 1.25
        else:
            return max(0, 100 - abs(pressure - 50) * 1.5)
    
    def calculate_stability_quality(self, angle_history: list, pressure_history: list) -> float:
        """Q_stability: Based on coefficient of variation"""
        if len(angle_history) < 2:
            return 0.0
        
        import statistics
        angle_mean = statistics.mean(angle_history)
        angle_std = statistics.stdev(angle_history)
        angle_cv = (angle_std / angle_mean) * 100 if angle_mean != 0 else 0
        
        pressure_mean = statistics.mean(pressure_history)
        pressure_std = statistics.stdev(pressure_history)
        pressure_cv = (pressure_std / pressure_mean) * 100 if pressure_mean != 0 else 0
        
        avg_cv = (angle_cv + pressure_cv) / 2
        
        if avg_cv <= 10:
            return 100.0
        elif avg_cv <= 20:
            return 50.0
        else:
            return max(0, 100 - avg_cv * 2)
    
    def calculate_overall_quality(self, angle: float, pressure: int, 
                                 angle_history: list, pressure_history: list) -> dict:
        """Calculate overall scan quality"""
        q_angle = self.calculate_angle_quality(angle)
        q_pressure = self.calculate_pressure_quality(pressure)
        q_stability = self.calculate_stability_quality(angle_history, pressure_history)
        
        overall_q = (0.35 * q_angle + 0.30 * q_pressure + 0.35 * q_stability)
        
        return {
            "angle_quality": round(q_angle, 1),
            "pressure_quality": round(q_pressure, 1),
            "stability_quality": round(q_stability, 1),
            "overall_quality": round(overall_q, 1),
            "passes_threshold": overall_q >= QUALITY_THRESHOLD
        }

quality_calculator = ScanQualityCalculator()

# ============================================
# MOCK DATA GENERATOR
# ============================================

class MockDataGenerator:
    """Simulates realistic user behavior"""
    
    def __init__(self):
        self.angle_base = 35.0
        self.pressure_base = 30
        self.angle_trend = random.uniform(-0.5, 0.5)
        self.pressure_trend = random.uniform(-0.3, 0.3)
    
    def generate_data(self) -> tuple:
        """Generate realistic angle and pressure data"""
        
        # Simulate user gradually improving positioning
        if abs(self.angle_base - TARGET_ANGLE) > 2:
            self.angle_trend += random.uniform(-0.1, 0.2)  # Drift toward target
        
        if abs(self.pressure_base - TARGET_PRESSURE) > 3:
            self.pressure_trend += random.uniform(-0.1, 0.2)
        
        # Apply trends with limits
        self.angle_base += self.angle_trend
        self.pressure_base += self.pressure_trend
        
        # Add realistic jitter
        angle = self.angle_base + random.gauss(0, 1.5)
        pressure = max(0, min(100, self.pressure_base + random.gauss(0, 3)))
        
        # Clamp to realistic ranges
        angle = max(20, min(80, angle))
        pressure = max(0, min(100, int(pressure)))
        
        return angle, pressure

mock_generator = MockDataGenerator()

# ============================================
# GUIDANCE ENGINE
# ============================================

def generate_guidance(angle: float, pressure: int, angle_history: list, 
                     pressure_history: list) -> list:
    """Generate real-time guidance for user"""
    guidance = []
    
    if angle < 45:
        diff = 45 - angle
        guidance.append(f"⬆️ Tilt probe UP {diff:.1f}° more")
    elif angle > 60:
        diff = angle - 60
        guidance.append(f"⬇️ Tilt probe DOWN {diff:.1f}°")
    else:
        guidance.append("✅ Angle is perfect!")
    
    if pressure < 40:
        diff = 40 - pressure
        guidance.append(f"🔼 Increase pressure by {diff:.0f} units")
    elif pressure > 60:
        diff = pressure - 60
        guidance.append(f"🔽 Reduce pressure by {diff:.0f} units")
    else:
        guidance.append("✅ Pressure is perfect!")
    
    if len(angle_history) > 1:
        import statistics
        angle_std = statistics.stdev(angle_history)
        if angle_std > 5:
            guidance.append("📍 Hold probe STEADY")
        else:
            guidance.append("✅ Probe is stable!")
    
    return guidance

# ============================================
# STATE MACHINE
# ============================================

def update_state_machine(angle: float, pressure: int, angle_history: list, 
                        pressure_history: list, current_state: State, 
                        hold_start_time) -> tuple:
    """State machine logic"""
    
    quality_data = quality_calculator.calculate_overall_quality(
        angle, pressure, angle_history, pressure_history
    )
    
    if current_state == State.POSITIONING:
        if quality_data["passes_threshold"]:
            return (
                State.SCANNING,
                "🎯 Perfect positioning! Hold steady for 3 seconds...",
                time.time(),
                0.0,
                STABILITY_WINDOW
            )
        else:
            guidance = generate_guidance(angle, pressure, angle_history, pressure_history)
            instruction = "📍 Adjust probe position"
            return (
                State.POSITIONING,
                instruction,
                None,
                0.0,
                STABILITY_WINDOW
            )
    
    elif current_state == State.SCANNING:
        if not quality_data["passes_threshold"]:
            return (
                State.POSITIONING,
                "⚠️ Position lost! Reposition probe",
                None,
                0.0,
                STABILITY_WINDOW
            )
        
        hold_elapsed = time.time() - hold_start_time
        hold_remaining = max(0, STABILITY_WINDOW - hold_elapsed)
        
        if hold_elapsed >= STABILITY_WINDOW:
            return (
                State.SUCCESS,
                "🎉 Scan complete! Diagnostic analysis successful!",
                hold_start_time,
                STABILITY_WINDOW,
                0.0
            )
        else:
            instruction = f"⏱️ Hold steady {hold_remaining:.1f}s more..."
            return (
                State.SCANNING,
                instruction,
                hold_start_time,
                hold_elapsed,
                hold_remaining
            )
    
    elif current_state == State.SUCCESS:
        return (
            State.SUCCESS,
            "✅ Scan complete! Ready for next scan.",
            hold_start_time,
            STABILITY_WINDOW,
            0.0
        )
    
    return (current_state, "Error", hold_start_time, 0.0, STABILITY_WINDOW)

# ============================================
# WEBSOCKET
# ============================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    print(f"✅ Client connected. Total: {len(active_connections)}")
    
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(websocket)
        print(f"❌ Client disconnected. Total: {len(active_connections)}")

# ============================================
# MOCK DATA LOOP
# ============================================

current_state = State.POSITIONING
hold_start_time = None
angle_history = []
pressure_history = []

@app.on_event("startup")
async def startup_event():
    print("=" * 60)
    print("🏥 MOCK CAROTID ULTRASOUND SYSTEM (No Arduino)")
    print("=" * 60)
    print(f"🎯 Simulating realistic user behavior...")
    print(f"📍 Target Angle: {TARGET_ANGLE}° (45-60° optimal)")
    print(f"⚙️ Target Pressure: {TARGET_PRESSURE} (40-60 optimal)")
    print(f"⏱️ Hold Duration: {STABILITY_WINDOW}s")
    print("=" * 60)
    
    asyncio.create_task(mock_data_loop())

async def mock_data_loop():
    global current_state, hold_start_time, angle_history, pressure_history
    
    while True:
        try:
            # Generate mock data
            angle, pressure = mock_generator.generate_data()
            
            # Keep history
            angle_history.append(angle)
            pressure_history.append(pressure)
            if len(angle_history) > 30:
                angle_history.pop(0)
                pressure_history.pop(0)
            
            # Update state machine
            new_state, instruction, new_hold_start, hold_elapsed, hold_remaining = update_state_machine(
                angle, pressure, angle_history, pressure_history,
                current_state, hold_start_time
            )
            
            current_state = new_state
            hold_start_time = new_hold_start
            
            # Get quality scores
            quality = quality_calculator.calculate_overall_quality(
                angle, pressure, angle_history, pressure_history
            )
            
            # Generate guidance
            guidance = generate_guidance(angle, pressure, angle_history, pressure_history)
            
            # Build response compatible with your frontend
            response = {
                "state": current_state.value,
                "instruction": instruction,
                "guidance": guidance,
                "angle": {
                    "current": round(angle, 1),
                    "is_correct": quality["passes_threshold"]
                },
                "pressure": pressure,
                "hold_progress": round((hold_elapsed / STABILITY_WINDOW) * 100, 1) if current_state == State.SCANNING else 0,
                "timestamp": time.time()
            }
            
            # Print for debugging
            print(f"[{current_state.value}] Angle:{angle:.1f}° Pressure:{pressure} Quality:{quality['overall_quality']:.1f}")
            
            # Broadcast
            disconnected = []
            for connection in active_connections:
                try:
                    await connection.send_json(response)
                except:
                    disconnected.append(connection)
            
            for conn in disconnected:
                if conn in active_connections:
                    active_connections.remove(conn)
            
            await asyncio.sleep(0.1)  # 10 updates per second
        
        except Exception as e:
            print(f"❌ Error: {e}")
            await asyncio.sleep(1)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

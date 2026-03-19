from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
import time
import random
from enum import Enum
import serial
import serial.tools.list_ports
import json

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
TARGET_ANGLE = 60.0
ANGLE_TOLERANCE = 5.0

TARGET_PRESSURE = 50
PRESSURE_TOLERANCE = 10

STABILITY_WINDOW = 3
QUALITY_THRESHOLD = 70

# Set to True to force mock mode, False to try real Arduino first
FORCE_MOCK_MODE = False

class State(Enum):
    POSITIONING = "POSITIONING"
    SCANNING = "SCANNING"
    ANALYSIS = "ANALYSIS"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"

active_connections = []

# ============================================
# ARDUINO AUTO-DETECT
# ============================================

def find_arduino_port():
    """Auto-detect Arduino serial port"""
    ports = serial.tools.list_ports.comports()
    print(f"\n🔍 Scanning for Arduino... Found {len(ports)} port(s)")
    
    for port in ports:
        print(f"  📌 {port.device}: {port.description}")
        desc_lower = port.description.lower()
        device_lower = port.device.lower()
        
        if any(x in desc_lower or x in device_lower for x in 
               ['arduino', 'usbserial', 'usbmodem', 'ch340', 'cp210', 'ftdi', 'serial']):
            print(f"✅ Selected Arduino: {port.device} ({port.description})")
            return port.device
    
    print("❌ No Arduino detected")
    return None

# ============================================
# TELEMETRY PARSER (Arduino → Python)
# ============================================

def parse_telemetry_line(line: str) -> dict | None:
    """
    Parse Arduino CSV format: PRESSURE,LATITUDE,LONGITUDE
    Example: 45.00,-78.59,-5.47
    
    Format breakdown:
    - PRESSURE: 0-100 (from FSR4020)
    - LATITUDE: -90 to +90 (tilt forward/backward)
    - LONGITUDE: -90 to +90 (tilt left/right)
    """
    line = line.strip()
    
    # Skip empty lines, timestamp lines, or debug messages
    if not line or '->' in line or line.count(':') > 1:
        return None
    
    # Split by comma
    parts = line.split(',')
    
    if len(parts) != 3:
        return None
    
    try:
        pressure_raw = float(parts[0].strip())
        latitude_raw = float(parts[1].strip())
        longitude_raw = float(parts[2].strip())
        
        # ===== PRESSURE CONVERSION =====
        # Already in 0-100 scale from Arduino
        pressure = int(max(0, min(100, pressure_raw)))
        
        # ===== ANGLE CONVERSION =====
        # Convert -90/+90 range to 0-90 absolute values
        lat = abs(latitude_raw)
        lon = abs(longitude_raw)
        
        # For carotid scanning, use the larger angle as primary
        # This represents the most significant tilt
        primary_angle = max(lat, lon)
        
        # Clamp values
        lat = max(0.0, min(90.0, lat))
        lon = max(0.0, min(90.0, lon))
        primary_angle = max(0.0, min(90.0, primary_angle))
        
        return {
            "pressure": pressure,
            "lat": lat,
            "lon": lon,
            "primary_angle": primary_angle,
            "raw_pressure": pressure_raw,
            "raw_lat": latitude_raw,
            "raw_lon": longitude_raw
        }
        
    except (ValueError, IndexError) as e:
        return None

# ============================================
# QUALITY SCORING ENGINE
# ============================================

class ScanQualityCalculator:
    """Calculate scan quality based on angle, pressure, and stability"""
    
    def __init__(self):
        self.angle_history = []
        self.pressure_history = []
        
    def calculate_angle_quality(self, angle: float) -> float:
        """Q_angle: 0-100 score (targeting 60° ±5)"""
        optimal_min, optimal_max = 55, 65
        
        if optimal_min <= angle <= optimal_max:
            return 100.0
        elif 40 <= angle < optimal_min or optimal_max < angle <= 80:
            if angle < optimal_min:
                return 50 + (angle - 40) * 3.33
            else:
                return 50 + (80 - angle) * 3.33
        else:
            return max(0, 100 - abs(angle - 60) * 2)
    
    def calculate_pressure_quality(self, pressure: int) -> float:
        """Q_pressure: 0-100 score"""
        optimal_min, optimal_max = 40, 60
        
        if optimal_min <= pressure <= optimal_max:
            return 100.0
        elif 20 <= pressure < optimal_min or optimal_max < pressure <= 80:
            if pressure < optimal_min:
                return 50 + (pressure - 20) * 2.5
            else:
                return 50 + (80 - pressure) * 2.5
        else:
            return max(0, 100 - abs(pressure - 50) * 2)
    
    def calculate_stability_quality(self, angle_history: list, pressure_history: list) -> float:
        """Q_stability: Based on coefficient of variation"""
        if len(angle_history) < 3:
            return 0.0
        
        import statistics
        
        recent_angles = angle_history[-10:]
        recent_pressures = pressure_history[-10:]
        
        angle_mean = statistics.mean(recent_angles)
        angle_std = statistics.stdev(recent_angles) if len(recent_angles) > 1 else 0
        angle_cv = (angle_std / angle_mean) * 100 if angle_mean != 0 else 0
        
        pressure_mean = statistics.mean(recent_pressures)
        pressure_std = statistics.stdev(recent_pressures) if len(recent_pressures) > 1 else 0
        pressure_cv = (pressure_std / pressure_mean) * 100 if pressure_mean != 0 else 0
        
        avg_cv = (angle_cv + pressure_cv) / 2
        
        if avg_cv <= 5:
            return 100.0
        elif avg_cv <= 15:
            return 75.0
        elif avg_cv <= 25:
            return 50.0
        else:
            return max(0, 100 - avg_cv * 2)
    
    def calculate_overall_quality(self, angle: float, pressure: int, 
                                 angle_history: list, pressure_history: list) -> dict:
        """Calculate overall scan quality"""
        q_angle = self.calculate_angle_quality(angle)
        q_pressure = self.calculate_pressure_quality(pressure)
        q_stability = self.calculate_stability_quality(angle_history, pressure_history)
        
        overall_q = (0.40 * q_angle + 0.25 * q_pressure + 0.35 * q_stability)
        
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
        
        if abs(self.angle_base - TARGET_ANGLE) > 2:
            self.angle_trend += random.uniform(-0.1, 0.2)
        
        if abs(self.pressure_base - TARGET_PRESSURE) > 3:
            self.pressure_trend += random.uniform(-0.1, 0.2)
        
        self.angle_base += self.angle_trend
        self.pressure_base += self.pressure_trend
        
        angle = self.angle_base + random.gauss(0, 1.5)
        pressure = max(0, min(100, self.pressure_base + random.gauss(0, 3)))
        
        angle = max(0, min(90, angle))
        pressure = max(0, min(100, int(pressure)))
        
        lat = angle + random.uniform(-5, 5)
        lon = angle
        
        return lon, lat, pressure

mock_generator = MockDataGenerator()

# ============================================
# GUIDANCE ENGINE
# ============================================

def generate_guidance(angle: float, pressure: int, angle_history: list, 
                     pressure_history: list) -> list:
    """Generate real-time guidance for user"""
    guidance = []
    
    # Angle guidance (targeting 60°)
    if angle < 55:
        diff = 55 - angle
        guidance.append(f"Tilt probe UP {diff:.1f}° more")
    elif angle > 65:
        diff = angle - 65
        guidance.append(f"Tilt probe DOWN {diff:.1f}°")
    
    # Pressure guidance (40-60 range)
    if pressure < 40:
        diff = 40 - pressure
        guidance.append(f"Increase pressure by {diff:.0f} units")
    elif pressure > 60:
        diff = pressure - 60
        guidance.append(f"Reduce pressure by {diff:.0f} units")
    
    # Stability guidance
    if len(angle_history) > 3:
        import statistics
        recent = angle_history[-10:]
        angle_std = statistics.stdev(recent) if len(recent) > 1 else 0
        if angle_std > 5:
            guidance.append("Hold probe STEADY")
    
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
                "Perfect positioning! Hold steady...",
                time.time(),
                0.0,
                STABILITY_WINDOW
            )
        else:
            instruction = "Adjust probe position"
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
                "Position lost! Reposition probe",
                None,
                0.0,
                STABILITY_WINDOW
            )
        
        hold_elapsed = time.time() - hold_start_time
        hold_remaining = max(0, STABILITY_WINDOW - hold_elapsed)
        
        if hold_elapsed >= STABILITY_WINDOW:
            return (
                State.SUCCESS,
                "Scan complete! Analysis successful!",
                hold_start_time,
                STABILITY_WINDOW,
                0.0
            )
        else:
            instruction = f"Hold steady {hold_remaining:.1f}s more..."
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
            "Scan complete! Ready for next scan.",
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
    print(f"✅ Frontend connected. Total clients: {len(active_connections)}")
    
    try:
        await websocket.send_json({
            "type": "connection",
            "status": "connected",
            "message": "Backend ready"
        })
    except:
        pass
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except:
                pass
    except WebSocketDisconnect:
        if websocket in active_connections:
            active_connections.remove(websocket)
        print(f"❌ Frontend disconnected. Total clients: {len(active_connections)}")

# ============================================
# MAIN DATA LOOP
# ============================================

current_state = State.POSITIONING
hold_start_time = None
angle_history = []
pressure_history = []

@app.on_event("startup")
async def startup_event():
    print("=" * 60)
    print("🏥 PLAQUEPAL - CAROTID ULTRASOUND SYSTEM")
    print("=" * 60)
    print(f"📍 Target Angle: {TARGET_ANGLE}° (55-65° optimal)")
    print(f"⚙️ Target Pressure: {TARGET_PRESSURE} (40-60 optimal)")
    print(f"⏱️ Hold Duration: {STABILITY_WINDOW}s")
    print(f"🎯 Quality Threshold: {QUALITY_THRESHOLD}%")
    print("=" * 60)
    
    asyncio.create_task(main_data_loop())

async def main_data_loop():
    global current_state, hold_start_time, angle_history, pressure_history
    
    arduino_port = None if FORCE_MOCK_MODE else find_arduino_port()
    
    if arduino_port:
        print(f"\n🔌 Using REAL Arduino on {arduino_port}")
        print("📡 Waiting for data...\n")
        await arduino_data_loop(arduino_port)
    else:
        print("\n🎭 No Arduino detected - using MOCK mode")
        print("💡 To use real Arduino, connect it and restart\n")
        await mock_data_loop()

async def arduino_data_loop(port: str):
    """Read from real Arduino"""
    global current_state, hold_start_time, angle_history, pressure_history
    
    BAUD_RATE = 9600
    
    while True:
        try:
            print(f"🔄 Connecting to Arduino on {port}...")
            ser = serial.Serial(port, BAUD_RATE, timeout=1)
            await asyncio.sleep(2)
            print(f"✅ Arduino connected!\n")
            
            line_count = 0
            
            while True:
                if ser.in_waiting > 0:
                    raw = ser.readline()
                    line = raw.decode("utf-8", errors="ignore").strip()
                    
                    if not line:
                        continue
                    
                    line_count += 1
                    
                    parsed = parse_telemetry_line(line)
                    if not parsed:
                        continue
                    
                    # Extract values
                    lon = parsed["lon"]
                    lat = parsed["lat"]
                    pressure = parsed["pressure"]
                    primary_angle = parsed["primary_angle"]
                    
                    # Use primary_angle as main angle
                    angle = primary_angle
                    
                    # Keep history
                    angle_history.append(angle)
                    pressure_history.append(pressure)
                    if len(angle_history) > 50:
                        angle_history.pop(0)
                        pressure_history.pop(0)
                    
                    # Update state machine
                    new_state, instruction, new_hold_start, hold_elapsed, hold_remaining = update_state_machine(
                        angle, pressure, angle_history, pressure_history,
                        current_state, hold_start_time
                    )
                    
                    current_state = new_state
                    hold_start_time = new_hold_start
                    
                    # Calculate quality
                    quality = quality_calculator.calculate_overall_quality(
                        angle, pressure, angle_history, pressure_history
                    )
                    
                    # Generate guidance
                    guidance = generate_guidance(angle, pressure, angle_history, pressure_history)
                    
                    # Build response
                    response = {
                        "state": current_state.value,
                        "instruction": instruction,
                        "guidance": guidance,
                        "angle": {
                            "current": round(angle, 1),
                            "latitude": round(lat, 1),
                            "longitude": round(lon, 1),
                            "is_correct": quality["passes_threshold"]
                        },
                        "pressure": pressure,
                        "quality": quality,
                        "hold_progress": round((hold_elapsed / STABILITY_WINDOW) * 100, 1) if current_state == State.SCANNING else 0,
                        "timestamp": time.time()
                    }
                    
                    # Console output
                    if line_count % 10 == 0:
                        print(f"[{current_state.value}] "
                              f"Angle:{angle:.1f}° (LAT:{parsed['raw_lat']:.1f}° LON:{parsed['raw_lon']:.1f}°) "
                              f"P:{pressure} "
                              f"Q:{quality['overall_quality']:.1f}% | Clients: {len(active_connections)}")
                    
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
                
                await asyncio.sleep(0.01)
        
        except serial.SerialException as e:
            print(f"❌ Serial error: {e}")
            print("⏳ Retrying in 5 seconds...")
            await asyncio.sleep(5)
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            import traceback
            traceback.print_exc()
            await asyncio.sleep(5)

async def mock_data_loop():
    """Fallback mock mode"""
    global current_state, hold_start_time, angle_history, pressure_history
    
    iteration = 0
    
    while True:
        try:
            lon, lat, pressure = mock_generator.generate_data()
            angle = lon
            
            angle_history.append(angle)
            pressure_history.append(pressure)
            if len(angle_history) > 30:
                angle_history.pop(0)
                pressure_history.pop(0)
            
            new_state, instruction, new_hold_start, hold_elapsed, hold_remaining = update_state_machine(
                angle, pressure, angle_history, pressure_history,
                current_state, hold_start_time
            )
            
            current_state = new_state
            hold_start_time = new_hold_start
            
            quality = quality_calculator.calculate_overall_quality(
                angle, pressure, angle_history, pressure_history
            )
            
            guidance = generate_guidance(angle, pressure, angle_history, pressure_history)
            
            response = {
                "state": current_state.value,
                "instruction": instruction,
                "guidance": guidance,
                "angle": {
                    "current": round(angle, 1),
                    "latitude": round(lat, 1),
                    "longitude": round(lon, 1),
                    "is_correct": quality["passes_threshold"]
                },
                "pressure": pressure,
                "hold_progress": round((hold_elapsed / STABILITY_WINDOW) * 100, 1) if current_state == State.SCANNING else 0,
                "quality": quality,
                "timestamp": time.time()
            }
            
            iteration += 1
            if iteration % 10 == 0:
                print(f"[MOCK {current_state.value}] Angle:{angle:.1f}° Pressure:{pressure} Quality:{quality['overall_quality']:.1f}% | Clients: {len(active_connections)}")
            
            disconnected = []
            for connection in active_connections:
                try:
                    await connection.send_json(response)
                except:
                    disconnected.append(connection)
            
            for conn in disconnected:
                if conn in active_connections:
                    active_connections.remove(conn)
            
            await asyncio.sleep(0.1)
        
        except Exception as e:
            print(f"❌ Error in mock loop: {e}")
            await asyncio.sleep(1)

if __name__ == "__main__":
    print("🚀 Starting PlaquePal Backend Server...")
    uvicorn.run(app, host="0.0.0.0", port=8000)



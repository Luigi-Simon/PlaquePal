import React, { useState, useEffect } from 'react';
import { Activity, ShieldAlert, Zap, Wifi } from 'lucide-react';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';

export default function App() {
  const [pressure, setPressure] = useState(0);
  const [chartData, setChartData] = useState(Array(20).fill({ value: 0 }));
  
  const [state, setState] = useState('POSITIONING');
  // 1. Initial instruction is sentence case for friendly tone
  const [instruction, setInstruction] = useState('Adjust probe position');
  const [angle, setAngle] = useState(80.0);
  const [angleCorrect, setAngleCorrect] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [guidance, setGuidance] = useState([
    "Tilt probe DOWN 20.0°",
    "Reduce pressure by 40 units"
  ]);
  
  const [wsStatus, setWsStatus] = useState('Connecting...');
  const [statusColor, setStatusColor] = useState('text-yellow-500');
  const [isConnected, setIsConnected] = useState(false);

  // useEffect WebSocket logic remains exactly the same and is omitted for brevity)
  useEffect(() => {
    // ... (Your actual WebSocket setup code is here. Kept it omitted as requested.)
    let ws = null;
    let reconnectTimeout = null;

    const connectWebSocket = () => {
      try {
        ws = new WebSocket('ws://localhost:8000/ws');

        ws.onopen = () => {
          console.log('✅ Connected to backend');
          setWsStatus('Live Connection Established');
          setStatusColor('text-green-500');
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('📨 Received from backend:', data);
            
            // Update pressure and graph
            if (data.pressure !== undefined) {
              setPressure(data.pressure);
              setChartData(prevData => {
                const newData = [...prevData.slice(1), { value: data.pressure }];
                return newData;
              });
            }
            
            // Update state
            if (data.state) {
              setState(data.state);
            }
            
            // Update instruction
            if (data.instruction) {
              setInstruction(data.instruction);
            }
            
            // Update angle - Extract only the number
            if (data.angle && data.angle.current !== undefined) {
              setAngle(data.angle.current);
              setAngleCorrect(data.angle.is_correct);
            }
            
            // Update progress
            if (data.hold_progress !== undefined) {
              setHoldProgress(data.hold_progress);
            }
            
            // Update guidance - Make sure it's an array
            if (Array.isArray(data.guidance)) {
              setGuidance(data.guidance);
            } else {
              setGuidance([]);
            }
            
          } catch (error) {
            console.error("❌ Error parsing data:", error);
          }
        };

        ws.onclose = () => {
          console.log('❌ Disconnected from backend');
          setWsStatus('Disconnected - Reconnecting...');
          setStatusColor('text-red-500');
          setIsConnected(false);
          
          // Auto-reconnect after 3 seconds
          reconnectTimeout = setTimeout(() => {
            console.log('🔄 Attempting to reconnect...');
            connectWebSocket();
          }, 3000);
        };

        ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          setWsStatus('Connection Error');
          setStatusColor('text-red-500');
        };

      } catch (error) {
        console.error('❌ WebSocket connection failed:', error);
        setWsStatus('Connection Failed');
        setStatusColor('text-red-500');
      }
    };

    // Initial connection
    connectWebSocket();

    // Cleanup
    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Color based on state (kept slightly softer colors)
  const getStateColor = () => {
    switch(state) {
      case 'POSITIONING': return 'bg-yellow-500/15 border-yellow-500/50 text-yellow-400';
      case 'HOLDING': return 'bg-blue-500/15 border-blue-500/50 text-blue-400';
      case 'SUCCESS': return 'bg-green-500/15 border-green-500/50 text-green-400';
      default: return 'bg-slate-500/15 border-slate-500/50 text-slate-400';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8 font-sans">
      <header className="flex justify-between items-center mb-10 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tighter text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
            PLAQUE<span className="text-white drop-shadow-none">PAL</span>
          </h1>
          <p className="text-slate-500 font-medium">MedTech Sprintathon | Real-Time Telemetry</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 rounded-full border border-slate-800 backdrop-blur-sm">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {isConnected ? 'System Ready' : 'System Offline'}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* ========================================================= */}
        {/* MAIN ULTRASOUND VIEWPORT (FRIENDLIER STYLE EDIT)          */}
        {/* ========================================================= */}
        <div className="col-span-8 aspect-video bg-slate-900 rounded-3xl border-2 border-slate-800 relative shadow-2xl overflow-hidden group">
          
          {/* Ultrasound Background */}
          <img 
            src="https://images.unsplash.com/photo-1530497610245-94d3c16cda28?auto=format&fit=crop&q=80&w=1000" 
            alt="Simulated Ultrasound" 
            className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale mix-blend-screen"
          />
          
          {/* Scanline Overlay */}
          <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.3)_2px,rgba(0,0,0,0.3)_4px)] pointer-events-none"></div>

          {/* 1. STATE Banner - Softer edges (rounded-2xl) and reduced weight (extrabold) */}
          <div className={`absolute top-6 left-6 px-8 py-4 rounded-2xl border-2 ${getStateColor()} font-extrabold text-2xl tracking-tight z-10 shadow-lg backdrop-blur-sm`}>
            STATE: {state}
          </div>

          {/* 2. ANGLE Indicator - Softer edges and reduced weight */}
          <div className={`absolute top-6 right-6 px-8 py-4 rounded-2xl border-2 ${angleCorrect ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-red-500/20 border-red-500 text-red-400'} font-extrabold text-2xl tracking-tight z-10 shadow-lg backdrop-blur-sm`}>
            ANGLE: {typeof angle === 'number' ? angle.toFixed(1) : '0'}°
          </div>

          {/* 3. Main Instruction Display - Reduced weight (bold) and Sentence case (less shouty) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center w-[90%]">
            <p className="text-6xl font-bold tracking-tighter text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.9)]">
              {instruction}
            </p>
          </div>

          {/* Guidance Messages (Softer styling) */}
          {guidance && guidance.length > 0 && (
            <div className="absolute bottom-4 left-4 bg-slate-950/80 border border-slate-700 rounded-2xl p-6 max-w-sm backdrop-blur-sm">
              {guidance.map((msg, idx) => (
                <p key={idx} className="text-sm font-medium text-yellow-400 mb-2 last:mb-0">
                  ⚠️ {msg}
                </p>
              ))}
            </div>
          )}

          {/* Connection Warning */}
          {!isConnected && (
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-20">
              <div className="text-center bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl">
                <Activity size={48} className="mx-auto mb-4 text-slate-500 animate-bounce" />
                <p className="text-slate-300 font-mono text-sm uppercase tracking-[0.1em] font-bold">
                  Awaiting Backend Connection...
                </p>
                <p className="text-slate-500 text-xs mt-2">Make sure python main.py is running</p>
              </div>
            </div>
          )}
        </div>
        {/* ========================================================= */}
        {/* END EDITED SECTION                                        */}
        {/* ========================================================= */}

        {/* Real-time Metrics (Subtly softened fonts) */}
        <div className="col-span-4 space-y-6 flex flex-col">
          {/* Pressure Card with Graph */}
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800">
            <div className="flex justify-between items-end mb-4">
              <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-widest">Live Probe Pressure</h3>
              <span className={`text-3xl font-mono font-semibold ${pressure > 80 ? 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]'}`}>
                {typeof pressure === 'number' ? pressure : 0}%
              </span>
            </div>
            
            <div style={{ height: '96px', width: '100%', minHeight: '96px' }} className="mb-4 opacity-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <YAxis domain={[0, 100]} hide={true} />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke={pressure > 80 ? "#ef4444" : "#22d3ee"} 
                    strokeWidth={3} 
                    dot={false}
                    isAnimationActive={false} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ease-out ${pressure > 80 ? 'bg-red-500' : 'bg-cyan-500'}`}
                style={{ width: `${Math.min(pressure, 100)}%` }}
              ></div>
            </div>

            {state === 'HOLDING' && (
              <div className="mt-6">
                <p className="text-xs text-slate-400 mb-2">Hold Progress: {holdProgress.toFixed(1)}%</p>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
                    style={{ width: `${holdProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* Device Status (Subtly softened fonts) */}
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 flex-grow">
            <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-widest mb-6">Device Status</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm font-medium">
                <Wifi size={18} className={statusColor} />
                <span>WebSocket: <span className={statusColor}>{wsStatus}</span></span>
              </div>
              <div className="flex items-center gap-4 text-sm font-medium">
                <ShieldAlert size={18} className={statusColor === 'text-green-500' ? 'text-cyan-500' : 'text-slate-600'} />
                <span>State: <span className="text-slate-400">{state}</span></span>
              </div>
              <div className="flex items-center gap-4 text-sm font-medium">
                <Activity size={18} className="text-cyan-500" />
                <span>Angle: <span className="text-slate-400">{typeof angle === 'number' ? angle.toFixed(1) : '0'}°</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
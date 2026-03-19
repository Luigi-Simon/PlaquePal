import React, { useState, useEffect, useRef } from 'react';
import { Activity, ShieldAlert, Zap, Wifi, CheckCircle2, Award } from 'lucide-react';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';

export default function App() {
  const [pressure, setPressure] = useState(0);
  const [chartData, setChartData] = useState(Array(20).fill({ value: 0 }));
  
  const [state, setState] = useState('POSITIONING');
  const [instruction, setInstruction] = useState('Adjust probe position');
  const [angle, setAngle] = useState({ current: 0, latitude: 0, longitude: 0 });
  const [angleCorrect, setAngleCorrect] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [guidance, setGuidance] = useState([]);
  
  const [wsStatus, setWsStatus] = useState('Connecting...');
  const [statusColor, setStatusColor] = useState('text-yellow-500');
  const [isConnected, setIsConnected] = useState(false);

  // Triggers the automatic report display
  const [showReport, setShowReport] = useState(false);
  
  // WebSocket reference
  const wsRef = useRef(null);

  useEffect(() => {
    let reconnectTimeout = null;
    let pingInterval = null;
    let isIntentionallyClosed = false;

    const connectWebSocket = () => {
      try {
        if (isIntentionallyClosed) return;

        const ws = new WebSocket('ws://localhost:8000/ws');
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('✅ Connected to backend');
          setWsStatus('Live Connection Established');
          setStatusColor('text-green-500');
          setIsConnected(true);
          
          // Send initial ping
          ws.send(JSON.stringify({ type: 'ping', message: 'Frontend connected' }));
          
          // Clear any existing ping interval
          if (pingInterval) clearInterval(pingInterval);
          
          // Set up periodic ping to keep connection alive
          pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 30000);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('📨 Received from backend:', data);
            
            // Update pressure and graph
            if (data.pressure !== undefined) {
              const pressureValue = Number(data.pressure);
              if (!isNaN(pressureValue)) {
                setPressure(pressureValue);
                setChartData(prevData => {
                  const newData = [...prevData.slice(1), { value: pressureValue }];
                  return newData;
                });
              }
            }
            
            // Update state
            if (data.state) {
              const newState = data.state;
              setState(newState);
              
              // Show report card when SUCCESS is reached
              if (newState === 'SUCCESS') {
                setShowReport(true);
              } else if (newState === 'POSITIONING') {
                // Hide report if we go back to positioning
                setShowReport(false);
              }
            }
            
            // Update instruction
            if (data.instruction) {
              setInstruction(data.instruction);
            }
            
            // Update angle
            if (data.angle) {
              if (typeof data.angle === 'object' && data.angle.current !== undefined) {
                setAngle({
                  current: Number(data.angle.current) || 0,
                  latitude: Number(data.angle.latitude) || 0,
                  longitude: Number(data.angle.longitude) || 0
                });
                setAngleCorrect(data.angle.is_correct === true);
              } else if (typeof data.angle === 'number') {
                setAngle({
                  current: data.angle,
                  latitude: 0,
                  longitude: 0
                });
              }
            }
            
            // Update progress
            if (data.hold_progress !== undefined) {
              const progress = Number(data.hold_progress);
              if (!isNaN(progress)) {
                setHoldProgress(Math.min(100, Math.max(0, progress)));
              }
            }
            
            // Update guidance
            if (Array.isArray(data.guidance)) {
              setGuidance(data.guidance);
            } else {
              setGuidance([]);
            }
            
          } catch (error) {
            console.error("❌ Error parsing data:", error);
          }
        };

        ws.onclose = (event) => {
          console.log('❌ Disconnected from backend', event.code);
          setWsStatus('Disconnected - Reconnecting...');
          setStatusColor('text-red-500');
          setIsConnected(false);
          
          if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
          }
          
          // Only reconnect if not intentionally closed
          if (!isIntentionallyClosed && event.code !== 1000) {
            reconnectTimeout = setTimeout(() => {
              console.log('🔄 Attempting to reconnect...');
              connectWebSocket();
            }, 3000);
          }
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
        
        if (!isIntentionallyClosed) {
          reconnectTimeout = setTimeout(connectWebSocket, 5000);
        }
      }
    };

    // Initial connection
    connectWebSocket();

    // Cleanup
    return () => {
      isIntentionallyClosed = true;
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, "Component unmounting");
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (pingInterval) {
        clearInterval(pingInterval);
      }
    };
  }, []);

  // Handle restarting the scan from SUCCESS state
  const handleNewScan = () => {
    console.log('🔄 Requesting new scan...');
    
    // Send reset command to backend
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        command: 'RESET_SCAN',
        timestamp: Date.now()
      }));
      console.log('✅ Reset command sent to backend');
    }
    
    // Immediately update frontend UI
    setState('POSITIONING');
    setHoldProgress(0);
    setShowReport(false);
    setInstruction('Adjust probe position');
    setGuidance([]);
  };

  // Color based on state
  const getStateColorText = () => {
    switch(state) {
      case 'POSITIONING': return 'text-yellow-400';
      case 'SCANNING': return 'text-blue-400';
      case 'SUCCESS': return 'text-green-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8 font-sans transition-colors duration-500">
      <header className="flex justify-between items-center mb-10 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tighter text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
            PLAQUE<span className="text-white drop-shadow-none">PAL</span>
          </h1>
          <p className="text-slate-500 font-medium">MedTech Sprintathon | Real-Time Telemetry Guidance</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 rounded-full border border-slate-800 backdrop-blur-sm shadow-inner">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {isConnected ? 'Link Live' : 'Link Offline'}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* MAIN ULTRASOUND VIEWPORT & GUIDANCE LOOP */}
        <div className="col-span-8 aspect-video bg-slate-900 rounded-3xl border-2 border-slate-800 relative shadow-2xl overflow-hidden group">
          
          {/* Ultrasound Background */}
          <img 
            src="https://images.unsplash.com/photo-1530497610245-94d3c16cda28?auto=format&fit=crop&q=80&w=1000" 
            alt="Simulated Ultrasound" 
            className={`absolute inset-0 w-full h-full object-cover opacity-30 grayscale mix-blend-screen transition-all duration-700 ${showReport ? 'blur-lg scale-110 opacity-10' : ''}`}
          />
          
          {/* Scanline Overlay */}
          <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.3)_2px,rgba(0,0,0,0.3)_4px)] pointer-events-none opacity-50"></div>

          {/* Regular Scanning UI */}
          {!showReport && (
            <>
              {/* ANGLE Indicator */}
              <div className={`absolute top-6 right-6 px-6 py-3 rounded-2xl border-2 ${angleCorrect ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-red-500/20 border-red-500 text-red-400'} font-extrabold text-lg z-10 shadow-lg backdrop-blur-sm transition-all duration-300`}>
                <span className="text-slate-400 font-medium mr-2 text-sm uppercase tracking-wider">Probe Angle:</span>
                {typeof angle.current === 'number' ? angle.current.toFixed(1) : '0.0'}°
              </div>

              {/* Main Feedback Loop */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center w-[90%] z-10">
                <p className={`text-8xl font-black tracking-tight transition-all duration-300 ${angleCorrect && pressure <= 80 ? 'text-green-400 drop-shadow-[0_0_30px_rgba(74,222,128,0.7)]' : pressure > 80 ? 'text-red-400 drop-shadow-[0_0_30px_rgba(248,113,113,0.7)]' : 'text-cyan-300 drop-shadow-[0_0_30px_rgba(34,211,238,0.7)]'}`}>
                  {instruction}
                </p>
                
                {/* Visual Angle Cue */}
                {Math.abs(angle.latitude) > 5 && (
                   <Zap className={`mx-auto mt-8 animate-pulse ${angle.latitude < -45 ? 'rotate-180 text-yellow-500' : 'text-yellow-500'}`} size={48} />
                )}
              </div>

              {/* Guidance Messages */}
              {guidance && guidance.length > 0 && state !== 'SUCCESS' && (
                <div className="absolute bottom-6 left-6 bg-slate-950/90 border border-slate-700 rounded-2xl p-6 max-w-sm backdrop-blur-sm z-10 shadow-xl">
                  <p className="text-xs font-semibold uppercase text-slate-500 tracking-widest mb-3">Live Corrections</p>
                  {guidance.map((msg, idx) => (
                    <p key={idx} className="text-sm font-medium text-yellow-400 mb-2 last:mb-0 flex items-center gap-2">
                      <span>⚠️</span> {msg}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}

          {/* SUCCESS REPORT CARD */}
          {showReport && (
            <div className="absolute inset-0 bg-slate-900 z-40 p-10 flex flex-col animate-in slide-in-from-bottom-6 duration-700 ease-out overflow-y-auto border-t-4 border-green-500/80">
              
              <div className="flex justify-between items-center mb-10 border-b border-slate-800 pb-6">
                <div>
                  <div className="flex items-center gap-4 mb-1">
                    <CheckCircle2 size={36} className="text-green-500" />
                    <h2 className="text-4xl font-extrabold text-white tracking-tighter">Diagnostic Report Card</h2>
                  </div>
                  <p className="text-slate-500 font-medium">Carotid Artery Plaque Assessment</p>
                </div>
                <div className="text-right">
                  <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 px-6 py-2 rounded-full text-base font-bold tracking-widest uppercase shadow-lg">
                    Risk Level: Moderate
                  </span>
                  <p className="text-xs text-slate-600 mt-2 font-mono">Scan ID: PKPL-{new Date().toISOString().slice(11,19).replace(/:/g, '')}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-8 mb-10">
                {/* AI Findings */}
                <div className="bg-slate-950/60 p-8 rounded-3xl border border-slate-800 shadow-inner group transition-all hover:border-slate-700">
                  <p className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-3">Estimated Plaque Burden</p>
                  <p className="text-5xl font-extrabold text-white tracking-tight">32%</p>
                  <p className="text-yellow-500 text-sm mt-3 flex items-center gap-2">
                    <ShieldAlert size={16} /> Significant stenosis present.
                  </p>
                </div>
                
                <div className="bg-slate-950/60 p-8 rounded-3xl border border-slate-800 shadow-inner transition-all hover:border-slate-700">
                  <p className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-3">Max Vessel Narrowing</p>
                  <p className="text-5xl font-extrabold text-white tracking-tight">1.2<span className="text-2xl text-slate-500">mm</span></p>
                  <p className="text-green-500 text-sm mt-3 flex items-center gap-2">
                    <CheckCircle2 size={16} /> Luminal diameter acceptable.
                  </p>
                </div>

                {/* SQS Score */}
                <div className="bg-slate-950 p-8 rounded-3xl border border-slate-700 col-span-2 relative shadow-2xl transition-all hover:border-cyan-800 hover:shadow-cyan-900/30">
                  <Award className="absolute top-6 right-8 text-cyan-600 opacity-50" size={56} />
                  <p className="text-cyan-400 text-sm font-bold uppercase tracking-wider mb-3">Composite Scan Quality Score (SQS)</p>
                  <p className="text-7xl font-black text-white tracking-tighter">94<span className="text-3xl text-slate-600"> / 100</span></p>
                  <div className="mt-5 grid grid-cols-3 gap-3 text-xs font-mono text-slate-500 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                    <span>Angle Accuracy: 35/35</span>
                    <span>Pressure Optimization: 30/30</span>
                    <span>Hold Stability: 29/35</span>
                  </div>
                  <p className="text-cyan-400 text-sm font-medium mt-4">Scan accepted for AI interpretation.</p>
                </div>
              </div>

              {/* Action Area */}
              <div className="mt-auto pt-8 border-t border-slate-800 flex justify-between items-center bg-slate-900 p-6 rounded-2xl -mx-4">
                <p className="text-slate-400 text-sm max-w-md">Data archived to Patient Medical Record. Verify AI findings with cart-based ultrasound if needed.</p>
                <div className="flex gap-4">
                  <button className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-6 py-3 rounded-full transition-colors">
                    Print / Export
                  </button>
                  <button 
                    onClick={handleNewScan}
                    className="bg-cyan-500 hover:bg-cyan-400 hover:scale-105 transform text-slate-950 font-bold px-8 py-3 rounded-full transition-all shadow-lg"
                  >
                    Start New Scan Sequence
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Connection Warning */}
          {!isConnected && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 animate-in fade-in duration-500">
              <div className="text-center bg-slate-900 border border-slate-700 p-10 rounded-3xl shadow-2xl scale-110">
                <Activity size={56} className="mx-auto mb-5 text-slate-600 animate-bounce" />
                <p className="text-slate-300 font-mono text-sm uppercase tracking-[0.2em] font-bold">
                  Awaiting Backend Link...
                </p>
                <p className="text-slate-600 text-xs mt-3">Make sure Python backend is active</p>
              </div>
            </div>
          )}
        </div>

        {/* Real-time Metrics Sidebar */}
        <div className="col-span-4 space-y-6 flex flex-col">
          {/* Pressure Card with Graph */}
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
            <div className="flex justify-between items-end mb-4">
              <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-widest">Live Probe Pressure</h3>
              <span className={`text-3xl font-mono font-semibold ${pressure > 80 ? 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]' : pressure === 0 ? 'text-slate-600' : 'text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]'}`}>
                {typeof pressure === 'number' ? pressure.toFixed(0) : 0}%
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

            {/* Hold Progress Bar */}
            <div className={`mt-6 transition-opacity duration-300 ${state === 'SCANNING' || state === 'SUCCESS' ? 'opacity-100' : 'opacity-20'}`}>
              <p className="text-xs text-slate-400 mb-2 font-mono uppercase tracking-widest">Capture Stability: {holdProgress.toFixed(0)}%</p>
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700 shadow-inner">
                <div 
                  className={`h-full bg-gradient-to-r ${state === 'SUCCESS' ? 'from-green-500 to-emerald-400' : 'from-purple-500 to-blue-500'} transition-all duration-150 ease-linear`}
                  style={{ width: `${holdProgress}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Device Status & Raw Telemetry Data */}
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 flex-grow shadow-xl">
            <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-widest mb-6">Device Telemetry Status</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm font-medium">
                <Wifi size={18} className={statusColor} />
                <span>WebSocket: <span className={statusColor}>{wsStatus}</span></span>
              </div>
              <div className="flex items-center gap-4 text-sm font-medium">
                <ShieldAlert size={18} className={statusColor === 'text-green-500' ? 'text-cyan-500' : 'text-slate-600'} />
                <span>State: <span className={`${getStateColorText()} uppercase tracking-wider`}>{state}</span></span>
              </div>
              <div className="flex items-center gap-4 text-sm font-medium">
                <Activity size={18} className="text-cyan-500" />
                <span>Live Angle: <span className="text-slate-400 font-mono text-base">{typeof angle.current === 'number' ? angle.current.toFixed(1) : '0.0'}°</span></span>
              </div>
              <div className="flex items-center gap-4 text-sm font-medium">
                <Zap size={18} className="text-yellow-500" />
                <span>Raw Lat/Lon: <span className="text-slate-500 font-mono">{angle.latitude.toFixed(1)}° / {angle.longitude.toFixed(1)}°</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



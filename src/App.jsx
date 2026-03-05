import React, { useState, useEffect } from 'react';
import { Activity, ShieldAlert, Zap, Wifi } from 'lucide-react';
// NEW: Import Recharts
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';

export default function App() {
  const [pressure, setPressure] = useState(0);
  // NEW: State to hold the history of pressure readings for the graph
  const [chartData, setChartData] = useState(Array(20).fill({ value: 0 }));
  
  const [wsStatus, setWsStatus] = useState('Connecting...');
  const [statusColor, setStatusColor] = useState('text-yellow-500');

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws');

    ws.onopen = () => {
      setWsStatus('Live Connection Established');
      setStatusColor('text-green-500');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.pressure !== undefined) {
          const newPressure = data.pressure;
          setPressure(newPressure);
          
          // NEW: Update the graph data (remove oldest, add newest)
          setChartData(prevData => {
            const newData = [...prevData.slice(1), { value: newPressure }];
            return newData;
          });
        }
      } catch (error) {
        console.error("Error reading Arduino data:", error);
      }
    };

    ws.onclose = () => {
      setWsStatus('Disconnected - Check Backend');
      setStatusColor('text-red-500');
    };

    return () => ws.close();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8 font-sans">
      <header className="flex justify-between items-center mb-10 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)]">
            PLAQUE<span className="text-white drop-shadow-none">PAL</span>
          </h1>
          <p className="text-slate-500 font-medium">MedTech Sprintathon | Real-Time Telemetry</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 rounded-full border border-slate-800">
          <div className={`w-2 h-2 rounded-full ${statusColor === 'text-green-500' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {statusColor === 'text-green-500' ? 'System Ready' : 'System Offline'}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Main Ultrasound Viewport */}
{/* Main Ultrasound Viewport */}
        <div className="col-span-8 aspect-video bg-slate-900 rounded-3xl border-2 border-slate-800 relative shadow-2xl overflow-hidden group">
          
          {/* FAKE ULTRASOUND BACKGROUND */}
          {/* A dark grayscale image to simulate an ultrasound feed. You can swap the src with a real local image later! */}
          <img 
            src="https://images.unsplash.com/photo-1530497610245-94d3c16cda28?auto=format&fit=crop&q=80&w=1000" 
            alt="Simulated Ultrasound" 
            className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale mix-blend-screen"
          />
          
          {/* Scanline Overlay Effect for that medical monitor vibe */}
          <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.3)_2px,rgba(0,0,0,0.3)_4px)] pointer-events-none"></div>

          {/* === MEDIAPIPE MOCKUP OVERLAYS === */}
          
          {/* Bounding Box 1: Carotid Artery Tracking */}
          <div className="absolute top-[25%] left-[20%] w-[50%] h-[40%] border-2 border-cyan-400 rounded bg-cyan-400/10 shadow-[0_0_15px_rgba(34,211,238,0.3)] transition-all duration-700 ease-in-out hover:bg-cyan-400/20">
            <div className="absolute -top-6 left-[-2px] bg-cyan-400 text-slate-950 text-[10px] font-bold px-2 py-1 rounded-t tracking-wider">
              CAROTID_ARTERY : 98.2%
            </div>
            {/* Corner brackets for extra tech feel */}
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-300"></div>
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-300"></div>
          </div>

          {/* Bounding Box 2: Plaque Detection (Danger!) */}
          <div className="absolute top-[40%] left-[45%] w-[15%] h-[20%] border-2 border-red-500 rounded bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse">
            <div className="absolute -top-6 left-[-2px] bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-t tracking-wider flex items-center gap-1">
              <ShieldAlert size={10} /> PLAQUE_DETECTED : 89.4%
            </div>
            {/* Crosshair target in the middle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-500/50">
               +
            </div>
          </div>

          {/* Viewport Telemetry Overlay */}
          <div className="absolute bottom-4 left-4 flex gap-3">
            <span className="bg-slate-950/80 border border-slate-700 text-cyan-400 text-xs px-3 py-1.5 rounded-md font-mono backdrop-blur-md flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
              FPS: 24.1
            </span>
            <span className="bg-slate-950/80 border border-slate-700 text-slate-400 text-xs px-3 py-1.5 rounded-md font-mono backdrop-blur-md">
              AI: MediaPipe Vision
            </span>
          </div>

          {/* Center Connection Warning (Fades out if we get a real connection) */}
          {statusColor !== 'text-green-500' && (
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-20">
              <div className="text-center bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl">
                <Activity size={48} className="mx-auto mb-4 text-slate-500 animate-bounce" />
                <p className="text-slate-300 font-mono text-sm uppercase tracking-[0.1em] font-bold">
                  Awaiting Probe Camera Feed...
                </p>
                <p className="text-slate-500 text-xs mt-2">Hardware syncing in progress</p>
              </div>
            </div>
          )}
        </div>
        {/* Real-time Metrics */}
        <div className="col-span-4 space-y-6 flex flex-col">
          {/* Pressure Card with Graph */}
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800">
            <div className="flex justify-between items-end mb-4">
              <h3 className="text-xs font-bold uppercase text-slate-500 tracking-widest">Live Probe Pressure</h3>
              <span className={`text-3xl font-mono font-bold ${pressure > 80 ? 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]'}`}>
                {pressure}%
              </span>
            </div>
            
            {/* The Recharts Graph */}
            <div className="h-24 w-full mb-4 opacity-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <YAxis domain={[0, 100]} hide={true} />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke={pressure > 80 ? "#ef4444" : "#22d3ee"} 
                    strokeWidth={3} 
                    dot={false}
                    isAnimationActive={true} 
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
            <button 
              onClick={() => {
                const testVal = Math.floor(Math.random() * 100);
                setPressure(testVal);
                setChartData(prev => [...prev.slice(1), { value: testVal }]);
              }} 
              className="text-xs font-bold tracking-widest bg-slate-800 hover:bg-slate-700 p-3 rounded-xl text-cyan-400 w-full mt-6 transition-colors border border-slate-700"
            >
              [TEST] INJECT FAKE ARDUINO DATA
            </button>
          </div>

          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 flex-grow">
            <h3 className="text-xs font-bold uppercase text-slate-500 tracking-widest mb-6">Device Status</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <Wifi size={18} className={statusColor} />
                <span>WebSocket: <span className={statusColor}>{wsStatus}</span></span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <ShieldAlert size={18} className={statusColor === 'text-green-500' ? 'text-cyan-500' : 'text-slate-600'} />
                <span>Arduino: <span className="text-slate-400">Syncing...</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
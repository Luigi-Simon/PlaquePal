import React, { useState } from 'react';
import { Activity, ShieldAlert, Zap } from 'lucide-react';

export default function App() {
  const [pressure, setPressure] = useState(45); // This simulates Jin En's hardware input

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8 font-sans">
      <header className="flex justify-between items-center mb-10 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)]">
  PLAQUE<span className="text-white drop-shadow-none">PAL</span>
</h1>
          <p className="text-slate-500 font-medium">MedTech Sprintathon 2026 | Team Simon</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 rounded-full border border-slate-800">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">System Ready</span>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Main Ultrasound Viewport */}
        <div className="col-span-8 aspect-video bg-slate-900 rounded-3xl border-2 border-slate-800 flex items-center justify-center relative shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-500/5 to-transparent"></div>
          <div className="text-center z-10">
          <Activity size={80} className="mx-auto mb-4 text-cyan-400 drop-shadow-[0_0_25px_rgba(34,211,238,0.8)]" />
            <p className="text-slate-500 font-mono text-sm uppercase tracking-[0.2em]">Waiting for Feed...</p>
          </div>
        </div>

        {/* Real-time Metrics */}
        <div className="col-span-4 space-y-6">
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800">
            <div className="flex justify-between items-end mb-4">
              <h3 className="text-xs font-bold uppercase text-slate-500 tracking-widest">Probe Pressure</h3>
              <span className={`text-2xl font-mono font-bold ${pressure > 80 ? 'text-red-500' : 'text-cyan-400'}`}>
                {pressure}%
              </span>
            </div>
            <input 
              type="range" 
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              value={pressure}
              onChange={(e) => setPressure(e.target.value)}
            />
          </div>

          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 flex-grow">
            <h3 className="text-xs font-bold uppercase text-slate-500 tracking-widest mb-6">Device Status</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <Zap size={18} className="text-yellow-500" />
                <span>WebSocket: <span className="text-slate-500">Connecting...</span></span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <ShieldAlert size={18} className="text-cyan-500" />
                <span>Arduino: <span className="text-green-500">COM3 Active</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { Activity, ShieldAlert, Zap, Wifi } from 'lucide-react';

export default function ScanResult({ data, onClose, onNewScan }) {
  // If no data is passed, don't render anything
  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-md transition-all">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Modal Header */}
        <div className="bg-slate-800 p-6 flex justify-between items-center border-b border-slate-700">
          <div>
            <h2 className="text-3xl font-extrabold text-white">Diagnostic Report</h2>
            <p className="text-slate-400 text-sm font-medium mt-1">Scan ID: {data.scanId} | AI-Assisted Evaluation</p>
          </div>
          <div className={`px-6 py-2 rounded-xl border-2 font-extrabold text-2xl tracking-tight 
            ${data.overallRisk === 'HIGH' ? 'bg-red-500/20 border-red-500 text-red-400' : 
              data.overallRisk === 'MODERATE' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' : 
              'bg-green-500/20 border-green-500 text-green-400'}`}>
            RISK: {data.overallRisk}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-8 grid grid-cols-2 gap-8">
          
          {/* Left Column: Metrics */}
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold uppercase text-slate-500 tracking-widest mb-3">AI Diagnostic Results</h3>
              <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800">
                <div className="flex justify-between mb-2">
                  <span className="text-slate-300">Plaque Burden Score</span>
                  <span className="text-cyan-400 font-bold">{data.diagnosticResults.plaqueBurdenScore} / 100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Vessel Narrowing</span>
                  <span className="text-yellow-400 font-bold">{data.diagnosticResults.vesselNarrowingPct}%</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase text-slate-500 tracking-widest mb-3">Scan Quality Verification</h3>
              <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800 flex items-center gap-4">
                <ShieldAlert size={32} className="text-green-500" />
                <div>
                  <p className="text-white font-bold">Diagnostic Quality Achieved</p>
                  <p className="text-slate-400 text-sm">Average Pressure: {data.scanQualityMetrics.averagePressurePct}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Recommendations */}
          <div>
            <h3 className="text-sm font-semibold uppercase text-slate-500 tracking-widest mb-3">Clinical Recommendations</h3>
            <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800 h-full">
              <ul className="space-y-4">
                {data.clinicalRecommendations.map((rec, idx) => (
                  <li key={idx} className="flex gap-3 text-slate-300">
                    <span className="text-cyan-500 font-bold">→</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-950 p-6 flex justify-end gap-4 border-t border-slate-800">
          <button 
            onClick={onClose}
            className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:bg-slate-800 transition-colors"
          >
            Close Report
          </button>
          <button 
            onClick={onNewScan}
            className="px-6 py-3 bg-cyan-500/20 border border-cyan-500 text-cyan-400 rounded-xl font-bold hover:bg-cyan-500 hover:text-slate-950 transition-all"
          >
            Start New Patient Scan
          </button>
        </div>

      </div>
    </div>
  );
}
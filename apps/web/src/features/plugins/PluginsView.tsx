import React, { useState } from 'react';
import { GlassCard } from '../../components/GlassCard';
import { api } from '../../lib/api';
import { QrCode, Smartphone, CheckCircle, RefreshCw } from 'lucide-react';

export const PluginsView: React.FC = () => {
  const [tuyaQr, setTuyaQr] = useState<string | null>(null);
  const [loadingTuya, setLoadingTuya] = useState<boolean>(false);

  const handleGenerateTuyaQr = async () => {
    setLoadingTuya(true);
    try {
      const session = await api.createTuyaQrSession();
      setTuyaQr(session.session_id);
    } catch {
      // Mock fallback session
      setTuyaQr('tuya_mock_session_' + Date.now());
    } finally {
      setLoadingTuya(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Hardware Integrations & Plugins</h2>
        <p className="text-slate-400 text-sm">
          Connect device ecosystems: Tuya QR pairing, Tapo Smart, Xiaomi MiHome, and MQTT.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tuya QR Code Pairing */}
        <GlassCard className="p-6 md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-lg">Tuya Smart Life (Scan QR)</h3>
                <p className="text-xs text-slate-400">Zero-admin panel setup via official mobile app QR scan</p>
              </div>
            </div>
            <span className="px-2.5 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              Ready
            </span>
          </div>

          <div className="bg-white/[0.02] p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row items-center gap-6">
            <div className="w-48 h-48 rounded-xl bg-white/10 flex flex-col items-center justify-center p-3 border border-white/10 relative">
              {tuyaQr ? (
                <div className="text-center p-2">
                  {/* Visual QR placeholder */}
                  <div className="w-32 h-32 bg-white rounded-lg flex items-center justify-center p-2 text-black font-mono text-[9px] break-all">
                    [TUYA QR TOKEN] {tuyaQr.slice(0, 20)}...
                  </div>
                  <span className="text-[10px] text-emerald-400 block mt-2 font-mono">Scan in SmartLife App</span>
                </div>
              ) : (
                <div className="text-center text-slate-400 text-xs p-4">
                  <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <span>Click generate to initiate QR pairing</span>
                </div>
              )}
            </div>

            <div className="space-y-3 flex-1 text-sm text-slate-300">
              <h4 className="font-semibold text-white">How to pair:</h4>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-400">
                <li>Open the <span className="text-slate-200">Smart Life</span> or <span className="text-slate-200">Tuya Smart</span> mobile app.</li>
                <li>Go to <span className="text-slate-200">Me &gt; Scan QR Code</span>.</li>
                <li>Scan the QR code generated here and approve the authentication request.</li>
                <li>All your Tuya switches and air purifiers sync automatically into Docus.</li>
              </ol>

              <button
                onClick={handleGenerateTuyaQr}
                disabled={loadingTuya}
                className="mt-3 px-4 py-2.5 rounded-xl glass-button text-cyan-300 font-semibold border-cyan-500/30 flex items-center gap-2 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTuya ? 'animate-spin' : ''}`} />
                {tuyaQr ? 'Regenerate QR Code' : 'Generate Pairing QR'}
              </button>
            </div>
          </div>
        </GlassCard>

        {/* Tapo Integration */}
        <GlassCard className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-white">TP-Link Tapo</h3>
              <p className="text-xs text-slate-400">Local LAN device control</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Direct high-speed local control for P100/P110 plugs and L530 bulbs without cloud delays.
          </p>
          <button className="w-full py-2.5 rounded-xl glass-button text-xs text-cyan-300 border-cyan-500/30 font-semibold">
            Configure Tapo Credentials
          </button>
        </GlassCard>

        {/* Xiaomi MiHome */}
        <GlassCard className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Xiaomi Smart</h3>
              <p className="text-xs text-slate-400">Air purifiers & sensors</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Syncs Mi Air Purifiers, temperature sensors, and robot vacuums directly.
          </p>
          <button className="w-full py-2.5 rounded-xl glass-button text-xs text-cyan-300 border-cyan-500/30 font-semibold">
            Connect Xiaomi Account
          </button>
        </GlassCard>

        {/* Local MQTT Broker */}
        <GlassCard className="p-6 md:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-semibold text-white">Local MQTT Broker & Zigbee2MQTT</h3>
              <p className="text-xs text-slate-400">Embedded or external Mosquitto broker bridge</p>
            </div>
            <span className="font-mono text-xs text-cyan-400">127.0.0.1:1883</span>
          </div>
          <p className="text-xs text-slate-400">
            Publish and listen to state topics with sub-millisecond latencies across local switches and sensors.
          </p>
        </GlassCard>
      </div>
    </div>
  );
};

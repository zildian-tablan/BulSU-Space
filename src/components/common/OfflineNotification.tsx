import React, { useState, useEffect } from 'react';
import { networkService } from '../../services/networkService';

interface OfflineNotificationProps {
  onRefresh: () => void;
}

const OfflineNotification: React.FC<OfflineNotificationProps> = ({ onRefresh }) => {
  const [expanded, setExpanded] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [firebaseConnected, setFirebaseConnected] = useState(true);
  const [showFirebaseStatus, setShowFirebaseStatus] = useState(false);

  // Subscribe to network service status
  useEffect(() => {
    const unsubscribe = networkService.subscribe((isConnected) => {
      setFirebaseConnected(isConnected);
      // Show Firebase status indicator if it's different than browser online status
      setShowFirebaseStatus(isConnected !== navigator.onLine);
    });

    // Initialize network service
    networkService.initialize();

    return () => {
      unsubscribe();
    };
  }, []);

  // Handle manual reconnect attempt
  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await networkService.reconnect();
      // Only refresh page if reconnection was successful
      if (firebaseConnected) {
        onRefresh();
      }
    } catch (error) {
      console.error('Reconnection failed:', error);
    } finally {
      setReconnecting(false);
    }
  };
  return (
    <div className="fixed inset-x-0 top-0 z-50">
      {/* Banner */}
      <div className="bg-slate-900 text-white shadow-2xl border-b border-slate-700/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="flex-shrink-0 mt-0.5">
                <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-red-500/20 flex items-center justify-center ring-2 ring-red-500/30">
                  <div className="h-2 w-2 rounded-full bg-red-400 animate-pulse"></div>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-sm sm:text-base text-white truncate">
                  No internet connection
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                  Check your network settings to continue
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <button 
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-white transition-colors duration-200 group"
              >
                <span>{expanded ? 'Hide' : 'Help'}</span>
                <svg 
                  className={`h-3 w-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>              <button 
                onClick={handleReconnect} 
                disabled={reconnecting}
                className={`
                  relative overflow-hidden
                  bg-gradient-to-r from-emerald-600 to-green-700 text-white 
                  hover:from-emerald-500 hover:to-green-600 
                  active:from-emerald-700 active:to-green-800
                  text-xs sm:text-sm font-semibold 
                  py-2.5 px-4 sm:px-5 rounded-xl 
                  transition-all duration-300 ease-out
                  flex items-center gap-2.5
                  shadow-lg hover:shadow-emerald-500/25 hover:shadow-xl
                  disabled:opacity-60 disabled:cursor-not-allowed 
                  disabled:hover:from-emerald-600 disabled:hover:to-green-700
                  disabled:hover:shadow-lg
                  min-w-0 flex-shrink-0
                  transform hover:scale-105 active:scale-95
                  ${reconnecting ? 'animate-pulse' : ''}
                `}
              >
                {/* Background shimmer effect when loading */}
                {reconnecting && (
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                )}
                
                {reconnecting ? (
                  <>
                    <div className="relative">
                      {/* Outer rotating ring */}
                      <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                        <circle 
                          cx="12" 
                          cy="12" 
                          r="10" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          fill="none" 
                          className="opacity-30"
                        />
                        <circle 
                          cx="12" 
                          cy="12" 
                          r="10" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          fill="none" 
                          strokeDasharray="31.416" 
                          strokeDashoffset="23.562"
                          className="opacity-100"
                          strokeLinecap="round"
                        />
                      </svg>
                      {/* Inner pulsing dot */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-1.5 w-1.5 bg-white rounded-full animate-pulse"></div>
                      </div>
                    </div>
                    <span className="hidden sm:inline font-medium">Connecting...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 sm:h-5 sm:w-5 transition-transform group-hover:rotate-180 duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="font-medium">Retry</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
        {/* Expanded Instructions */}
      {expanded && (
        <div className="bg-white/95 backdrop-blur-sm border-b border-slate-200/50 shadow-xl animate-slideDown">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-5">
            <div className="space-y-4">
              <h3 className="font-semibold text-sm sm:text-base text-slate-800 flex items-center gap-2">
                <svg className="h-4 w-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Connection troubleshooting
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="font-medium text-xs sm:text-sm text-slate-700 uppercase tracking-wide">Quick fixes</h4>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-xs sm:text-sm text-slate-600">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-2 flex-shrink-0"></div>
                      <span>Enable <span className="font-medium text-slate-800">Wi-Fi</span> and connect to a network</span>
                    </li>
                    <li className="flex items-start gap-2 text-xs sm:text-sm text-slate-600">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-2 flex-shrink-0"></div>
                      <span>Turn on <span className="font-medium text-slate-800">Mobile Data</span> in device settings</span>
                    </li>
                    <li className="flex items-start gap-2 text-xs sm:text-sm text-slate-600">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-2 flex-shrink-0"></div>
                      <span>Disable <span className="font-medium text-slate-800">Airplane Mode</span> if enabled</span>
                    </li>
                  </ul>
                </div>
                
                <div className="space-y-3">
                  <h4 className="font-medium text-xs sm:text-sm text-slate-700 uppercase tracking-wide">Advanced steps</h4>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-xs sm:text-sm text-slate-600">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-2 flex-shrink-0"></div>
                      <span>Check signal strength in your area</span>
                    </li>
                    <li className="flex items-start gap-2 text-xs sm:text-sm text-slate-600">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-2 flex-shrink-0"></div>
                      <span>Restart your device if issues persist</span>
                    </li>
                  </ul>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-4 border-t border-slate-200/70">
                <p className="text-xs sm:text-sm text-slate-600">
                  Once connected, use the <span className="font-medium">Retry</span> button above.
                </p>
                
                {/* Network status indicator */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-200">
                  <span className="text-xs text-slate-500">Status:</span>
                  <div className="flex items-center gap-1.5">
                    <div className={`h-2 w-2 rounded-full ${navigator.onLine ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`}></div>
                    <span className="text-xs font-medium text-slate-700">
                      {navigator.onLine ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfflineNotification; 
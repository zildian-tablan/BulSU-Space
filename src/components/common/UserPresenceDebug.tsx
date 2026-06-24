import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../../firebase/config';

const getStatusText = (presence: any, now: number) => {
  if (!presence) return { text: 'No data', color: 'gray' };
  const lastActive = presence.lastActive || 0;
  const state = presence.state;
  const timeSinceActive = now - lastActive;
  if (state === 'online' && timeSinceActive < 60000) return { text: 'Active now', color: 'green' };
  if (state === 'online' && timeSinceActive < 300000) return { text: 'Recently active', color: 'yellow' };
  if (state === 'away') return { text: 'Away', color: 'orange' };
  if (state === 'offline') return { text: 'Offline', color: 'gray' };
  return { text: 'Unknown', color: 'gray' };
};

const UserPresenceDebug: React.FC = () => {
  const { currentUser } = useAuth();
  const [presence, setPresence] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  // Add authentication status
  const isAuthenticated = !!currentUser;

  useEffect(() => {
    if (!currentUser?.id) return;
    const statusRef = ref(rtdb, `status/${currentUser.id}`);
    const unsubscribe = onValue(statusRef, (snapshot) => {
      setPresence(snapshot.val());
      setLastUpdate(Date.now());
    });
    return () => unsubscribe();
  }, [currentUser?.id]);

  const now = Date.now();
  const status = getStatusText(presence, now);
  const lastActive = presence?.lastActive ? new Date(presence.lastActive).toLocaleTimeString() : 'N/A';

  return (
    <div className="mb-4 p-3 rounded-lg bg-gray-900/70 border border-green-700/30">
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-block w-3 h-3 rounded-full bg-${status.color}-400 border border-${status.color}-700`}></span>
        <span className="font-semibold text-green-200 text-xs">Presence Debug</span>
        <span className="ml-auto text-[10px] text-gray-400">{new Date(lastUpdate).toLocaleTimeString()}</span>
      </div>
      <div className="text-xs text-gray-200">
        <div>Status: <span className={`text-${status.color}-300 font-bold`}>{status.text}</span></div>
        <div>State: <span className="text-gray-300">{presence?.state || 'N/A'}</span></div>
        <div>Last Active: <span className="text-gray-300">{lastActive}</span></div>
        <div>Raw: <span className="text-gray-500">{JSON.stringify(presence) || 'No data'}</span></div>
        <div className="mt-2">
          <span className="font-semibold">Auth status:</span> {isAuthenticated ? (
            <span className="text-green-400 font-bold ml-1">Authenticated</span>
          ) : (
            <span className="text-red-400 font-bold ml-1">Not Authenticated</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserPresenceDebug;

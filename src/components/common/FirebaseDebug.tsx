import React, { useEffect, useState } from 'react';
import { ref, get, onValue } from 'firebase/database';
import { rtdb } from '../../firebase/config';

interface FirebaseDebugProps {
  userId?: string;
}

export const FirebaseDebug: React.FC<FirebaseDebugProps> = ({ userId = 'test-user' }) => {
  const [connectionStatus, setConnectionStatus] = useState<boolean | null>(null);
  const [statusData, setStatusData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLog(prev => [...prev, `${timestamp}: ${message}`]);
    console.log(`[FirebaseDebug] ${message}`);
  };

  useEffect(() => {
    addLog('Starting Firebase RTDB debugging...');
    
    const testConnection = async () => {
      try {
        // Test 1: Check connection status
        addLog('Testing connection to .info/connected...');
        const connectedRef = ref(rtdb, '.info/connected');
        const connectedSnapshot = await get(connectedRef);
        const isConnected = connectedSnapshot.val();
        setConnectionStatus(isConnected);
        addLog(`Connection status: ${isConnected ? 'CONNECTED' : 'DISCONNECTED'}`);

        // Test 2: Try to read from status path
        addLog(`Testing read access to status/${userId}...`);
        const statusRef = ref(rtdb, `status/${userId}`);
        const statusSnapshot = await get(statusRef);
        const statusExists = statusSnapshot.exists();
        const statusValue = statusSnapshot.val();
        addLog(`Status path exists: ${statusExists}`);
        addLog(`Status value: ${JSON.stringify(statusValue)}`);
        setStatusData(statusValue);

        // Test 3: Set up real-time listener
        addLog('Setting up real-time listener...');
        const unsubscribe = onValue(statusRef, (snapshot) => {
          const value = snapshot.val();
          addLog(`Real-time update received: ${JSON.stringify(value)}`);
          setStatusData(value);
        }, (error) => {
          addLog(`Real-time listener error: ${error.message}`);
          setError(error.message);
        });

        // Test 4: Try to write to a test path (this will help identify permission issues)
        addLog('Testing write access...');
        try {
          const { set } = await import('firebase/database');
          const testRef = ref(rtdb, `debug-test/${userId}`);
          await set(testRef, {
            timestamp: Date.now(),
            test: true
          });
          addLog('Write test: SUCCESS');
        } catch (writeError: any) {
          addLog(`Write test: FAILED - ${writeError.message}`);
        }

        return unsubscribe;
      } catch (error: any) {
        addLog(`Connection test failed: ${error.message}`);
        setError(error.message);
      }
    };

    testConnection();
  }, [userId]);

  return (
    <div className="p-4 bg-gray-100 rounded-lg max-w-2xl mx-auto">
      <h3 className="text-lg font-bold mb-4">Firebase Realtime Database Debug</h3>
      
      <div className="mb-4">
        <h4 className="font-semibold">Connection Status:</h4>
        <span className={`px-2 py-1 rounded ${
          connectionStatus === true ? 'bg-green-200 text-green-800' :
          connectionStatus === false ? 'bg-red-200 text-red-800' :
          'bg-gray-200 text-gray-800'
        }`}>
          {connectionStatus === null ? 'TESTING...' : 
           connectionStatus ? 'CONNECTED' : 'DISCONNECTED'}
        </span>
      </div>

      {error && (
        <div className="mb-4 p-2 bg-red-100 border border-red-300 rounded">
          <h4 className="font-semibold text-red-800">Error:</h4>
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <div className="mb-4">
        <h4 className="font-semibold">Status Data:</h4>
        <pre className="bg-white p-2 rounded border overflow-auto text-xs">
          {JSON.stringify(statusData, null, 2) || 'No data'}
        </pre>
      </div>

      <div className="mb-4">
        <h4 className="font-semibold">Debug Log:</h4>
        <div className="bg-white p-2 rounded border max-h-60 overflow-auto">
          {debugLog.map((log, index) => (
            <div key={index} className="text-xs font-mono mb-1">{log}</div>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-600">
        <p>Testing user: {userId}</p>
        <p>Database URL: {rtdb.app.options.databaseURL}</p>
      </div>
    </div>
  );
};

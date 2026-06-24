import React, { useState, useEffect } from 'react';
import { debugDataAccess } from '../../utils/debugDataAccess';
import { useAuth } from '../../contexts/AuthContext';

const DataAccessChecker: React.FC = () => {
  const { currentUser } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleCheckAccess = async () => {
    if (!currentUser) {
      setError('Please sign in first');
      return;
    }

    setIsChecking(true);
    setError(null);
    
    try {
      const result = await debugDataAccess();
      setResults(result);
      setShowResults(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred during the check');
    } finally {
      setIsChecking(false);
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-medium text-gray-200">Data Access Diagnostic</h3>
        
        {/* Network status indicator */}
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <p className="text-sm text-gray-400">
            {isOnline ? 'Connected to the internet' : 'Currently offline'}
          </p>
        </div>
        
        {!isOnline && (
          <div className="bg-red-900/20 border border-red-800 p-2 rounded-md">
            <p className="text-sm text-red-400 mb-2">
              You are currently offline. Most features won't work until you reconnect.
            </p>
            <button
              onClick={handleRefresh}
              className="text-xs bg-red-800/50 hover:bg-red-800/80 text-white px-3 py-1 rounded"
            >
              Refresh Page
            </button>
          </div>
        )}
        
        <p className="text-sm text-gray-400">
          Use this tool to check if your account can properly access data.
        </p>
        
        <div className="mt-2">
          <button
            onClick={handleCheckAccess}
            disabled={isChecking || !currentUser || !isOnline}
            className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isChecking ? 'Checking...' : 'Check Data Access'}
          </button>
        </div>
        
        {error && (
          <div className="mt-2 p-2 bg-red-900/30 border border-red-800 rounded text-red-400 text-sm">
            {error}
            {error.includes('offline') && (
              <div className="mt-2">
                <p className="text-xs">Try the following:</p>
                <ul className="list-disc text-xs ml-4 mt-1">
                  <li>Check your internet connection</li>
                  <li>Try refreshing the page</li>
                  <li>Clear browser cache and try again</li>
                </ul>
              </div>
            )}
          </div>
        )}
        
        {showResults && results && (
          <div className="mt-2">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-md font-medium text-gray-300">Results</h4>
              <button
                onClick={() => setShowResults(false)}
                className="text-gray-500 hover:text-gray-400 text-sm"
              >
                Hide
              </button>
            </div>
            
            {results.success ? (
              <div className="space-y-2">
                <div className="p-2 bg-gray-800/50 rounded text-sm">
                  <p className="text-gray-400">User: {results.data?.userId}</p>
                  <p className="text-gray-400">Email: {results.data?.email}</p>
                </div>
                
                {results.data?.collections && (
                  <div className="space-y-2">
                    {Object.entries(results.data.collections).map(([name, data]: [string, any]) => (
                      <div key={name} className="p-2 bg-gray-800/50 rounded">
                        <div className="flex justify-between items-center">
                          <h5 className="text-gray-300 capitalize">{name}</h5>
                          {data.error ? (
                            <span className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded">Error</span>
                          ) : data.count !== undefined ? (
                            <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded">
                              {data.count} items
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded">
                              {data.exists ? 'Found' : 'Not Found'}
                            </span>
                          )}
                        </div>
                        
                        {data.error && (
                          <p className="text-red-400 text-xs mt-1">{data.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2 bg-red-900/30 border border-red-800 rounded text-red-400 text-sm">
                {results.error || 'Unknown error'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataAccessChecker; 
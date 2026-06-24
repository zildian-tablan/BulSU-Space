import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { PresenceStatusIndicator } from './PresenceStatusIndicator';

const AuthStatusIndicator: React.FC = () => {
  const { currentUser, loading, isAuthenticated } = useAuth();
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  const [isVisible, setIsVisible] = useState(true); // Start with true to always show initially
  const [sessionFlags, setSessionFlags] = useState({
    isAuthenticated: false,
    hasCurrentUser: false,
    isLoggingOut: false,
    intentionalLogout: false,
    forceStayOnSignIn: false,
    isAuthenticating: false,
  });
  // Monitor Firebase auth state
  useEffect(() => {
    console.log('[AuthStatusIndicator] Component mounted');
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('[AuthStatusIndicator] Firebase user changed:', user ? 'authenticated' : 'not authenticated');
      setFirebaseUser(user);
    });
    return unsubscribe;
  }, []);

  // Monitor session storage flags
  useEffect(() => {
    const updateFlags = () => {
      setSessionFlags({
        isAuthenticated: sessionStorage.getItem('isAuthenticated') === 'true',
        hasCurrentUser: sessionStorage.getItem('currentUser') !== null,
        isLoggingOut: sessionStorage.getItem('isLoggingOut') === 'true',
        intentionalLogout: sessionStorage.getItem('intentionalLogout') === 'true',
        forceStayOnSignIn: sessionStorage.getItem('forceStayOnSignIn') === 'true',
        isAuthenticating: sessionStorage.getItem('isAuthenticating') === 'true',
      });
    };

    // Initial update
    updateFlags();

    // Listen for storage changes
    const interval = setInterval(updateFlags, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    if (loading) return 'bg-yellow-500';
    if (currentUser && firebaseUser && isAuthenticated) return 'bg-green-500';
    if (sessionFlags.isLoggingOut) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getStatusText = () => {
    if (loading) return 'Loading...';
    if (sessionFlags.isLoggingOut) return 'Logging out...';
    if (sessionFlags.isAuthenticating) return 'Authenticating...';
    if (currentUser && firebaseUser && isAuthenticated) return 'Authenticated';
    return 'Not authenticated';
  };

  const hasConflicts = () => {
    const contextAuth = !!currentUser;
    const firebaseAuth = !!firebaseUser;
    const sessionAuth = sessionFlags.isAuthenticated;
    
    return !(contextAuth === firebaseAuth && firebaseAuth === sessionAuth);
  };
  return (
    <>      {/* Toggle Button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="fixed top-4 right-4 z-[100] bg-blue-600 hover:bg-blue-500 backdrop-blur-sm border border-blue-400 rounded-full p-3 text-white text-sm font-bold shadow-xl transition-all duration-200"
        title="Toggle Auth Status"
      >
        {isVisible ? '👁️' : '🔍'}
      </button>      {/* Status Panel */}
      {isVisible && (
        <div className="fixed top-20 right-4 z-[99] bg-gray-900/95 backdrop-blur-sm border-2 border-blue-500 rounded-lg p-4 text-sm font-mono shadow-2xl min-w-[250px] max-w-[350px]">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
        <span className="text-white font-semibold">{getStatusText()}</span>
        {/* User Presence Status (Online/Away/Offline) */}
        {currentUser && (
          <PresenceStatusIndicator userId={currentUser.id} showText={true} size="sm" className="ml-2" />
        )}
      </div>
      
      {hasConflicts() && (
        <div className="text-red-400 mb-2 font-bold">⚠️ AUTH CONFLICT!</div>
      )}
      
      <div className="space-y-1 text-gray-300">
        <div className="flex justify-between">
          <span>Context User:</span>
          <span className={currentUser ? 'text-green-400' : 'text-red-400'}>
            {currentUser ? '✓' : '✗'}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Firebase User:</span>
          <span className={firebaseUser ? 'text-green-400' : 'text-red-400'}>
            {firebaseUser ? '✓' : '✗'}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Session Auth:</span>
          <span className={sessionFlags.isAuthenticated ? 'text-green-400' : 'text-red-400'}>
            {sessionFlags.isAuthenticated ? '✓' : '✗'}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Session User:</span>
          <span className={sessionFlags.hasCurrentUser ? 'text-green-400' : 'text-red-400'}>
            {sessionFlags.hasCurrentUser ? '✓' : '✗'}
          </span>
        </div>
        
        <div className="border-t border-gray-600 pt-1 mt-2">
          <div className="text-gray-400 text-[10px] space-y-0.5">
            {sessionFlags.isLoggingOut && (
              <div className="text-orange-400">🔄 Logging out</div>
            )}
            {sessionFlags.intentionalLogout && (
              <div className="text-blue-400">🚪 Intentional logout</div>
            )}
            {sessionFlags.forceStayOnSignIn && (
              <div className="text-purple-400">🔒 Force stay signin</div>
            )}
            {sessionFlags.isAuthenticating && (
              <div className="text-yellow-400">⏳ Authenticating</div>
            )}
            {loading && (
              <div className="text-yellow-400">⏳ Context loading</div>
            )}
          </div>
        </div>
          {currentUser && (
          <div className="border-t border-gray-600 pt-1 mt-2">
            <div className="text-[10px] text-gray-400">
              User: {currentUser.name}
            </div>
            <div className="text-[10px] text-gray-400">
              Role: {currentUser.role}
            </div>
          </div>
        )}
      </div>
        </div>
      )}
    </>
  );
};

export default AuthStatusIndicator;

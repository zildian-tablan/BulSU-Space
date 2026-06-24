import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { auth } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { AuthInstanceManager } from '../../firebase/auth-instance-manager';

/**
 * Debug component for monitoring auth state
 * Only visible during development
 */
const AuthDebugPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const [isProtectedOperation, setIsProtectedOperation] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user: User | null) => {
      setFirebaseUser(user);
    });

    // Check for protected operations
    const interval = setInterval(() => {
      setIsProtectedOperation(AuthInstanceManager.isAuthOperationInProgress());
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // Don't render in production
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const toggle = () => setExpanded(!expanded);

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-2 rounded-md shadow-lg z-50 text-xs opacity-80 hover:opacity-100 transition-opacity">
      <div className="flex items-center justify-between cursor-pointer" onClick={toggle}>
        <span>Auth Debug {expanded ? '▼' : '▶'}</span>
        <span className={isProtectedOperation ? 'text-yellow-300' : 'text-green-300'}>
          {isProtectedOperation ? '⚠️ Protected' : '✓ Normal'}
        </span>
      </div>

      {expanded && (
        <div className="mt-2 border-t border-gray-700 pt-2 space-y-1">
          <div>
            <strong>Firebase User:</strong> {firebaseUser ? `${firebaseUser.email} (${firebaseUser.uid.slice(0,6)}...)` : 'None'}
          </div>
          <div>
            <strong>Context User:</strong> {currentUser ? `${currentUser.email} (${currentUser.id.slice(0,6)}...)` : 'None'}
          </div>
          <div>
            <strong>Session:</strong> {sessionStorage.getItem('isAuthenticated') === 'true' ? 'Authenticated' : 'Not authenticated'}
          </div>
          <div className={isProtectedOperation ? 'text-yellow-300' : 'text-green-300'}>
            <strong>Auth Protection:</strong> {isProtectedOperation ? 'Active' : 'Inactive'}
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthDebugPanel;

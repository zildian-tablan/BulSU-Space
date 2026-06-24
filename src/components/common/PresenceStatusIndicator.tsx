import React from 'react';
import { useUserPresence } from '../../hooks/useUserPresence';

interface PresenceStatusIndicatorProps {
  userId: string;
  showText?: boolean;
  showLastSeen?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

interface StatusDisplay {
  color: string;
  bgColor: string;
  text: string;
  description: string;
  animate: boolean;
  connectionQuality?: 'good' | 'poor' | 'disconnected';
  realTimeUpdate?: number;
}

export const PresenceStatusIndicator: React.FC<PresenceStatusIndicatorProps> = ({
  userId,
  showText = false,
  showLastSeen = false,
  size = 'sm',
  className = ''
}) => {
  const { presence, isLoading, connectionError } = useUserPresence(userId);

  const getStatusDisplay = (): StatusDisplay => {
    // Handle loading state
    if (isLoading) {
      return {
        color: 'border-gray-400',
        bgColor: 'bg-gray-400',
        text: 'Loading...',
        description: 'Loading status...',
        animate: false
      };
    }

    // Handle connection errors
    if (connectionError) {
      return {
        color: 'border-gray-400',
        bgColor: 'bg-gray-400',
        text: 'Unknown',
        description: 'Connection error',
        animate: false,
        connectionQuality: 'disconnected'
      };
    }

    // If no presence data, be optimistic in production
    if (!presence) {
      const isProduction = window.location.hostname === 'bulsuspace.web.app' || 
                          window.location.hostname.includes('firebaseapp.com');
      
      if (isProduction) {
        return {
          color: 'border-yellow-400',
          bgColor: 'bg-yellow-400',
          text: 'Loading...',
          description: 'Checking status...',
          animate: true,
          connectionQuality: 'poor'
        };
      }
      
      return {
        color: 'border-gray-400',
        bgColor: 'bg-gray-400',
        text: 'Offline',
        description: 'No status data',
        animate: false,
        connectionQuality: 'disconnected'
      };
    }

    const now = Date.now();
    const thirtySecondsAgo = now - 30000; // 30 seconds
    const fiveMinutesAgo = now - 300000; // 5 minutes
    const thirtyMinutesAgo = now - 1800000; // 30 minutes
    
    // Enhanced real-time status calculation
    const lastActiveTime = presence.lastActive || presence.lastSeen || 0;
    const timeSinceActive = now - lastActiveTime;
    
    // Determine connection quality
    const connectionQuality: 'good' | 'poor' | 'disconnected' = 
      presence.connectionQuality || 
      (timeSinceActive < 60000 ? 'good' : 
       timeSinceActive < 300000 ? 'poor' : 'disconnected');    // Enhanced status logic with more aggressive real-time updates and better logging
    if (presence.state === 'online') {
      console.log(`[PresenceStatusIndicator] Presence data for ${userId}:`, {
        state: presence.state,
        lastActive: presence.lastActive ? new Date(presence.lastActive).toISOString() : 'N/A',
        realTimeUpdate: presence.realTimeUpdate ? new Date(presence.realTimeUpdate).toISOString() : 'N/A',
        connections: presence.connections ? Object.keys(presence.connections).length : 0,
        activeConnections: presence.connections ? 
          Object.values(presence.connections).filter((c: any) => c.active === true).length : 0
      });
      
      // If we have realTimeUpdate data, prefer it for most responsive display
      if (presence.realTimeUpdate && (now - presence.realTimeUpdate < 60000)) {
        // Use realTimeUpdate for immediate "Active now" status if within last minute
        return {
          color: 'border-green-500',
          bgColor: 'bg-green-500',
          text: 'Active now',
          description: 'Currently active',
          animate: true,
          connectionQuality: 'good',
          realTimeUpdate: presence.realTimeUpdate
        };
      } else if (lastActiveTime > thirtySecondsAgo) {
        return {
          color: 'border-green-500',
          bgColor: 'bg-green-500',
          text: 'Active now',
          description: 'Currently active',
          animate: true,
          connectionQuality: 'good',
          realTimeUpdate: presence.realTimeUpdate
        };
      } else if (lastActiveTime > fiveMinutesAgo) {
        return {
          color: 'border-green-400',
          bgColor: 'bg-green-400',
          text: 'Online',
          description: 'Recently active',
          animate: false,
          connectionQuality,
          realTimeUpdate: presence.realTimeUpdate
        };
      } else if (lastActiveTime > thirtyMinutesAgo) {
        return {
          color: 'border-yellow-400',
          bgColor: 'bg-yellow-400',
          text: 'Away',
          description: 'Recently seen',
          animate: false,
          connectionQuality: 'poor',
          realTimeUpdate: presence.realTimeUpdate
        };
      }
    }

    // Handle away status
    if (presence.state === 'away' && lastActiveTime > fiveMinutesAgo) {
      return {
        color: 'border-yellow-400',
        bgColor: 'bg-yellow-400',
        text: 'Away',
        description: 'User is away',
        animate: false,
        connectionQuality: 'poor',
        realTimeUpdate: presence.realTimeUpdate
      };
    }

    // Default to offline
    return {
      color: 'border-gray-400',
      bgColor: 'bg-gray-400',
      text: 'Offline',
      description: lastActiveTime > 0 ? 'Last seen a while ago' : 'No recent activity',
      animate: false,
      connectionQuality: 'disconnected',
      realTimeUpdate: presence.realTimeUpdate
    };
  };

  const formatLastSeen = (): string => {
    if (!presence?.lastActive) return '';
    
    const now = Date.now();
    const timeDiff = now - presence.lastActive;
    
    if (timeDiff < 60000) return 'Just now';
    if (timeDiff < 3600000) return `${Math.floor(timeDiff / 60000)}m ago`;
    if (timeDiff < 86400000) return `${Math.floor(timeDiff / 3600000)}h ago`;
    
    return new Date(presence.lastActive).toLocaleDateString();
  };

  const statusDisplay = getStatusDisplay();
  
  // Size classes
  const sizeClasses = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  const textSizeClasses = {
    xs: 'text-[10px]',
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {/* Status Dot */}
      <div className="relative">
        <div
          className={`
            ${sizeClasses[size]} 
            ${statusDisplay.bgColor}
            ${statusDisplay.color}
            border-2 border-gray-800
            rounded-full 
            ${statusDisplay.animate ? 'animate-pulse' : ''}
            shadow-sm
          `}
          title={statusDisplay.description}
        />
        {/* Ring animation for very active users */}
        {statusDisplay.animate && (
          <div
            className={`
              absolute inset-0 
              ${statusDisplay.bgColor}
              rounded-full 
              animate-ping 
              opacity-30
            `}
          />
        )}
      </div>
      
      {/* Status Text */}
      {showText && (
        <div className="flex flex-col">
          <span className={`${textSizeClasses[size]} font-medium text-gray-200`}>
            {statusDisplay.text}
          </span>
          {showLastSeen && presence?.lastActive && (
            <span className={`${textSizeClasses[size]} text-gray-400 leading-tight`}>
              {formatLastSeen()}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
import React from 'react';
import { PresenceStatusIndicator } from './PresenceStatusIndicator';

interface User {
  id: string;
  name: string;
  profile_pic?: string;
  role?: string;
  department?: string;
}

interface UserStatusCardProps {
  user: User;
  showRole?: boolean;
  showDepartment?: boolean;
  showPresence?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export const UserStatusCard: React.FC<UserStatusCardProps> = ({
  user,
  showRole = false,
  showDepartment = false,
  showPresence = true,
  size = 'md',
  className = '',
  onClick
}) => {
  const sizeStyles = {
    sm: {
      container: 'p-2',
      avatar: 'w-8 h-8',
      text: 'text-sm',
      subtext: 'text-xs'
    },
    md: {
      container: 'p-3',
      avatar: 'w-10 h-10',
      text: 'text-base',
      subtext: 'text-sm'
    },
    lg: {
      container: 'p-4',
      avatar: 'w-12 h-12',
      text: 'text-lg',
      subtext: 'text-base'
    }
  };

  const styles = sizeStyles[size];

  return (
    <div 
      className={`
        bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/70 
        border border-green-700/40 
        rounded-xl 
        shadow-lg hover:shadow-green-800/30 
        transition-all duration-300 
        ${styles.container}
        ${onClick ? 'cursor-pointer hover:border-green-600/60' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {/* Avatar with Status Indicator */}
        <div className="relative flex-shrink-0">
          {user.profile_pic ? (
            <img 
              src={user.profile_pic} 
              alt={user.name} 
              className={`${styles.avatar} rounded-full object-cover border-2 border-green-700/40`}
            />
          ) : (
            <div className={`
              ${styles.avatar} 
              rounded-full 
              bg-gradient-to-br from-green-600 to-green-500 
              flex items-center justify-center 
              text-white font-bold
              border-2 border-green-700/40
              ${styles.text}
            `}>
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          
          {/* Status Indicator */}
          {showPresence && (
            <div className="absolute -bottom-0.5 -right-0.5">
              <PresenceStatusIndicator 
                userId={user.id} 
                size={size === 'lg' ? 'md' : 'sm'}
              />
            </div>
          )}
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`${styles.text} font-semibold text-white truncate`}>
              {user.name}
            </h3>
            {showPresence && (
              <PresenceStatusIndicator 
                userId={user.id} 
                showText={true} 
                size={size === 'lg' ? 'sm' : 'xs'}
              />
            )}
          </div>
          
          {(showRole || showDepartment) && (
            <div className="mt-1">
              {showRole && user.role && (
                <span className={`${styles.subtext} text-green-300/80 capitalize`}>
                  {user.role}
                </span>
              )}
              {showRole && showDepartment && user.role && user.department && (
                <span className={`${styles.subtext} text-gray-400 mx-1`}>•</span>
              )}
              {showDepartment && user.department && (
                <span className={`${styles.subtext} text-gray-300/70`}>
                  {user.department}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserStatusCard;

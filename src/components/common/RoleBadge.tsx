import React, { useState } from 'react';
import { UserRole } from '../../contexts/AuthContext';
import { 
  ShieldCheckIcon, 
  AcademicCapIcon, 
  BriefcaseIcon, 
  UserIcon,
  UserGroupIcon 
} from '@heroicons/react/24/solid';
import { isMobileDevice } from '../../utils/mobileUtils';

interface RoleBadgeProps {
  role: UserRole | string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  isSpaceAdmin?: boolean;
  showTooltip?: boolean;
}

/**
 * A reusable component for displaying user role badges across the app
 * Supports different sizes and custom styling
 * Enhanced with tooltips and special styling for space admins
 */
const RoleBadge: React.FC<RoleBadgeProps> = ({ 
  role, 
  size = 'medium', 
  className = '',
  isSpaceAdmin = false,
  showTooltip = true
}) => {  const [showLabel, setShowLabel] = useState(false);
  const isMobile = isMobileDevice();
  const roleStr = (role || '').toString();
  const roleLower = roleStr.toLowerCase().trim();
  const isAdmin = roleLower === 'admin' || roleLower === 'super admin';
  
  // Size classes for the badge container
  const sizeClasses = {
    small: "p-0.5",
    medium: "p-1",
    large: "p-1.5"
  };
    // Size classes for the icon/text - larger on mobile
  const contentSizeClasses = {
    small: isMobile ? "h-4 w-4 text-[8px]" : "h-2.5 w-2.5 text-[8px]",
    medium: isMobile ? "h-5 w-5 text-xs" : "h-3 w-3 text-xs",
    large: isMobile ? "h-6 w-6 text-sm" : "h-4 w-4 text-sm"
  };
  
  // Circle size classes
  const circularSizeClasses = {
    small: "h-4 w-4 flex items-center justify-center",
    medium: "h-5 w-5 flex items-center justify-center",
    large: "h-6 w-6 flex items-center justify-center"
  };
    // Text size classes - larger on mobile for better visibility
  const textSizeClasses = {
    small: isMobile ? "text-[10px]" : "text-[8px]",
    medium: isMobile ? "text-xs" : "text-[10px]",
    large: isMobile ? "text-sm" : "text-xs"
  };
  
  // Base styles for all badges
  const baseClasses = "rounded-full shadow-md relative transition-all duration-300";
  
  // Get role display name for tooltip
  const getRoleDisplayName = () => {
    if (isAdmin) return roleLower === 'super admin' ? 'Super Admin' : 'Admin';
    if (isSpaceAdmin) return 'Space Admin';
    
    switch(roleLower) {
      case 'student': return 'Student';
      case 'faculty': return 'Faculty';
      case 'alumni': return 'Alumni';
      case 'infirmary': return 'Infirmary';
      case 'dean': return 'Dean';
      default: return roleStr;
    }
  };
  
  // Tooltip component
  const Tooltip = () => (
    showTooltip && showLabel ? (
      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-900/90 text-white text-xs rounded whitespace-nowrap backdrop-blur-sm border border-gray-700/50 z-50 shadow-lg">
        {getRoleDisplayName()}
        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-900/90 rotate-45"></div>
      </div>
    ) : null
  );
  
  // For admin roles (with shield icon)
  if (isAdmin) {
    // Special styling for super admin
    const adminGradient = role === 'super admin' 
      ? 'from-emerald-400 to-teal-600' 
      : 'from-green-400 to-green-600';
      
    const adminRing = role === 'super admin'
      ? 'ring-emerald-300/60 shadow-emerald-500/40'
      : 'ring-green-300/50 shadow-green-500/30';
    
    return (
      <div 
        className={`${baseClasses} ${sizeClasses[size]} bg-gradient-to-br ${adminGradient} ring-1 ${adminRing} text-white ${className}`}
        onMouseEnter={() => setShowLabel(true)}
        onMouseLeave={() => setShowLabel(false)}
      >
        <ShieldCheckIcon className={contentSizeClasses[size]} />
        <Tooltip />
      </div>
    );
  }
  
  // For space admin role (displays differently than regular role)
  if (isSpaceAdmin) {
    return (
      <div 
        className={`${baseClasses} ${circularSizeClasses[size]} bg-gradient-to-br from-yellow-400 to-amber-600 ring-2 ring-yellow-300/60 shadow-sm shadow-yellow-400/40 animate-pulse ${className}`}
        onMouseEnter={() => setShowLabel(true)}
        onMouseLeave={() => setShowLabel(false)}
      >
        <UserGroupIcon className={`text-white ${textSizeClasses[size]} scale-90`} />
        <Tooltip />
      </div>
    );
  }
  // Dean role with crown material icon (crown icon from Material Symbols)
  if (roleLower === 'dean') {
    return (
      <div 
        className={`${baseClasses} ${circularSizeClasses[size]} bg-gradient-to-br from-fuchsia-400 to-purple-600 ring-1 ring-fuchsia-300/60 shadow-sm shadow-fuchsia-500/30 ${className}`}
        onMouseEnter={() => setShowLabel(true)}
        onMouseLeave={() => setShowLabel(false)}
      >
        <span className={`material-symbols-outlined text-white ${textSizeClasses[size]} leading-none`} style={{fontVariationSettings: "'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 24"}}>
          crown
        </span>
        <Tooltip />
      </div>
    );
  }
  
  // Infirmary role - use Material Icon 'health_cross'
  if (roleLower === 'infirmary') {
    return (
      <div
        className={`${baseClasses} ${circularSizeClasses[size]} bg-gradient-to-br from-red-400 to-red-600 ring-1 ring-red-300/60 shadow-sm shadow-red-500/30 ${className}`}
        onMouseEnter={() => setShowLabel(true)}
        onMouseLeave={() => setShowLabel(false)}
      >
        <span className={`material-symbols-outlined text-white ${textSizeClasses[size]} leading-none`} style={{fontVariationSettings: "'FILL' 1, 'wght' 600"}}>
          health_cross
        </span>
        <Tooltip />
      </div>
    );
  }
    // Student role with icon and enhanced styling - green colors
  if (role === 'student') {
    return (
      <div 
        className={`${baseClasses} ${circularSizeClasses[size]} bg-gradient-to-br from-green-400 to-green-600 ring-1 ring-green-300/50 shadow-sm shadow-green-500/30 ${className}`}
        onMouseEnter={() => setShowLabel(true)}
        onMouseLeave={() => setShowLabel(false)}
      >
        <AcademicCapIcon className={`text-white ${textSizeClasses[size]} scale-90`} />
        <Tooltip />
      </div>
    );
  }
    // Faculty role with briefcase icon - blue colors
  if (role === 'faculty') {
    return (
      <div 
        className={`${baseClasses} ${circularSizeClasses[size]} bg-gradient-to-br from-blue-400 to-blue-600 ring-1 ring-blue-300/50 shadow-sm shadow-blue-500/30 ${className}`}
        onMouseEnter={() => setShowLabel(true)}
        onMouseLeave={() => setShowLabel(false)}
      >
        <BriefcaseIcon className={`text-white ${textSizeClasses[size]} scale-90`} />
        <Tooltip />
      </div>
    );
  }
  
  // Alumni role with user icon
  if (role === 'alumni') {
    return (
      <div 
        className={`${baseClasses} ${circularSizeClasses[size]} bg-gradient-to-br from-amber-400 to-amber-600 ring-1 ring-amber-300/50 shadow-sm shadow-amber-500/30 ${className}`}
        onMouseEnter={() => setShowLabel(true)}
        onMouseLeave={() => setShowLabel(false)}
      >
        <UserIcon className={`text-white ${textSizeClasses[size]} scale-90`} />
        <Tooltip />
      </div>
    );
  }
    // Default for other roles
  return (
    <div 
      className={`${baseClasses} ${circularSizeClasses[size]} bg-gradient-to-br from-green-400 to-green-600 ring-1 ring-green-300/50 shadow-sm shadow-green-500/30 ${className}`}
      onMouseEnter={() => setShowLabel(true)}
      onMouseLeave={() => setShowLabel(false)}
    >
      {isMobile ? (
        // On mobile, show a generic user icon instead of text
        <UserIcon className={`text-white ${textSizeClasses[size]} scale-90`} />
      ) : (
        // On desktop, show the first letter of the role
        <span className={`text-white drop-shadow-sm font-bold ${textSizeClasses[size]}`}>{role.charAt(0).toUpperCase()}</span>
      )}
      <Tooltip />    </div>
  );
};

export default RoleBadge;

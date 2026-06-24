import React from 'react';
import { getInitials } from '../../services/userService';

interface DefaultProfilePictureProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const DefaultProfilePicture: React.FC<DefaultProfilePictureProps> = ({ 
  name, 
  size = 'md',
  className = '' 
}) => {
  const initials = getInitials(name);
  
  // Define size classes
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-12 h-12 text-lg',
    lg: 'w-20 h-20 text-2xl',
    xl: 'w-32 h-32 text-4xl'
  };
  
  // Generate a consistent color based on the name
  const getColorClass = (name: string): string => {
    const colors = [
      'bg-green-600',
      'bg-green-700',
      'bg-green-800',
      'bg-emerald-600',
      'bg-emerald-700',
      'bg-teal-600',
      'bg-teal-700'
    ];
    
    // Simple hash function to get a consistent color
    const hash = name.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);
    
    return colors[hash % colors.length];
  };

  return (
    <div 
      className={`${sizeClasses[size]} ${getColorClass(name)} rounded-full flex items-center justify-center font-bold text-white ${className}`}
      aria-label={`Default profile picture for ${name}`}
    >
      {initials}
    </div>
  );
};

export default DefaultProfilePicture;

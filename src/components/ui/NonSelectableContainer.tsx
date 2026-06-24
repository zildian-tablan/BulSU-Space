import React, { ReactNode } from 'react';

interface NonSelectableContainerProps {
  children: ReactNode;
  className?: string;
  as?: React.ElementType;
}

/**
 * NonSelectableContainer component
 * 
 * A component that explicitly prevents text selection for its children,
 * useful for UI containers and interactive elements.
 * 
 * @example
 * <NonSelectableContainer>
 *   <div>This content cannot be selected</div>
 * </NonSelectableContainer>
 * 
 * @example
 * <NonSelectableContainer as="section" className="rounded p-4 bg-gray-800">
 *   Container content that cannot be selected
 * </NonSelectableContainer>
 */
const NonSelectableContainer: React.FC<NonSelectableContainerProps> = ({
  children,
  className = '',
  as: Component = 'div'
}) => {
  const nonSelectableClass = 'user-select-none';
  const combinedClassName = `${nonSelectableClass} ${className}`.trim();

  return (
    <Component className={combinedClassName} style={{ userSelect: 'none' }}>
      {children}
    </Component>
  );
};

export default NonSelectableContainer;

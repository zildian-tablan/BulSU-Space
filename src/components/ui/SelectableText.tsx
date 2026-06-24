import React, { ReactNode } from 'react';

interface SelectableTextProps {
  children: ReactNode;
  className?: string;
  as?: React.ElementType;
}

/**
 * SelectableText component
 * 
 * A component that explicitly allows text selection for its children,
 * overriding any parent components that may have disabled text selection.
 * 
 * @example
 * <SelectableText>
 *   This text will be selectable even if its parent has user-select: none
 * </SelectableText>
 * 
 * @example
 * <SelectableText as="h2" className="text-xl font-bold">
 *   This heading will be selectable
 * </SelectableText>
 */
const SelectableText: React.FC<SelectableTextProps> = ({
  children,
  className = '',
  as: Component = 'span'
}) => {
  const selectableClass = 'user-select-text';
  const combinedClassName = `${selectableClass} ${className}`.trim();

  return (
    <Component className={combinedClassName} style={{ userSelect: 'text' }}>
      {children}
    </Component>
  );
};

export default SelectableText;

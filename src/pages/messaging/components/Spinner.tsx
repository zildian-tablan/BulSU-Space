import React from 'react';

type SpinnerProps = {
  size?: number;
  className?: string;
  label?: string;
};

const Spinner: React.FC<SpinnerProps> = ({ size = 32, className = '', label = '' }) => (
  <div
    className={`flex items-center justify-center ${className}`}
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div
      className="animate-spin rounded-full border-4 border-gray-600 border-t-green-500"
      style={{ width: size, height: size }}
    />
    {label ? <span className="ml-3 text-gray-300 text-sm">{label}</span> : null}
  </div>
);

export default Spinner;

import React from 'react';

interface LogoModalProps {
  onClose: () => void;
}

const LogoModal: React.FC<LogoModalProps> = ({ onClose }) => {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm transition-opacity duration-300 modal-centered"
      onClick={onClose}
    >
      <div 
        className="bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900 rounded-3xl shadow-2xl border border-green-700/60 p-5 sm:p-8 md:p-10 max-w-lg w-full mx-4 transform transition-all duration-300 scale-100 relative"
        onClick={(e) => e.stopPropagation()}
        style={{ marginTop: "20px" }} /* Add a small margin to push it down slightly */
      >
        <div className="flex flex-col items-center text-center">
          {/* Logo with glow and animated ring */}
          <div className="relative h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 mb-4 sm:mb-5 md:mb-6 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-gradient-to-tr from-green-600/40 to-green-400/10 blur-2xl animate-pulse-slow" />
            <span className="absolute inset-0 rounded-full border-4 border-green-500/30 animate-spin-slow" />
            <img
              src="/images/bulsu-space-logo.png"
              alt="BulSU Space Logo"
              className="h-full w-full object-contain z-10 drop-shadow-[0_0_18px_rgba(34,197,94,0.7)]"
            />
          </div>
          {/* Title with animated BulSU Space text */}
          <h2 className="text-2xl sm:text-2xl md:text-3xl font-extrabold text-white mb-2 sm:mb-3 tracking-tight drop-shadow-lg">
            Welcome to{' '}<br></br>
            <span className="logo-text-glow bg-gradient-to-r from-green-400 via-green-500 to-green-400 bg-clip-text text-transparent animate-gradient-x shadow-green-500/30">
              BulSU Space: Academic Community Social Platform
            </span>
          </h2>
          {/* Description */}
          <p className="text-gray-300 mb-6 sm:mb-7 md:mb-8 text-sm sm:text-base leading-relaxed max-w-xs mx-auto">
            BulSU Space is a digital platform for Bulacan State University - Hagonoy Campus students, faculty, and alumni.<br/>
            <span className="text-green-300 font-medium">Connect</span>, <span className="text-green-300 font-medium">share</span>, and <span className="text-green-300 font-medium">stay updated</span> with BulSU Space.
          </p>
          {/* Button with glow */}
          <button
            onClick={onClose}
            className="px-5 sm:px-6 md:px-7 py-2 sm:py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-base sm:text-lg shadow-lg shadow-green-700/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 animate-glow"
          >
            Got it!
          </button>
        </div>
        {/* Decorative floating dots */}
        <span className="absolute top-4 left-4 h-3 w-3 rounded-full bg-green-500/60 blur-md animate-bounce-slow" />
        <span className="absolute bottom-6 right-6 h-2 w-2 rounded-full bg-green-400/40 blur-[2px] animate-float" />
        <span className="absolute bottom-4 left-1/2 h-1.5 w-1.5 rounded-full bg-green-600/40 blur-[1px] animate-float2" />
      </div>
    </div>
  );
};

export default LogoModal;

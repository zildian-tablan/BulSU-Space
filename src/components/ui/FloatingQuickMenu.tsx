import React, { useState, useRef, useEffect } from 'react';
import AppsIcon from '@mui/icons-material/Apps';
import PersonIcon from '@mui/icons-material/Person';
import { useNavigate } from 'react-router-dom';

/**
 * FloatingQuickMenu
 * - A floating action button anchored bottom-right
 * - Click to toggle two menu options: Profile and Expression Board
 * - Animated, accessible, stays visible when scrolling
 */
const FloatingQuickMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen(v => !v);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // close when clicking outside
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (e.target instanceof Node && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  return (
    // Keep desktop look; on small screens push up to avoid bottom nav overlap
  <div ref={containerRef} className="fixed right-5 z-50 flex flex-col items-end gap-2 bottom-24 sm:bottom-5">
      {/* Menu items */}
  <div className="flex flex-col items-end">
        <div className={`relative group ${open ? '' : ''}`}>
            {/* Show tooltips on all viewports for consistent look */}
            <div className={`block absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gradient-to-br from-green-900/80 to-green-800/70 text-white text-sm px-3 py-1.5 shadow-lg ring-1 ring-green-900/30 backdrop-blur-sm transform transition-all duration-150 ${open ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'}`}>
            Profile
          </div>
            <button
            type="button"
            onClick={() => { setOpen(false); navigate('/profile'); }}
            aria-label="Go to profile"
            className={`flex items-center justify-center w-11 h-11 rounded-lg bg-gradient-to-br from-green-800/50 to-green-600/30 text-white shadow-md border border-green-700/30 transform transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-300 ${open ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
            style={{ transitionDelay: open ? '30ms' : '0ms' }}
          >
            <PersonIcon fontSize="small" className="text-white text-[18px]" />
          </button>
        </div>

        <div className="relative group mt-2">
          {/* Tooltip shown on all sizes for consistency */}
            <div className={`block absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gradient-to-br from-green-900/80 to-green-800/70 text-white text-sm px-3 py-1.5 shadow-lg ring-1 ring-green-900/30 backdrop-blur-sm transform transition-all duration-150 ${open ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'}`}>
            Expression Board
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); navigate('/freedom-wall'); }}
            aria-label="Open Expression Board"
            className={`flex items-center justify-center w-11 h-11 rounded-lg bg-gradient-to-br from-green-800/50 to-green-600/30 text-white shadow-md border border-green-700/30 transform transition-all duration-220 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-300 ${open ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-5 opacity-0'}`}
            style={{ transitionDelay: open ? '60ms' : '0ms' }}
          >
            {/* Use same icon as user dropdown (note_stack) */}
            <span className="material-symbols-outlined text-white text-[18px]" aria-hidden>note_stack</span>
          </button>
        </div>

        <div className="relative group mt-2">
          <div className={`block absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gradient-to-br from-green-900/80 to-green-800/70 text-white text-sm px-3 py-1.5 shadow-lg ring-1 ring-green-900/30 backdrop-blur-sm transform transition-all duration-150 ${open ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'}`}>
            Idea Chain
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); navigate('/idea-chain'); }}
            aria-label="Open Idea Chain"
            className={`flex items-center justify-center w-11 h-11 rounded-lg bg-gradient-to-br from-green-800/50 to-green-600/30 text-white shadow-md border border-green-700/30 transform transition-all duration-220 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-300 ${open ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-7 opacity-0'}`}
            style={{ transitionDelay: open ? '90ms' : '0ms' }}
          >
            <span className="material-symbols-outlined text-white text-[18px]">batch_prediction</span>
          </button>
        </div>

        <div className="relative group mt-2">
          <div className={`block absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gradient-to-br from-green-900/80 to-green-800/70 text-white text-sm px-3 py-1.5 shadow-lg ring-1 ring-green-900/30 backdrop-blur-sm transform transition-all duration-150 ${open ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'}`}>
            Space News
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); navigate('/space-news'); }}
            aria-label="Open Space News"
            className={`flex items-center justify-center w-11 h-11 rounded-lg bg-gradient-to-br from-green-800/50 to-green-600/30 text-white shadow-md border border-green-700/30 transform transition-all duration-220 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-300 ${open ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-9 opacity-0'}`}
            style={{ transitionDelay: open ? '120ms' : '0ms' }}
          >
            <span className="material-symbols-outlined text-white text-[18px]">newspaper</span>
          </button>
        </div>
      </div>

      {/* FAB */}
      {/* Floating animation styles - small and subtle */}
      <style>{`@keyframes subtleFloat { 0% { transform: translateY(0px); } 50% { transform: translateY(-4px); } 100% { transform: translateY(0px); } }`}</style>
      <button
        type="button"
        aria-label="Open quick menu"
        title="Quick menu"
        onClick={toggle}
        className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white hover:from-green-500 hover:to-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 shadow-lg shadow-green-500/40 transform-gpu transition-transform duration-150 active:scale-95"
        // unified look across breakpoints; default is green for visibility
        style={{ animation: 'subtleFloat 3.6s ease-in-out infinite' }}
      >
        <AppsIcon fontSize="small" className="text-white" />
      </button>
    </div>
  );
};

export default FloatingQuickMenu;

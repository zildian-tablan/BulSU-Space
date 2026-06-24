import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ScrollAnimation } from '../ScrollAnimation';

/**
 * OnboardingFooter
 * Reusable footer used across onboarding pages.
 * - If onOpenTerms/onOpenPrivacy are provided, they will be invoked to open modals.
 * - Otherwise, it navigates to the corresponding routes.
 */
export interface OnboardingFooterProps {
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
}

const OnboardingFooter: React.FC<OnboardingFooterProps> = ({ onOpenTerms, onOpenPrivacy }) => {
  const navigate = useNavigate();
  return (
    <footer className="py-6 sm:py-8 border-t border-white/6 bg-gradient-to-t from-transparent via-white/1 to-transparent">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollAnimation direction="up" delay={100} duration={800}>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between sm:items-center w-full">
            {/* Brand */}
            <div className="flex items-center space-x-3">
              <img
                src="/images/bulsu-space-logo.png"
                alt="BulSU Space Logo"
                className="w-5 h-5 sm:w-6 sm:h-6 rounded-full shadow-sm"
              />
              <span className="font-semibold text-sm text-white/90">BulSU Space</span>
            </div>

            {/* Navigation - wraps on small screens */}
            <nav className="flex flex-wrap justify-center gap-2 sm:gap-6">
              <button
                onClick={() => navigate('/about')}
                className="bg-transparent text-white/70 hover:text-emerald-400 text-xs sm:text-sm px-2 py-1 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded whitespace-nowrap"
                aria-label="About"
              >About</button>

              <button
                onClick={() => navigate('/features')}
                className="bg-transparent text-white/70 hover:text-emerald-400 text-xs sm:text-sm px-2 py-1 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded whitespace-nowrap"
                aria-label="Features"
              >Features</button>

              <button
                onClick={(e) => { e.preventDefault(); return (onOpenPrivacy ? onOpenPrivacy() : navigate('/privacy')); }}
                className="bg-transparent text-white/70 hover:text-emerald-400 text-xs sm:text-sm px-2 py-1 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded whitespace-nowrap"
                aria-label="Privacy"
              >Privacy</button>

              <button
                onClick={(e) => { e.preventDefault(); return (onOpenTerms ? onOpenTerms() : navigate('/terms')); }}
                className="bg-transparent text-white/70 hover:text-emerald-400 text-xs sm:text-sm px-2 py-1 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded whitespace-nowrap"
                aria-label="Terms"
              >Terms</button>

              <button
                onClick={() => navigate('/contact')}
                className="bg-transparent text-white/70 hover:text-emerald-400 text-xs sm:text-sm px-2 py-1 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded whitespace-nowrap"
                aria-label="Contact"
              >Contact</button>
            </nav>

            {/* Copyright - placed to the right on larger screens, under nav on small */}
            <div className="mt-1 text-xs text-white/50 sm:mt-0 sm:ml-4">© {new Date().getFullYear()} BulSU Space</div>
          </div>
        </ScrollAnimation>
      </div>
    </footer>
  );
};

export default OnboardingFooter;

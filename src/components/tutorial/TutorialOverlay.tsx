import React, { useEffect, useState } from 'react';
import { useTutorial } from '../../contexts/TutorialContext';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import confetti from 'canvas-confetti';

interface TutorialOverlayProps {}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = () => {
  const { isActive, currentStep, steps, nextStep, prevStep, skipTutorial, isNavigating } = useTutorial();
  const { currentUser } = useAuth();
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({});
  
  // Check if user is an admin or super admin - We'll use this to conditionally render instead of early return
  const isAdminOrSuperAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super admin';

  // Initialize tooltip style with centered position but opacity 0
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    opacity: 0
  });
  const [tooltipReady, setTooltipReady] = useState<boolean>(false);

  useEffect(() => {
    // Only proceed if tutorial is active, step exists, and user is not admin/super admin
    if (!isActive || !steps[currentStep] || isAdminOrSuperAdmin) return;
    
    // First set tooltipReady to false when step changes
    setTooltipReady(false);
    
    const updatePosition = () => {
      const currentStepData = steps[currentStep];
      const element = document.querySelector(currentStepData.target) as HTMLElement;
      
      if (element) {
        // Determine if this is a page-level tutorial item (not targeting a specific element but the whole page)
        const isPageTutorial = currentStepData.target === '[data-tutorial="profile-page"]' ||
                            currentStepData.target === '[data-tutorial="events-page"]' ||
                            currentStepData.target === '[data-tutorial="groups-page"]' || 
                            /* community page removed */
                            currentStepData.target === '[data-tutorial="messages-page"]' ||
                            currentStepData.target === '[data-tutorial="notifications-page"]' ||
                            currentStepData.target === 'body';
        const isFilterBarStep = currentStepData.id === 'filter-bar' || currentStepData.target === '[data-tutorial="filter-bar"]';

        // Only add highlight class for non-page tutorials
        if (!isPageTutorial && !isFilterBarStep) {
          element.classList.add('tutorial-target-highlight');
        }
        
        setTargetElement(element);
        const rect = element.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        // Only scroll element into view if it's not visible and not near the top
        const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
        const isNearTop = rect.top < 100; // Don't scroll if element is already near top (like navbar)
        
        if (!isVisible && !isNearTop) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }

        // Calculate overlay position (highlight area)
        const padding = 8;
        setOverlayStyle({
          top: rect.top + scrollTop - padding,
          left: rect.left + scrollLeft - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        });

        // Calculate tooltip position
        const tooltipWidth = 320; // Fixed width matching w-80 class
        const tooltipHeight = 240; // Increased height for new design
        let tooltipTop = rect.top + scrollTop;
        let tooltipLeft = rect.left + scrollLeft;

        // Special positioning adjustment for specific elements (like create-post)
        const isSpecificElementTarget = currentStepData.target === '[data-tutorial="create-post"]';
        const verticalOffset = isSpecificElementTarget ? -250 : 0; // Move 250px upward for specific element targets

        // For page tutorials, position tooltip exactly in the center of the screen
        if (isPageTutorial) {
          tooltipTop = window.innerHeight / 2 - tooltipHeight / 2 + scrollTop;
          tooltipLeft = window.innerWidth / 2 - tooltipWidth / 2;
          // For page tutorials, use transform for precise centering
        } else {
          // For specific element tutorials, use the standard positioning
          switch (currentStepData.position) {
            case 'top':
              tooltipTop = rect.top + scrollTop - tooltipHeight - 16 + verticalOffset;
              tooltipLeft = rect.left + scrollLeft + rect.width / 2 - tooltipWidth / 2;
              break;
            case 'bottom':
              tooltipTop = rect.bottom + scrollTop + 16 + verticalOffset;
              tooltipLeft = rect.left + scrollLeft + rect.width / 2 - tooltipWidth / 2;
              break;
            case 'left':
              tooltipTop = rect.top + scrollTop + rect.height / 2 - tooltipHeight / 2 + verticalOffset;
              tooltipLeft = rect.left + scrollLeft - tooltipWidth - 16;
              break;
            case 'right':
              tooltipTop = rect.top + scrollTop + rect.height / 2 - tooltipHeight / 2 + verticalOffset;
              tooltipLeft = rect.right + scrollLeft + 16;
              break;
          }
        }

        // Ensure tooltip stays within viewport
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (tooltipLeft < 10) tooltipLeft = 10;
        if (tooltipLeft + tooltipWidth > viewportWidth - 10) {
          tooltipLeft = viewportWidth - tooltipWidth - 10;
        }
        if (tooltipTop < 10) tooltipTop = 10;
        if (tooltipTop + tooltipHeight > viewportHeight + scrollTop - 10) {
          tooltipTop = viewportHeight + scrollTop - tooltipHeight - 10;
        }

        setTooltipStyle({
          top: tooltipTop,
          left: tooltipLeft,
          width: tooltipWidth,
        });
        
        // Set tooltip as ready after positioning is calculated
        setTimeout(() => {
          setTooltipReady(true);
        }, 50);
      }
    };

    // Initial position calculation with a delay for stability
    setTimeout(updatePosition, 200);

    // Update position on resize or scroll
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);
    
    return () => {
      // Clean up event listeners
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
      
      // Reset tooltip ready state
      setTooltipReady(false);
      
      // Remove highlight classes from the target element
      if (targetElement) {
        targetElement.classList.remove('tutorial-target-highlight');
      }
      
      // Clean up any highlight classes that might be present on other elements
      document.querySelectorAll('.tutorial-target-highlight').forEach(el => {
        el.classList.remove('tutorial-target-highlight');
      });
    };
  }, [isActive, currentStep, steps, isAdminOrSuperAdmin, targetElement]);

  // Disable user-initiated scrolling while tutorial is active (but still allow programmatic scrollIntoView)
  useEffect(() => {
    if (!isActive || isAdminOrSuperAdmin) return;

    const preventScroll = (e: Event) => {
      e.preventDefault();
    };
    const preventKeyScroll = (e: KeyboardEvent) => {
      const keys = [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'PageUp',
        'PageDown',
        'Home',
        'End',
        ' ', // space
      ];
      if (keys.includes(e.key)) {
        e.preventDefault();
      }
    };

    // Add listeners (non-passive so we can preventDefault)
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('keydown', preventKeyScroll, { passive: false } as AddEventListenerOptions); // casting for TS

    return () => {
      window.removeEventListener('wheel', preventScroll as EventListener);
      window.removeEventListener('touchmove', preventScroll as EventListener);
      window.removeEventListener('keydown', preventKeyScroll as EventListener);
    };
  }, [isActive, isAdminOrSuperAdmin]);

  // Trigger confetti on the last step
  useEffect(() => {
    if (!isActive || !tooltipReady || isAdminOrSuperAdmin) return;
    
    // Check if we're on the last step
    if (currentStep === steps.length - 1) {
      // Delay confetti slightly for better effect
      const confettiTimer = setTimeout(() => {
        // Fire confetti from multiple angles for a celebration effect
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10003 };

        function randomInRange(min: number, max: number) {
          return Math.random() * (max - min) + min;
        }

        const interval: any = setInterval(function() {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            return clearInterval(interval);
          }

          const particleCount = 50 * (timeLeft / duration);
          
          // Fire confetti from left side
          confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
          });
          
          // Fire confetti from right side
          confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
          });
        }, 250);

        return () => clearInterval(interval);
      }, 300);

      return () => clearTimeout(confettiTimer);
    }
  }, [isActive, currentStep, steps.length, tooltipReady, isAdminOrSuperAdmin]);

  // If tutorial is not active, step doesn't exist or user is admin/super admin, don't render anything
  if (!isActive || !steps[currentStep] || isAdminOrSuperAdmin) return null;
  
  const currentStepData = steps[currentStep];

  // Check if we're on a page-level tutorial item (rather than a specific element)
  const isPageTutorial = currentStepData.target === '[data-tutorial="profile-page"]' ||
                      currentStepData.target === '[data-tutorial="events-page"]' ||
                      currentStepData.target === '[data-tutorial="groups-page"]' || 
                      /* community page removed */
                      currentStepData.target === '[data-tutorial="messages-page"]' ||
                      currentStepData.target === '[data-tutorial="notifications-page"]' ||
                      currentStepData.target === 'body';
                      
  // Create post or other specific elements that need special positioning
  const isSpecificElementTarget = currentStepData.target === '[data-tutorial="create-post"]';
  // For the filter bar step, suppress the dark overlay and highlight box
  const suppressOverlayForFilterBar = currentStepData.id === 'filter-bar' || currentStepData.target === '[data-tutorial="filter-bar"]';

  return (
    <>
      {/* Dark overlay (hidden for filter bar step) - blocks all interactions */}
      {!suppressOverlayForFilterBar && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[9997] pointer-events-auto transition-opacity duration-300 ease-in-out" />
      )}

      {/* Transparent overlay for filter bar step - blocks interactions but invisible */}
      {suppressOverlayForFilterBar && (
        <div className="fixed inset-0 bg-transparent z-[9997] pointer-events-auto" />
      )}

      {/* Highlight area - only show for specific elements, not for page tooltips */}
      {targetElement && !isPageTutorial && !suppressOverlayForFilterBar && (
        <div
          className="fixed bg-transparent border-2 border-green-400 rounded-lg shadow-lg z-[10001] pointer-events-none tutorial-highlight-glow transition-all duration-300 ease-in-out"
          style={overlayStyle}
        />
      )}

      {/* Tooltip - only show once positioning is calculated */}
      {tooltipReady && (
        <div
          className={`fixed bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-2xl shadow-2xl z-[10002] w-80 max-w-[90vw] pointer-events-auto ${
            isPageTutorial 
              ? 'tutorial-simple-fade-in' 
              : 'tutorial-appear'
          } ${isSpecificElementTarget ? 'transform -translate-y-32' : ''}`}
          style={tooltipStyle}
        >
        {/* Close button */}
        <button
          onClick={skipTutorial}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-200 transition-colors p-1 rounded-full hover:bg-gray-800"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="p-6 pr-12">
          <h3 className="text-lg font-bold text-white mb-3 leading-tight">
            {currentStepData.title}
          </h3>
          <p className="text-gray-300 text-sm leading-relaxed">
            {currentStepData.description}
          </p>
        </div>

        {/* Progress indicators */}
        <div className="px-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex space-x-2">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentStep 
                      ? 'w-6 bg-green-500' 
                      : index < currentStep 
                        ? 'w-1.5 bg-green-400' 
                        : 'w-1.5 bg-gray-600'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-gray-400 font-medium">
              {currentStep + 1} of {steps.length}
            </span>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between gap-3">
            {/* Previous button */}
            <button
              onClick={prevStep}
              disabled={currentStep === 0 || isNavigating}
              className={`flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 min-w-0 flex-1 ${
                currentStep === 0 || isNavigating
                  ? 'text-gray-500 cursor-not-allowed bg-gray-800 border border-gray-700'
                  : 'text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-gray-500'
              }`}
            >
              <ChevronLeftIcon className="h-4 w-4 mr-1.5 flex-shrink-0" />
              <span className="truncate">Back</span>
            </button>

            {/* Next/Finish button */}
            <button
              onClick={nextStep}
              disabled={isNavigating}
              className={`flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 min-w-0 flex-1 ${
                isNavigating 
                  ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-500 text-white shadow-lg hover:shadow-green-500/25'
              }`}
            >
              {isNavigating ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 mr-1.5 animate-spin flex-shrink-0" />
                  <span className="truncate">Loading</span>
                </>
              ) : currentStep === steps.length - 1 ? (
                <span className="truncate">Finish</span>
              ) : (
                <>
                  <span className="truncate">Next</span>
                  <ChevronRightIcon className="h-4 w-4 ml-1.5 flex-shrink-0" />
                </>
              )}
            </button>
          </div>

          {/* Skip tutorial */}
          <div className="mt-4 text-center">
            <button
              onClick={skipTutorial}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors font-medium"
            >
              Skip tutorial
            </button>
          </div>
        </div>
      </div>
      )}
    </>
  );
};

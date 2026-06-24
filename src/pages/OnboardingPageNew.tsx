import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRightIcon, ArrowRightIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { ScrollAnimation } from '../components/ScrollAnimation';
import '../styles/onboarding.css';
import TermsAndConditionsModal from '../components/modals/TermsAndConditionsModal';
import PrivacyPolicyModal from '../components/modals/PrivacyPolicyModal';
import CommunicationGuidelinesModal from '../components/modals/CommunicationGuidelinesModal';
import OnboardingFooter from '../components/onboarding/OnboardingFooter';

// Add this css at the top of your component
// This will be used for parallax effects and menu animations
const parallaxStyles = `
  .parallax-bg-slow {
    transition: transform 0.2s cubic-bezier(0.2, 0.49, 0.32, 0.99);
  }
  .parallax-bg-medium {
    transition: transform 0.15s cubic-bezier(0.2, 0.49, 0.32, 0.99);
  }
  .parallax-bg-fast {
    transition: transform 0.1s cubic-bezier(0.2, 0.49, 0.32, 0.99);
  }
  
  .menu-enter {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  
  .menu-enter-active {
    opacity: 1;
    transform: translateY(0) scale(1);
    transition: opacity 300ms, transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  
  .menu-exit {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  
  .menu-exit-active {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
    transition: opacity 300ms, transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
  }
`;

// Custom hook for parallax effect
const useParallax = () => {
  const [scrollY, setScrollY] = useState(0);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate mouse position relative to the center of the viewport
      const x = (e.clientX / window.innerWidth - 0.5) * 2; // -1 to 1
      const y = (e.clientY / window.innerHeight - 0.5) * 2; // -1 to 1
      setMousePosition({ x, y });
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);
  
  // Calculate different speeds for different elements
  const getScrollTransform = (speed = 1, offset = 0) => {
    return {
      transform: `translateY(${scrollY * speed + offset}px)`,
    };
  };
  
  // Calculate mouse-based parallax
  const getMouseTransform = (speed = 0.1) => {
    return {
      transform: `translate(${mousePosition.x * speed * 100}px, ${mousePosition.y * speed * 100}px)`,
    };
  };
  
  return { scrollY, mousePosition, getScrollTransform, getMouseTransform };
};

type FeatureKey = 'academicGroups' | 'virtualStudySpaces' | 'resourceLibrary' | 'eventCalendar';

interface FeatureModalContent {
  eyebrow: string;
  title: string;
  intro: string;
  highlights: string[];
  tips: string[];
}

const featureCardConfig: Array<{ key: FeatureKey; title: string; description: string; color: string }> = [
  {
    key: 'academicGroups',
    title: 'Academic Groups',
    description: 'Join subject-specific groups to collaborate with peers and faculty',
    color: 'gradient-orange'
  },
  {
    key: 'virtualStudySpaces',
    title: 'Virtual Study Spaces',
    description: 'Create or join virtual spaces for focused group study sessions',
    color: 'gradient-emerald'
  },
  {
    key: 'resourceLibrary',
    title: 'Resource Library',
    description: 'Access a vast collection of academic resources and materials',
    color: 'gradient-purple'
  },
  {
    key: 'eventCalendar',
    title: 'Event Calendar',
    description: 'Never miss important academic and social events on campus',
    color: 'gradient-teal'
  }
];

const featureModalCopy: Record<FeatureKey, FeatureModalContent> = {
  academicGroups: {
    eyebrow: 'Collaboration Hubs',
    title: 'Academic Groups',
    intro: 'Build dedicated homes for every course, organization, or study circle. Academic Groups keep conversations, announcements, and shared files anchored to the people who need them most.',
    highlights: [
      'Create moderated spaces with customizable guidelines and pinned resources so everyone starts on the same page.',
      'Post announcements, share documents, and run quick polls without jumping across multiple apps.',
      'Tap into notification preferences that surface urgent updates while letting learners mute what can wait.'
    ],
    tips: [
      'Use the group templates to spin up new cohorts faster and keep naming conventions consistent.',
      'Assign co-moderators from faculty or lead students so questions always get an informed response.'
    ]
  },
  virtualStudySpaces: {
    eyebrow: 'Real-time Collaboration',
    title: 'Virtual Study Spaces',
    intro: 'Recreate the energy of an in-person study hall. Virtual Study Spaces layer video, task boards, and shared notes into one focused environment.',
    highlights: [
      'Launch drop-in rooms for cram sessions, thesis defenses, or mentorship meetings with a single link.',
      'Co-edit whiteboards and task lists so everyone leaves with the same action items and references.',
      'Pomodoro timers and focus soundscapes encourage productive sprints without losing track of breaks.'
    ],
    tips: [
      'Schedule recurring spaces for lab groups so teammates always know where to meet online.',
      'Enable session recaps to automatically send notes and recordings to absent members.'
    ]
  },
  resourceLibrary: {
    eyebrow: 'Centralized Materials',
    title: 'Resource Library',
    intro: 'Keep lecture decks, reviewer sheets, and campus policies searchable in one curated library. Metadata and smart tags make the right file effortless to find.',
    highlights: [
      'Upload files once and automatically apply course tags, subjects, and visibility rules.',
      'Surface trending materials based on what classmates bookmark, download, or comment on.',
      'Version history makes it clear which syllabus or reviewer is the latest without manual renaming.'
    ],
    tips: [
      'Add short descriptions to every upload so future students quickly understand why it matters.',
      'Bundle related resources into study collections and share them directly inside your groups.'
    ]
  },
  eventCalendar: {
    eyebrow: 'Campus Planner',
    title: 'Event Calendar',
    intro: 'Coordinate academic deadlines, organization gatherings, and campus celebrations in a unified timeline that syncs with personal calendars.',
    highlights: [
      'Color-code events by category so exams, workshops, and community drives stand out at a glance.',
      'RSVP tracking and capacity limits help organizers prepare materials and venues efficiently.',
      'Automated reminders and digest emails ensure every member stays aligned on what is happening next.'
    ],
    tips: [
      'Export schedules to Google or Outlook calendars when you need reminders outside BulSU Space.',
      'Use follow-up tasks to assign volunteers, logistics, and documentation roles right after an event.'
    ]
  }
};

// Navigation Component
const Navigation: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  
  

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && isMenuOpen) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  return (
    <>
      {/* Backdrop overlay when menu is open (mobile only) */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 sm:hidden animate-fadeIn"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
      <nav className="fixed top-1 sm:top-4 lg:top-6 left-1/2 transform -translate-x-1/2 z-50 glass-morphism rounded-full px-2 sm:px-6 py-1.5 sm:py-3.5 shadow-xl shadow-emerald-900/10 backdrop-blur-md border border-emerald-500/10 hover:border-emerald-400/30 transition-colors">
        {/* Responsive layout with overflow handling */}
        <div className="flex items-center w-screen max-w-[90vw] sm:max-w-[90vw] md:max-w-[720px] overflow-x-auto hide-scrollbar">
          {/* Left section with logo - adaptive width */}
          <div className="flex items-center w-auto sm:w-24 md:w-40 flex-shrink-0">
            <button
              onClick={() => navigate('/')}
              className="flex items-center space-x-2 bg-transparent hover:text-emerald-400 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
              aria-label="Back to home"
            >
              <div className="relative">
                <img
                  src="/images/bulsu-space-logo.png"
                  alt="BulSU Space Logo"
                  className="w-4 h-4 sm:w-7 sm:h-7 transition-all duration-300 relative z-10"
                />
              </div>
              <span className="font-bold text-[10px] sm:text-sm ml-1 sm:ml-0 relative z-10">BulSU Space</span>
            </button>
          </div>
              {/* Hamburger menu icon for mobile */}
        <div className="sm:hidden ml-auto flex items-center">
          <button
            onClick={toggleMenu}
            className="text-white p-1.5 relative focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-full bg-transparent"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? (
              <XMarkIcon className="h-6 w-6" />
            ) : (
              <Bars3Icon className="h-6 w-6" />
            )}
          </button>
        </div>
          
          {/* Center section with navigation - centered with proper spacing - hidden on mobile unless menu is open */}
          <div 
            ref={menuRef}
            className={`${isMenuOpen ? 'flex animate-menuFadeIn' : 'hidden sm:flex'} transition-all duration-300 ease-in-out ${isMenuOpen ? 'absolute top-full left-0 right-0 mt-3 glass-morphism rounded-xl p-5 flex-col space-y-4 w-[90vw] mx-auto border border-emerald-500/20 shadow-xl shadow-emerald-900/20 backdrop-blur-lg' : 'sm:static sm:bg-transparent sm:p-0 sm:flex-row sm:flex-grow sm:items-center sm:justify-center sm:space-y-0 sm:mt-0 sm:border-0 sm:shadow-none'}`}>
            <div className="sm:flex sm:items-center sm:space-x-7 w-full sm:w-auto flex flex-col sm:flex-row space-y-4 sm:space-y-0">
              <button 
                onClick={() => {
                  navigate('/features');
                  setIsMenuOpen(false);
                }}
                className="!text-white bg-transparent hover:text-emerald-200 hover:scale-105 relative px-3 sm:px-2 py-2 sm:py-1 transition-all duration-300 font-normal text-sm group overflow-hidden w-full sm:w-auto text-center sm:text-left"
              >
                <div className="absolute inset-0 bg-emerald-500/20 rounded-lg opacity-0 group-hover:opacity-80 transition-opacity"></div>
                <span className="relative z-10">Features</span>
                <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-gradient-to-r from-emerald-300 to-teal-400 transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover:w-full"></span>
              </button>
              <button 
                onClick={() => {
                  navigate('/about');
                  setIsMenuOpen(false);
                }}
                className="!text-white bg-transparent hover:text-emerald-200 hover:scale-105 relative px-3 sm:px-2 py-2 sm:py-1 transition-all duration-300 font-normal text-sm group overflow-hidden w-full sm:w-auto text-center sm:text-left"
              >
                <div className="absolute inset-0 bg-emerald-500/20 rounded-lg opacity-0 group-hover:opacity-80 transition-opacity"></div>
                <span className="relative z-10">About</span>
                <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-gradient-to-r from-emerald-300 to-teal-400 transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover:w-full"></span>
              </button>
              <button 
                onClick={() => {
                  navigate('/contact');
                  setIsMenuOpen(false);
                }}
                className="!text-white bg-transparent hover:text-emerald-200 hover:scale-105 relative px-3 sm:px-2 py-2 sm:py-1 transition-all duration-300 font-normal text-sm group overflow-hidden w-full sm:w-auto text-center sm:text-left"
              >
                <div className="absolute inset-0 bg-emerald-500/20 rounded-lg opacity-0 group-hover:opacity-80 transition-opacity"></div>
                <span className="relative z-10">Contact</span>
                <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-gradient-to-r from-emerald-300 to-teal-400 transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover:w-full"></span>
              </button>
              
              {/* mobile join removed */}
            </div>
          </div>
          
          {/* join button removed from desktop nav */}
        </div>
      </nav>
    </>
  );
};

// CountUpStat Component
const CountUpStat: React.FC<{
  endValue: number, 
  suffix?: string, 
  label: string,
  duration?: number,
  formatK?: boolean
}> = ({ endValue, suffix = '+', label, duration = 2000, formatK = false }) => {
  const [count, setCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const statRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Start animation when stat comes into view
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    
    if (statRef.current) {
      observer.observe(statRef.current);
    }
    
    return () => {
      observer.disconnect();
    };
  }, []);
  
  useEffect(() => {
    if (!isVisible) return;
    
    let startTime: number | null = null;
    let animationFrame: number;
    
    const updateCount = (timestamp: number) => {
      if (!startTime) {
        startTime = timestamp;
        setHasAnimated(true);
      }
      const progress = timestamp - startTime;
      
      // Calculate the current count based on progress
      const percentage = Math.min(progress / duration, 1);
      const easeOutQuart = 1 - Math.pow(1 - percentage, 4); // Easing function for natural slowdown
      const currentCount = Math.floor(easeOutQuart * endValue);
      
      setCount(currentCount);
      
      if (progress < duration) {
        animationFrame = requestAnimationFrame(updateCount);
      } else {
        setCount(endValue);
      }
    };
    
    animationFrame = requestAnimationFrame(updateCount);
    
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [endValue, duration, isVisible]);
  
  // Format number to show K for thousands
  const formattedCount = formatK && count >= 1000 
    ? `${(count / 1000).toFixed(count % 1000 === 0 ? 0 : 1)}K` 
    : count;
  
  return (
    <div 
      ref={statRef} 
      className={`text-base sm:text-lg lg:text-2xl font-black mb-0.5 transition-all duration-500 ${
        hasAnimated ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
      }`}
    >
      {formattedCount}{suffix}
    </div>
  );
};

// Hero Section Component
const HeroSection: React.FC = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const { getScrollTransform } = useParallax();
  const navigate = useNavigate();
  
  useEffect(() => {
    // Set loaded state after a much longer delay to trigger animations
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 800); // Increased from 500ms to 800ms for a more dramatic entrance
    
    return () => clearTimeout(timer);
  }, []);
  
  return (
    <section className="relative min-h-screen flex items-center curved-section pt-20 sm:pt-24 overflow-hidden">
      <div 
        className={`absolute inset-0 bg-cover bg-center transition-transform duration-4000 delay-2000 ease-in ${
          isLoaded ? 'scale-100 opacity-100' : 'scale-110 opacity-0'
        }`} 
        style={{
    backgroundImage: "url('/images/hero-bg.png')"
        }}
      />
      <div className={`absolute inset-0 gradient-orange transition-opacity duration-4500 delay-2000 ease-in-out ${
        isLoaded ? 'opacity-80' : 'opacity-0'
      }`} />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
        <div className="space-y-6 lg:space-y-8 order-2 lg:order-1" style={getScrollTransform(-0.03)}>
          <div className={`glass-morphism rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-full lg:max-w-lg transition-all duration-3000 ease-in ${
            isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16'
          }`}>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-black leading-tight mb-4 sm:mb-6">
              <span className={`inline-block transition-all duration-2500 delay-1200 ease-in ${
                isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}>
                Making space for 
              </span>
              <span className={`block transition-all duration-2500 delay-2200 ease-in ${
                isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}>
                transformative
              </span>
              <span className={`block transition-all duration-2500 delay-3200 ease-in ${
                isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}>
                innovation
              </span>
            </h1>
            {/* Down-arrow removed as requested */}
            
            <div className={`mt-6 flex items-center space-x-4 transition-all duration-2000 ease-in ${
              isLoaded ? 'opacity-100 translate-y-0 delay-4500' : 'opacity-0 translate-y-12'
            }`}>
              <button 
                onClick={() => navigate('/signin')} 
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-full text-sm transition-all duration-300 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 flex items-center"
              >
                Join the Community
                <ArrowRightIcon className="w-4 h-4 ml-2" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6 order-1 lg:order-2" style={getScrollTransform(-0.04)}>
          {/* Statistics removed as requested */}

          {/* Feature cards removed (Join the Community / Academic Excellence) as requested */}
        </div>
      </div>
    </section>
  );
};

// Mission Vision Section Component
const MissionVisionSection: React.FC<{ onLearnMore: () => void }> = ({ onLearnMore }) => {
  return (
    <section className="py-16 sm:py-20 lg:py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          <div className="order-2 lg:order-1">
            <ScrollAnimation direction="left" distance={80} delay={150} duration={1000}>
              <div className="glass-morphism rounded-2xl sm:rounded-3xl p-6 sm:p-8 relative overflow-hidden">
                <div className="relative z-10 space-y-4 sm:space-y-6">
                  <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">Our Mission & Vision</h2>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold mb-2 text-emerald-400">Our Mission</h3>
                      <p className="text-sm sm:text-base">
                        "BulSU Space - Hagonoy aims to enhance communication, strengthen academic engagement, and foster a sense of belonging by providing accessible, innovative, and user-friendly tools that support learning, collaboration, and personal growth within the BulSU Hagonoy campus."
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold mb-2 text-blue-400">Our Vision</h3>
                      <p className="text-sm sm:text-base">
                        "To be the leading digital platform that unites the BulSU Hagonoy academic community, empowering students, faculty, and alumni to connect, collaborate, and thrive in a dynamic learning environment."
                      </p>
                    </div>
                  </div>
                  {/* 'Learn More' button removed as requested */}
                </div>
              </div>
            </ScrollAnimation>
          </div>
          
          <div className="order-1 lg:order-2 grid grid-cols-2 gap-4 sm:gap-6">
            <ScrollAnimation direction="right" distance={60} delay={200} duration={800}>
              <div className="gradient-teal rounded-2xl sm:rounded-3xl p-6 sm:p-8 hover:scale-105 transition-transform h-full flex flex-col justify-between">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/20 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                  </svg>
                </div>
                <h3 className="text-lg sm:text-xl font-bold mb-2">Excellence</h3>
                <p className="text-xs sm:text-sm opacity-90">We strive for academic and technical excellence in all we do</p>
              </div>
            </ScrollAnimation>
            
            <ScrollAnimation direction="right" distance={60} delay={300} duration={800}>
              <div className="gradient-rose rounded-2xl sm:rounded-3xl p-6 sm:p-8 hover:scale-105 transition-transform h-full flex flex-col justify-between">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/20 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                  </svg>
                </div>
                <h3 className="text-lg sm:text-xl font-bold mb-2">Community</h3>
                <p className="text-xs sm:text-sm opacity-90">Building meaningful connections that last</p>
              </div>
            </ScrollAnimation>
            
            <ScrollAnimation direction="right" distance={60} delay={400} duration={800}>
              <div className="gradient-indigo rounded-2xl sm:rounded-3xl p-6 sm:p-8 hover:scale-105 transition-transform h-full flex flex-col justify-between">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/20 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                </div>
                <h3 className="text-lg sm:text-xl font-bold mb-2">Innovation</h3>
                <p className="text-xs sm:text-sm opacity-90">Embracing new ideas and technologies</p>
              </div>
            </ScrollAnimation>
            
            <ScrollAnimation direction="right" distance={60} delay={500} duration={800}>
              <div className="gradient-purple rounded-2xl sm:rounded-3xl p-6 sm:p-8 hover:scale-105 transition-transform h-full flex flex-col justify-between">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/20 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
                    <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
                    <line x1="6" y1="1" x2="6" y2="4"></line>
                    <line x1="10" y1="1" x2="10" y2="4"></line>
                    <line x1="14" y1="1" x2="14" y2="4"></line>
                  </svg>
                </div>
                <h3 className="text-lg sm:text-xl font-bold mb-2">Learning</h3>
                <p className="text-xs sm:text-sm opacity-90">Continuous growth through shared knowledge</p>
              </div>
            </ScrollAnimation>
          </div>
        </div>
      </div>
    </section>
  );
};

// FeaturesShowcase removed as requested

// Platform Features Section Component
const PlatformFeaturesSection: React.FC<{ onFeatureLearnMore: (feature: FeatureKey) => void }> = ({ onFeatureLearnMore }) => {
  const navigate = useNavigate();
  return (
    <section className="py-16 sm:py-20 lg:py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
          <div className="lg:col-span-2 space-y-6">
            <ScrollAnimation direction="left" delay={100} duration={800}>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold">Discover What BulSU Space Has to Offer</h2>
              <p className="text-sm sm:text-base opacity-80 mt-6">
                Our platform is built with the specific needs of academic communities in mind, providing tools and features that enhance collaboration, learning, and campus life.
              </p>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => navigate('/features')}
                  className="inline-flex items-center justify-center px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors text-sm"
                >
                  Explore All Features
                  <ChevronRightIcon className="ml-2 w-4 h-4" />
                </button>
              </div>
            </ScrollAnimation>
          </div>
          
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {featureCardConfig.map((feature, index) => (
              <ScrollAnimation 
                key={feature.key} 
                direction="right" 
                delay={200 + (index * 100)} 
                duration={800}
                className="w-full"
              >
                <button
                  type="button"
                  onClick={() => onFeatureLearnMore(feature.key)}
                  className={`${feature.color} rounded-xl sm:rounded-2xl p-6 w-full text-left hover:scale-105 transition-transform group focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70`}
                  aria-label={`Learn more about ${feature.title}`}
                >
                  <h3 className="text-lg sm:text-xl font-bold mb-2">{feature.title}</h3>
                  <p className="text-sm opacity-90 mb-4">{feature.description}</p>
                  <div className="flex items-center text-sm font-medium">
                    Learn more
                    <ChevronRightIcon className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </ScrollAnimation>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

// CommunityStatistics removed as requested

const OnboardingPage: React.FC = () => {
  const { getScrollTransform } = useParallax();
  const parallaxRef = useRef<HTMLDivElement>(null);
  // Modal state for footer links
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [commGuidelinesOpen, setCommGuidelinesOpen] = useState(false);
  const [missionModalOpen, setMissionModalOpen] = useState(false);
  const [activeFeatureKey, setActiveFeatureKey] = useState<FeatureKey | null>(null);
  // QR code sources: primary (Google Charts) and fallback (qrserver)
  const primaryQr = `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent('https://bulsuspace.web.app/')}&chld=L%7C1`;
  const fallbackQr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('https://bulsuspace.web.app/')}`;
  const [qrSrc, setQrSrc] = useState(primaryQr);

  const handleFeatureLearnMore = (feature: FeatureKey) => {
    setActiveFeatureKey(feature);
  };

  return (
    <div ref={parallaxRef} className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
      <Navigation />

      {/* Parallax Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 50%, rgba(76, 175, 80, 0.1) 0%, rgba(0, 0, 0, 0) 50%)",
          }}
        />
        <div 
          className="absolute top-[10%] right-[5%] w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{
            background: "linear-gradient(45deg, #4CAF50, #2196F3)"
          }}
        />
        <div 
          className="absolute bottom-[20%] left-[15%] w-64 h-64 rounded-full blur-3xl opacity-10"
          style={{
            background: "linear-gradient(45deg, #FF9800, #F44336)"
          }}
        />
        <div className="absolute -bottom-[30%] left-[40%] w-[800px] h-[800px] rounded-full blur-3xl opacity-5"
          style={{
            background: "radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%)"
          }}
        />
      </div>

      {/* Content Sections */}
      <div className="relative z-10">
        <HeroSection />

        <ScrollAnimation direction="up" delay={100} duration={800}>
          <MissionVisionSection onLearnMore={() => setMissionModalOpen(true)} />
        </ScrollAnimation>

        {/* FeaturesShowcase removed */}

        <ScrollAnimation direction="up" delay={200} duration={800}>
          <PlatformFeaturesSection onFeatureLearnMore={handleFeatureLearnMore} />
        </ScrollAnimation>

        <ScrollAnimation direction="up" delay={250} duration={800}>
          <section className="py-12 sm:py-16 lg:py-20 relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="glass-morphism rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex-1">
                  <h3 className="text-xl sm:text-2xl font-bold mb-2">Invite fellow Kingfishers</h3>
                  <p className="text-sm opacity-90 mb-4">Share BulSU Space with your friends and classmates. Scan the QR code or copy the link below to invite them.</p>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
                    <div className="flex-1 max-w-lg">
                      <label className="sr-only">Invite link</label>
                      <input
                        readOnly
                        value={"https://bulsuspace.web.app/"}
                        className="bg-white/5 text-sm px-4 py-3 rounded-lg w-full ring-0 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
                      />
                    </div>

                    <div className="flex items-center space-x-2 mt-3 sm:mt-0">
                      <CopyInviteButton link={"https://bulsuspace.web.app/"} />
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0 flex flex-col items-center justify-center">
                  <div className="rounded-3xl p-1 bg-gradient-to-br from-emerald-400 via-teal-300 to-indigo-500 shadow-2xl hover:scale-105 transform transition-transform">
                    <div className="bg-gray-900 rounded-2xl p-2 border border-white/10">
                      <div className="bg-white rounded-lg p-1">
                        <img
                          src={qrSrc}
                          alt="BulSU Space QR Code"
                          className="w-40 h-40 sm:w-48 sm:h-48 rounded-lg block"
                          onError={() => {
                            if (qrSrc !== fallbackQr) setQrSrc(fallbackQr);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-center text-white/80">Scan to join BulSU Space</div>
                </div>
              </div>
            </div>
          </section>
        </ScrollAnimation>

        {/* CommunityStatistics removed */}

        <ScrollAnimation direction="up" delay={200} duration={800}>
          <OnboardingFooter
            onOpenTerms={() => setTermsOpen(true)}
            onOpenPrivacy={() => setPrivacyOpen(true)}
          />
        </ScrollAnimation>
      </div>

      {/* Modals triggered from footer links */}
      <MissionVisionModal isOpen={missionModalOpen} onClose={() => setMissionModalOpen(false)} />
      <FeatureLearnMoreModal featureKey={activeFeatureKey} onClose={() => setActiveFeatureKey(null)} />
      <TermsAndConditionsModal isOpen={termsOpen} onClose={() => setTermsOpen(false)} viewOnly={true} />
      <PrivacyPolicyModal isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <CommunicationGuidelinesModal isOpen={commGuidelinesOpen} onClose={() => setCommGuidelinesOpen(false)} />
    </div>
  );
};

// Copy button component
const CopyInviteButton: React.FC<{ link: string }> = ({ link }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = link;
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Copy failed', err);
      }
      document.body.removeChild(el);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm border border-emerald-600/30 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-300"
      title="Copy invite link"
      aria-label="Copy invite link"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};

// Share button component (uses Web Share API if available)
const ShareInviteButton: React.FC<{ link: string; title?: string }> = ({ link, title }) => {
  const handleShare = async () => {
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({ title: title || 'BulSU Space', url: link });
      } catch (err) {
        // ignore or log
        console.error('Share failed', err);
      }
    } else {
      // Fallback - open native share dialog or just copy
      try {
        await navigator.clipboard.writeText(link);
        alert('Link copied to clipboard. Share it with your friends!');
      } catch (e) {
        window.open(link, '_blank');
      }
    }
  };

  return (
    <button
      onClick={handleShare}
      className="bg-teal-500 hover:bg-teal-600 text-white px-3 py-2 rounded-lg text-sm border border-teal-600/30 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-teal-300"
      title="Share invite"
      aria-label="Share invite link"
    >
      Share
    </button>
  );
};

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, eyebrow, title, children, footer }) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

    return (
    <div
      className="fixed inset-0 z-[2147483000] bg-black/75 backdrop-blur-sm px-4 py-6 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-2xl bg-gray-900 border border-white/10 rounded-3xl shadow-2xl p-6 sm:p-8 text-white/90">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 transition text-white/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          aria-label="Close modal"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
        <div className="space-y-2">
          {eyebrow && <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">{eyebrow}</p>}
          <h3 className="text-2xl font-semibold text-white">{title}</h3>
        </div>
        <div className="mt-4 text-sm leading-relaxed space-y-4">
          {children}
        </div>
        {footer && <div className="mt-6 pt-4 border-t border-white/10">{footer}</div>}
      </div>
    </div>
  );
};

const MissionVisionModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();

  return (
    <InfoModal
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="BulSU Space Foundations"
      title="Mission & Vision in Action"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/about');
            }}
            className="px-5 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 transition text-sm text-white shadow-lg shadow-emerald-500/30"
          >
            Visit About Page
          </button>
        </div>
      }
    >
      <p>
        BulSU Space exists to make the BulSU Hagonoy community feel connected, informed, and empowered. Our mission and vision guide every design decision—from how announcements surface to the way peer support happens in groups.
      </p>
      <div className="grid gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <h4 className="text-lg font-semibold text-emerald-300">Mission</h4>
          <p className="mt-2 text-white/80">
            We enhance communication, strengthen academic engagement, and foster belonging by supplying accessible, user-friendly tools that support learning, collaboration, and personal growth across the campus.
          </p>
          <ul className="mt-3 list-disc pl-5 space-y-2 text-white/70">
            <li>Dedicated spaces keep conversations and resources aligned with every course and organization.</li>
            <li>Inclusive design makes sure first-year students and graduating alumni can participate effortlessly.</li>
            <li>Built-in accountability—from moderation to analytics—helps campus leaders steer healthy communities.</li>
          </ul>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <h4 className="text-lg font-semibold text-blue-300">Vision</h4>
          <p className="mt-2 text-white/80">
            We aspire to become the digital home that unites students, faculty, and alumni—fueling collaboration, mentorship, and innovation long after the bell rings.
          </p>
          <ul className="mt-3 list-disc pl-5 space-y-2 text-white/70">
            <li>Context-aware notifications keep every Kingfisher in sync with milestones and celebrations.</li>
            <li>Discovery tools highlight communities, events, and resources that extend learning beyond the classroom.</li>
            <li>Long-term knowledge archives ensure campus wisdom compounds year after year.</li>
          </ul>
        </div>
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <h4 className="text-sm font-semibold text-emerald-200 uppercase tracking-wider">What this means for you</h4>
          <p className="mt-2 text-white/70">
            Whether you are joining your first organization or leading university-wide initiatives, BulSU Space provides structured tools, transparent communication, and data-informed insights so you can focus on meaningful impact.
          </p>
        </div>
      </div>
    </InfoModal>
  );
};

const FeatureLearnMoreModal: React.FC<{ featureKey: FeatureKey | null; onClose: () => void }> = ({ featureKey, onClose }) => {
  const navigate = useNavigate();
  if (!featureKey) {
    return null;
  }

  const content = featureModalCopy[featureKey];

  return (
    <InfoModal
      isOpen={Boolean(featureKey)}
      onClose={onClose}
      eyebrow={content.eyebrow}
      title={content.title}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/features');
            }}
            className="px-5 py-2 rounded-full bg-teal-500 hover:bg-teal-600 transition text-sm text-white shadow-lg shadow-teal-500/30"
          >
            Explore All Features
          </button>
        </div>
      }
    >
      {/* Short summary + two highlights (keeps modal concise) */}
      <p className="mb-4">{content.intro.split('.').slice(0,1).join('.') + '.'}</p>
      <ul className="mt-3 list-disc pl-5 space-y-2 text-white/70">
        {content.highlights.slice(0,2).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </InfoModal>
  );
};

// Make sure this component is properly exported
export default OnboardingPage;

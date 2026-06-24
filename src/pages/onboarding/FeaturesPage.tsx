import React, { useRef, useState, useEffect } from 'react';
import TermsAndConditionsModal from '../../components/modals/TermsAndConditionsModal';
import PrivacyPolicyModal from '../../components/modals/PrivacyPolicyModal';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, ChevronRightIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { ScrollAnimation } from '../../components/ScrollAnimation';
import '../../styles/onboarding.css';
import OnboardingFooter from '../../components/onboarding/OnboardingFooter';

// Icons for features
import {
  ChatBubbleLeftRightIcon,
  BellAlertIcon,
  LockClosedIcon,
  UserGroupIcon,
  MegaphoneIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  StarIcon,
  SquaresPlusIcon,
  AcademicCapIcon, // New icon for "Why Choose Us"
  LightBulbIcon, // New icon for "Why Choose Us"
  GlobeAltIcon, // New icon for "Why Choose Us"
  CheckCircleIcon, // New icon for "Testimonials"
  // PlayCircleIcon removed
  CalendarDaysIcon, // New icon for "How It Works"
  DocumentTextIcon, // New icon for "How It Works"
  ShareIcon, // New icon for "How It Works"
} from '@heroicons/react/24/outline';

// Navigation Component (remains largely the same, minor style tweaks)
interface NavigationProps {
  hidden?: boolean;
}
const Navigation: React.FC<NavigationProps> = ({ hidden = false }) => {
  const navigate = useNavigate();

  const handleBackToHome = () => {
    navigate('/');
  };

  const handleAboutPage = () => {
    navigate('/about');
  };

  const handleFeaturesPage = () => {
    navigate('/features');
  };

  const handleContactPage = () => {
    navigate('/contact');
  };

  return (
    <nav className={`${hidden ? 'hidden' : ''} fixed top-1 sm:top-4 lg:top-6 left-1/2 transform -translate-x-1/2 z-40 glass-morphism rounded-full px-2 sm:px-6 py-1.5 sm:py-3.5 shadow-xl shadow-emerald-900/10 backdrop-blur-md border border-emerald-500/10 hover:border-emerald-400/30 transition-colors`}>
      {/* Responsive layout with overflow handling */}
      <div className="flex items-center w-screen max-w-[90vw] sm:max-w-[90vw] md:max-w-[720px] overflow-x-auto hide-scrollbar">
        {/* Left section with logo - adaptive width */}
        <div className="flex items-center w-auto sm:w-24 md:w-40 flex-shrink-0">
          <button
            onClick={handleBackToHome}
            className="flex items-center space-x-1 sm:space-x-2 bg-transparent hover:text-emerald-400 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
            aria-label="Back to home"
          >
            <ArrowLeftIcon className="w-2.5 h-2.5 sm:w-4 sm:h-4" />
            <span className="text-[10px] sm:text-sm hidden xs:inline">Back</span>
            <span className="text-[10px] sm:text-sm hidden sm:inline">to Home</span>
          </button>
        </div>

        {/* Center section with navigation - centered with proper spacing */}
        <div className="flex-grow flex items-center justify-center">
          <div className="flex items-center space-x-2 sm:space-x-7">
            <button
              onClick={handleFeaturesPage}
              className="text-emerald-400 bg-transparent hover:scale-110 relative px-1 sm:px-2 py-0.5 sm:py-1 transition-all duration-300 font-normal text-[10px] sm:text-sm group overflow-hidden"
            >
              Features
              <span className="absolute bottom-0 left-0 w-full h-[2px] bg-emerald-300 transition-all duration-300 opacity-100"></span>
              <span className="absolute inset-0 bg-emerald-500/20 rounded-md opacity-100 transition-opacity"></span>
            </button>
            <button
              onClick={handleAboutPage}
              className="text-white bg-transparent hover:text-emerald-200 hover:scale-110 relative px-1 sm:px-2 py-0.5 sm:py-1 transition-all duration-300 font-normal text-[10px] sm:text-sm group overflow-hidden"
            >
              About
              <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-emerald-300 transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover:w-full"></span>
              <span className="absolute inset-0 bg-emerald-500/20 rounded-md opacity-0 group-hover:opacity-80 transition-opacity"></span>
            </button>
            <button
              onClick={handleContactPage}
              className="text-white bg-transparent hover:text-emerald-200 hover:scale-110 relative px-1 sm:px-2 py-0.5 sm:py-1 transition-all duration-300 font-normal text-[10px] sm:text-sm group overflow-hidden"
            >
              Contact
              <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-emerald-300 transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover:w-full"></span>
              <span className="absolute inset-0 bg-emerald-500/20 rounded-md opacity-0 group-hover:opacity-80 transition-opacity"></span>
            </button>
          </div>
        </div>

        {/* Right section with logo - adaptive width */}
        <div className="w-auto sm:w-24 md:w-40 flex-shrink-0 flex items-center justify-end space-x-1.5 sm:space-x-4">
          <div className="relative">
            <img
              src="/images/bulsu-space-logo.png"
              alt="BulSU Space Logo"
              className="w-4 h-4 sm:w-7 sm:h-7 transition-all duration-300 relative z-10"
            />
          </div>
          <span className="font-bold text-[10px] sm:text-sm relative">
            <span className="relative z-10 text-white">BulSU Space</span>
          </span>
        </div>
      </div>
    </nav>
  );
};

// Hero Section Component (minor style tweaks)
const FeaturesHeroSection: React.FC = () => {
  return (
    <section className="relative min-h-[90vh] sm:min-h-screen flex items-center pt-16 pb-8 sm:pt-20 md:pt-24 sm:pb-16 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center lg:bg-fixed opacity-20"
        style={{
          backgroundImage: "url('/images/space_bg.png')"
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/90 to-blue-900/90" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8 lg:gap-0 items-center">
        <ScrollAnimation direction="left" delay={100} duration={800} className="lg:col-span-3 order-2 lg:order-1 text-center lg:text-left">
          <div className="space-y-4 sm:space-y-6">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4 sm:mb-6 mx-auto lg:mx-0">
              <SparklesIcon className="w-4 h-4 text-emerald-400 mr-2" />
              <span className="text-xs font-semibold text-emerald-300">Academic Innovation</span>
            </div>
            <h1 className="text-2xl xs:text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-black leading-tight mb-3 sm:mb-4">
              Powerful Features for <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-300">Academic Excellence</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl opacity-90 leading-relaxed max-w-2xl mx-auto lg:mx-0">
              Discover the powerful tools designed to enhance collaboration, communication, and community building in your academic journey at Bulacan State University.
            </p>
            <button
              onClick={() => {
                const featuresSection = document.getElementById('features-section');
                featuresSection?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="mt-4 sm:mt-6 bg-emerald-500 hover:bg-emerald-600 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-full text-sm transition-all duration-300 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 flex items-center group font-medium mx-auto lg:mx-0"
            >
              Explore Features
              <ChevronRightIcon className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </ScrollAnimation>

        <ScrollAnimation direction="right" delay={300} duration={800} className="lg:col-span-2 order-1 lg:order-2 mb-4 sm:mb-6 lg:mb-0">
          <div className="relative flex items-center justify-center px-4 sm:px-8 lg:px-0 lg:ml-0 xl:ml-4 lg:-mr-8 xl:-mr-12 2xl:-mr-16">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-2xl filter blur-xl transform -rotate-3 lg:scale-110 xl:scale-120"></div>
      <div className="relative z-10 p-2 sm:p-3 md:p-4 transform transition-transform duration-500 lg:scale-110 xl:scale-115 2xl:scale-120">
              <div className="absolute -inset-2 bg-gradient-to-r from-emerald-400/10 to-blue-500/10 rounded-3xl blur-lg animate-pulse" style={{animationDuration: '3s'}}></div>
              <div className="relative w-full max-w-[220px] xs:max-w-[260px] sm:max-w-[300px] md:max-w-[380px] lg:max-w-[440px] xl:max-w-[500px] mx-auto">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/30 to-blue-500/30 rounded-3xl filter blur-2xl opacity-50 animate-pulse" style={{animationDuration: '4s'}}></div>

                {/* Floating particles - made responsive */}
                <div className="absolute w-1.5 sm:w-2 md:w-2.5 lg:w-3 h-1.5 sm:h-2 md:h-2.5 lg:h-3 rounded-full bg-emerald-400/60 top-1/4 left-1/4 animate-particle blur-sm"></div>
                <div className="absolute w-1 sm:w-1.5 md:w-2 h-1 sm:h-1.5 md:h-2 rounded-full bg-emerald-300/60 top-1/3 right-1/3 animate-particle-delay-1 blur-sm"></div>
                <div className="absolute w-1.5 sm:w-2 md:w-2.5 lg:w-3 h-1.5 sm:h-2 md:h-2.5 lg:h-3 rounded-full bg-blue-400/60 bottom-1/3 left-1/3 animate-particle-delay-2 blur-sm"></div>
                <div className="absolute w-1 sm:w-1.5 md:w-2 h-1 sm:h-1.5 md:h-2 rounded-full bg-blue-300/60 bottom-1/4 right-1/4 animate-particle-delay-3 blur-sm"></div>

                {/* Phone image with float animation */}
                <img
                  src="/images/features-phone.png"
                  alt="BulSU Space Features on Mobile"
                  className="w-full h-auto mx-auto object-contain relative z-10 drop-shadow-2xl animate-float sm:animate-float-enhanced lg:scale-125 xl:scale-135 2xl:scale-150"
                  loading="eager"
                />

                {/* Reflection effect - enhanced for larger screens */}
                <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-3/4 h-3 sm:h-4 lg:h-6 xl:h-8 bg-emerald-400/10 rounded-full blur-md"></div>
                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2/3 h-1.5 sm:h-2 lg:h-4 xl:h-5 bg-emerald-400/20 rounded-full blur-sm"></div>
              </div>
            </div>
          </div>
        </ScrollAnimation>
      </div>

      {/* Mobile scroll indicator - improved */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex flex-col items-center opacity-80 lg:hidden">
        <p className="text-xs text-emerald-300 mb-1.5 font-medium">Scroll to explore</p>
        <svg className="w-5 h-5 text-emerald-300 animate-pulse" style={{ animationDuration: '2s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
        </svg>
      </div>
    </section>
  );
};

// Feature Simple Component for the alternating layout (minor style tweaks)
interface FeatureSimpleProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  index: number;
  align: 'left' | 'right';
}

const FeatureSimple: React.FC<FeatureSimpleProps> = ({ title, description, icon, index, align }) => {
  return (
    <ScrollAnimation direction={align === 'left' ? 'left' : 'right'} delay={200 + (index * 50)} duration={800}>
      <div className={`flex ${align === 'right' ? 'justify-start' : 'justify-end'} items-center mb-8`}>
        <div className={`flex ${align === 'left' ? 'flex-row-reverse text-right' : 'flex-row text-left'} items-center gap-4 max-w-md`}>
          <div className="relative flex-shrink-0">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400/20 to-teal-300/20 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="bg-emerald-500/10 p-3 rounded-xl relative">
              <div className="text-emerald-400 w-8 h-8 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                {icon}
              </div>
            </div>
          </div>
          <div className="group focus-within:focus-visible"> 
            <h3 className="text-lg font-semibold mb-1 text-white group-hover:text-emerald-400 transition-colors">{title}</h3>
            {/* Description hidden by default, visible on hover or focus-within for accessibility */}
            <p className="text-slate-300 text-sm leading-relaxed opacity-0 max-h-0 overflow-hidden transition-all duration-300 group-hover:opacity-100 group-hover:max-h-40 focus-within:opacity-100 focus-within:max-h-40">{description}</p>
          </div>
        </div>
      </div>
    </ScrollAnimation>
  );
};

// New: Why Choose Us Section
const WhyChooseUsSection: React.FC = () => {
  const reasons = [
    {
      title: "Tailored for Academics",
      description: "Designed specifically for the unique needs of university students and faculty.",
      icon: <AcademicCapIcon className="w-full h-full" />
    },
    {
      title: "Intuitive & User-Friendly",
      description: "Enjoy a seamless and easy-to-navigate experience from day one.",
      icon: <LightBulbIcon className="w-full h-full" />
    },
    {
      title: "Secure & Reliable",
      description: "Your data and communications are protected with industry-leading security measures.",
      icon: <ShieldCheckIcon className="w-full h-full" />
    },
    {
      title: "Community Focused",
      description: "Foster a vibrant academic community with tools for collaboration and engagement.",
      icon: <GlobeAltIcon className="w-full h-full" />
    }
  ];

  return (
    <section className="py-16 sm:py-20 lg:py-24 relative overflow-hidden bg-gray-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollAnimation direction="up" delay={100} duration={800}>
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">
              Why Choose <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-300">BulSU Space</span>?
            </h2>
            <p className="text-lg max-w-3xl mx-auto opacity-80">
              More than just a platform, it's your academic ecosystem designed for success.
            </p>
          </div>
        </ScrollAnimation>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {reasons.map((reason, index) => (
            <ScrollAnimation key={index} direction="up" delay={200 + (index * 100)} duration={800}>
              <div className="glass-morphism p-6 rounded-2xl border border-emerald-500/20 text-center h-full flex flex-col items-center justify-center transition-all duration-300 hover:border-emerald-400/40 hover:shadow-lg hover:shadow-emerald-500/10">
                <div className="bg-emerald-500/10 p-4 rounded-xl inline-block mb-4">
                  <div className="text-emerald-400 w-10 h-10">
                    {reason.icon}
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-2 text-white">{reason.title}</h3>
                <p className="text-slate-300 text-sm leading-relaxed">{reason.description}</p>
              </div>
            </ScrollAnimation>
          ))}
        </div>
      </div>
    </section>
  );
};

// New: How It Works Section
const HowItWorksSection: React.FC = () => {
  const steps = [
    {
      title: "Create Your Profile",
      description: "Set up your personalized academic profile and connect with your courses.",
      icon: <UserGroupIcon className="w-full h-full" />
    },
    {
      title: "Explore Your Feed",
      description: "Stay updated with announcements, events, and discussions from your groups.",
      icon: <DocumentTextIcon className="w-full h-full" />
    },
    {
      title: "Collaborate & Communicate",
      description: "Engage in real-time chats, share resources, and work together on projects.",
      icon: <ChatBubbleLeftRightIcon className="w-full h-full" />
    },
    {
      title: "Achieve Academic Goals",
      description: "Utilize integrated tools and resources to excel in your studies.",
      icon: <AcademicCapIcon className="w-full h-full" />
    }
  ];

  return (
    <section className="py-16 sm:py-20 lg:py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollAnimation direction="up" delay={100} duration={800}>
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">
              How BulSU Space <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-300 to-blue-400">Works</span>
            </h2>
            <p className="text-lg max-w-3xl mx-auto opacity-80">
              A simple, guided journey to a more connected and productive academic life.
            </p>
          </div>
        </ScrollAnimation>

        <div className="relative flex flex-col items-center">
          {/* Vertical Line */}
          <div className="absolute hidden md:block h-full w-0.5 bg-emerald-500/30 left-1/2 transform -translate-x-1/2 top-0"></div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-12 md:gap-y-24 w-full">
            {steps.map((step, index) => (
              <ScrollAnimation key={index} direction={index % 2 === 0 ? "left" : "right"} delay={200 + (index * 150)} duration={800}>
                <div className={`flex items-center ${index % 2 === 0 ? 'md:justify-end' : 'md:justify-start'} w-full`}>
                  <div className={`flex flex-col md:flex-row items-center ${index % 2 === 0 ? 'md:flex-row-reverse' : ''} max-w-md text-center md:text-left`}>
                    <div className="relative flex-shrink-0 mx-auto md:mx-0 mb-4 md:mb-0 md:w-24 md:h-24 flex items-center justify-center">
                      <div className="absolute -inset-2 bg-gradient-to-r from-emerald-400/20 to-teal-300/20 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      <div className="bg-emerald-500/10 p-5 rounded-full relative border border-emerald-400/30">
                        <div className="text-emerald-400 w-10 h-10">
                          {step.icon}
                        </div>
                      </div>
                      <div className="absolute -bottom-4 text-emerald-300 font-bold text-2xl">
                        {index + 1}
                      </div>
                    </div>
                    <div className={`md:ml-6 md:mr-6 ${index % 2 === 0 ? 'md:mr-0 md:ml-6' : 'md:ml-0 md:mr-6'}`}>
                      <h3 className="text-xl font-semibold mb-2 text-white">{step.title}</h3>
                      <p className="text-slate-300 text-sm leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                </div>
              </ScrollAnimation>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

// New: Testimonials Section
const TestimonialsSection: React.FC = () => {
  const testimonials = [
    {
      quote: "BulSU Space has transformed how I interact with my classmates and professors. It's incredibly intuitive and keeps me organized!",
      author: "Maria S.",
      role: "BSIT Student",
      avatar: "/images/avatar-female.png" // Placeholder image
    },
    {
      quote: "The real-time announcements and group spaces are game-changers. Communication is so much smoother now.",
      author: "Prof. Reyes",
      role: "Faculty Member",
      avatar: "/images/avatar-male.png" // Placeholder image
    },
    {
      quote: "I love the secure environment and how easy it is to find academic resources. Highly recommended for all BulSU students!",
      author: "John D.",
      role: "BSECE Student",
      avatar: "/images/avatar-male2.png" // Placeholder image
    }
  ];

  return (
    <section className="py-16 sm:py-20 lg:py-24 relative overflow-hidden bg-gray-900/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollAnimation direction="up" delay={100} duration={800}>
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">
              What Our <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-blue-400">Community Says</span>
            </h2>
            <p className="text-lg max-w-3xl mx-auto opacity-80">
              Hear from students and faculty who are already benefiting from BulSU Space.
            </p>
          </div>
        </ScrollAnimation>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <ScrollAnimation key={index} direction="up" delay={200 + (index * 100)} duration={800}>
              <div className="glass-morphism p-8 rounded-2xl border border-emerald-500/20 h-full flex flex-col justify-between transition-all duration-300 hover:border-emerald-400/40 hover:shadow-lg hover:shadow-emerald-500/10">
                <CheckCircleIcon className="w-8 h-8 text-emerald-400 mb-4" />
                <p className="text-slate-200 text-base italic mb-6 flex-grow">"{testimonial.quote}"</p>
                <div className="flex items-center">
                  <img src={testimonial.avatar} alt={testimonial.author} className="w-12 h-12 rounded-full mr-4 border-2 border-emerald-400" />
                  <div>
                    <p className="font-semibold text-white">{testimonial.author}</p>
                    <p className="text-sm text-slate-400">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            </ScrollAnimation>
          ))}
        </div>
      </div>
    </section>
  );
};

// FeatureSpotlightSection removed


// Contact CTA Section (minor style tweaks)
const FeaturesCTASection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="py-16 sm:py-20 lg:py-24 relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollAnimation direction="up" delay={100} duration={1000}>
          <div className="gradient-emerald rounded-2xl sm:rounded-3xl p-8 sm:p-12 lg:p-16 text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4 sm:mb-6">Ready to Experience BulSU Space?</h2>
            <p className="text-sm sm:text-base max-w-2xl mx-auto mb-8 sm:mb-10 opacity-90">
              Join thousands of students and faculty members already using BulSU Space to enhance their academic journey.
            </p>
            <div className="flex items-center justify-center">
              <button
                onClick={() => navigate('/signin')}
                className="relative px-8 py-4 bg-indigo-600 text-white font-bold rounded-full hover:bg-indigo-700 transition-all duration-300 shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 text-base border-2 border-white/30 hover:scale-105 active:scale-95 group overflow-hidden"
              >
                {/* Sparkle effect */}
                <span className="absolute top-0 left-0 w-full h-full">
                  <span className="absolute top-1/4 left-1/4 w-1 h-1 bg-white rounded-full opacity-70 animate-ping"></span>
                  <span className="absolute top-3/4 right-1/4 w-1.5 h-1.5 bg-white rounded-full opacity-60 animate-ping" style={{animationDelay: '0.5s', animationDuration: '2s'}}></span>
                  <span className="absolute bottom-1/3 right-1/3 w-1 h-1 bg-white rounded-full opacity-70 animate-ping" style={{animationDelay: '0.2s', animationDuration: '1.7s'}}></span>
                </span>

                {/* Pulsing glow */}
                <span className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 opacity-0 group-hover:opacity-100 blur-md transition-opacity duration-300 animate-pulse"></span>

                {/* Enhanced 3D effect with subtle bottom shine */}
                <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-white/10 to-transparent rounded-full opacity-50"></span>

                {/* Text with arrow icon */}
                <span className="relative flex items-center justify-center">
                  Get Started Now
                  <svg className="w-5 h-5 ml-2 transform group-hover:translate-x-1 transition-transform" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
};

// Footer Component (minor style tweaks)

// Main Component
const FeaturesPage: React.FC = () => {
  const [scrollY, setScrollY] = useState(0);
  const parallaxRef = useRef<HTMLDivElement>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const features = [
    {
      title: "Real-time Messaging",
      description: "Connect instantly with peers and faculty through secure, real-time messaging with read receipts.",
      icon: <ChatBubbleLeftRightIcon className="w-full h-full" />
    },
    {
      title: "Announcement Posting",
      description: "Stay informed with important announcements from administrators and faculty, all in one centralized location.",
      icon: <MegaphoneIcon className="w-full h-full" />
    },
    {
      title: "Timely Notifications",
      description: "Never miss important updates with our comprehensive notification system that keeps you informed across all devices.",
      icon: <BellAlertIcon className="w-full h-full" />
    },
    {
      title: "Multi-Factor Authentication",
      description: "Secure your account with multiple layers of protection including email verification and optional additional security factors.",
      icon: <LockClosedIcon className="w-full h-full" />
    },
    {
      title: "Role-Based Access Control",
      description: "Experience tailored platform access based on your role within the academic community, ensuring appropriate permissions.",
      icon: <ShieldCheckIcon className="w-full h-full" />
    },
    {
      title: "Group Spaces",
      description: "Collaborate efficiently in dedicated spaces for classes, projects, and interest groups with shared resources.",
      icon: <UserGroupIcon className="w-full h-full" />
    },
    {
      title: "Real-time Updates",
      description: "Experience a dynamic platform with timely content updates, online presence indicators, and synchronized data across devices.",
      icon: <ArrowPathIcon className="w-full h-full" />
    },
    {
      title: "Academic Integration",
      description: "Seamlessly connect with university systems for a unified academic experience with calendar integration and resource linking.",
      icon: <SquaresPlusIcon className="w-full h-full" />
    },
    {
      title: "Content Recommendations",
      description: "Discover relevant academic resources and connections through our intelligent recommendation system.",
      icon: <StarIcon className="w-full h-full" />
    }
  ];

  return (
    <div ref={parallaxRef} className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
  <Navigation hidden={termsOpen || privacyOpen} />

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
        <FeaturesHeroSection />

        {/* Why Choose Us Section */}
        <WhyChooseUsSection />

        {/* Features Alternating Section */}
        <section id="features-section" className="py-16 sm:py-20 lg:py-24 relative overflow-hidden bg-gray-900/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollAnimation direction="up" delay={100} duration={800}>
              <div className="text-center mb-12 sm:mb-16">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">
                  Platform Features
                </h2>
                <p className="text-lg max-w-3xl mx-auto opacity-80">
                  Explore the comprehensive set of features that make BulSU Space the ideal platform for academic excellence.
                </p>
              </div>
            </ScrollAnimation>

            {/* First Row: Home Interface image left, 3 features right */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
              <ScrollAnimation direction="left" delay={100} duration={800} className="flex items-center justify-center">
                <div className="relative w-full max-w-md lg:max-w-lg xl:max-w-xl">
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/30 to-blue-500/30 rounded-xl filter blur-xl opacity-50"></div>
                  <img
                    src="/images/onboarding/home-pc-right.png"
                    alt="BulSU Space Home Interface"
                      className="w-full h-auto relative z-10 rounded-xl object-cover shadow-xl shadow-emerald-900/20 transition-transform duration-500"
                  />
                </div>
              </ScrollAnimation>

              <div className="flex flex-col justify-center">
                {/* Showing home-related features next to home interface image */}
                <FeatureSimple
                  key="home1"
                  title={features[0].title}
                  description={features[0].description}
                  icon={features[0].icon}
                  index={0}
                  align="right"
                />
                <FeatureSimple
                  key="home2"
                  title={features[1].title}
                  description={features[1].description}
                  icon={features[1].icon}
                  index={1}
                  align="right"
                />
                <FeatureSimple
                  key="home3"
                  title={features[2].title}
                  description={features[2].description}
                  icon={features[2].icon}
                  index={2}
                  align="right"
                />
              </div>
            </div>

            {/* Second Row: 3 features left, Feed Interface image right */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
              <div className="flex flex-col justify-center order-2 lg:order-1">
                {/* Showing feed/content-related features next to feed interface image */}
                <FeatureSimple
                  key="feed1"
                  title={features[3].title}
                  description={features[3].description}
                  icon={features[3].icon}
                  index={3}
                  align="left"
                />
                <FeatureSimple
                  key="feed2"
                  title={features[4].title}
                  description={features[4].description}
                  icon={features[4].icon}
                  index={4}
                  align="left"
                />
                <FeatureSimple
                  key="feed3"
                  title={features[5].title}
                  description={features[5].description}
                  icon={features[5].icon}
                  index={5}
                  align="left"
                />
              </div>

              <ScrollAnimation direction="right" delay={100} duration={800} className="flex items-center justify-center order-1 lg:order-2">
                <div className="relative w-full max-w-md lg:max-w-lg xl:max-w-xl">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/30 to-emerald-500/30 rounded-xl filter blur-xl opacity-50"></div>
                  <img
                    src="/images/onboarding/feed-pc-left.png"
                    alt="BulSU Space Feed Interface"
                    className="w-full h-auto relative z-10 rounded-xl object-cover shadow-xl shadow-emerald-900/20 transition-transform duration-500"
                  />
                </div>
              </ScrollAnimation>
            </div>

            {/* Third Row: Messaging Interface image left, 3 features right */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <ScrollAnimation direction="left" delay={100} duration={800} className="flex items-center justify-center">
                <div className="relative w-full max-w-md lg:max-w-lg xl:max-w-xl">
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/30 to-blue-500/30 rounded-xl filter blur-xl opacity-50"></div>
                  <img
                    src="/images/onboarding/messaging-pc-right.png"
                    alt="BulSU Space Messaging Interface"
                    className="w-full h-auto relative z-10 rounded-xl object-cover shadow-xl shadow-emerald-900/20 transition-transform duration-500"
                  />
                </div>
              </ScrollAnimation>

              <div className="flex flex-col justify-center">
                {/* Showing messaging/communication-related features next to messaging interface image */}
                <FeatureSimple
                  key="messaging1"
                  title={features[6].title}
                  description={features[6].description}
                  icon={features[6].icon}
                  index={6}
                  align="right"
                />
                <FeatureSimple
                  key="messaging2"
                  title={features[7].title}
                  description={features[7].description}
                  icon={features[7].icon}
                  index={7}
                  align="right"
                />
                <FeatureSimple
                  key="messaging3"
                  title={features[8].title}
                  description={features[8].description}
                  icon={features[8].icon}
                  index={8}
                  align="right"
                />
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <HowItWorksSection />

  {/* Testimonials Section */}
        <TestimonialsSection />

    <FeaturesCTASection />

    <OnboardingFooter onOpenTerms={() => setTermsOpen(true)} onOpenPrivacy={() => setPrivacyOpen(true)} />
        {/* Modals triggered from footer */}
        <TermsAndConditionsModal isOpen={termsOpen} onClose={() => setTermsOpen(false)} viewOnly={true} />
        <PrivacyPolicyModal isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      </div>
    </div>
  );
};

export default FeaturesPage;
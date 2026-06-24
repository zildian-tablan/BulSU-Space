import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { ScrollAnimation } from '../../components/ScrollAnimation';
import OnboardingFooter from '../../components/onboarding/OnboardingFooter';
import TermsAndConditionsModal from '../../components/modals/TermsAndConditionsModal';
import PrivacyPolicyModal from '../../components/modals/PrivacyPolicyModal';
import '../../styles/onboarding.css';

// Navigation Component
const Navigation: React.FC = () => {
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
    <nav className="fixed top-1 sm:top-4 lg:top-6 left-1/2 transform -translate-x-1/2 z-50 glass-morphism rounded-full px-2 sm:px-6 py-1.5 sm:py-3.5 shadow-xl shadow-emerald-900/10 backdrop-blur-md border border-emerald-500/10 hover:border-emerald-400/30 transition-colors">
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
              className="text-white bg-transparent hover:text-emerald-200 hover:scale-110 relative px-1 sm:px-2 py-0.5 sm:py-1 transition-all duration-300 font-normal text-[10px] sm:text-sm group overflow-hidden"
            >
              Features
              <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-emerald-300 transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover:w-full"></span>
              <span className="absolute inset-0 bg-emerald-500/20 rounded-md opacity-0 group-hover:opacity-80 transition-opacity"></span>
            </button>
            <button className="text-emerald-400 bg-transparent hover:scale-110 relative px-1 sm:px-2 py-0.5 sm:py-1 transition-all duration-300 font-normal text-[10px] sm:text-sm group overflow-hidden">
              About
              <span className="absolute bottom-0 left-0 w-full h-[2px] bg-emerald-300 transition-all duration-300 opacity-100"></span>
              <span className="absolute inset-0 bg-emerald-500/20 rounded-md opacity-100 transition-opacity"></span>
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

// Hero Section Component
const AboutHeroSection: React.FC = () => {
  return (
    <section className="relative min-h-[90vh] sm:min-h-screen flex items-center pt-16 pb-8 sm:pt-20 md:pt-24 sm:pb-16 overflow-hidden">
      <div 
        className="absolute inset-0 bg-cover bg-center lg:bg-fixed opacity-20" 
        style={{
          backgroundImage: "url('/images/space_bg.png')"
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/90 to-blue-900/90" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-0 items-center">
        <ScrollAnimation direction="left" delay={100} duration={800} className="order-2 lg:order-1 text-center lg:text-left">
          <div className="space-y-4 sm:space-y-6">
            <h1 className="text-2xl xs:text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-black leading-tight mb-3 sm:mb-4">
              About BulSU Space
            </h1>
            <p className="text-base sm:text-lg md:text-xl opacity-90 leading-relaxed max-w-2xl mx-auto lg:mx-0">
              A revolutionary digital platform designed exclusively for the Bulacan State University community, empowering students and faculty through innovative technology and fostering academic excellence.
            </p>
          </div>
        </ScrollAnimation>
        
        <ScrollAnimation direction="right" delay={300} duration={800} className="order-1 lg:order-2 mb-4 sm:mb-6 lg:mb-0">
          <div className="relative flex items-center justify-center px-4 sm:px-8 lg:px-0 lg:ml-0 xl:ml-4 lg:-mr-8 xl:-mr-12 2xl:-mr-16">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-2xl filter blur-xl transform -rotate-3 lg:scale-110 xl:scale-120"></div>
            <div className="relative z-10 p-2 transform hover:scale-[1.03] transition-transform duration-500 lg:scale-110 xl:scale-115 2xl:scale-120">
              <div className="absolute -inset-2 bg-gradient-to-r from-emerald-400/10 to-blue-500/10 rounded-3xl blur-lg animate-pulse" style={{animationDuration: '3s'}}></div>
              <div className="relative w-full max-w-[220px] xs:max-w-[260px] sm:max-w-[300px] md:max-w-[380px] lg:max-w-[440px] xl:max-w-[500px] mx-auto">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/30 to-blue-500/30 rounded-3xl filter blur-2xl opacity-50 animate-pulse" style={{animationDuration: '4s'}}></div>
                
                {/* Floating particles - made responsive */}
                <div className="absolute w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-emerald-400/60 top-1/4 left-1/4 animate-particle blur-sm"></div>
                <div className="absolute w-1 h-1 rounded-full bg-emerald-300/60 top-1/3 right-1/3 animate-particle-delay-1 blur-sm"></div>
                <div className="absolute w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-blue-400/60 bottom-1/3 left-1/3 animate-particle-delay-2 blur-sm"></div>
                <div className="absolute w-1 h-1 rounded-full bg-blue-300/60 bottom-1/4 right-1/4 animate-particle-delay-3 blur-sm"></div>
                
                {/* Phone image with float animation */}
                <img 
                  src="/images/about-phone.png" 
                  alt="BulSU Space Mobile App" 
                  className="w-full h-auto mx-auto object-contain relative z-10 drop-shadow-2xl animate-float-enhanced lg:scale-125 xl:scale-135 2xl:scale-150"
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

// Mission, Vision & Goals Section - Combined component that replaced the separate sections

// Mission Section
// Mission, Vision & Goals Section
const MissionVisionGoalsSection: React.FC = () => {
  

  return (
    <section className="py-16 sm:py-20 lg:py-24 relative overflow-hidden bg-gradient-to-b from-gray-900 to-gray-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollAnimation direction="up" delay={100} duration={800}>
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">Mission, Vision & Goals</h2>
            <p className="text-lg max-w-3xl mx-auto opacity-80">
              The foundation that guides our platform's purpose, direction, and development.
            </p>
          </div>
        </ScrollAnimation>
        
        {/* Mission & Vision Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-16">
          <ScrollAnimation direction="left" delay={200} duration={800}>
            <div className="glass-morphism rounded-2xl sm:rounded-3xl p-6 sm:p-8 relative overflow-hidden h-full">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-blue-500"></div>
              <div className="relative z-10 space-y-4">
                <div className="flex items-center mb-2">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-emerald-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold">Our Mission</h3>
                </div>
                <p className="text-sm sm:text-base italic text-center">
                  "BulSU Space - Hagonoy aims to enhance communication, strengthen academic engagement, and foster a sense of belonging by providing accessible, innovative, and user-friendly tools that support learning, collaboration, and personal growth within the BulSU Hagonoy campus."
                </p>
              </div>
            </div>
          </ScrollAnimation>
          
          <ScrollAnimation direction="right" delay={300} duration={800}>
            <div className="glass-morphism rounded-2xl sm:rounded-3xl p-6 sm:p-8 relative overflow-hidden h-full">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
              <div className="relative z-10 space-y-4">
                <div className="flex items-center mb-2">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold">Our Vision</h3>
                </div>
                <p className="text-sm sm:text-base italic text-center">
                  "To be the leading digital platform that unites the BulSU Hagonoy academic community, empowering students, faculty, and alumni to connect, collaborate, and thrive in a dynamic learning environment."
                </p>
              </div>
            </div>
          </ScrollAnimation>
        </div>
        
        
      </div>
    </section>
  );
};

// Our Team Section
const OurTeamSection: React.FC = () => {
  return (
    <section className="py-16 sm:py-20 lg:py-24 relative overflow-hidden bg-gray-900/80">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.05),transparent_50%)]"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <ScrollAnimation direction="up" delay={100} duration={800}>
          <div className="text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center justify-center mb-3">
              <div className="h-px w-10 bg-emerald-500/50"></div>
              <span className="mx-4 text-emerald-500 uppercase tracking-wider text-sm font-medium">Core Team</span>
              <div className="h-px w-10 bg-emerald-500/50"></div>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-gray-400">Meet Our Team</h2>
            <p className="text-base max-w-3xl mx-auto text-white/70">
              The passionate individuals behind BulSU Space who are dedicated to creating an exceptional platform for our university community.
            </p>
          </div>
        </ScrollAnimation>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              name: "Dean Paolo Bautista",
              role: "Back-End Developer",
              image: require('./Profiles/deanpaolobautista.jpg'),
              description: "Computer Science faculty member with expertise in educational technology"
            },
            {
              name: "Zildian Benedict Tablan",
              role: "Front-End Developer",
              image: require('./Profiles/zildianbenedicttablan.jpg'),
              description: "Senior CS student specializing in web application architecture"
            },
            {
              name: "John Paul Torres",
              role: "Full-Stack Developer",
              image: require('./Profiles/johnpaultorres.png'),
              description: "Multimedia Arts graduate with a passion for accessible design"
            },
            {
              name: "Raven Gillian Tan",
              role: "Documentation",
              image: require('./Profiles/ravengilliantan.jpg'),
              description: "IT graduate with experience in cloud infrastructure and security"
            },
            {
              name: "Kirsten Keisha Peralta",
              role: "Documentation",
              image: require('./Profiles/kirstenkeishaperalta.jpg'),
              description: "Communications graduate focused on building engaging online communities"
            }
          ].map((member, index) => (
            <ScrollAnimation key={index} direction="up" delay={200 + (index * 100)} duration={800}>
              <div className="group">
                <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-all duration-500 p-6 h-full flex flex-col">
                  <div className="flex items-start mb-6">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 overflow-hidden mr-4 relative rounded-full">
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/30 to-blue-500/30 backdrop-blur-sm"></div>
                      <img
                        src={member.image}
                        alt={member.name}
                        className="w-full h-full object-cover relative z-10 transition-all duration-500 filter saturate-100"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = "https://via.placeholder.com/150";
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent z-20"></div>
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="text-lg sm:text-xl font-bold mb-1 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">{member.name}</h3>
                      <div className="inline-flex items-center">
                        <div className="h-0.5 w-5 bg-emerald-400 mr-2"></div>
                        <span className="text-emerald-400 text-xs uppercase tracking-wider font-medium">{member.role}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                </div>
              </div>
            </ScrollAnimation>
          ))}
        </div>
      </div>
    </section>
  );
};

// Contact CTA Section removed


const AboutPage: React.FC = () => {
  const parallaxRef = useRef<HTMLDivElement>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  
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
        <AboutHeroSection />
        
        <MissionVisionGoalsSection />
        
        <OurTeamSection />

        <OnboardingFooter
          onOpenTerms={() => setTermsOpen(true)}
          onOpenPrivacy={() => setPrivacyOpen(true)}
        />
      </div>
      <TermsAndConditionsModal isOpen={termsOpen} onClose={() => setTermsOpen(false)} viewOnly={true} />
      <PrivacyPolicyModal isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  );
};

export default AboutPage;

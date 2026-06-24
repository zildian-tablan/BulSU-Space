import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
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
            <button 
              onClick={handleAboutPage}
              className="text-white bg-transparent hover:text-emerald-200 hover:scale-110 relative px-1 sm:px-2 py-0.5 sm:py-1 transition-all duration-300 font-normal text-[10px] sm:text-sm group overflow-hidden"
            >
              About
              <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-emerald-300 transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover:w-full"></span>
              <span className="absolute inset-0 bg-emerald-500/20 rounded-md opacity-0 group-hover:opacity-80 transition-opacity"></span>
            </button>
            <button 
              className="text-emerald-400 bg-transparent hover:scale-110 relative px-1 sm:px-2 py-0.5 sm:py-1 transition-all duration-300 font-normal text-[10px] sm:text-sm group overflow-hidden"
            >
              Contact
              <span className="absolute bottom-0 left-0 w-full h-[2px] bg-emerald-300 transition-all duration-300 opacity-100"></span>
              <span className="absolute inset-0 bg-emerald-500/20 rounded-md opacity-100 transition-opacity"></span>
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

// Contact Hero Section Component
const ContactHeroSection: React.FC = () => {
  return (
    <section className="relative min-h-[80vh] xs:min-h-[85vh] sm:min-h-screen flex items-center pt-14 xs:pt-16 pb-6 xs:pb-8 sm:pt-20 md:pt-24 sm:pb-16 overflow-hidden">
      {/* Background Pattern - Subtle grid with animated gradient */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] xxs:opacity-[0.03] z-0"></div>
        
        {/* Responsive background gradients with different positions based on screen size */}
        <div className="absolute -inset-[5%] xxs:-inset-[7%] sm:-inset-[10%] lg:-inset-[15%] bg-gradient-to-br from-emerald-900/15 via-transparent to-teal-900/20 z-0 animate-slow-rotate"></div>
        
        {/* Additional subtle background elements visible on larger screens */}
        <div className="hidden sm:block absolute bottom-[-20%] right-[-10%] w-[40%] h-[50%] rounded-full bg-emerald-700/5 blur-3xl"></div>
        <div className="hidden xxs:block absolute top-[20%] left-[-15%] w-[30%] h-[30%] rounded-full bg-teal-600/5 blur-3xl"></div>
      </div>
      
      <div className="container mx-auto px-3 xs:px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 xs:gap-8 md:gap-12 items-center">
          <ScrollAnimation
            className="flex flex-col space-y-6"
            direction="right"
            duration={1000}
            delay={200}
          >
            <h1 className="text-2xl xxs:text-3xl xs:text-4xl sm:text-5xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-emerald-100 to-emerald-200">
              Get in Touch
            </h1>
            
            <p className="text-xs xxs:text-sm xs:text-base sm:text-lg text-gray-300 max-w-lg">
              Have questions about BulSU Space? Want to provide feedback? 
              We'd love to hear from you. Our team is ready to assist you with any inquiries.
            </p>
            
            <div className="flex flex-col space-y-3 xxs:space-y-4 mt-3 xxs:mt-4">
              <div className="flex items-start space-x-3 xxs:space-x-4">
                <div className="p-1.5 xxs:p-2 bg-emerald-500/10 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 xxs:h-5 xxs:w-5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-emerald-300 font-medium text-sm xxs:text-base">Email Us</h3>
                  <p className="text-gray-400 text-xs xxs:text-sm mt-0.5 xxs:mt-1">support@bulsuspace.web.app</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3 xxs:space-x-4">
                <div className="p-1.5 xxs:p-2 bg-emerald-500/10 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 xxs:h-5 xxs:w-5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-emerald-300 font-medium text-sm xxs:text-base">Visit Us</h3>
                  <p className="text-gray-400 text-xs xxs:text-sm mt-0.5 xxs:mt-1">Bulacan State University - Hagonoy, Iba/Carillo, Hagonoy, Bulacan</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3 xxs:space-x-4">
                <div className="p-1.5 xxs:p-2 bg-emerald-500/10 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 xxs:h-5 xxs:w-5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-emerald-300 font-medium text-sm xxs:text-base">Call Us</h3>
                  <p className="text-gray-400 text-xs xxs:text-sm mt-0.5 xxs:mt-1">(+63) 44-919-7800</p>
                </div>
              </div>
            </div>
          </ScrollAnimation>
          
          <ScrollAnimation
            className="relative"
            direction="left"
            duration={1000}
            delay={400}
          >
            <ContactForm />
          </ScrollAnimation>
        </div>
      </div>
    </section>
  );
};

// Contact Form Component
const ContactForm: React.FC = () => {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  
  const [formStatus, setFormStatus] = useState<{
    status: 'idle' | 'submitting' | 'success' | 'error';
    message: string;
  }>({
    status: 'idle',
    message: ''
  });

  const allowedDomains = ['ms.bulsu.edu.ph', 'bulsu.edu.ph', 'outlook.com'];
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [emailError, setEmailError] = useState<string>('');
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target as HTMLInputElement;

    // Update email suggestions when editing email
    if (name === 'email') {
      const localPart = value.split('@')[0] || '';
      if (localPart.length > 0) {
        setEmailSuggestions(allowedDomains.map(d => `${localPart}@${d}`));
      } else {
        setEmailSuggestions(allowedDomains.map(d => `@${d}`));
      }
      // Clear email error while user types
      setEmailError('');
    }

    setFormState(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateEmailDomain = (email: string) => {
    if (!email || typeof email !== 'string') return false;
    const lower = email.toLowerCase().trim();
    return allowedDomains.some(d => lower.endsWith(`@${d}`));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus({ status: 'submitting', message: '' });

    try {
      if (!validateEmailDomain(formState.email)) {
        setEmailError('Email must end with @ms.bulsu.edu.ph, @bulsu.edu.ph, or @outlook.com');
        setFormStatus({ status: 'error', message: 'Please use an allowed email domain.' });
        return;
      }

      setTimeout(() => {
        console.log('Form submitted:', formState);
        setFormStatus({ status: 'success', message: 'Your message has been sent! We will get back to you soon.' });
        setFormState({ name: '', email: '', subject: '', message: '' });
        setTimeout(() => setFormStatus({ status: 'idle', message: '' }), 5000);
      }, 1500);
    } catch (error: any) {
      console.error('Error submitting form:', error);
      setFormStatus({ status: 'error', message: error?.message || 'An error occurred while submitting the form.' });
    }
  };
  
  return (
    <div className="relative bg-gray-900/50 backdrop-blur-sm p-4 xxs:p-5 xs:p-6 sm:p-8 rounded-xl xs:rounded-2xl border border-emerald-500/20 shadow-xl shadow-emerald-900/10 overflow-hidden">
      {/* Responsive background elements for the form */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-700/5 via-transparent to-teal-600/5 pointer-events-none"></div>
      <div className="absolute -right-12 -bottom-12 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
      <div className="absolute -left-8 -top-8 w-16 h-16 bg-emerald-400/5 rounded-full blur-xl pointer-events-none"></div>
      
      <h3 className="text-lg xxs:text-xl sm:text-2xl font-bold text-emerald-100 mb-4 xxs:mb-5 xs:mb-6 relative z-10">Send us a Message</h3>
      
      {formStatus.status === 'success' && (
        <div className="mb-4 xxs:mb-5 xs:mb-6 p-3 xs:p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start space-x-2 xxs:space-x-3 relative z-10">
          <CheckCircleIcon className="w-4 h-4 xxs:w-5 xxs:h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-emerald-200 text-xs xxs:text-sm">{formStatus.message}</p>
        </div>
      )}
      
      {formStatus.status === 'error' && (
        <div className="mb-4 xxs:mb-5 xs:mb-6 p-3 xs:p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start space-x-2 xxs:space-x-3 relative z-10">
          <ExclamationCircleIcon className="w-4 h-4 xxs:w-5 xxs:h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-200 text-xs xxs:text-sm">{formStatus.message}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 xxs:gap-4 mb-3 xxs:mb-4">
          <div>
            <label htmlFor="name" className="block text-xs text-emerald-300 mb-1 xxs:mb-1.5 font-medium">
              Your Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formState.name}
              onChange={handleChange}
              required
              className="w-full px-2.5 xs:px-3 py-2 xs:py-2.5 bg-gray-800/50 border border-gray-700 focus:border-emerald-500/50 rounded-lg text-gray-100 text-xs xxs:text-sm outline-none transition-colors duration-200 focus:ring-1 focus:ring-emerald-500/30"
              placeholder="John Doe"
            />
          </div>
          
          <div>
            <label htmlFor="email" className="block text-xs text-emerald-300 mb-1 xxs:mb-1.5 font-medium">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formState.email}
              onChange={handleChange}
              list="email-suggestions"
              required
              className="w-full px-2.5 xs:px-3 py-2 xs:py-2.5 bg-gray-800/50 border border-gray-700 focus:border-emerald-500/50 rounded-lg text-gray-100 text-xs xxs:text-sm outline-none transition-colors duration-200 focus:ring-1 focus:ring-emerald-500/30"
              placeholder="john.doe@ms.bulsu.edu.ph"
            />
            <datalist id="email-suggestions">
              {emailSuggestions.map((sugg, i) => (
                <option key={i} value={sugg} />
              ))}
            </datalist>
            {emailError && <p className="text-red-400 text-xs mt-1">{emailError}</p>}
          </div>
        </div>
        
        <div className="mb-3 xxs:mb-4">
          <label htmlFor="subject" className="block text-xs text-emerald-300 mb-1 xxs:mb-1.5 font-medium">
            Subject
          </label>
          <select
            id="subject"
            name="subject"
            value={formState.subject}
            onChange={handleChange}
            required
            className="w-full px-2.5 xs:px-3 py-2 xs:py-2.5 bg-gray-800/50 border border-gray-700 focus:border-emerald-500/50 rounded-lg text-gray-100 text-xs xxs:text-sm outline-none transition-colors duration-200 focus:ring-1 focus:ring-emerald-500/30"
          >
            <option value="" disabled>Select a subject</option>
            <option value="general">General Inquiry</option>
            <option value="technical">Technical Support</option>
            <option value="feedback">Feedback</option>
            <option value="other">Other</option>
          </select>
        </div>
        
        <div className="mb-4 xxs:mb-5">
          <label htmlFor="message" className="block text-xs text-emerald-300 mb-1 xxs:mb-1.5 font-medium">
            Your Message
          </label>
          <textarea
            id="message"
            name="message"
            value={formState.message}
            onChange={handleChange}
            required
            rows={4}
            className="w-full px-2.5 xs:px-3 py-2 xs:py-2.5 bg-gray-800/50 border border-gray-700 focus:border-emerald-500/50 rounded-lg text-gray-100 text-xs xxs:text-sm outline-none transition-colors duration-200 focus:ring-1 focus:ring-emerald-500/30"
            placeholder="How can we help you?"
          ></textarea>
        </div>
        
        <button
          type="submit"
          disabled={formStatus.status === 'submitting'}
          className={`w-full py-2 xxs:py-2.5 px-3 xxs:px-4 flex justify-center items-center rounded-lg font-medium text-xs xxs:text-sm transition-all duration-300 ${
            formStatus.status === 'submitting'
              ? 'bg-emerald-700/50 text-emerald-200/70 cursor-not-allowed'
              : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-lg shadow-emerald-700/30 hover:shadow-emerald-700/50'
          }`}
        >
          {formStatus.status === 'submitting' ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-1.5 xxs:mr-2 h-3 w-3 xxs:h-4 xxs:w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Sending...
            </span>
          ) : (
            'Send Message'
          )}
        </button>
      </form>
    </div>
  );
};



// Main Contact Page Component
const ContactPage: React.FC = () => {
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  return (
    <div className="relative bg-gray-900 text-white min-h-screen overflow-x-hidden">
      {/* Page-wide responsive background elements */}
      <div className="absolute inset-0 bg-noise-texture opacity-[0.02] pointer-events-none"></div>
      <div className="absolute top-0 inset-x-0 h-[50vh] sm:h-[60vh] bg-gradient-to-b from-emerald-950/30 to-transparent opacity-40 sm:opacity-50 pointer-events-none"></div>
      <div className="absolute bottom-0 inset-x-0 h-[30vh] sm:h-[40vh] bg-gradient-to-t from-gray-950/50 to-transparent pointer-events-none"></div>
      
      <Navigation />
      <main className="pt-16 relative z-10">
        <ContactHeroSection />
      </main>
      <OnboardingFooter
        onOpenTerms={() => setTermsOpen(true)}
        onOpenPrivacy={() => setPrivacyOpen(true)}
      />
      <TermsAndConditionsModal isOpen={termsOpen} onClose={() => setTermsOpen(false)} viewOnly={true} />
      <PrivacyPolicyModal isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  );
};

export default ContactPage;

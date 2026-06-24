import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import TermsAndConditionsModal from '../modals/TermsAndConditionsModal';
import PrivacyPolicyModal from '../modals/PrivacyPolicyModal';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';

// Faculty signup component that allows faculty members to request access
const departmentOptions = ['BSIT', 'BSTM', 'BSHM', 'BIT', 'BSEd', 'BEEd', 'BTLEd'];

const FacultySignup: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Redirect already authenticated users (mirror SignIn behavior lightly)
  useEffect(() => {
    if (currentUser) {
      navigate('/home', { replace: true });
    }
  }, [currentUser, navigate]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [touched, setTouched] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isValid = firstName.trim() && lastName.trim() && idNumber.trim() && department && acceptedTerms && acceptedPrivacy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      // Save faculty access request to Firestore
      await addDoc(collection(db, 'faculty_access_requests'), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        idNumber: idNumber.trim(),
        department,
        status: 'pending', // Initial status
        createdAt: serverTimestamp(),
      });
      
      // Show success message
      alert(`Faculty Access Request Submitted\n\nYour request has been submitted successfully. An administrator will review your request.`);
      
      // Clear form after successful submission
      setFirstName('');
      setLastName('');
      setIdNumber('');
      setDepartment('');
      setAcceptedTerms(false);
      setTouched(false);
    } catch (error) {
      console.error('Error submitting faculty access request:', error);
      setSubmitError('Failed to submit request. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenTermsModal = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowTermsModal(true);
  };
  const handleOpenPrivacyModal = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowPrivacyModal(true);
  };

  const handleCloseTermsModal = () => {
    setShowTermsModal(false);
  };

  // Disabled red styling for required validation (fields still required via isValid logic)
  const invalidClass = '';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-green-950 to-green-900 relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
      {/* Decorative blurred shapes */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-green-600/20 rounded-full blur-3xl -z-10 animate-pulse" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-green-400/10 rounded-full blur-3xl -z-10 animate-pulse" />
      <div className="max-w-md w-full space-y-8 shadow-2xl rounded-2xl bg-gray-900/80 backdrop-blur-md p-8 border border-gray-800/60">
        <div className="text-center">
          <img
            className="mx-auto h-24 w-auto drop-shadow-[0_0_20px_rgba(34,197,94,0.5)] animate-fadeIn"
            src="/images/bulsu-space-logo.png"
            alt="BulSU Space Logo"
          />
          <h2 className="mt-5 text-3xl font-extrabold text-white tracking-tight animate-fadeIn">Faculty Access Request</h2>
          <div className="mt-1 text-green-400 text-base font-semibold animate-fadeInSlow">Join our academic community</div>
        </div>
        <div className="animate-fadeInSlow">
          <form onSubmit={handleSubmit} className="mt-6 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-300 mb-0.5">First Name</label>
                <input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={() => setTouched(true)}
                  className="appearance-none block w-full px-2.5 py-2 bg-gray-800/50 border border-gray-700 placeholder-gray-500 text-gray-200 rounded-md focus:outline-none focus:ring-green-500/50 focus:border-green-500/50 focus:z-10 sm:text-sm transition-all duration-200"
                  placeholder="Juan"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-300 mb-0.5">Last Name</label>
                <input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={() => setTouched(true)}
                  className="appearance-none block w-full px-2.5 py-2 bg-gray-800/50 border border-gray-700 placeholder-gray-500 text-gray-200 rounded-md focus:outline-none focus:ring-green-500/50 focus:border-green-500/50 focus:z-10 sm:text-sm transition-all duration-200"
                  placeholder="Dela Cruz"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="idNumber" className="block text-sm font-medium text-gray-300 mb-0.5">ID Number</label>
                <input
                  id="idNumber"
                  type="text"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  onBlur={() => setTouched(true)}
                  className="appearance-none block w-full px-2.5 py-2 bg-gray-800/50 border border-gray-700 placeholder-gray-500 text-gray-200 rounded-md focus:outline-none focus:ring-green-500/50 focus:border-green-500/50 focus:z-10 sm:text-sm transition-all duration-200"
                  placeholder="2024-000000"
                />
              </div>
              <div>
                <label htmlFor="department" className="block text-sm font-medium text-gray-300 mb-0.5">Department</label>
                <select
                  id="department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  onBlur={() => setTouched(true)}
                  className="appearance-none block w-full px-2.5 py-2 bg-gray-800/50 border border-gray-700 text-gray-200 rounded-md focus:outline-none focus:ring-green-500/50 focus:border-green-500/50 focus:z-10 sm:text-sm transition-all duration-200"
                >
                  <option value="">Select Department</option>
                  {departmentOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
            {/* Terms & Privacy Checkboxes (wrapped to remove form space gap) */}
            <div className="-mt-2">
              <div className="flex items-center leading-tight">
                <input
                  id="terms-checkbox"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  onBlur={() => setTouched(true)}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-600 bg-gray-700 rounded"
                />
                <label htmlFor="terms-checkbox" className="ml-2 block text-sm text-gray-300">
                  I agree to the{' '}
                  <button
                    onClick={handleOpenTermsModal}
                    className="text-green-400 bg-transparent hover:text-green-300 underline underline-offset-2 font-medium focus:outline-none"
                  >
                    Terms and Conditions
                  </button>
                </label>
              </div>
              <div className="flex items-center leading-tight">
                <input
                  id="privacy-checkbox"
                  type="checkbox"
                  checked={acceptedPrivacy}
                  onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                  onBlur={() => setTouched(true)}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-600 bg-gray-700 rounded"
                />
                <label htmlFor="privacy-checkbox" className="ml-2 block text-sm text-gray-300">
                  I acknowledge the{' '}
                  <button
                    onClick={handleOpenPrivacyModal}
                    className="text-green-400 bg-transparent hover:text-green-300 underline underline-offset-2 font-medium focus:outline-none"
                  >
                    Privacy Policy
                  </button>
                </label>
              </div>
            </div>
            
            <div className="pt-0">
              <button
                type="submit"
                disabled={!isValid || isSubmitting}
                className={`group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-base font-semibold rounded-lg text-white shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:cursor-not-allowed animate-fadeInSlow ${
                  !isValid || isSubmitting
                    ? 'bg-gradient-to-r from-green-700 to-green-600 opacity-60 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600'
                }`}
              >
                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                  {isSubmitting ? (
                    <svg className="animate-spin h-5 w-5 text-emerald-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-emerald-300 group-hover:text-emerald-200 transition-colors duration-200" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                  )}
                </span>
                <span>{isSubmitting ? 'Submitting...' : 'Request Access'}</span>
              </button>
            </div>
            
            {/* Error message */}
            {submitError && (
              <div className="mt-2 text-red-500 text-sm text-center animate-fadeIn">
                {submitError}
              </div>
            )}
            
            <div className="flex items-center justify-center mt-1">
              <div className="text-sm text-center w-full">
                <button
                  type="button"
                  onClick={() => navigate('/signin')}
                  className="font-medium text-green-400 bg-transparent hover:text-green-300 transition-colors duration-200 underline underline-offset-4"
                >
                  Already have access? Sign in
                </button>
              </div>
            </div>
          </form>
          
        </div>
      </div>
      
      {/* Terms and Conditions Modal - moved outside containers to render on top of everything */}
  <TermsAndConditionsModal 
        isOpen={showTermsModal}
        onClose={handleCloseTermsModal}
        viewOnly
      />
      <PrivacyPolicyModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
    </div>
  );
};

export default FacultySignup;

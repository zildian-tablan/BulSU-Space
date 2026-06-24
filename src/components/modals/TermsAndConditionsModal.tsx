import React, { useState, useEffect } from 'react';
import PrivacyPolicyModal from './PrivacyPolicyModal';
import { useAuth } from '../../contexts/AuthContext';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';

interface TermsAndConditionsModalProps {
  isOpen: boolean;
  onClose?: () => void;
  /**
   * When true, modal is informational only: no acceptance required, can be freely closed.
   * Used for faculty registration view of terms.
   */
  viewOnly?: boolean;
}

const TermsAndConditionsModal: React.FC<TermsAndConditionsModalProps> = ({ isOpen, onClose, viewOnly = false }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  // Handle ESC key to prevent accidental closing (terms must be accepted)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (viewOnly) {
          onClose?.();
        } else {
          event.preventDefault(); // Block closing in enforced mode
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, viewOnly, onClose]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const progress = Math.min((scrollTop + clientHeight) / scrollHeight * 100, 100);
    setScrollProgress(progress);
    
    if (scrollTop + clientHeight >= scrollHeight - 10) {
      setHasScrolledToBottom(true);
    }
  };

  const handleAccept = async () => {
    if (viewOnly) { // Simple close in viewOnly mode
      onClose?.();
      return;
    }
    if (!currentUser || loading) return; // Require auth user & prevent double click

    setLoading(true);
    const started = performance.now();

    // Optimistic close: hide modal immediately for better UX
    onClose?.();

    try {
      const userRef = doc(db, 'users', currentUser.id);
      await updateDoc(userRef, {
        isNewUser: false,
        termsAcceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      // Real-time onSnapshot in AuthContext will update currentUser; no manual sessionStorage mutation needed
      const duration = Math.round(performance.now() - started);
      console.log(`[Terms] Acceptance write succeeded in ${duration}ms`);
    } catch (error) {
      console.error('Error updating user terms acceptance:', error);
      // Optional: surface a non-blocking notification; using alert for now (replace with toast system if available)
      alert('We recorded your acceptance locally but syncing to server failed. Retrying in background.');
      // Simple single retry after short delay
      setTimeout(async () => {
        try {
          await updateDoc(doc(db, 'users', currentUser.id), {
            isNewUser: false,
            termsAcceptedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          console.log('[Terms] Retry acceptance write succeeded');
        } catch (retryErr) {
          console.error('[Terms] Retry acceptance write failed:', retryErr);
        }
      }, 1500);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[2147483647] p-4 overflow-y-auto flex items-start justify-center pt-6" style={{ backdropFilter: 'blur(8px)' }}>
      <div className="relative mx-auto mt-0 mb-10 bg-gray-900 rounded-2xl border border-green-600/40 shadow-[0_8px_40px_-4px_rgba(0,0,0,0.8)] w-full max-w-5xl max-h-[88vh] flex flex-col text-gray-300 text-sm leading-relaxed">
        {/* Header */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center">
                <span className="material-icons text-green-400">gavel</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Terms and Conditions</h2>
                <p className="text-gray-400 text-sm">BulSU Space Academic Social Platform</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              {!viewOnly && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">Welcome to BulSU Space!</p>
                  <p className="text-xs text-green-400">Please review and accept our terms</p>
                </div>
              )}
              {viewOnly && (
                <button
                  aria-label="Close"
                  onClick={() => onClose?.()}
                  className="text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <span className="material-icons">close</span>
                </button>
              )}
            </div>
          </div>
          {!viewOnly && (
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-gray-400">Reading Progress</span>
                <span className="text-xs text-green-400">{Math.round(scrollProgress)}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-green-600 to-green-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${scrollProgress}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
        {/* Content */}
  <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar" onScroll={handleScroll}>
          <div className="space-y-8">
            <section>
              <h3 className="text-lg font-semibold text-green-400 mb-3">1. Acceptance of Terms</h3>
              <p className="mb-3">
                These Terms of Service ("Terms") constitute a legal agreement between you and Bulacan State University - Hagonoy Campus ("University," "we," "us," or "our") regarding your use of the BulSU Space platform and related services (the "Service").
              </p>
              <p className="mb-3">
                BY ACCESSING OR USING THE SERVICE, YOU AGREE TO BE BOUND BY THESE TERMS. IF YOU DISAGREE WITH ANY PART OF THESE TERMS, THEN YOU MAY NOT ACCESS THE SERVICE.
              </p>
              <p>
                These Terms apply to all visitors, users, and others who access or use the Service. We reserve the right to update and change these Terms at any time without prior notice.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-green-400 mb-3">2. Description of Service</h3>
              <p className="mb-3">
                BulSU Space is an exclusive academic social networking platform designed for the Bulacan State University - Hagonoy Campus community. The Service provides communication, collaboration, and educational tools for students, faculty, staff, and alumni.
              </p>
              <p>
                The Service includes but is not limited to: social networking features, messaging systems, content sharing capabilities, academic resources, event management tools, and community forums.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-green-400 mb-3">3. Eligibility</h3>
              <p className="mb-3">
                To use this Service, you must meet ALL of the following requirements:
              </p>
              <ul className="list-disc ml-6 space-y-2">
                <li><strong>Age Requirement:</strong> You must be at least eighteen (18) years of age.</li>
                <li><strong>Institutional Affiliation:</strong> You must be a current student, faculty member, staff member, administrator, or alumni of Bulacan State University - Hagonoy Campus.</li>
                <li><strong>Legal Capacity:</strong> You must have the legal authority to enter into this agreement.</li>
                <li><strong>Account Integrity:</strong> You must provide accurate and truthful information when creating your account.</li>
                <li><strong>Good Standing:</strong> You must not have been previously banned or suspended from the Service.</li>
              </ul>
              <p className="mt-3 text-yellow-300 text-sm">
                <strong>Important:</strong> Users under 18 years of age are strictly prohibited from using this Service. The University reserves the right to verify eligibility and may request documentation to confirm your affiliation and age.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-green-400 mb-3">4. User Accounts</h3>
              <p className="mb-3">
                You are responsible for safeguarding the password and all activities under your account. You agree to:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Provide accurate and complete registration information</li>
                <li>Maintain and update your information to keep it current</li>
                <li>Maintain the security of your password and identification</li>
                <li>Notify us immediately of any unauthorized use of your account</li>
                <li>Accept responsibility for all activities under your account</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-green-400 mb-3">5. Prohibited Uses</h3>
              <p className="mb-3">
                You may not use the Service:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>For any unlawful purpose or to solicit unlawful acts</li>
                <li>To violate any international, federal, provincial, or state regulations or laws</li>
                <li>To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate</li>
                <li>To submit false or misleading information</li>
                <li>To upload or transmit viruses or malicious code</li>
                <li>To spam, phish, pharm, pretext, spider, crawl, or scrape</li>
                <li>For any obscene or immoral purpose</li>
                <li>To interfere with security features of the Service</li>
                <li>To violate academic integrity policies</li>
                <li>To impersonate others or create false identities</li>
              </ul>
              <p className="mt-3">
                We reserve the right to terminate your use of the Service for violating any prohibited uses.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-green-400 mb-3">6. Content</h3>
              <p className="mb-3">
                Our Service allows you to post, link, store, share and otherwise make available certain information, text, graphics, videos, or other material ("Content"). You are responsible for Content that you post to the Service, including its legality, reliability, and appropriateness.
              </p>
              <p className="mb-3">
                By posting Content to the Service, You grant us the right and license to use, modify, publicly perform, publicly display, reproduce, and distribute such Content on and through the Service.
              </p>
              <p>
                You retain any and all of your rights to any Content you submit, post or display on or through the Service and you are responsible for protecting those rights.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-green-400 mb-3">7. Privacy Policy</h3>
              <p className="mb-3">
                Your privacy is important to us. Our Privacy Policy explains how we collect, use, and protect your information when you use our Service.
              </p>
              <p>
                By using our Service, you agree to the collection and use of information in accordance with our Privacy Policy.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-green-400 mb-3">8. Termination</h3>
              <p className="mb-3">
                We may terminate or suspend your account and bar access to the Service immediately, without prior notice or liability, under our sole discretion, for any reason whatsoever including violation of the Terms.
              </p>
              <p className="mb-3">
                If you wish to terminate your account, you may discontinue using the Service and contact us to request account deletion.
              </p>
              <p>
                Upon termination, your right to use the Service will cease immediately.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-green-400 mb-3">9. Disclaimer</h3>
              <p className="mb-3">
                The information on this Service is provided on an "as is" basis. To the fullest extent permitted by law, this University:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Excludes all representations and warranties relating to this Service and its contents</li>
                <li>Does not guarantee the Service will be constantly available or available at all</li>
                <li>Makes no representations about the suitability of the information contained in the Service</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-green-400 mb-3">10. Limitation of Liability</h3>
              <p className="mb-3">
                In no event shall Bulacan State University - Hagonoy Campus, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the Service.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-green-400 mb-3">11. Governing Law</h3>
              <p className="mb-3">
                These Terms shall be interpreted and governed by the laws of the Republic of the Philippines, without regard to its conflict of law provisions.
              </p>
              <p>
                Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-green-400 mb-3">12. Changes to Terms</h3>
              <p className="mb-3">
                We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days notice prior to any new terms taking effect.
              </p>
              <p>
                By continuing to access or use our Service after any revisions become effective, you agree to be bound by the revised terms.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-green-400 mb-3">13. Contact Information</h3>
              <p className="mb-3">
                If you have any questions about these Terms, please contact us:
              </p>
              <div className="p-4 bg-gray-800/50 rounded-lg border border-green-600/20">
                <p className="font-medium text-green-400">BulSU Space Administration</p>
                <p className="text-sm mt-1">Bulacan State University - Hagonoy Campus</p>
                <p className="text-sm">Email: admin@bulsuspace.edu.ph</p>
                <p className="text-sm">Phone: +63 (044) 793-2380</p>
                <p className="text-sm">Office Hours: Monday - Friday, 8:00 AM - 5:00 PM</p>
              </div>
            </section>

            
          </div>

          
        </div>

  {/* Footer */}
  <div className="p-6 border-t border-gray-800 bg-gray-800/30">
          {viewOnly ? (
            <div className="flex items-center justify-end">
              <button
                onClick={() => onClose?.()}
    className="px-6 py-2 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row w-full gap-4 sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 cursor-pointer select-none leading-snug">
                  <input
                    id="privacy-checkbox"
                    type="checkbox"
                    checked={acceptedPrivacy}
                    onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                    className="mt-0.5 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-600 bg-gray-700 rounded"
                  />
                  <span className="text-sm text-gray-300">
                    I acknowledge the{' '}
                    <button
                      type="button"
                      onClick={() => setPrivacyModalOpen(true)}
                      className="text-green-400 bg-transparent hover:text-green-300 underline underline-offset-2 font-medium focus:outline-none"
                    >
                      Privacy Policy
                    </button>
                  </span>
                </label>
                <p className="text-[11px] text-gray-500 leading-snug ml-6">By clicking "Accept & Continue" you agree to the Terms and Conditions and acknowledge the Privacy Policy.</p>
              </div>
              <button
                onClick={handleAccept}
                disabled={!hasScrolledToBottom || !acceptedPrivacy || loading}
                className={`sm:ml-auto px-8 py-3 rounded-lg font-semibold transition-all duration-200 ${
                  hasScrolledToBottom && acceptedPrivacy && !loading
                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-green-600/25' 
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    <span>Accepting...</span>
                  </div>
                ) : (
                  'Accept & Continue'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Embedded Privacy Policy Modal */}
      <PrivacyPolicyModal isOpen={privacyModalOpen} onClose={() => setPrivacyModalOpen(false)} />
    </div>
  );
};

export default TermsAndConditionsModal;

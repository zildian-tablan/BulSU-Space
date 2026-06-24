import React, { useEffect } from 'react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose?: () => void;
  viewOnly?: boolean; // always viewOnly for now, kept for API symmetry
}

const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose, viewOnly = true }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2147483647] p-4 bg-black/75 backdrop-blur-sm overflow-y-auto flex items-start justify-center pt-6" role="dialog" aria-modal="true" aria-labelledby="privacy-policy-title">
      <div className="relative mx-auto mt-0 mb-10 bg-gray-900 rounded-2xl border border-green-600/40 shadow-[0_8px_40px_-4px_rgba(0,0,0,0.8)] w-full max-w-4xl max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center">
              <span className="material-icons text-green-400">shield</span>
            </div>
            <div>
              <h2 id="privacy-policy-title" className="text-2xl font-bold text-white">Privacy Policy</h2>
              <p className="text-gray-400 text-sm">BulSU Space Academic Social Platform</p>
            </div>
          </div>
          <button aria-label="Close" onClick={() => onClose?.()} className="text-gray-400 hover:text-gray-200 transition-colors">
            <span className="material-icons">close</span>
          </button>
        </div>

        {/* Content */}
  <div className="flex-1 overflow-y-auto p-6 space-y-8 text-gray-300 text-sm leading-relaxed custom-scrollbar">
          <section className="space-y-3">
            <p>
              BulSU Space values your privacy. This Privacy Policy explains the minimal personal information we use to create and administer
              user accounts on the academic social platform for Bulacan State University - Hagonoy Campus. It applies to <span className="text-green-300 font-medium">all users</span> including students, faculty,
               administrators, and alumni.
            </p>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-green-600/20">
              <h3 className="text-green-400 font-semibold mb-2">Data Used For Account Creation</h3>
              <ul className="list-disc ml-5 space-y-1 text-gray-200">
                <li><strong>Name</strong> – to properly identify you within the academic community.</li>
                <li><strong>ID Number</strong> – to uniquely match your institutional identity and prevent duplicate or unauthorized accounts.</li>
                <li><strong>Department</strong> – to enable relevant academic groupings, access scopes, and contextual features.</li>
              </ul>
              <p className="mt-3 text-sm text-gray-400">These three fields are securely provided by / verified with the campus registrar strictly for the purpose of establishing your academic user profile.</p>
            </div>
            <p>
              No other personal information is required to initially provision an account. Additional profile fields (e.g., profile photo, biography,
              interests) are entirely optional and are only visible according to in‑platform visibility rules you control.
            </p>
            <p>
              All processing is limited to enabling authenticated participation, community collaboration, and essential platform integrity (e.g., preventing impersonation).
              We do <span className="text-green-300 font-medium">not</span> sell, rent, or externally monetize your information.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-green-400 font-semibold">Optional Participation</h3>
            <p>
              Access to BulSU Space is encouraged to foster a modern, connected, and inclusive digital academic community. However, participation is optional. If you choose
              not to proceed, no additional data beyond the minimal registrar‑ or administrator‑verified set is stored for engagement purposes.
            </p>
            <p>
              By continuing, you acknowledge that only the specified minimal data (Name, ID Number, Department) will be used to create and manage your account. You may later request correction
              or deletion subject to institutional policy and record retention obligations.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-green-400 font-semibold">Your Choices & Control</h3>
            <ul className="list-disc ml-5 space-y-1">
              <li>Optionally enrich your profile for better collaboration.</li>
              <li>Request clarification on how your data is used via campus administration.</li>
              <li>Limit or remove non-required profile details at any time.</li>
              <li>Report any privacy concern directly to administrators.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-green-400 font-semibold">Contact</h3>
            <p className="text-sm">Questions or concerns about privacy? Contact the BulSU Space Administration Office or the campus registrar.</p>
          </section>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800 bg-gray-800/30 flex items-center justify-end gap-3">
          <button
            onClick={() => onClose?.()}
            className="px-6 py-2 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyModal;

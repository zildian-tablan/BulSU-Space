import React, { useEffect } from 'react';

interface CommunicationGuidelinesModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

const CommunicationGuidelinesModal: React.FC<CommunicationGuidelinesModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    if (isOpen) {
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2147483647] p-4 bg-black/75 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="comm-guidelines-title">
      <div className="relative mx-auto mt-2 mb-10 bg-gray-900 rounded-2xl border border-green-600/40 shadow-[0_8px_40px_-4px_rgba(0,0,0,0.8)] w-full max-w-4xl max-h-[88vh] flex flex-col">
        <div className="p-6 border-b border-gray-800 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center">
              <span className="material-icons text-green-400">groups</span>
            </div>
            <div>
              <h2 id="comm-guidelines-title" className="text-2xl font-bold text-white">Community & Communication Guidelines</h2>
              <p className="text-gray-400 text-sm">BulSU Space Academic Social Platform</p>
            </div>
          </div>
          <button aria-label="Close" onClick={() => onClose?.()} className="text-gray-400 hover:text-gray-200 transition-colors">
            <span className="material-icons">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8 text-gray-300 text-sm leading-relaxed">
          <section className="space-y-3">
            <h3 className="text-green-400 font-semibold">Core Principles</h3>
            <ul className="list-disc ml-5 space-y-1">
              <li>Respect all members regardless of role, background, or opinion.</li>
              <li>Assume good intent but address harmful behavior promptly.</li>
              <li>Stay academically focused in study, course, or research spaces.</li>
              <li>Protect confidentiality of private or sensitive academic information.</li>
            </ul>
          </section>
          <section className="space-y-3">
            <h3 className="text-green-400 font-semibold">Allowed vs Disallowed</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-gray-800/50 border border-green-600/20">
                <h4 className="text-green-300 font-medium mb-2 text-sm">Encouraged</h4>
                <ul className="list-disc ml-4 text-xs space-y-1">
                  <li>Constructive academic debate</li>
                  <li>Peer assistance & mentoring</li>
                  <li>Sharing verifiable academic resources</li>
                  <li>Professional collaboration</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg bg-gray-800/50 border border-red-600/20">
                <h4 className="text-red-300 font-medium mb-2 text-sm">Prohibited</h4>
                <ul className="list-disc ml-4 text-xs space-y-1">
                  <li>Harassment, hate, or derogatory remarks</li>
                  <li>Academic dishonesty facilitation</li>
                  <li>Spam, scams, or phishing attempts</li>
                  <li>Sharing private credentials or IDs</li>
                </ul>
              </div>
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-green-400 font-semibold">Messaging Etiquette</h3>
            <ul className="list-disc ml-5 space-y-1">
              <li>Keep messages concise and relevant to the channel or group context.</li>
              <li>Use clear academic or professional language—avoid excessive slang.</li>
              <li>Report suspicious behavior instead of engaging directly.</li>
              <li>Avoid sharing personal contact info publicly; use platform tools.</li>
            </ul>
          </section>
          <section className="space-y-3">
            <h3 className="text-green-400 font-semibold">Reporting & Enforcement</h3>
            <p>Use the in-platform report feature or contact an administrator for urgent issues. Repeated or severe violations may lead to content removal, temporary suspension, or permanent account action based on institutional policy.</p>
          </section>
          <section className="space-y-3">
            <h3 className="text-green-400 font-semibold">Academic Integrity Reminder</h3>
            <p>Do not request or distribute exam keys, answer sheets, or plagiarism material. Collaboration must align with course guidelines. Violations are escalated to academic administration.</p>
          </section>
          <section className="space-y-3">
            <h3 className="text-green-400 font-semibold">Contact</h3>
            <p className="text-sm">Questions? Contact platform administrators or faculty coordinators for clarification before posting questionable content.</p>
          </section>
        </div>
        <div className="p-5 border-t border-gray-800 bg-gray-800/30 flex items-center justify-end">
          <button onClick={() => onClose?.()} className="px-6 py-2 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommunicationGuidelinesModal;
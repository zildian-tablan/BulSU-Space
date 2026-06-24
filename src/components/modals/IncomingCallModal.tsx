import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PhoneIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { User } from '../../contexts/AuthContext';

type IncomingCallModalProps = {
  isOpen: boolean;
  caller: User | null;
  isLoading?: boolean;
  onAccept: () => void;
  onReject: () => void;
};

const RINGTONE_SRC = '/callSounds/incoming-call-1-296420.mp3';

const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  isOpen,
  caller,
  isLoading = false,
  onAccept,
  onReject,
}) => {
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const audio = new Audio(RINGTONE_SRC);
    audio.loop = true;
    audio.preload = 'auto';
    ringtoneRef.current = audio;

    void audio.play().catch(() => undefined);

    return () => {
      audio.pause();
      audio.currentTime = 0;
      ringtoneRef.current = null;
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const displayName = caller?.name?.trim() || 'Unknown caller';
  const profilePic = caller?.profile_pic;
  const initial = displayName.charAt(0).toUpperCase() || '?';

  return createPortal(
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="incoming-call-title"
        className="w-full max-w-sm rounded-2xl border border-green-700/30 bg-[#121212] shadow-2xl overflow-hidden"
      >
        <div className="px-6 pt-8 pb-6 text-center">
          <div className="mx-auto mb-4 relative w-24 h-24">
            <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
            {profilePic ? (
              <img
                src={profilePic}
                alt={displayName}
                className="relative w-24 h-24 rounded-full object-cover border-2 border-green-400/50"
              />
            ) : (
              <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center text-white text-3xl font-semibold border-2 border-green-400/50">
                {initial}
              </div>
            )}
          </div>

          <p className="text-green-300 text-sm uppercase tracking-[0.22em] mb-1">Incoming call</p>
          <h2 id="incoming-call-title" className="text-white text-xl font-semibold truncate">
            {displayName}
          </h2>
          <p className="text-gray-400 text-sm mt-2">Audio call</p>
        </div>

        <div className="px-6 pb-6 flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={onReject}
            disabled={isLoading}
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-colors disabled:opacity-60"
            aria-label="Decline call"
          >
            <XMarkIcon className="w-7 h-7" />
          </button>

          <button
            type="button"
            onClick={onAccept}
            disabled={isLoading}
            className="w-14 h-14 rounded-full bg-green-600 hover:bg-green-500 text-white flex items-center justify-center transition-colors disabled:opacity-60"
            aria-label="Accept call"
          >
            <PhoneIcon className="w-7 h-7" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default IncomingCallModal;

import React from 'react';
import { createPortal } from 'react-dom';
import {
  MicrophoneIcon,
  SpeakerWaveIcon,
  PhoneXMarkIcon,
} from '@heroicons/react/24/solid';
import {
  MicrophoneIcon as MicrophoneOutlineIcon,
  SpeakerXMarkIcon,
} from '@heroicons/react/24/outline';
import type { User } from '../../contexts/AuthContext';

interface ActiveAudioCallOverlayProps {
  isOpen: boolean;
  peerUser: User | null;
  duration: string;
  status: 'ringing' | 'connected' | 'ended' | 'rejected' | 'expired';
  isCaller: boolean;
  isSelfMuted: boolean;
  isRemoteMuted: boolean;
  needsAudioPlaybackUnlock: boolean;
  isLoading: boolean;
  onToggleSelfMute: () => void;
  onToggleRemoteMute: () => void;
  onEndCall: () => void;
  onUnlockAudio: () => void;
}

const ActiveAudioCallOverlay: React.FC<ActiveAudioCallOverlayProps> = ({
  isOpen,
  peerUser,
  duration,
  status,
  isCaller,
  isSelfMuted,
  isRemoteMuted,
  needsAudioPlaybackUnlock,
  isLoading,
  onToggleSelfMute,
  onToggleRemoteMute,
  onEndCall,
  onUnlockAudio,
}) => {
  if (!isOpen || typeof document === 'undefined') return null;

  const displayName = peerUser?.name?.trim() || 'Unknown User';
  const profilePic = peerUser?.profile_pic;
  const initial = displayName.charAt(0).toUpperCase() || '?';

  const isConnected = status === 'connected';
  const isRinging = status === 'ringing';

  const statusText = isConnected
    ? duration
    : isRinging
    ? isCaller
      ? 'Calling...'
      : 'Incoming call...'
    : 'Call ended';

  return createPortal(
    <div className="fixed inset-0 z-[11000] flex flex-col items-center justify-center bg-gradient-to-b from-[#0a0a0a] via-[#121212] to-[#0a0a0a]">
      {/* User info section */}
      <div className="flex flex-col items-center justify-center flex-1 pt-16">
        {/* Avatar with pulse animation when ringing */}
        <div className="relative mb-6">
          {isRinging && (
            <div className="absolute inset-0 rounded-full bg-green-500/30 animate-ping" style={{ animationDuration: '1.5s' }} />
          )}
          {profilePic ? (
            <img
              src={profilePic}
              alt={displayName}
              className="w-32 h-32 rounded-full object-cover border-4 border-green-500/50 shadow-xl shadow-green-500/20"
            />
          ) : (
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center text-white text-5xl font-semibold border-4 border-green-500/50 shadow-xl shadow-green-500/20">
              {initial}
            </div>
          )}
        </div>

        {/* User name */}
        <h2 className="text-white text-2xl font-semibold mb-2 text-center px-4 truncate max-w-[80vw]">
          {displayName}
        </h2>

        {/* Status / duration */}
        <p className="text-green-400 text-lg font-medium mb-4">
          {statusText}
        </p>

        {/* iOS audio unlock button */}
        {needsAudioPlaybackUnlock && isConnected && (
          <button
            type="button"
            onClick={onUnlockAudio}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Tap to hear audio
          </button>
        )}
      </div>

      {/* Controls section */}
      <div className="pb-16 px-6">
        <div className="flex items-center justify-center gap-6">
          {/* Mute self button */}
          {isConnected && (
            <button
              type="button"
              onClick={onToggleSelfMute}
              disabled={isLoading}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all disabled:opacity-50 ${
                isSelfMuted
                  ? 'bg-red-500/20 border-2 border-red-500 text-red-400'
                  : 'bg-white/10 border-2 border-white/20 text-white hover:bg-white/20'
              }`}
              title={isSelfMuted ? 'Unmute yourself' : 'Mute yourself'}
              aria-label={isSelfMuted ? 'Unmute yourself' : 'Mute yourself'}
            >
              {isSelfMuted ? (
                <MicrophoneOutlineIcon className="w-7 h-7" />
              ) : (
                <MicrophoneIcon className="w-7 h-7" />
              )}
            </button>
          )}

          {/* End call button */}
          <button
            type="button"
            onClick={onEndCall}
            disabled={isLoading}
            className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-colors disabled:opacity-50 shadow-lg shadow-red-500/30"
            title="End call"
            aria-label="End call"
          >
            <PhoneXMarkIcon className="w-9 h-9" />
          </button>

          {/* Mute remote button */}
          {isConnected && (
            <button
              type="button"
              onClick={onToggleRemoteMute}
              disabled={isLoading}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all disabled:opacity-50 ${
                isRemoteMuted
                  ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-400'
                  : 'bg-white/10 border-2 border-white/20 text-white hover:bg-white/20'
              }`}
              title={isRemoteMuted ? 'Unmute other user' : 'Mute other user'}
              aria-label={isRemoteMuted ? 'Unmute other user' : 'Mute other user'}
            >
              {isRemoteMuted ? (
                <SpeakerXMarkIcon className="w-7 h-7" />
              ) : (
                <SpeakerWaveIcon className="w-7 h-7" />
              )}
            </button>
          )}
        </div>

        {/* Mute status indicators */}
        {isConnected && (isSelfMuted || isRemoteMuted) && (
          <div className="flex items-center justify-center gap-4 mt-4 text-sm">
            {isSelfMuted && (
              <span className="text-red-400 flex items-center gap-1">
                <MicrophoneOutlineIcon className="w-4 h-4" />
                You are muted
              </span>
            )}
            {isRemoteMuted && (
              <span className="text-amber-400 flex items-center gap-1">
                <SpeakerXMarkIcon className="w-4 h-4" />
                Speaker muted
              </span>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ActiveAudioCallOverlay;

import React from 'react';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline';

interface NotificationSoundSettingsProps {
  className?: string;
}

const NotificationSoundSettings: React.FC<NotificationSoundSettingsProps> = ({ className = '' }) => {
  const { soundOptions, updateSoundOptions, testNotificationSound } = useNotificationContext();
  const soundTypes = [
    { value: 'default', label: 'Default' },
    { value: 'subtle', label: 'Subtle' },
    { value: 'academic', label: 'Academic' },
    { value: 'chime', label: 'Chime' },
    { value: 'message', label: 'Message' }
  ];

  return (
    <div className={`bg-gray-900/40 backdrop-blur-sm border border-gray-800/30 rounded-xl p-5 ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        {soundOptions.enabled ? (
          <SpeakerWaveIcon className="h-6 w-6 text-green-400" />
        ) : (
          <SpeakerXMarkIcon className="h-6 w-6 text-gray-400" />
        )}
        <h3 className="text-lg font-semibold text-white">Notification Sounds</h3>
      </div>      <div className="space-y-6">        {/* Simple iOS-style Toggle Switch that exactly matches the reference image */}        <div className="flex items-center justify-between">
          <label className="text-base font-medium text-gray-200">
            Enable notification sounds
          </label>
          <div className="inline-block">
            <button
              onClick={() => updateSoundOptions({ enabled: !soundOptions.enabled })}
              className="focus:outline-none"
              aria-pressed={soundOptions.enabled}
              aria-label="Toggle notification sounds"
            >              <div className="relative w-12 h-7 flex items-center">
                {/* Track */}
                <div className={`absolute inset-0 rounded-full transition-colors duration-300 ease-in-out ${
                  soundOptions.enabled ? 'bg-green-500' : 'bg-gray-600'
                }`} />
                {/* Circle with margin */}
                <div 
                  className={`absolute w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300 ${
                    soundOptions.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                  style={{
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    margin: '1px'
                  }}
                />
              </div>
            </button>
          </div>
        </div>        {/* Enhanced Volume Control */}
        {soundOptions.enabled && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <SpeakerXMarkIcon className={`h-4 w-4 ${soundOptions.volume < 0.1 ? 'text-green-500' : 'text-gray-400'}`} />
                <label className="text-base font-medium text-gray-200">
                  Volume
                </label>
              </div>
              <span className="text-sm font-medium px-2 py-0.5 rounded bg-green-500/10 text-green-500">
                {Math.round(soundOptions.volume * 100)}%
              </span>
            </div>            <div className="relative px-0 mt-1">
              <div className="absolute inset-0 h-2 rounded-full bg-gray-800"></div>
              <input
                type="range"
                min="0"
                max="1" 
                step="0.05"
                value={soundOptions.volume}
                onChange={(e) => updateSoundOptions({ volume: parseFloat(e.target.value) })}
                className="w-full h-2 appearance-none cursor-pointer focus:outline-none relative z-10"
                style={{
                  background: `linear-gradient(to right, rgb(16, 185, 129) 0%, rgb(16, 185, 129) ${soundOptions.volume * 100}%, transparent ${soundOptions.volume * 100}%)`,
                  borderRadius: "9999px",
                  height: "8px"
                }}
              />
            </div>
          </div>
        )}        {/* Sound Type Selection */}
        {soundOptions.enabled && (
          <div className="mt-6">
            <label className="block text-base font-medium text-gray-200 mb-3">
              Sound Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              {soundTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => updateSoundOptions({ soundType: type.value as any })}
                  className={`px-4 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                    soundOptions.soundType === type.value
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        )}        {/* Test Sound Button - Simple version that matches the screenshot */}
        {soundOptions.enabled && (
          <div className="mt-6">
            <button
              onClick={testNotificationSound}
              className="w-full px-5 py-2.5 bg-gray-800 text-gray-200 text-base font-medium rounded-md hover:bg-gray-700 transition-colors duration-200 focus:outline-none flex items-center justify-center gap-2"
            >
              <SpeakerWaveIcon className="h-5 w-5" />
              <span>Test Sound</span>
            </button>
          </div>
        )}
      </div>      {/* Custom CSS for the slider */}      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          height: 12px;
          width: 1px;
          background: transparent;
          cursor: pointer;
          margin-top: -2px;
        }
        
        input[type="range"]::-moz-range-thumb {
          height: 12px;
          width: 1px;
          border: none;
          background: transparent;
          cursor: pointer;
        }
          input[type="range"]:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
};

export default NotificationSoundSettings;

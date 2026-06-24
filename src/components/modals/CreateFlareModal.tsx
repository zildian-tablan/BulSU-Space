import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { createFlare } from '../../services/flareService';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../common/ConfirmModal';

interface CreateFlareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFlareCreated?: () => void;
}

const CreateFlareModal: React.FC<CreateFlareModalProps> = ({ isOpen, onClose, onFlareCreated }) => {
  const { currentUser } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'choose' | 'preview' | 'description'>('choose');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tooLongModalOpen, setTooLongModalOpen] = useState(false);
  const [tooLongDuration, setTooLongDuration] = useState<number | null>(null);

  // Revoke preview object URL when it changes or when component unmounts
  React.useEffect(() => {
    return () => {
      if (previewUrl) {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch (e) {}
      }
    };
  }, [previewUrl]);

  const handleFileSelect = (file: File) => {
    // Only allow video MIME types
    if (!file.type || !file.type.startsWith('video/')) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setStep('choose');
      setError('Please select a valid video file (MP4, MOV, WEBM, etc.)');
      return;
    }

    // Validate file size (max 150MB as a fallback if duration can't be determined)
    const maxSize = 150 * 1024 * 1024; // 150MB
    if (file.size > maxSize) {
      setError('File size should be less than 150MB');
      return;
    }

    // Determine video duration before accepting the file
    const objectUrl = URL.createObjectURL(file);
    const tmpVideo = document.createElement('video');

    // We only want to revoke the object URL if the file is rejected (too long)
    // Do NOT revoke it immediately after reading metadata — the preview element
    // needs the blob URL to remain valid while the user previews the video.
    tmpVideo.preload = 'metadata';
    tmpVideo.src = objectUrl;
    tmpVideo.onloadedmetadata = () => {
      const duration = tmpVideo.duration || 0;

      if (duration > 90) {
        // Too long: revoke the blob URL immediately and show modal
        try {
          tmpVideo.src = '';
          URL.revokeObjectURL(objectUrl);
        } catch (e) {}
        setTooLongDuration(duration);
        setTooLongModalOpen(true);
        setError(null);
        return;
      }

      // Accept the file and keep the object URL for preview
      setSelectedFile(file);
      setPreviewUrl(objectUrl);
      setStep('preview');
      setError(null);
    };

    tmpVideo.onerror = () => {
      // If metadata can't be read, fall back to accepting based on file size (already checked)
      try {
        tmpVideo.src = '';
      } catch (e) {}
      setSelectedFile(file);
      setPreviewUrl(objectUrl);
      setStep('preview');
      setError(null);
    };
  };

  const handleAlbumClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleNextToDescription = () => {
    setStep('description');
  };

  const handleUpload = async () => {
    if (!selectedFile || !currentUser) return;

    setIsUploading(true);
    setError(null);

    try {
      await createFlare({
        userId: currentUser.id,
        mediaFile: selectedFile,
        description: description.trim()
      });

      // Reset state and close modal
      setSelectedFile(null);
      setPreviewUrl(null);
      setDescription('');
      setStep('choose');
      onFlareCreated?.();
      onClose();
    } catch (err) {
      console.error('Error creating flare:', err);
      setError('Failed to create flare. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setDescription('');
      setStep('choose');
      setError(null);
      onClose();
    }
  };

  const handleBack = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setDescription('');
    setStep('choose');
    setError(null);
  };

  const modalContent = (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm" style={{ zIndex: 11000 }}>
      <div className="relative w-full max-w-md bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg shadow-2xl border border-green-500/30 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="material-icons text-green-400">bolt</span>
            Create Flare
          </h2>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'choose' && (
            <div className="space-y-4">
              <p className="text-gray-300 text-center mb-6">
                Select media from your device
              </p>

              {/* Album Option */}
              <button
                onClick={handleAlbumClick}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg transition-all transform hover:scale-105 shadow-lg"
              >
                <PhotoIcon className="w-6 h-6" />
                <span className="font-semibold">Choose video from device</span>
              </button>

              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {/* Preview */}
              <div className="relative bg-black rounded-lg overflow-hidden aspect-[9/16] max-h-[60vh] mx-auto">
                <video
                  src={previewUrl || ''}
                  controls
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  disabled={isUploading}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleNextToDescription}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white rounded-lg transition-all font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 'description' && (
            <div className="space-y-4">
              {/* Description Input as Overlay */}
              <div className="space-y-2">
                <label className="text-sm text-gray-300 font-medium">
                  Add a description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.length <= 150) {
                      setDescription(value);
                    }
                  }}
                  placeholder="Add a short description to your flare..."
                  maxLength={150}
                  rows={4}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  autoFocus
                />
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">Max 150 characters</span>
                  <span className={`${description.length >= 150 ? 'text-red-400' : 'text-gray-400'}`}>
                    {description.length}/150
                  </span>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('preview')}
                  disabled={isUploading}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  {isUploading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="material-icons animate-spin text-sm">refresh</span>
                      Uploading...
                    </span>
                  ) : (
                    'Post Flare'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Too-long video modal (blocks upload until user picks a valid video)
  const tooLongModal = (
    <ConfirmModal
      open={tooLongModalOpen}
      title="Video exceeds maximum length"
      description={
        tooLongDuration
          ? `The selected video is ${Math.round(tooLongDuration)} seconds long which exceeds the maximum allowed length of 90 seconds for a Flare. Please choose a shorter video.`
          : 'The selected video exceeds the maximum allowed length of 90 seconds for a Flare. Please choose a shorter video.'
      }
      confirmText="OK"
      cancelText="OK"
      onConfirm={() => setTooLongModalOpen(false)}
      onCancel={() => setTooLongModalOpen(false)}
    />
  );

  if (!isOpen && !tooLongModalOpen) return null;

  return (
    <>
      {isOpen && createPortal(modalContent, document.body)}
      {tooLongModal}
    </>
  );
};

export default CreateFlareModal;

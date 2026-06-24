import React, { useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { XMarkIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import Cropper from 'react-easy-crop';
import { getCroppedImage } from '../../utils/imageCrop';

// Avatar presets by gender
const maleAvatars = [
  "https://cdn-icons-png.flaticon.com/128/6997/6997674.png",
  "https://cdn-icons-png.flaticon.com/128/4140/4140037.png",
  "https://cdn-icons-png.flaticon.com/128/4139/4139981.png",
  "https://cdn-icons-png.flaticon.com/128/4140/4140061.png",
  "https://cdn-icons-png.flaticon.com/128/4140/4140077.png",
  "https://cdn-icons-png.flaticon.com/128/6997/6997676.png",
  "https://cdn-icons-png.flaticon.com/128/4140/4140052.png",
  "https://cdn-icons-png.flaticon.com/128/4140/4140042.png",
];

const femaleAvatars = [
  "https://cdn-icons-png.flaticon.com/128/4140/4140047.png",
  "https://cdn-icons-png.flaticon.com/128/4140/4140060.png",
  "https://cdn-icons-png.flaticon.com/128/4140/4140040.png",
  "https://cdn-icons-png.flaticon.com/128/4140/4140051.png",
  "https://cdn-icons-png.flaticon.com/128/4139/4139951.png",
];

const otherAvatars = [
  "https://cdn-icons-png.flaticon.com/128/4696/4696285.png",
  "https://cdn-icons-png.flaticon.com/128/1326/1326405.png",
  "https://cdn-icons-png.flaticon.com/128/1674/1674291.png",
  "https://cdn-icons-png.flaticon.com/128/3006/3006876.png",
  "https://cdn-icons-png.flaticon.com/128/3011/3011270.png",
];

interface AvatarSelectionModalProps {
  isOpen: boolean;
  userGender?: string;
  onClose: () => void;
  onSelectAvatar: (url: string) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; // legacy not used directly after cropping integration
  uploadingImage: boolean;
}

const AvatarSelectionModal: React.FC<AvatarSelectionModalProps> = ({
  isOpen,
  userGender = 'other',
  onClose,
  onSelectAvatar,
  onFileUpload,
  uploadingImage
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const normalizedGender = userGender?.toLowerCase() || 'other';
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [localUploading, setLocalUploading] = useState(false);

  const onCropComplete = useCallback((_croppedArea:any, croppedAreaPixels:any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRawImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCropAndUpload = async () => {
    if (!rawImage || !croppedAreaPixels) return;
    try {
      setLocalUploading(true);
      const blob = await getCroppedImage(rawImage, croppedAreaPixels);
      // Convert blob to File and create a synthetic event to reuse parent upload handler
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
      }
      // Call original onFileUpload with synthetic event
      const event = { target: { files: dt.files } } as unknown as React.ChangeEvent<HTMLInputElement>;
      onFileUpload(event);
      // Reset local state (modal will close after parent updates)
      setRawImage(null);
    } catch (err) {
      console.error(err);
      alert('Failed to crop image');
    } finally {
      setLocalUploading(false);
    }
  };
  
  // Get the appropriate avatars based on user's gender
  const getAvatarsForGender = (): string[] => {
    if (normalizedGender === 'male') return maleAvatars;
    if (normalizedGender === 'female') return femaleAvatars;
    return otherAvatars;
  };
  
  // Get gender display name
  const getGenderDisplayName = (): string => {
    if (normalizedGender === 'male') return 'Male';
    if (normalizedGender === 'female') return 'Female';
    return 'Other';
  };
  if (!isOpen) return null;
  if (typeof document === 'undefined') return null; // SSR safety

  // Get avatars based on detected gender
  const avatars = getAvatarsForGender();
  const genderDisplayName = getGenderDisplayName();

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-gray-900 rounded-xl border border-green-800/40 shadow-xl mobile-scrollbar-hide">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-green-800/20 p-4 flex items-center justify-between">
          <span className="font-semibold text-green-300 text-base">
            Select {genderDisplayName} Avatar
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-red-400 p-1.5 rounded-full transition-colors hover:bg-gray-800"
            title="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 relative">
          {/* Upload Area */}
          <div className="mb-6 p-4 border border-dashed border-green-800/30 rounded-lg bg-gray-800/50 flex flex-col items-center">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleLocalFile}
              accept="image/*"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-gray-800 text-green-400 px-4 py-2 rounded-lg flex items-center gap-2 transition-all hover:bg-green-900/40 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-60"
              disabled={uploadingImage || localUploading}
              tabIndex={0}
              aria-disabled={uploadingImage || localUploading}
            >
              <ArrowUpTrayIcon className="h-5 w-5" />
              <span>{(uploadingImage || localUploading) ? 'Processing...' : 'Upload Custom Image'}</span>
            </button>
            {(uploadingImage || localUploading) && (
              <div className="mt-2 flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500"></div>
                <span className="text-xs text-green-400">Uploading...</span>
              </div>
            )}
          </div>

          {/* Avatar Grid - Only showing avatars for detected gender */}
          <div className="mb-2">
            <h3 className="text-sm font-medium text-green-400 mb-2 flex items-center">
              {genderDisplayName} Avatars
              <span className="ml-2 text-xs bg-green-800/50 px-2 py-0.5 rounded-full">
                Auto-Detected
              </span>
            </h3>
            <div className="grid grid-cols-4 gap-3">
              {avatars.map((avatar, index) => (
                <div
                  key={index}
                  onClick={() => !uploadingImage && onSelectAvatar(avatar)}
                  className={`aspect-square rounded-lg overflow-hidden border-2 ${
                    !uploadingImage
                      ? 'cursor-pointer hover:border-green-500 hover:scale-105 transition-all'
                      : 'opacity-50 cursor-not-allowed'
                  } border-gray-800 bg-gray-800`}
                >
                  <img
                    src={avatar}
                    alt={`Avatar option ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Cropping Overlay */}
          {rawImage && (
            <div className="absolute inset-0 z-20 flex flex-col bg-black/80 backdrop-blur-sm rounded-xl p-4">
              <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
                <div className="relative w-full max-w-sm aspect-square rounded-full overflow-hidden bg-black/40 border border-green-800/40 shadow-inner">
                  <Cropper
                    image={rawImage}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={onCropComplete}
                    showGrid={false}
                    cropShape="round"
                  />
                </div>
                <div className="mt-4 w-full max-w-sm">
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full"
                    aria-label="Zoom"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setRawImage(null)}
                  className="px-4 py-2 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                  disabled={localUploading}
                >Cancel</button>
                <button
                  onClick={handleCropAndUpload}
                  className="px-4 py-2 text-sm rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-60"
                  disabled={localUploading}
                >{localUploading ? 'Uploading...' : 'Save'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AvatarSelectionModal;
import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { uploadNewsImage, createNews } from '../../services/newsService';
import { auth } from '../../firebase/config';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

const CreateNewsModal: React.FC<Props> = ({ open, onClose, onCreated }) => {
  const { currentUser }: any = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [readableAddress, setReadableAddress] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setLocation('');
      setReadableAddress('');
      setCoordinates(null);
      setLocationError(null);
      setFile(null);
      setPreview(null);
    } else {
      // Get user's location when modal opens
      getCurrentLocation();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return;
  }, [open]);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    setGettingLocation(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCoordinates({ lat: latitude, lng: longitude });
        setLocation(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        
        // Reverse geocode to get readable address
        try {
          const address = await reverseGeocode(latitude, longitude);
          setReadableAddress(address);
        } catch (error) {
          console.error('Reverse geocoding error:', error);
          setReadableAddress(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        }
        
        setGettingLocation(false);
      },
      (error) => {
        let errorMessage = 'Unable to get your location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            break;
        }
        setLocationError(errorMessage);
        setGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      // Using OpenStreetMap Nominatim API (free, no API key required)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'BulSU Space News App' // Required by Nominatim
          }
        }
      );

      if (!response.ok) {
        throw new Error('Geocoding failed');
      }

      const data = await response.json();
      
      // Build a readable address from the response
      const address = data.address;
      const parts = [];

      // Add specific location details in order of preference
      if (address.building) parts.push(address.building);
      if (address.road) parts.push(address.road);
      if (address.neighbourhood || address.suburb) parts.push(address.neighbourhood || address.suburb);
      if (address.city || address.town || address.village) parts.push(address.city || address.town || address.village);
      if (address.state || address.province) parts.push(address.state || address.province);
      if (address.country) parts.push(address.country);

      const readableAddress = parts.length > 0 ? parts.join(', ') : data.display_name;
      return readableAddress;
    } catch (error) {
      console.error('Error in reverse geocoding:', error);
      // Fallback to coordinates if geocoding fails
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    if (f.size > MAX_IMAGE_SIZE) {
      alert('Image is too large (max 5MB)');
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      alert('Please provide title and description');
      return;
    }
    if (!coordinates) {
      alert('Location is required. Please allow location access and try again.');
      return;
    }
    if (!currentUser && !auth.currentUser) {
      // Defensive guard: no authenticated user available
      console.error('[CreateNewsModal] No authenticated user available', { currentUser, firebaseUser: auth.currentUser });
      alert('You must be signed in to create news');
      return;
    }
    // Prefer the app's AuthContext user id, fall back to firebase auth uid
    const authorId = (currentUser && ((currentUser as any).id || (currentUser as any).uid)) || (auth.currentUser && auth.currentUser.uid) || undefined;
    if (!authorId) {
      console.error('[CreateNewsModal] Unable to determine author id', { currentUser, firebaseUser: auth.currentUser });
      alert('Unable to determine your user id. Please refresh and try again.');
      return;
    }
    setLoading(true);
    try {
      let imageUrl: string | undefined;
      if (file) {
        imageUrl = await uploadNewsImage(file);
      }
      const creatorName = (currentUser && ((currentUser as any).name || (currentUser as any).displayName)) || auth.currentUser?.displayName || undefined;
      const creatorProfilePic = (currentUser && ((currentUser as any).profile_pic || (currentUser as any).photoURL)) || (auth.currentUser && (auth.currentUser as any).photoURL) || undefined;

      const id = await createNews({
        title: title.trim(),
        description: description.trim(),
        location: readableAddress || location.trim(),
        coordinates: coordinates,
        imageUrl,
        createdBy: authorId as string,
        creatorName: creatorName as string | undefined,
        creatorProfilePic: creatorProfilePic as string | undefined
      });
      setLoading(false);
      onClose();
      if (onCreated) onCreated(id);
    } catch (err) {
      console.error(err);
      setLoading(false);
      alert('Failed to create news');
    }
  };

  if (!open) return null;

  const modal = (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl mx-4 rounded-2xl bg-gray-900 border border-green-700/30 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-green-400 text-3xl">article</span>
            <h3 className="text-2xl font-bold text-white">Create News</h3>
          </div>
          <button 
            onClick={onClose} 
            aria-label="Close" 
            className="text-gray-400 hover:text-white hover:bg-gray-800 p-2 rounded-lg transition-all"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Title Input */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
              <span className="material-symbols-outlined text-lg">title</span>
              Title
            </label>
            <input
              className="w-full rounded-lg bg-gray-800 border border-gray-700 focus:border-green-500 focus:ring-2 focus:ring-green-400/30 px-4 py-3 text-white placeholder-gray-400 transition"
              placeholder="Enter news title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description Textarea */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
              <span className="material-symbols-outlined text-lg">description</span>
              Description
            </label>
            <textarea
              className="w-full rounded-lg bg-gray-800 border border-gray-700 focus:border-green-500 focus:ring-2 focus:ring-green-400/30 px-4 py-3 text-white placeholder-gray-400 resize-none h-36 transition"
              placeholder="Enter news description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Location Section */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
              <span className="material-symbols-outlined text-lg text-red-400">location_on</span>
              Location
              <span className="text-red-400 text-xs">(Required)</span>
            </label>
            {gettingLocation ? (
              <div className="flex items-center gap-3 text-green-400 text-sm bg-gray-800 rounded-lg p-4 border border-gray-700">
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                <span>Getting your location...</span>
              </div>
            ) : coordinates ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-400 text-sm bg-green-950/30 rounded-lg px-3 py-2 border border-green-700/30">
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  <span className="font-medium">Location captured</span>
                </div>
                <div className="w-full rounded-lg bg-gray-800 border border-green-500/30 px-4 py-3">
                  <div className="flex items-start gap-2 text-white text-sm font-medium mb-2">
                    <span className="material-symbols-outlined text-green-400 text-lg">pin_drop</span>
                    <span className="flex-1">{readableAddress || 'Loading address...'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400 text-xs ml-7">
                    <span className="material-symbols-outlined text-sm">my_location</span>
                    <span>{location}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={getCurrentLocation}
                  className="flex items-center gap-2 text-sm text-green-400 hover:text-green-300 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">refresh</span>
                  <span>Refresh location</span>
                </button>
              </div>
            ) : locationError ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 text-red-400 text-sm bg-red-950/30 rounded-lg p-4 border border-red-700/30">
                  <span className="material-symbols-outlined text-xl">error</span>
                  <span className="flex-1">{locationError}</span>
                </div>
                <button
                  type="button"
                  onClick={getCurrentLocation}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition text-sm font-medium"
                >
                  <span className="material-symbols-outlined">refresh</span>
                  <span>Try Again</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-gray-400 text-sm bg-gray-800 rounded-lg p-4 border border-gray-700">
                <span className="material-symbols-outlined animate-pulse">location_searching</span>
                <span>Requesting location...</span>
              </div>
            )}
          </div>

          {/* Image Upload Section */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
              <span className="material-symbols-outlined text-lg">image</span>
              Image
              <span className="text-gray-500 text-xs">(Optional)</span>
            </label>
            {preview ? (
              <div className="relative rounded-lg overflow-hidden border border-gray-700">
                <img src={preview} alt="preview" className="w-full max-h-64 object-cover" />
                <button
                  onClick={() => { setFile(null); setPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="absolute top-3 right-3 bg-gray-900/90 hover:bg-red-600 text-white rounded-lg p-2 transition-all flex items-center gap-1"
                >
                  <span className="material-symbols-outlined">delete</span>
                  <span className="text-sm">Remove</span>
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-3 cursor-pointer p-4 rounded-lg bg-gray-800 border border-dashed border-gray-700 hover:border-green-500/50 transition-all group">
                <div className="w-12 h-12 rounded-lg bg-gray-700 flex items-center justify-center border border-gray-600 group-hover:border-green-500/50 transition-all">
                  <span className="material-symbols-outlined text-green-400 text-2xl">add_photo_alternate</span>
                </div>
                <div>
                  <div className="text-sm text-gray-300 font-medium">Upload an image</div>
                  <div className="text-xs text-gray-500">PNG, JPG up to 5MB</div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </label>
            )}
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-800 bg-gray-900/50">
          <button 
            onClick={onClose} 
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 transition-all font-medium"
          >
            <span className="material-symbols-outlined text-lg">close</span>
            <span>Cancel</span>
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={loading || !coordinates}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold shadow-lg hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                <span>Creating...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">send</span>
                <span>Create News</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modal, document.body);
  }

  return modal;
};

export default CreateNewsModal;

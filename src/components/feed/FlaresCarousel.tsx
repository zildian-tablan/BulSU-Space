import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline';
import { Flare } from '../../models/Flare';
import { getFlares } from '../../services/flareService';
import { useAuth } from '../../contexts/AuthContext';
import CreateFlareModal from '../modals/CreateFlareModal';

interface FlaresCarouselProps {
  onViewAll?: () => void;
}

const FlaresCarousel: React.FC<FlaresCarouselProps> = ({ onViewAll }) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [flares, setFlares] = useState<Flare[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadFlares = async () => {
    try {
      setLoading(true);
      const fetchedFlares = await getFlares(10); // Limit to 10 flares
      setFlares(fetchedFlares);
    } catch (error) {
      console.error('Error loading flares:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlares();
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleFlareCreated = () => {
    loadFlares(); // Reload flares after creating a new one
  };

  return (
    <>
      <div className="px-0 sm:px-4 lg:px-6 mb-4">
        <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/95 border border-green-500/30 rounded-lg p-4 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="material-icons text-green-400">bolt</span>
              Flares
            </h3>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 text-gray-400 hover:text-green-400 transition-colors"
                title="Options"
              >
                <span className="material-icons text-sm">more_vert</span>
              </button>
              
              {/* Dropdown Menu */}
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 min-w-[150px] overflow-hidden">
                  <button
                    onClick={() => {
                      navigate('/flares');
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 transition-colors flex items-center gap-2"
                  >
                    <span className="material-icons text-sm">visibility</span>
                    View All Flares
                  </button>
                  <button
                    onClick={() => {
                      loadFlares();
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 transition-colors flex items-center gap-2"
                  >
                    <span className="material-icons text-sm">refresh</span>
                    Refresh
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Carousel Container */}
          <div className="relative">
            {/* Flares Scroll Container */}
            <div
              ref={scrollContainerRef}
              className="flex flex-nowrap gap-3 overflow-x-auto overflow-y-hidden scrollbar-hide scroll-smooth pb-2"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {/* Create New Flare Card */}
              <div
                onClick={() => setShowCreateModal(true)}
                className="flex-shrink-0 w-28 h-48 sm:w-32 sm:h-52 bg-gradient-to-br from-green-600/20 to-green-500/10 border-2 border-dashed border-green-500/50 rounded-xl cursor-pointer hover:border-green-400 hover:from-green-600/30 hover:to-green-500/20 transition-all flex flex-col items-center justify-center gap-2 group"
              >
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center group-hover:bg-green-500/30 transition-colors">
                  {currentUser?.profile_pic ? (
                    <img
                      src={currentUser.profile_pic}
                      alt={currentUser.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="material-icons text-green-400 text-2xl">person</span>
                  )}
                </div>
                <p className="text-xs text-gray-300 font-medium mt-1">Create Flare</p>
              </div>

              {/* Loading Skeletons */}
              {loading && (
                <>
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={`skeleton-${i}`}
                      className="flex-shrink-0 w-28 h-48 sm:w-32 sm:h-52 bg-gray-700/50 rounded-xl animate-pulse"
                    />
                  ))}
                </>
              )}

              {/* Flare Cards */}
              {!loading && flares.map((flare, index) => (
                <div
                  key={flare.id}
                  className="flex-shrink-0 w-28 h-48 sm:w-32 sm:h-52 rounded-xl overflow-hidden cursor-pointer group relative bg-gray-900 border border-gray-700 hover:border-green-500/50 transition-all"
                  onClick={() => navigate('/flares', { state: { startIndex: index } })}
                  onMouseEnter={(e) => {
                    // Play video on hover (desktop only)
                    if (flare.mediaType === 'video') {
                      const video = e.currentTarget.querySelector('video');
                      if (video) {
                        video.play().catch(() => {
                          // Ignore play errors (e.g., if user hasn't interacted with page yet)
                        });
                      }
                    }
                  }}
                  onMouseLeave={(e) => {
                    // Pause video when hover ends
                    if (flare.mediaType === 'video') {
                      const video = e.currentTarget.querySelector('video');
                      if (video) {
                        video.pause();
                        video.currentTime = 0; // Reset to start
                      }
                    }
                  }}
                >
                  {/* Media */}
                  {flare.mediaType === 'image' ? (
                    <img
                      src={flare.mediaUrl}
                      alt={`Flare by ${flare.userName}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <video
                      src={flare.mediaUrl}
                      className="w-full h-full object-cover"
                      loop
                      playsInline
                    />
                  )}

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />

                  {/* User Info */}
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <div className="flex items-center gap-2">
                      {flare.userProfilePic ? (
                        <img
                          src={flare.userProfilePic}
                          alt={flare.userName}
                          className="w-6 h-6 rounded-full border border-white/50"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center border border-white/50">
                          <span className="material-icons text-white text-xs">person</span>
                        </div>
                      )}
                      <p className="text-white text-xs font-medium truncate flex-1">
                        {flare.userName}
                      </p>
                    </div>
                  </div>

                  {/* Full Screen Button */}
                  <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowsPointingOutIcon className="w-4 h-4 text-white" />
                  </div>
                </div>
              ))}

              {/* View All Card - commented out for now as per requirements */}
              {/* {!loading && flares.length > 0 && (
                <div
                  onClick={onViewAll}
                  className="flex-shrink-0 w-28 h-48 sm:w-32 sm:h-52 bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-xl cursor-pointer hover:border-green-500/50 transition-all flex flex-col items-center justify-center gap-2"
                >
                  <span className="material-icons text-green-400 text-3xl">visibility</span>
                  <p className="text-sm text-white font-medium text-center px-2">
                    View All Flares
                  </p>
                </div>
              )} */}
            </div>
          </div>

          {/* No Flares Message - Removed */}
        </div>
      </div>

      {/* Create Flare Modal */}
      <CreateFlareModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onFlareCreated={handleFlareCreated}
      />
    </>
  );
};

export default FlaresCarousel;

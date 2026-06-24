import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getFlaresPaginated, deleteFlare, getFlareById, getUserFlares } from '../services/flareService';
import { useParams } from 'react-router-dom';
import { toggleFlareLike, getUserLikedFlares } from '../services/flareReactionService';
import { addFlareComment, getFlareComments, FlareComment } from '../services/flareCommentService';
import { notifyWarnFlare, notifyFlareTakedown } from '../services/notificationTriggers';
import { Flare } from '../models/Flare';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  HeartIcon,
  ChatBubbleOvalLeftIcon,
  ArrowLeftIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon
} from '@heroicons/react/24/solid';
import {
  ArrowDownTrayIcon,
  LinkIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon
} from '@heroicons/react/24/outline';

const CommentsPanel = lazy(() => import('../components/flares/CommentsPanel'));
const CommentsOverlay = lazy(() => import('../components/flares/CommentsOverlay'));

const FlaresPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const [flares, setFlares] = useState<Flare[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [likedFlares, setLikedFlares] = useState<Set<string>>(new Set());
  const [showComments, setShowComments] = useState(false);
  const [showDesktopComments, setShowDesktopComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentsMap, setCommentsMap] = useState<Map<string, FlareComment[]>>(new Map());
  const [loadingComments, setLoadingComments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [videoPaused, setVideoPaused] = useState<Map<number, boolean>>(new Map());
  const [userPausedVideo, setUserPausedVideo] = useState(false);
  const [expandedCaptions, setExpandedCaptions] = useState<Set<string>>(new Set());
  const [openMenuFlareId, setOpenMenuFlareId] = useState<string | null>(null);
  const [menuActionLoading, setMenuActionLoading] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window !== 'undefined') return window.innerWidth >= 1024;
    return true;
  });
  // Tab for filtering flares: 'all' | 'yours' | 'saved'
  const [selectedTab, setSelectedTab] = useState<'all' | 'yours' | 'saved'>('all');
  const BATCH_SIZE = 20;
  const VISIBLE_WINDOW = 5;
  const containerRef = useRef<HTMLDivElement>(null);
  const commentsContainerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const backgroundVideoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const userProfileCacheRef = useRef<Map<string, string>>(new Map());
  const loadMorePromiseRef = useRef<Promise<void> | null>(null);
  const isScrolling = useRef(false);
  const scrollAccumulator = useRef(0);
  const scrollThreshold = 100;
  const copyTimeoutRef = useRef<number | null>(null);
  const normalizedRole = currentUser?.role?.toLowerCase();
  const isSuperAdmin = normalizedRole === 'super admin';
  const isProgramChairAdmin = useMemo(() => {
    if (!currentUser || normalizedRole !== 'admin') return false;
    const officeString: string | undefined = (currentUser as any)?.office;
    const officesArray: string[] = Array.isArray((currentUser as any)?.offices)
      ? ((currentUser as any).offices as string[])
      : [];

    const normalizedOffice = typeof officeString === 'string' ? officeString.toLowerCase() : '';
    const normalizedOffices = officesArray.map(o => (typeof o === 'string' ? o.toLowerCase() : ''));

    return normalizedOffice === 'program chair' || normalizedOffices.includes('program chair');
  }, [currentUser, normalizedRole]);

  // Format relative time
  const getRelativeTime = (timestamp: any): string => {
    if (!timestamp?.toDate) return 'Just now';
    const now = new Date();
    const date = timestamp.toDate();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 60) return 'Just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hr${diffInHours > 1 ? 's' : ''} ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} d ago`;
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return `${diffInMonths} mo ago`;
    const diffInYears = Math.floor(diffInMonths / 12);
    return `${diffInYears} yr${diffInYears > 1 ? 's' : ''} ago`;
  };

  // Track viewport breakpoint to render only one layout at a time
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Prevent mobile pull-to-refresh so vertical swipes can move between flares
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { documentElement, body } = document;
    const previousHtmlOverscroll = documentElement.style.overscrollBehaviorY;
    const previousBodyOverscroll = body.style.overscrollBehaviorY;

    if (!isDesktop) {
      documentElement.style.overscrollBehaviorY = 'contain';
      body.style.overscrollBehaviorY = 'contain';
    }

    return () => {
      documentElement.style.overscrollBehaviorY = previousHtmlOverscroll;
      body.style.overscrollBehaviorY = previousBodyOverscroll;
    };
  }, [isDesktop]);

  // When switching layout (desktop <-> mobile), clear refs
  useEffect(() => {
    videoRefs.current.forEach((v) => { try { v.pause(); } catch {} });
    backgroundVideoRefs.current.forEach((v) => { try { v.pause(); } catch {} });
    videoRefs.current.clear();
    backgroundVideoRefs.current.clear();
    setUserPausedVideo(false);
  }, [isDesktop]);

  // Fetch user profile picture with caching
  const fetchUserProfilePic = useCallback(async (userId: string): Promise<string> => {
    const cached = userProfileCacheRef.current.get(userId);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const profilePic = (userData as any).profile_pic || '';
        userProfileCacheRef.current.set(userId, profilePic);
        return profilePic;
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
    userProfileCacheRef.current.set(userId, '');
    return '';
  }, []);

  const loadBatch = useCallback(async (cursor?: any) => {
    const { flares: fetchedFlares, lastVisible: lastDoc } = await getFlaresPaginated(BATCH_SIZE, cursor);
    if (!fetchedFlares.length) {
      return { flares: [] as Flare[], lastVisible: lastDoc };
    }
    const flaresWithProfilePics = await Promise.all(
      fetchedFlares.map(async (flare) => {
        const profilePic = await fetchUserProfilePic(flare.userId);
        return {
          ...flare,
          userProfilePic: profilePic || flare.userProfilePic
        };
      })
    );
    return { flares: flaresWithProfilePics, lastVisible: lastDoc };
  }, [fetchUserProfilePic]);

  const loadInitialFlares = useCallback(async (force = false) => {
    if (hasLoadedInitial && !force) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { flares: firstBatch, lastVisible: lastDoc } = await loadBatch();
      let initialFlares = firstBatch;
      const paramsState = location.state as { startIndex?: number } | null;

      // If route has a flareId param, try to prioritize that flare
      const params = ({} as any) as { flareId?: string };
      try {
        // useParams is not available inside useCallback, read directly via location.pathname
        // but we can use URL to extract trailing segment when path is /flares/:id
        const match = location.pathname.match(/^\/flares\/(.+)$/);
        if (match) params.flareId = decodeURIComponent(match[1]);
      } catch {}

      if (params.flareId) {
        // Try to find in fetched batch
        const foundIndex = firstBatch.findIndex(f => f.id === params.flareId);
        if (foundIndex >= 0) {
          // Move found flare to front so it's prioritized, keep order for others
          const [found] = firstBatch.splice(foundIndex, 1);
          initialFlares = [found, ...firstBatch];
        } else {
          // Fetch specific flare and place it at the top
          try {
            const flareDoc = await getFlareById(params.flareId);
            if (flareDoc) {
              // Prepend if not already present
              initialFlares = [flareDoc, ...firstBatch];
            }
          } catch (err) {
            console.error('[FlaresPage] Failed to fetch targeted flare:', err);
          }
        }
      }

      setFlares(initialFlares);
      setLastVisible(lastDoc);
      setHasMore(firstBatch.length === BATCH_SIZE && !!lastDoc);
      const state = paramsState;
      // If we prepended a specific flare, ensure currentIndex points to it
      if (params.flareId) {
        setCurrentIndex(0);
      } else if (state?.startIndex !== undefined && state.startIndex >= 0 && state.startIndex < initialFlares.length) {
        setCurrentIndex(state.startIndex);
      } else {
        setCurrentIndex(0);
      }
    } catch (err) {
      console.error('Error loading flares:', err);
      setError('We had trouble loading flares. Please try again.');
    } finally {
      setLoading(false);
      setHasLoadedInitial(true);
    }
  }, [hasLoadedInitial, loadBatch, location.state]);

  const loadMoreFlares = useCallback(async () => {
    if (!hasMore || loadingMore) {
      return loadMorePromiseRef.current ?? Promise.resolve();
    }
    if (!lastVisible) {
      setHasMore(false);
      return Promise.resolve();
    }

    if (loadMorePromiseRef.current) {
      return loadMorePromiseRef.current;
    }

    const loadPromise = (async () => {
      try {
        setLoadingMore(true);
        const { flares: nextBatch, lastVisible: nextCursor } = await loadBatch(lastVisible);
        if (!nextBatch.length) {
          setHasMore(false);
          setLastVisible(null);
          return;
        }
        setFlares(prev => [...prev, ...nextBatch]);
        setLastVisible(nextCursor);
        setHasMore(nextBatch.length === BATCH_SIZE && !!nextCursor);
      } catch (err) {
        console.error('Error loading more flares:', err);
      } finally {
        setLoadingMore(false);
        loadMorePromiseRef.current = null;
      }
    })();

    loadMorePromiseRef.current = loadPromise;
    return loadPromise;
  }, [hasMore, lastVisible, loadBatch, loadingMore]);

  useEffect(() => {
    loadInitialFlares();
  }, [loadInitialFlares]);

  // React to direct navigations to `/flares/:flareId` while the page is already mounted.
  // This ensures clicking a notification that changes the URL will prioritize the
  // targeted flare by prepending it (or moving it to the front) and selecting it.
  useEffect(() => {
    try {
      const match = location.pathname.match(/^\/flares\/(.+)$/);
      if (!match) return;
      const targetFlareId = decodeURIComponent(match[1]);
      if (!targetFlareId) return;

      // If we already have flares loaded, try to move the targeted flare to index 0
      const existingIndex = flares.findIndex(f => f.id === targetFlareId);
      if (existingIndex === 0) {
        setCurrentIndex(0);
        return;
      }

      if (existingIndex > 0) {
        setFlares(prev => {
          const copy = prev.slice();
          const [found] = copy.splice(existingIndex, 1);
          return [found, ...copy];
        });
        setCurrentIndex(0);
        return;
      }

      // Not present in current list: fetch the flare and prepend it
      (async () => {
        try {
          const flareDoc = await getFlareById(targetFlareId);
          if (flareDoc) {
            setFlares(prev => [flareDoc, ...prev]);
            setCurrentIndex(0);
          }
        } catch (err) {
          console.error('[FlaresPage] Failed to fetch targeted flare on navigation:', err);
        }
      })();
    } catch (e) {
      // ignore malformed paths
    }
  }, [location.pathname]);

  useEffect(() => {
    const state = location.state as { startIndex?: number } | null;
    if (state?.startIndex !== undefined && state.startIndex >= 0 && state.startIndex < flares.length) {
      setCurrentIndex(state.startIndex);
    }
  }, [location.state, flares.length]);

  const handleRetryInitialLoad = useCallback(() => {
    loadInitialFlares(true);
  }, [loadInitialFlares]);

  // Load user's liked flares
  useEffect(() => {
    if (currentUser) {
      loadUserLikes();
    }
  }, [currentUser]);

  // Load comments when flare changes
  useEffect(() => {
    if (flares.length > 0 && currentIndex >= 0 && currentIndex < flares.length) {
      const currentFlare = flares[currentIndex];
      loadCommentsForFlare(currentFlare.id);
    }
  }, [currentIndex, flares]);

  const loadUserLikes = async () => {
    if (!currentUser) return;
    try {
      const likedFlareIds = await getUserLikedFlares(currentUser.id);
      setLikedFlares(new Set(likedFlareIds));
    } catch (error) {
      console.error('Error loading user likes:', error);
    }
  };

  const loadCommentsForFlare = async (flareId: string) => {
    // Check if comments are already loaded
    if (commentsMap.has(flareId)) {
      // Scroll to top even if comments are cached
      if (commentsContainerRef.current) {
        commentsContainerRef.current.scrollTop = 0;
      }
      return;
    }

    setLoadingComments(true);
    try {
      const comments = await getFlareComments(flareId);
      setCommentsMap(prev => new Map(prev).set(flareId, comments));
      
      // Scroll to top to show newest comments
      setTimeout(() => {
        if (commentsContainerRef.current) {
          commentsContainerRef.current.scrollTop = 0;
        }
      }, 100);
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const syncBackgroundVideo = useCallback((index: number, action: 'play' | 'pause' | 'timeupdate', currentTime?: number) => {
    const bgVideo = backgroundVideoRefs.current.get(index);
    if (!bgVideo) return;

    const time = currentTime ?? 0;

    if (action === 'play') {
      if (Math.abs(bgVideo.currentTime - time) > 0.3) {
        try {
          bgVideo.currentTime = time;
        } catch {}
      }
      bgVideo.play().catch(() => {});
    } else if (action === 'pause') {
      bgVideo.pause();
      try {
        bgVideo.currentTime = time;
      } catch {}
    } else if (action === 'timeupdate') {
      if (Math.abs(bgVideo.currentTime - time) > 0.4) {
        try {
          bgVideo.currentTime = time;
        } catch {}
      }
    }
  }, []);

  // Get filtered flares according to selected tab
  const getFilteredFlares = () => {
    if (!selectedTab || selectedTab === 'all') return flares;

    if (selectedTab === 'yours') {
      if (!currentUser) return [];
      return flares.filter(f => f.userId === currentUser.id);
    }

    if (selectedTab === 'saved') {
      if (!currentUser) return [];
      // Flare model doesn't include saved info by default; support common shapes used elsewhere.
      return flares.filter(f => {
        const anyF = f as any;
        const savedByArray: string[] | undefined = anyF.savedBy;
        const isSavedFlag: boolean | undefined = anyF.isSaved;
        if (Array.isArray(savedByArray)) {
          return savedByArray.includes(currentUser.id);
        }
        if (typeof isSavedFlag === 'boolean') {
          return isSavedFlag;
        }
        return false;
      });
    }

    return flares;
  };

  const filteredFlares = getFilteredFlares();
  const totalFlares = filteredFlares.length;

  // Reset to first flare when switching tabs
  useEffect(() => {
    setCurrentIndex(0);
  }, [selectedTab]);

  // When the user selects the "Your Flares" tab, fetch all flares posted by the current user
  useEffect(() => {
    let cancelled = false;

    const loadUserFlares = async () => {
      if (!currentUser) {
        setFlares([]);
        setHasMore(false);
        setLastVisible(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const userFlares = await getUserFlares(currentUser.id);
        if (cancelled) return;

        // Ensure profile pictures are present
        const withPics = await Promise.all(
          userFlares.map(async (f) => {
            const profilePic = await fetchUserProfilePic(f.userId);
            return { ...f, userProfilePic: profilePic || f.userProfilePic };
          })
        );

        setFlares(withPics);
        setLastVisible(null);
        setHasMore(false);
        setCurrentIndex(0);
      } catch (err) {
        console.error('[FlaresPage] Failed to load user flares:', err);
        if (!cancelled) setError('Failed to load your flares.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (selectedTab === 'yours') {
      loadUserFlares();
    } else if (selectedTab === 'all') {
      // Restore the main feed when switching back to "For You" / All
      loadInitialFlares(true);
    }

    return () => {
      cancelled = true;
    };
  }, [selectedTab, currentUser, fetchUserProfilePic, loadInitialFlares]);

  // Only render a small sliding window to keep the DOM light.
  const { visibleFlares, startIndex: visibleStartIndex } = useMemo(() => {
    const total = filteredFlares.length;
    if (!total) {
      return { visibleFlares: [] as Flare[], startIndex: 0 };
    }
    const windowSize = Math.min(VISIBLE_WINDOW, total);
    let start = currentIndex - Math.floor(windowSize / 2);
    const maxStart = Math.max(0, total - windowSize);
    if (start < 0) start = 0;
    if (start > maxStart) start = maxStart;
    const end = Math.min(total, start + windowSize);
    return {
      visibleFlares: filteredFlares.slice(start, end),
      startIndex: start
    };
  }, [filteredFlares, currentIndex]);

  const actionSheetFlare = useMemo(() => {
    if (!openMenuFlareId) {
      return null;
    }
    return flares.find(flare => flare.id === openMenuFlareId) || null;
  }, [openMenuFlareId, flares]);

  useEffect(() => {
    if (!totalFlares) {
      return;
    }
    setCurrentIndex(prev => (prev >= totalFlares ? totalFlares - 1 : prev));
  }, [totalFlares]);

  useEffect(() => {
    if (!totalFlares) {
      return;
    }
    if (currentIndex >= totalFlares - 3 && hasMore && !loadingMore) {
      loadMoreFlares();
    }
  }, [currentIndex, totalFlares, hasMore, loadingMore, loadMoreFlares]);

  // Handle video playback based on current index - ensure only current video plays
  useEffect(() => {
    let mounted = true;
    
    const playCurrentVideo = async () => {
      const currentVideo = videoRefs.current.get(currentIndex);
      
      // Pause and reset all videos first
      videoRefs.current.forEach((video, index) => {
        if (index !== currentIndex) {
          video.pause();
          video.currentTime = 0;
          syncBackgroundVideo(index, 'pause', 0);
        }
      });

      backgroundVideoRefs.current.forEach((video, index) => {
        if (index !== currentIndex) {
          video.pause();
          video.currentTime = 0;
        }
      });
      
      // Handle current video
      if (currentVideo && mounted) {
        // Apply current mute state
        currentVideo.muted = isMuted;

        // Only autoplay if user hasn't manually paused
        if (!userPausedVideo) {
          try {
            await currentVideo.play();
            syncBackgroundVideo(currentIndex, 'play', currentVideo.currentTime);
            setVideoPaused(prev => new Map(prev).set(currentIndex, false));
          } catch (error) {
            // If autoplay with sound is blocked, fall back to muted autoplay
            console.log('Autoplay prevented, attempting muted fallback');
            if (!isMuted) {
              try {
                currentVideo.muted = true;
                setIsMuted(true);
                await currentVideo.play();
                syncBackgroundVideo(currentIndex, 'play', currentVideo.currentTime);
                setVideoPaused(prev => new Map(prev).set(currentIndex, false));
              } catch (e2) {
                setVideoPaused(prev => new Map(prev).set(currentIndex, true));
                syncBackgroundVideo(currentIndex, 'pause', currentVideo.currentTime);
              }
            } else {
              setVideoPaused(prev => new Map(prev).set(currentIndex, true));
              syncBackgroundVideo(currentIndex, 'pause', currentVideo.currentTime);
            }
          }
        } else {
          setVideoPaused(prev => new Map(prev).set(currentIndex, true));
          syncBackgroundVideo(currentIndex, 'pause', currentVideo.currentTime);
        }
      }
    };
    
    playCurrentVideo();
    
    return () => {
      mounted = false;
    };
  }, [currentIndex, isMuted, userPausedVideo, syncBackgroundVideo]);
  
  // Reset current video to start when changing flares and reset pause state for new flare
  useEffect(() => {
    const currentVideo = videoRefs.current.get(currentIndex);
    if (currentVideo) {
      currentVideo.currentTime = 0;
    }
    const backgroundVideo = backgroundVideoRefs.current.get(currentIndex);
    if (backgroundVideo) {
      backgroundVideo.pause();
      backgroundVideo.currentTime = 0;
    }
    // Reset pause state so new flare autoplays
    setUserPausedVideo(false);
  }, [currentIndex]);
  
  // Cleanup video refs on unmount
  useEffect(() => {
    return () => {
      videoRefs.current.forEach((video) => {
        video.pause();
        video.src = '';
      });
      backgroundVideoRefs.current.forEach((video) => {
        video.pause();
        video.src = '';
      });
      videoRefs.current.clear();
      backgroundVideoRefs.current.clear();
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // Handle scroll with accumulator for better accuracy
  const handleScroll = useCallback((e: WheelEvent) => {
    // Check if the scroll event originated from a sidebar or comment section
    const target = e.target as HTMLElement;
    const isInSidebar = target.closest('.sidebar-scroll-area');
    
    // If scrolling in sidebar, allow default scroll behavior
    if (isInSidebar) {
      return;
    }
    
    e.preventDefault();

    if (!totalFlares) {
      return;
    }
    
    // If already transitioning, ignore new scroll events
    if (isScrolling.current) {
      return;
    }

    // Accumulate scroll delta
    scrollAccumulator.current += e.deltaY;

    // Check if we've accumulated enough scroll to change flare
    if (Math.abs(scrollAccumulator.current) >= scrollThreshold) {
      if (scrollAccumulator.current > 0 && currentIndex < totalFlares - 1) {
        // Scroll down - next flare
        isScrolling.current = true;
        setCurrentIndex(prev => prev + 1);
        scrollAccumulator.current = 0;
        setTimeout(() => { 
          isScrolling.current = false; 
        }, 600); // Match transition duration
      } else if (scrollAccumulator.current < 0 && currentIndex > 0) {
        // Scroll up - previous flare
        isScrolling.current = true;
        setCurrentIndex(prev => prev - 1);
        scrollAccumulator.current = 0;
        setTimeout(() => { 
          isScrolling.current = false; 
        }, 600); // Match transition duration
      } else {
        // Reset if at boundaries
        scrollAccumulator.current = 0;
      }
    }
  }, [currentIndex, totalFlares]);

  // Add scroll event listener
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleScroll, { passive: false });
    }
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleScroll);
      }
    };
  }, [handleScroll]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!totalFlares) {
        return;
      }
      if (e.key === 'ArrowDown' && currentIndex < totalFlares - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (e.key === 'ArrowUp' && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      } else if (e.key === 'Escape') {
        navigate(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, totalFlares, navigate]);

  // Handle touch swipe for mobile with improved accuracy
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  const minSwipeDistance = 80; // Minimum distance for a valid swipe

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDesktop && !showComments) {
      e.preventDefault();
    }
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchEndY.current) {
      touchEndY.current = e.changedTouches[0].clientY;
    }
    
    const diff = touchStartY.current - touchEndY.current;

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0 && currentIndex < totalFlares - 1) {
        // Swipe up - next flare
        setCurrentIndex(prev => prev + 1);
      } else if (diff < 0 && currentIndex > 0) {
        // Swipe down - previous flare
        setCurrentIndex(prev => prev - 1);
      }
    }
    
    // Reset
    touchEndY.current = 0;
  };

  useEffect(() => {
    if (!openMenuFlareId) {
      return;
    }

    if (typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuFlareId(null);
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [openMenuFlareId]);

  useEffect(() => {
    if (openMenuFlareId) {
      setOpenMenuFlareId(null);
    }
  }, [currentIndex, isDesktop]);

  const handleLike = async (flareId: string) => {
    if (!currentUser) return;
    
    try {
      // Optimistically update UI
      const wasLiked = likedFlares.has(flareId);
      const newLikedFlares = new Set(likedFlares);
      
      if (wasLiked) {
        newLikedFlares.delete(flareId);
      } else {
        newLikedFlares.add(flareId);
      }
      setLikedFlares(newLikedFlares);

      // Update flare's like count in local state
      setFlares(prevFlares => 
        prevFlares.map(flare => 
          flare.id === flareId 
            ? { ...flare, likeCount: (flare.likeCount || 0) + (wasLiked ? -1 : 1) }
            : flare
        )
      );

      // Update in Firebase
      await toggleFlareLike(flareId, currentUser.id);
    } catch (error) {
      console.error('Error liking flare:', error);
      // Revert on error
      const wasLiked = !likedFlares.has(flareId);
      const revertedLikes = new Set(likedFlares);
      if (wasLiked) {
        revertedLikes.add(flareId);
      } else {
        revertedLikes.delete(flareId);
      }
      setLikedFlares(revertedLikes);
      
      // Revert flare count
      setFlares(prevFlares => 
        prevFlares.map(flare => 
          flare.id === flareId 
            ? { ...flare, likeCount: (flare.likeCount || 0) + (wasLiked ? 1 : -1) }
            : flare
        )
      );
    }
  };

  const toggleCaption = useCallback((flareId: string) => {
    setExpandedCaptions(prev => {
      const next = new Set(prev);
      if (next.has(flareId)) {
        next.delete(flareId);
      } else {
        next.add(flareId);
      }
      return next;
    });
  }, []);

  const handleComment = () => {
    if (!currentUser) return;
    const currentFlare = flares[currentIndex];
    if (currentFlare) {
      loadCommentsForFlare(currentFlare.id);
    }
    // Show comments on mobile; open panel on desktop
    if (window.innerWidth >= 1024) {
      setShowDesktopComments(true);
    } else {
      setShowComments(true);
    }
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !currentUser) return;
    
    const currentFlare = flares[currentIndex];
    if (!currentFlare) return;

    try {
      // Add comment to Firestore
      await addFlareComment(
        currentFlare.id,
        currentUser.id,
        currentUser.name || 'Anonymous',
        currentUser.profile_pic,
        newComment.trim()
      );

      // Reload comments for this flare
      const updatedComments = await getFlareComments(currentFlare.id);
      setCommentsMap(prev => new Map(prev).set(currentFlare.id, updatedComments));
      
      setNewComment('');
    } catch (error) {
      console.error('Error submitting comment:', error);
    }
  };

  const getFlareExcerpt = (flare: Flare): string | undefined => {
    const description = flare.description ?? '';
    const normalized = description.replace(/\s+/g, ' ').trim();
    if (!normalized) return undefined;
    if (normalized.length <= 120) {
      return normalized;
    }
    return `${normalized.slice(0, 117)}...`;
  };

  const handleCopyLink = async (flare: Flare) => {
    const shareUrl = `${window.location.origin}/flares/${flare.id}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const fallbackInput = document.createElement('input');
        fallbackInput.value = shareUrl;
        document.body.appendChild(fallbackInput);
        fallbackInput.select();
        document.execCommand('copy');
        document.body.removeChild(fallbackInput);
      }
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      setCopyFeedback('Link copied to clipboard');
      copyTimeoutRef.current = window.setTimeout(() => setCopyFeedback(null), 2200);
      console.log('Flare link copied to clipboard');
    } catch (error) {
      console.error('Failed to copy flare link:', error);
      alert('Failed to copy link. Please try again.');
    } finally {
      setOpenMenuFlareId(null);
    }
  };

  const handleDownloadFlare = async (flare: Flare) => {
    setMenuActionLoading(flare.id);
    try {
      const response = await fetch(flare.mediaUrl);
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      const urlPath = flare.mediaUrl.split('?')[0];
      const extensionMatch = urlPath.match(/\.([a-zA-Z0-9]+)$/);
      const fallbackExt = flare.mediaType === 'video' ? 'mp4' : 'jpg';
      const extension = extensionMatch ? extensionMatch[1] : fallbackExt;
      link.download = `flare-${flare.id}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error('Error downloading flare media:', error);
      alert('Failed to download media. Please try again.');
    } finally {
      setMenuActionLoading(null);
      setOpenMenuFlareId(null);
    }
  };

  const removeFlareLocally = (flareId: string) => {
    setFlares(prev => {
      const filtered = prev.filter(flare => flare.id !== flareId);
      const newLength = filtered.length;
      setCurrentIndex(prevIndex => {
        if (!newLength) return 0;
        return Math.min(prevIndex, newLength - 1);
      });
      return filtered;
    });

    setCommentsMap(prev => {
      if (!prev.has(flareId)) return prev;
      const next = new Map(prev);
      next.delete(flareId);
      return next;
    });

    setLikedFlares(prev => {
      if (!prev.has(flareId)) return prev;
      const next = new Set(prev);
      next.delete(flareId);
      return next;
    });

    setVideoPaused(new Map());
    setUserPausedVideo(false);
  };

  const handleDeleteFlare = async (flare: Flare, options?: { force?: boolean }) => {
    if (!currentUser) return;

    const isForce = options?.force ?? false;
    const isAuthor = currentUser.id === flare.userId;

    if (!isAuthor && !isForce) {
      console.warn('Unauthorized flare delete attempt prevented');
      return;
    }

    if (isForce && !isSuperAdmin) {
      console.warn('Force delete requires super admin privileges');
      return;
    }

    const confirmationMessage = isForce
      ? 'Force delete this flare? This action cannot be undone.'
      : 'Delete this flare? This action cannot be undone.';

    const confirmed = window.confirm(confirmationMessage);
    if (!confirmed) {
      return;
    }

    setMenuActionLoading(flare.id);

    try {
      await deleteFlare(flare.id);
      removeFlareLocally(flare.id);

      const isCurrentFlare = flares[currentIndex]?.id === flare.id;
      if (isCurrentFlare) {
        setShowComments(false);
        setShowDesktopComments(false);
      }

      if (isForce) {
        try {
          const excerpt = getFlareExcerpt(flare);
          await notifyFlareTakedown(flare.id, currentUser.id, flare.userId, excerpt);
        } catch (notifyError) {
          console.error('Failed to send takedown notification:', notifyError);
        }
      }
    } catch (error) {
      console.error('Error deleting flare:', error);
      alert('Failed to delete flare. Please try again.');
    } finally {
      setMenuActionLoading(null);
      setOpenMenuFlareId(null);
    }
  };

  const handleWarnFlare = async (flare: Flare) => {
    if (!currentUser || !isProgramChairAdmin || currentUser.id === flare.userId) {
      return;
    }

    const confirmed = window.confirm('Send a warning to the author of this flare?');
    if (!confirmed) {
      return;
    }

    setMenuActionLoading(flare.id);
    try {
      const excerpt = getFlareExcerpt(flare);
      const sent = await notifyWarnFlare(flare.id, currentUser.id, flare.userId, excerpt);
      if (!sent) {
        alert('Failed to send warning. Please try again.');
      }
    } catch (error) {
      console.error('Error sending flare warning:', error);
      alert('Failed to send warning. Please try again.');
    } finally {
      setMenuActionLoading(null);
      setOpenMenuFlareId(null);
    }
  };

  const handleForceDeleteFlare = async (flare: Flare) => {
    await handleDeleteFlare(flare, { force: true });
  };

  const renderActionButtons = (flare: Flare) => {
  const isBusy = menuActionLoading === flare.id;
    const commentsCount = commentsMap.get(flare.id)?.length || 0;

    return (
      <div className="absolute right-1 bottom-24 flex flex-col gap-2 z-20 items-center">
        {flare.mediaType === 'video' && (
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="flex flex-col items-center gap-1 bg-transparent transition-all duration-300 hover:scale-110"
          >
            <div className="p-2 rounded-full bg-gray-800/70 hover:bg-gray-700/80 transition-all duration-300 shadow-lg">
              {isMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white drop-shadow-lg">
                  <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM17.78 9.22a.75.75 0 10-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 001.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 101.06-1.06L20.56 12l1.72-1.72a.75.75 0 00-1.06-1.06l-1.72 1.72-1.72-1.72z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white drop-shadow-lg">
                  <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
                  <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
                </svg>
              )}
            </div>
          </button>
        )}

        <button
          onClick={() => handleLike(flare.id)}
          disabled={!currentUser}
          className="flex flex-col items-center gap-1 disabled:opacity-50 transition-all duration-300 hover:scale-110 bg-transparent"
        >
          <div
            className={`p-2 rounded-full transition-all duration-300 shadow-lg ${
              likedFlares.has(flare.id)
                ? 'bg-red-500/80 hover:bg-red-600/90 shadow-red-500/30'
                : 'bg-gray-800/70 hover:bg-gray-700/80'
            }`}
          >
            <HeartIcon className="w-6 h-6 text-white drop-shadow-lg" />
          </div>
          <span
            className={`text-white text-xs font-bold drop-shadow-lg ${
              likedFlares.has(flare.id) ? 'text-red-400' : ''
            }`}
          >
            {flare.likeCount || 0}
          </span>
        </button>

        <button
          onClick={handleComment}
          disabled={!currentUser}
          className="flex flex-col items-center gap-1 disabled:opacity-50 transition-all duration-300 hover:scale-110 bg-transparent"
        >
          <div className="p-2 rounded-full bg-blue-500/70 hover:bg-blue-600/80 transition-all duration-300 shadow-lg shadow-blue-500/30">
            <ChatBubbleOvalLeftIcon className="w-6 h-6 text-white drop-shadow-lg" />
          </div>
          <span className="text-white text-xs font-bold drop-shadow-lg">
            {commentsCount}
          </span>
        </button>
        <button
          type="button"
          data-flare-menu-trigger
          onClick={() => setOpenMenuFlareId(prev => (prev === flare.id ? null : flare.id))}
          disabled={isBusy}
          aria-haspopup="menu"
          aria-expanded={openMenuFlareId === flare.id}
          className="flex flex-col items-center gap-1 transition-all duration-300 hover:scale-110 bg-transparent disabled:opacity-60"
        >
          <div
            className={`p-2 rounded-full transition-all duration-300 shadow-lg ${
              openMenuFlareId === flare.id
                ? 'bg-white/20'
                : 'bg-gray-700/70 hover:bg-gray-600/80'
            }`}
          >
            <EllipsisVerticalIcon className="w-6 h-6 text-white drop-shadow-lg" />
          </div>
          <span className="text-white text-xs font-bold drop-shadow-lg">More</span>
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black">
        {/* Main flare skeleton */}
        <div className="h-screen flex items-center justify-center">
          <div className="relative w-full h-full max-w-[600px] mx-auto animate-pulse">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-800/50 to-gray-900/50">
              {/* Skeleton for user info */}
              <div className="absolute bottom-20 left-4 right-20 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-gray-700/70"></div>
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-gray-700/70 rounded"></div>
                    <div className="h-3 w-24 bg-gray-700/70 rounded"></div>
                  </div>
                </div>
                <div className="h-3 w-3/4 bg-gray-700/70 rounded"></div>
                <div className="h-3 w-1/2 bg-gray-700/70 rounded"></div>
              </div>
              
              {/* Skeleton for action buttons */}
              <div className="absolute bottom-20 right-4 flex flex-col items-center gap-6">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-full bg-gray-700/70"></div>
                  <div className="h-3 w-8 bg-gray-700/70 rounded"></div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-full bg-gray-700/70"></div>
                  <div className="h-3 w-8 bg-gray-700/70 rounded"></div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-full bg-gray-700/70"></div>
                  <div className="h-3 w-8 bg-gray-700/70 rounded"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && flares.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white flex flex-col items-center gap-4 px-6 text-center max-w-sm">
          <span className="material-icons text-6xl text-red-500">error</span>
          <p className="text-lg">{error}</p>
          <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
            <button
              onClick={handleRetryInitialLoad}
              className="flex-1 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20"
            >
              Retry
            </button>
            <button
              onClick={() => navigate(-1)}
              className="flex-1 px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors border border-white/20"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (flares.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white flex flex-col items-center gap-4">
          <span className="material-icons text-6xl text-gray-500">bolt</span>
          <p className="text-xl">No flares available</p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2 hover:bg-white/10 text-white rounded-lg transition-colors border border-white/20"
          >
            Go Back
          </button>

        </div>
      </div>
    );
  }

  const currentFlare = filteredFlares[currentIndex];

  return (
    <>
      {copyFeedback && (
        <div className="fixed top-16 left-1/2 z-[60] -translate-x-1/2 transform px-4 py-2 rounded-full bg-emerald-500/90 text-white text-sm font-medium shadow-lg backdrop-blur-sm">
          {copyFeedback}
        </div>
      )}
      <div
        ref={containerRef}
        className="fixed inset-0 bg-black overflow-hidden overscroll-y-contain touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Back button (mobile) */}
        <button
          onClick={() => navigate(-1)}
          className="fixed top-6 left-4 z-50 p-2 bg-black/50 hover:bg-white/10 text-white rounded-full backdrop-blur-sm transition-colors lg:hidden"
          aria-label="Back"
        >
          <ArrowLeftIcon className="w-6 h-6" />
        </button>

        {/* Close button - Desktop only (top-left of page) */}
        <button
          onClick={() => navigate(-1)}
          className="hidden lg:block fixed top-6 left-4 z-50 p-2 bg-black/50 hover:bg-white/10 text-white rounded-full backdrop-blur-sm transition-colors"
          aria-label="Back"
        >
          <ArrowLeftIcon className="w-6 h-6" />
        </button>

        {/* Comment toggle button - Desktop only */}
        <button
          onClick={() => setShowDesktopComments(!showDesktopComments)}
          className="hidden lg:block fixed top-6 right-4 z-50 p-2 bg-black/50 hover:bg-white/10 text-white rounded-full backdrop-blur-sm transition-colors"
          aria-label="Toggle Comments"
        >
          <ChatBubbleOvalLeftIcon className="w-6 h-6" />
        </button>

        {/* Flare counter removed (design change) */}

        {/* Desktop quick navigation buttons (center-left of page) - show only when comments are closed */}
        {!showDesktopComments && (
          <div className="hidden lg:flex fixed left-4 top-1/2 -translate-y-1/2 z-50 flex-col gap-3">
            <button
              onClick={() => currentIndex > 0 && setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              aria-label="Previous flare"
              className="p-2 rounded-full bg-black/50 hover:bg-white/10 text-white backdrop-blur-sm transition-colors disabled:opacity-40"
            >
              <ChevronUpIcon className="w-6 h-6" />
            </button>
            <button
              onClick={() => currentIndex < totalFlares - 1 && setCurrentIndex((i) => Math.min(totalFlares - 1, i + 1))}
              disabled={currentIndex >= totalFlares - 1}
              aria-label="Next flare"
              className="p-2 rounded-full bg-black/50 hover:bg-white/10 text-white backdrop-blur-sm transition-colors disabled:opacity-40"
            >
              <ChevronDownIcon className="w-6 h-6" />
            </button>
          </div>
        )}

  {/* Desktop Layout (exclusive) */}
  {isDesktop && (
  <div className="flex h-[100svh]">

          {/* Center Column: Flare Display (9:16 Frame) */}
          <div className="flex-1 flex justify-center items-stretch bg-black relative overflow-hidden">
            {/* Fixed 9:16 aspect ratio container - height matches screen; width derives from aspect ratio */}
            <div className="relative h-full overflow-hidden" style={{ aspectRatio: '9/16', height: '100%', maxHeight: '100%' }}>
              {/* Tabs (center-top of flare container) - full-width row, transparent background to avoid parent's gray */}
              <div className="absolute left-0 right-0 top-2 z-30 flex justify-center">
                <div className="w-full max-w-[720px] px-4">
                  <div className="bg-transparent backdrop-blur-sm rounded-full p-0.5 flex items-center gap-1">
                    <button
                      onClick={() => setSelectedTab('all')}
                      aria-current={selectedTab === 'all' ? 'true' : undefined}
                      className={`flex-1 text-center whitespace-nowrap truncate px-2 py-0.5 rounded-full text-xs transition ${selectedTab === 'all' ? 'bg-emerald-500 text-white font-semibold ring-1 ring-emerald-400/20' : 'text-white/70 hover:text-white'}`}
                    >
                      For You
                    </button>
                    <button
                      onClick={() => setSelectedTab('yours')}
                      aria-current={selectedTab === 'yours' ? 'true' : undefined}
                      className={`flex-1 text-center whitespace-nowrap truncate px-2 py-0.5 rounded-full text-xs transition ${selectedTab === 'yours' ? 'bg-emerald-500 text-white font-semibold ring-1 ring-emerald-400/20' : 'text-white/70 hover:text-white'}`}
                    >
                      Your Flares
                    </button>
                    {/*
                    <button
                      onClick={() => setSelectedTab('saved')}
                      aria-current={selectedTab === 'saved' ? 'true' : undefined}
                      className={`flex-1 text-center whitespace-nowrap truncate px-2 py-0.5 rounded-full text-xs transition ${selectedTab === 'saved' ? 'bg-emerald-500 text-white font-semibold ring-1 ring-emerald-400/20' : 'text-white/70 hover:text-white'}`}
                    >
                      Saved
                    </button>
                    */}
                  </div>
                </div>
              </div>
              {/* Flare counter removed (design change) */}

              {visibleFlares.map((flare, offset) => {
                const index = visibleStartIndex + offset;
                const isActive = index === currentIndex;
                const isBefore = index < currentIndex;
                const transitionClass = isActive
                  ? 'opacity-100 scale-100 z-10'
                  : isBefore
                  ? 'opacity-0 scale-95 -translate-y-full'
                  : 'opacity-0 scale-95 translate-y-full';
                return (
                <div
                  key={flare.id}
                  className={`absolute inset-0 transition-all duration-500 ${transitionClass}`}
                  style={{ aspectRatio: '9/16' }}
                >
                  {/* Media */}
                  {flare.mediaType === 'image' ? (
                    <div className="relative w-full h-full overflow-hidden">
                      {/* Blurred background fill */}
                      <img
                        src={flare.mediaUrl}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ filter: 'blur(12px) brightness(0.58)', zIndex: 0 }}
                      />
                      {/* Main media centered, contained */}
                      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 1 }}>
                        <img
                          src={flare.mediaUrl}
                          alt={`Flare by ${flare.userName}`}
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="relative w-full h-full overflow-hidden">
                      {/* Blurred background fill */}
                      <video
                        ref={(el) => {
                          if (el) {
                            backgroundVideoRefs.current.set(index, el);
                            el.muted = true;
                          } else {
                            backgroundVideoRefs.current.delete(index);
                          }
                        }}
                        src={flare.mediaUrl}
                        className="absolute inset-0 w-full h-full object-cover"
                        loop
                        muted
                        playsInline
                        preload={isActive ? 'auto' : 'metadata'}
                        aria-hidden
                        style={{ filter: 'blur(12px) brightness(0.58)', zIndex: 0 }}
                      />
                      {/* Main media centered, contained */}
                      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 1 }}>
                        <video
                          ref={(el) => {
                            if (el) {
                              videoRefs.current.set(index, el);
                              el.muted = isMuted;
                              if (!el.dataset.listenerAdded) {
                                const handlePlay = () => {
                                  setVideoPaused(prev => {
                                    const newMap = new Map(prev);
                                    newMap.set(index, false);
                                    return newMap;
                                  });
                                  syncBackgroundVideo(index, 'play', el.currentTime);
                                };
                                const handlePause = () => {
                                  setVideoPaused(prev => {
                                    const newMap = new Map(prev);
                                    newMap.set(index, true);
                                    return newMap;
                                  });
                                  syncBackgroundVideo(index, 'pause', el.currentTime);
                                };
                                const handleTimeUpdate = () => {
                                  syncBackgroundVideo(index, 'timeupdate', el.currentTime);
                                };
                                el.addEventListener('play', handlePlay);
                                el.addEventListener('pause', handlePause);
                                el.addEventListener('timeupdate', handleTimeUpdate);
                                el.dataset.listenerAdded = 'true';
                              }
                            } else {
                              videoRefs.current.delete(index);
                            }
                          }}
                          src={flare.mediaUrl}
                          className="w-full h-full object-contain"
                          loop
                          muted={isMuted}
                          playsInline
                          preload={isActive ? 'auto' : 'metadata'}
                          onClick={(e) => {
                            e.stopPropagation();
                            const video = e.currentTarget as HTMLVideoElement;
                            if (video.paused) {
                              setUserPausedVideo(false);
                              video.play().catch(() => {});
                            } else {
                              setUserPausedVideo(true);
                              video.pause();
                            }
                          }}
                        />

                        {/* Play button overlay - shown when video is paused */}
                        {isActive && videoPaused.get(index) && (
                          <div 
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            style={{ zIndex: 5 }}
                          >
                            <div className="bg-black/50 rounded-full p-4 backdrop-blur-sm">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-12 h-12">
                                <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* User info overlay - bottom left */}
                  <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-20">
                    <div className="flex items-center gap-3 mb-3">
                      {flare.userProfilePic ? (
                        <img
                          src={flare.userProfilePic}
                          alt={flare.userName}
                          className="w-12 h-12 rounded-full border-2 border-white object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center border-2 border-white">
                          <span className="material-icons text-white">person</span>
                        </div>
                      )}
                      <div>
                        <p className="text-white font-semibold text-lg">
                          {flare.userName?.split(/\s+/).slice(0, 3).join(' ') || 'Anonymous'}
                        </p>
                        <p className="text-gray-300 text-sm">
                          {flare.createdAt?.toDate ? 
                            new Date(flare.createdAt.toDate()).toLocaleDateString() : 
                            'Recently'
                          }
                        </p>
                      </div>
                    </div>

                    {/* Caption area */}
                    <div className="text-white text-sm">
                      {(() => {
                        const caption = flare.description?.trim() || 'No description';
                        const words = caption.split(/\s+/);
                        const isLong = words.length > 5;
                        const isExpanded = expandedCaptions.has(flare.id);
                        const displayText = isLong && !isExpanded ? words.slice(0, 5).join(' ') + '…' : caption;

                        return (
                          <>
                            <p>{displayText}</p>
                            {isLong && (
                              <button
                                onClick={() => toggleCaption(flare.id)}
                                className="mt-1 text-xs font-semibold text-blue-300 hover:text-blue-200 transition-colors"
                              >
                                {isExpanded ? 'See less' : 'See more'}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {/* Sound/description */}
                    <div className="flex items-center gap-2 mt-2 text-gray-300 text-xs">
                      <span className="material-icons text-sm">music_note</span>
                      <p className="truncate">Original sound - {flare.userName}</p>
                    </div>
                  </div>

                  {renderActionButtons(flare)}
                </div>
              );
            })}

              {/* Skeleton loading indicator when fetching more flares */}
              {loadingMore && hasMore && (
                <div className="absolute inset-0 z-20 pointer-events-none animate-pulse">
                  <div className="w-full h-full bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm">
                    <div className="absolute bottom-20 left-4 right-20 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-gray-700/70"></div>
                        <div className="space-y-2">
                          <div className="h-4 w-32 bg-gray-700/70 rounded"></div>
                          <div className="h-3 w-24 bg-gray-700/70 rounded"></div>
                        </div>
                      </div>
                      <div className="h-3 w-3/4 bg-gray-700/70 rounded"></div>
                      <div className="h-3 w-1/2 bg-gray-700/70 rounded"></div>
                    </div>
                    
                    <div className="absolute bottom-20 right-4 flex flex-col items-center gap-6">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-8 h-8 rounded-full bg-gray-700/70"></div>
                        <div className="h-3 w-8 bg-gray-700/70 rounded"></div>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-8 h-8 rounded-full bg-gray-700/70"></div>
                        <div className="h-3 w-8 bg-gray-700/70 rounded"></div>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-8 h-8 rounded-full bg-gray-700/70"></div>
                        <div className="h-3 w-8 bg-gray-700/70 rounded"></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            
          </div>
          {showDesktopComments && currentFlare && (
            <Suspense
              fallback={
                <aside className="hidden lg:flex w-[380px] flex-col border-l border-white/20 bg-black/40 backdrop-blur-sm" />
              }
            >
              <CommentsPanel
                comments={commentsMap.get(currentFlare.id) || []}
                loading={loadingComments}
                currentUser={currentUser}
                newComment={newComment}
                setNewComment={setNewComment}
                onSubmit={handleSubmitComment}
                onSignIn={() => navigate('/login')}
                getRelativeTime={getRelativeTime}
                scrollRef={commentsContainerRef}
              />
            </Suspense>
          )}
    </div>
  )}
  {/* Mobile Layout (exclusive) */}
  {!isDesktop && (
  <div className="relative w-full h-[100svh] flex items-center justify-center">
        <div className="relative w-full h-full max-w-[600px] mx-auto">
          {/* Tabs (center-top of flare container - mobile) - full-width row, transparent background */}
          <div className="absolute left-0 right-0 top-2 z-40 flex justify-center">
            <div className="w-full max-w-[640px] px-3">
              <div className="bg-transparent backdrop-blur-sm rounded-full p-0.5 flex items-center gap-1">
                <button
                  onClick={() => setSelectedTab('all')}
                  aria-current={selectedTab === 'all' ? 'true' : undefined}
                  className={`flex-1 text-center whitespace-nowrap truncate px-1 py-0.5 rounded-full text-xs transition ${selectedTab === 'all' ? 'bg-emerald-500 text-white font-semibold ring-1 ring-emerald-400/20' : 'text-white/70 hover:text-white'}`}
                >
                  For You
                </button>
                <button
                  onClick={() => setSelectedTab('yours')}
                  aria-current={selectedTab === 'yours' ? 'true' : undefined}
                  className={`flex-1 text-center whitespace-nowrap truncate px-1 py-0.5 rounded-full text-xs transition ${selectedTab === 'yours' ? 'bg-emerald-500 text-white font-semibold ring-1 ring-emerald-400/20' : 'text-white/70 hover:text-white'}`}
                >
                  Your Flares
                </button>
                {/*
                <button
                  onClick={() => setSelectedTab('saved')}
                  aria-current={selectedTab === 'saved' ? 'true' : undefined}
                  className={`flex-1 text-center whitespace-nowrap truncate px-1 py-0.5 rounded-full text-xs transition ${selectedTab === 'saved' ? 'bg-emerald-500 text-white font-semibold ring-1 ring-emerald-400/20' : 'text-white/70 hover:text-white'}`}
                >
                  Saved
                </button>
                */}
              </div>
            </div>
          </div>
          {visibleFlares.map((flare, offset) => {
            const index = visibleStartIndex + offset;
            const isActive = index === currentIndex;
            const transitionClass = isActive
              ? 'opacity-100 scale-100 z-10'
              : index < currentIndex
              ? 'opacity-0 scale-95 -translate-y-full'
              : 'opacity-0 scale-95 translate-y-full';
            return (
              <div
                key={flare.id}
                className={`absolute inset-0 transition-all duration-500 ${transitionClass}`}
              >
              {/* Media */}
              {flare.mediaType === 'image' ? (
                <div className="relative w-full h-full overflow-hidden">
                  {/* Blurred background fill */}
                  <img
                    src={flare.mediaUrl}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ filter: 'blur(12px) brightness(0.58)', zIndex: 0 }}
                  />
                  {/* Main media centered, contained */}
                  <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 1 }}>
                    <img
                      src={flare.mediaUrl}
                      alt={`Flare by ${flare.userName}`}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                </div>
              ) : (
                <div className="relative w-full h-full overflow-hidden">
                  {/* Blurred background fill */}
                  <video
                    ref={(el) => {
                      if (el) {
                        backgroundVideoRefs.current.set(index, el);
                        el.muted = true;
                      } else {
                        backgroundVideoRefs.current.delete(index);
                      }
                    }}
                    src={flare.mediaUrl}
                    className="absolute inset-0 w-full h-full object-cover"
                    loop
                    muted
                    playsInline
                    preload={isActive ? 'auto' : 'metadata'}
                    aria-hidden
                    style={{ filter: 'blur(12px) brightness(0.58)', zIndex: 0 }}
                  />
                  {/* Main media centered, contained */}
                  <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 1 }}>
                    <video
                      ref={(el) => {
                        if (el) {
                          videoRefs.current.set(index, el);
                          el.muted = isMuted;
                          if (!el.dataset.listenerAdded) {
                            const handlePlay = () => {
                              setVideoPaused(prev => {
                                const newMap = new Map(prev);
                                newMap.set(index, false);
                                return newMap;
                              });
                              syncBackgroundVideo(index, 'play', el.currentTime);
                            };
                            const handlePause = () => {
                              setVideoPaused(prev => {
                                const newMap = new Map(prev);
                                newMap.set(index, true);
                                return newMap;
                              });
                              syncBackgroundVideo(index, 'pause', el.currentTime);
                            };
                            const handleTimeUpdate = () => {
                              syncBackgroundVideo(index, 'timeupdate', el.currentTime);
                            };
                            el.addEventListener('play', handlePlay);
                            el.addEventListener('pause', handlePause);
                            el.addEventListener('timeupdate', handleTimeUpdate);
                            el.dataset.listenerAdded = 'true';
                          }
                        } else {
                          videoRefs.current.delete(index);
                        }
                      }}
                      src={flare.mediaUrl}
                      className="w-full h-full object-contain"
                      loop
                      muted={isMuted}
                      playsInline
                      preload={isActive ? 'auto' : 'metadata'}
                      onClick={(e) => {
                        e.stopPropagation();
                        const video = e.currentTarget as HTMLVideoElement;
                        if (video.paused) {
                          setUserPausedVideo(false);
                          video.play().catch(() => {});
                        } else {
                          setUserPausedVideo(true);
                          video.pause();
                        }
                      }}
                    />
                  </div>
                  
                  {/* Play button overlay */}
                  {isActive && videoPaused.get(index) && (
                    <div 
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      style={{ zIndex: 5 }}
                    >
                      <div className="bg-black/50 rounded-full p-4 backdrop-blur-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-12 h-12">
                          <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* User info overlay - bottom left (mobile) */}
              <div className="absolute bottom-0 left-0 right-0 p-6 pr-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-20">
                <div className="flex items-center gap-3 mb-3">
                  {flare.userProfilePic ? (
                    <img
                      src={flare.userProfilePic}
                      alt={flare.userName}
                      className="w-12 h-12 rounded-full border-2 border-white object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center border-2 border-white">
                      <span className="material-icons text-white">person</span>
                    </div>
                  )}
                  <div>
                    <p className="text-white font-semibold text-lg">
                      {flare.userName?.split(/\s+/).slice(0, 3).join(' ') || 'Anonymous'}
                    </p>
                    <p className="text-gray-300 text-sm">
                      {flare.createdAt?.toDate ? 
                        new Date(flare.createdAt.toDate()).toLocaleDateString() : 
                        'Recently'
                      }
                    </p>
                  </div>
                </div>

                <div className="text-white text-sm">
                  {(() => {
                    const caption = flare.description?.trim() || 'No description';
                    const words = caption.split(/\s+/);
                    const isLong = words.length > 5;
                    const isExpanded = expandedCaptions.has(flare.id);
                    const displayText = isLong && !isExpanded ? words.slice(0, 5).join(' ') + '…' : caption;

                    return (
                      <>
                        <p>{displayText}</p>
                        {isLong && (
                          <button
                            onClick={() => toggleCaption(flare.id)}
                            className="mt-1 text-xs font-semibold text-blue-300 hover:text-blue-200 transition-colors"
                          >
                            {isExpanded ? 'See less' : 'See more'}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-2 mt-2 text-gray-300 text-xs">
                  <span className="material-icons text-sm">music_note</span>
                  <p className="truncate">Original sound - {flare.userName}</p>
                </div>
              </div>

              {renderActionButtons(flare)}
              </div>
            );
          })}
        </div>
    </div>
  )}

      {actionSheetFlare && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm"
          onClick={() => setOpenMenuFlareId(null)}
        >
          <div
            data-flare-action-sheet
            className="w-full"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto w-full max-w-md px-4 pb-6 pt-4">
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/30" />
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0c0c0f]/95 shadow-2xl">
                <div className="px-5 py-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
                    Quick Actions
                  </h3>
                  <p className="mt-1 text-xs text-white/50">
                    Choose how you want to manage this flare.
                  </p>
                </div>
                <div className="h-px bg-white/10" />
                <button
                  type="button"
                  onClick={() => handleDownloadFlare(actionSheetFlare)}
                  disabled={menuActionLoading === actionSheetFlare.id}
                  className="flex w-full items-center gap-4 px-5 py-3 text-left text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                    <ArrowDownTrayIcon className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Download</p>
                    <p className="text-xs text-white/55">Save a copy of this flare</p>
                  </div>
                </button>
                <div className="h-px bg-white/5" />
                <button
                  type="button"
                  onClick={() => handleCopyLink(actionSheetFlare)}
                  disabled={menuActionLoading === actionSheetFlare.id}
                  className="flex w-full items-center gap-4 px-5 py-3 text-left text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/15 text-blue-200">
                    <LinkIcon className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Copy link</p>
                    <p className="text-xs text-white/55">Share this flare via link</p>
                  </div>
                </button>
                {currentUser?.id === actionSheetFlare.userId && (
                  <>
                    <div className="h-px bg-white/5" />
                    <button
                      type="button"
                      onClick={() => handleDeleteFlare(actionSheetFlare)}
                      disabled={menuActionLoading === actionSheetFlare.id}
                      className="flex w-full items-center gap-4 px-5 py-3 text-left text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 text-red-300">
                        <TrashIcon className="h-5 w-5" />
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">Delete</p>
                        <p className="text-xs text-red-200/70">Remove this flare from BulSU Space</p>
                      </div>
                    </button>
                  </>
                )}
                {isProgramChairAdmin && currentUser?.id !== actionSheetFlare.userId && (
                  <>
                    <div className="h-px bg-white/5" />
                    <button
                      type="button"
                      onClick={() => handleWarnFlare(actionSheetFlare)}
                      disabled={menuActionLoading === actionSheetFlare.id}
                      className="flex w-full items-center gap-4 px-5 py-3 text-left text-amber-300 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-200">
                        <ExclamationTriangleIcon className="h-5 w-5" />
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">Warn author</p>
                        <p className="text-xs text-amber-200/70">Send a notice to the flare owner</p>
                      </div>
                    </button>
                  </>
                )}
                {isSuperAdmin && (
                  <>
                    <div className="h-px bg-white/5" />
                    <button
                      type="button"
                      onClick={() => handleForceDeleteFlare(actionSheetFlare)}
                      disabled={menuActionLoading === actionSheetFlare.id}
                      className="flex w-full items-center gap-4 px-5 py-3 text-left text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 text-red-300">
                        <ShieldExclamationIcon className="h-5 w-5" />
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">Force delete</p>
                        <p className="text-xs text-red-200/75">Remove this flare for everyone</p>
                      </div>
                    </button>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpenMenuFlareId(null)}
                className="mt-3 w-full rounded-2xl bg-white/10 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Comment Overlay */}
      <Suspense fallback={null}>
        <CommentsOverlay
          open={!!(showComments && currentFlare)}
          onClose={() => setShowComments(false)}
          comments={(currentFlare && commentsMap.get(currentFlare.id)) || []}
          loading={loadingComments}
          currentUser={currentUser}
          newComment={newComment}
          setNewComment={setNewComment}
          onSubmit={handleSubmitComment}
          onSignIn={() => navigate('/login')}
          getRelativeTime={getRelativeTime}
        />
      </Suspense>

      {/* Login prompt for non-authenticated users */}
      {!currentUser && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent z-40">
          <div className="max-w-md mx-auto text-center text-white">
            <p className="mb-3">Sign in to like and comment on flares</p>
            <button
              onClick={() => navigate('/login')}
              className="px-6 py-2 hover:bg-white/10 text-white rounded-lg transition-colors font-semibold border border-white/20"
            >
              Sign In
            </button>
          </div>
        </div>
      )}
      {/* Close outer container */}
      </div>
    </>
  );
};

export default FlaresPage;

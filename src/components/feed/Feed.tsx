import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import CreatePost from './CreatePost';
import PostCard from './PostCard';
import PollCard from './PollCard';
import CreatePollModal from '../modals/CreatePollModal';
import FlaresCarousel from './FlaresCarousel';
import FullScreenRegularPostModal from './FullScreenRegularPostModal';
import { isMobileDevice } from '../../utils/mobileUtils';
import PostCardSkeleton from './PostCardSkeleton';
import { Post, PostVisibility } from '../../models/Post';
import { getPostsRealtime, getPostsBatch, getReportedPosts, cleanupPostsForUnknownUsers, getArchivedPosts, getArchivedSchoolYears } from '../../services/postService';
import { getAllUsers, getMultipleUserStatusesRealtime, UserStatus } from '../../services/userService';
import { getIndependentPolls, createPoll, Poll, getCachedIndependentPolls, invalidateIndependentPollsCache, subscribeToIndependentPolls } from '../../services/pollService';
import PollCardSkeleton from './PollCardSkeleton';
import { useAuth } from '../../contexts/AuthContext';
import RestrictedUserModal from '../modals/RestrictedUserModal';
import RevokedUserModal from '../modals/RevokedUserModal';
import AlumniGraduationModal from '../modals/AlumniGraduationModal';
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

const getComparableTimestamp = (value: any): number => {
  if (!value) return 0;
  try {
    if (typeof value?.toDate === 'function') {
      const date = value.toDate();
      return date instanceof Date ? date.getTime() : 0;
    }
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value?.seconds === 'number') {
      const nanos = typeof value?.nanoseconds === 'number' ? value.nanoseconds : 0;
      return value.seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
  } catch (e) {
    // no-op: fallback below
  }
  return 0;
};

const getMediaSignature = (media: any): string => {
  if (!Array.isArray(media) || media.length === 0) return '';
  return media
    .map((item) => {
      if (typeof item === 'string') return `s:${item}`;
      if (!item || typeof item !== 'object') return 'x:';
      const type = typeof item.type === 'string' ? item.type : '';
      const url = typeof item.url === 'string' ? item.url : '';
      const storagePath = typeof item.storagePath === 'string' ? item.storagePath : '';
      const name = typeof item.name === 'string' ? item.name : '';
      return `o:${type}|${url}|${storagePath}|${name}`;
    })
    .join('||');
};

const getFeedPostRenderSignature = (post: Post & { reportCount?: number }): string => {
  const shared = (post as any).sharedPostSnapshot as any;
  const sharedSignature = shared
    ? [
        shared.id || '',
        shared.originalPostId || shared.original_post_id || '',
        getComparableTimestamp(shared.createdAt),
        getComparableTimestamp(shared.updatedAt),
        typeof shared.originalPostContent === 'string' ? shared.originalPostContent : '',
        getMediaSignature(shared.originalPostMedia),
      ].join('|')
    : '';

  return [
    post.id,
    post.userId || '',
    post.userName || '',
    post.userProfilePic || '',
    post.userRole || '',
    post.content || '',
    post.visibility || '',
    post.reactionCount || 0,
    post.commentCount || 0,
    post.viewCount || 0,
    (post as any).reportCount || 0,
    post.isPoll ? '1' : '0',
    post.isShare ? '1' : '0',
    post.sharedFromPostId || '',
    post.originalPostId || '',
    getComparableTimestamp(post.createdAt),
    getComparableTimestamp(post.updatedAt),
    getComparableTimestamp((post as any).annual_archive_date),
    getMediaSignature((post as any).media),
    getMediaSignature((post as any).mediaUrls),
    sharedSignature,
  ].join('~');
};

const Feed: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Resolve highlight payload from query first, with state fallback for compatibility.
  const searchParams = new URLSearchParams(location.search);
  const locationState = (location.state || {}) as any;
  const highlightPostId = (searchParams.get('highlight') || locationState?.highlightPostId) as string | undefined;
  const highlightEventKey = (searchParams.get('highlightEvent') || locationState?.highlightEvent || location.key) as string;
  const navTargetFilter = locationState?.targetFilter as string | undefined;
  const [temporaryPinnedPostId, setTemporaryPinnedPostId] = useState<string | null>(null);
  const [highlightDismissed, setHighlightDismissed] = useState(false);
  // Track which post was opened as fullscreen due to a highlight (to notify/close)
  const [highlightOpenedPostId, setHighlightOpenedPostId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(navTargetFilter || 'all');
  const [posts, setPosts] = useState<(Post & { reportCount?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRestrictedModal, setShowRestrictedModal] = useState(false);
  const [showRevokedModal, setShowRevokedModal] = useState(false);
  const [showGraduationModal, setShowGraduationModal] = useState(false);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [initialBatchAttempted, setInitialBatchAttempted] = useState(false);
  const [realtimeListenerAttempted, setRealtimeListenerAttempted] = useState(false);
  const [highlightFullscreenOpen, setHighlightFullscreenOpen] = useState(false);
  const loaderRef = React.useRef<HTMLDivElement | null>(null);
  const { currentUser } = useAuth();
  // friend list / KaSpace support removed from feed filter
  // Debug panel state
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [archivedYears, setArchivedYears] = useState<string[]>([]);
  const [selectedArchiveYear, setSelectedArchiveYear] = useState<string | null>(null);
  const [debugUsers, setDebugUsers] = useState<any[]>([]);
  const [debugUsersLoading, setDebugUsersLoading] = useState(false);
  const [debugUsersError, setDebugUsersError] = useState<string | null>(null);
  const [debugUserStatuses, setDebugUserStatuses] = useState<Record<string, UserStatus | null>>({});
  const [debugTimeTick, setDebugTimeTick] = useState<number>(Date.now());
  const [independentPolls, setIndependentPolls] = useState<Poll[]>([]);
  const [pollsLoading, setPollsLoading] = useState(false);
  const [pollsContainerMinimized, setPollsContainerMinimized] = useState(true);
  const [expandedPollId, setExpandedPollId] = useState<string | null>(null);
  const [showCreatePollModal, setShowCreatePollModal] = useState(false);
  const [isCreatingPoll, setIsCreatingPoll] = useState(false);
  const appliedNavFilterRef = useRef<string | undefined>(navTargetFilter ? `${navTargetFilter}-${location.key}` : undefined);

  useEffect(() => {
    if (!navTargetFilter) return;
    const signature = `${navTargetFilter}-${location.key}`;
    if (appliedNavFilterRef.current === signature) return;
    appliedNavFilterRef.current = signature;
    setFilter(navTargetFilter);
  }, [navTargetFilter, location.key]);

  // Helper to format last active time
  const formatRelativeTime = (timestamp?: number): string => {
    if (!timestamp) return '—';
    const diff = Date.now() - timestamp;
    if (diff < 0) return 'now';
    const s = Math.floor(diff / 1000);
    if (s < 10) return 'now';
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    const d = Math.floor(h / 24);
    return d + 'd';
  };

  // Periodic tick to update relative times while panel open
  useEffect(() => {
    if (!showDebugPanel) return;
    const interval = setInterval(() => setDebugTimeTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [showDebugPanel]);

  useEffect(() => {
    if (currentUser?.role === 'admin') return;
    if (showDebugPanel) setShowDebugPanel(false);
  }, [currentUser?.role, showDebugPanel]);

  // Run revoked/unknown user cleanup when an admin loads the feed (rate limited per session)
  useEffect(() => {
    if (!currentUser?.id) return;
    const role = currentUser.role;
    if (role !== 'admin' && role !== 'super admin') return;

    const sessionKey = `revoked-post-cleanup-${currentUser.id}`;
    const minInterval = 10 * 60 * 1000; // 10 minutes
    const lastRunRaw = sessionStorage.getItem(sessionKey);
    const lastRun = lastRunRaw ? parseInt(lastRunRaw, 10) : 0;
    const now = Date.now();

    if (!Number.isNaN(lastRun) && now - lastRun < minInterval) {
      return;
    }

    let isCancelled = false;

    const runCleanup = async () => {
      sessionStorage.setItem(sessionKey, String(now));
      try {
        const result = await cleanupPostsForUnknownUsers(currentUser.id, {
          includeRevokedUsers: true,
          includeUnknownRole: true
        });
        if (!isCancelled) {
          console.log('[Feed] Post cleanup result for revoked/missing users:', result);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('[Feed] Post cleanup for revoked/missing users failed:', error);
        }
        sessionStorage.removeItem(sessionKey);
      }
    };

    runCleanup();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id, currentUser?.role]);

  

  // Set up real-time status listeners for all debug users when panel open
  useEffect(() => {
    if (!showDebugPanel || debugUsers.length === 0 || currentUser?.role !== 'admin') return;
    const ids = debugUsers.map(u => u.id);
    const unsubscribe = getMultipleUserStatusesRealtime(ids, (statuses) => {
      setDebugUserStatuses(statuses);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [showDebugPanel, debugUsers]);

  // Load initial batch
  useEffect(() => {
    // Allow loading for unauthenticated visitors as well (viewer may be null)
    setLoading(true);
    setError(null);
    setInitialBatchAttempted(false);
    setLastVisible(null);
    setHasMore(true);
    setPosts([]);
    const loadInitial = async () => {
      const uid = currentUser?.id || null;
      const role = currentUser?.role || 'guest';
      // Check if user is admin or super admin and filter is 'reported'
      const isAdminOrSuperAdmin = role === 'admin' || role === 'super admin';
      
      if (filter === 'reported' && isAdminOrSuperAdmin) {
        // Load reported posts for admins
        try {
          const reportedPosts = await getReportedPosts();
          setPosts(reportedPosts);
          setHasMore(false); // No pagination for reported posts
          setLoading(false);
          setInitialBatchAttempted(true);
        } catch (error) {
          console.error('Error loading reported posts:', error);
          setError('Failed to load reported posts');
          setLoading(false);
          setInitialBatchAttempted(true);
        }
      } else if (filter === 'archives') {
        try {
          // Load available archive years and set default
          const years = await getArchivedSchoolYears();
          setArchivedYears(years);
          const defaultYear = years && years.length ? years[0] : null;
          setSelectedArchiveYear(defaultYear);
          // Load archived posts for default year (or all if none)
          const archived = await getArchivedPosts(defaultYear || undefined);
          setPosts(archived);
          setHasMore(false);
          setLoading(false);
          setInitialBatchAttempted(true);
        } catch (err) {
          console.error('Error loading archived posts:', err);
          setError('Failed to load archived posts');
          setLoading(false);
          setInitialBatchAttempted(true);
        }
      } else {
        // Load regular posts (works for anonymous visitors — pass null uid)
        try {
          const { posts: batch, lastVisible: last, hasMore } = await getPostsBatch(
            uid,
            role,
            10,
            null
          );
          setPosts(batch);
          setLastVisible(last);
          setHasMore(hasMore);
          setLoading(false);
          setInitialBatchAttempted(true);
        } catch (err) {
          console.error('Error loading initial posts batch:', err);
          setError('Failed to load posts');
          setLoading(false);
          setInitialBatchAttempted(true);
        }
      }
    };
    loadInitial();
  }, [currentUser, filter]);

  // Refresh archived posts when selectedArchiveYear changes while archives filter active
  useEffect(() => {
    let cancelled = false;
    const loadArchived = async () => {
      if (!currentUser) return;
      // Allow any authenticated user to refresh archived posts (no admin-only restriction)
      if (filter !== 'archives') return;
      setLoading(true);
      try {
        const archived = await getArchivedPosts(selectedArchiveYear || undefined);
        if (cancelled) return;
        setPosts(archived);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Error refreshing archived posts:', err);
        setError('Failed to refresh archived posts');
        setLoading(false);
      }
    };
    loadArchived();
    return () => { cancelled = true };
  }, [selectedArchiveYear, filter, currentUser]);

  // Listen for external filter changes (dispatched by CreatePost filter button)
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as any
        if (detail && detail.filter) {
          setFilter(detail.filter)
        }
      } catch (err) {
        console.error('set-feed-filter handler error', err)
      }
    }
    window.addEventListener('set-feed-filter', handler as EventListener)
    return () => window.removeEventListener('set-feed-filter', handler as EventListener)
  }, [])

  // Global handler: open create-poll from other components (e.g., CreatePost)
  useEffect(() => {
    const openHandler = () => {
      setFilter('polls');
      openCreatePollModal();
    };
    window.addEventListener('open-create-poll', openHandler as EventListener);
    return () => window.removeEventListener('open-create-poll', openHandler as EventListener);
  }, []);

  // Sync polls container minimized state across components via custom event
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as any;
        if (detail && typeof detail.minimized === 'boolean') {
          setPollsContainerMinimized(detail.minimized);
        }
      } catch (err) {
        console.error('Failed to handle set-polls-container-minimized event', err);
      }
    };
    window.addEventListener('set-polls-container-minimized', handler as EventListener);
    return () => window.removeEventListener('set-polls-container-minimized', handler as EventListener);
  }, []);

  // When the entire polls container is minimized, collapse any expanded poll
  useEffect(() => {
    if (pollsContainerMinimized) {
      setExpandedPollId(null);
    }
  }, [pollsContainerMinimized]);

  

  // Load independent polls
  useEffect(() => {
    if (!currentUser) {
      setIndependentPolls([]);
      setPollsLoading(false);
      return;
    }

    const cached = getCachedIndependentPolls();
    if (cached) {
      setIndependentPolls(cached);
      setPollsLoading(false);
    } else {
      setPollsLoading(true);
    }

    const unsubscribe = subscribeToIndependentPolls(
      (polls) => {
        setIndependentPolls(polls);
        setPollsLoading(false);
      },
      (error) => {
        console.error('Error loading independent polls:', error);
        setPollsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUser?.id]);

  
  // Handlers to open/close create-poll modal and submit a new independent poll
  const openCreatePollModal = () => {
    setShowCreatePollModal(true);
  };

  const closeCreatePollModal = () => {
    setShowCreatePollModal(false);
  };

  const handlePollSubmit = async (
    options: Array<{ id: string; text: string; count: number }>,
    question: string,
    durationDays?: number
  ) => {
    if (!currentUser || isCreatingPoll) return;
    try {
      setIsCreatingPoll(true);

      const pollData: any = {
        type: 'post_poll',
        question: question,
        options: options.map(opt => ({ id: opt.id, text: opt.text })),
        authorId: currentUser.id,
        authorName: currentUser.name,
        authorProfilePic: currentUser.profile_pic,
        authorRole: currentUser.role,
        postId: `independent_${Date.now()}`,
        ...(durationDays && durationDays >= 1 && durationDays <= 3 ? { durationDays } : {})
      };

      await createPoll(pollData);

      // Refresh independent polls list
      try {
        const polls = await getIndependentPolls();
        setIndependentPolls(polls);
      } catch (err) {
        console.error('[Feed] Failed to refresh polls after create:', err);
      }

      setShowCreatePollModal(false);
    } catch (err) {
      console.error('[Feed] Error creating poll:', err);
      alert('Failed to create poll. Please try again.');
    } finally {
      setIsCreatingPoll(false);
    }
  };


  // Infinite scroll: Intersection Observer
  useEffect(() => {
    if (!hasMore || loading || isFetchingMore) return;
    const observer = new window.IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          fetchMorePosts();
        }
      },
      { threshold: 0.5 }
    );
    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }
    return () => {
      if (loaderRef.current) observer.unobserve(loaderRef.current);
    };
    // eslint-disable-next-line
  }, [loaderRef.current, hasMore, loading, isFetchingMore]);

  // Fetch more posts
  const fetchMorePosts = async () => {
    if (!hasMore || isFetchingMore || loading) return;
    setIsFetchingMore(true);
    try {
      const uid = currentUser?.id || null;
      const role = currentUser?.role || 'guest';
      const { posts: batch, lastVisible: last, hasMore: more } = await getPostsBatch(
        uid,
        role,
        10,
        lastVisible
      );
      setPosts(prev => {
        // Combine prev and batch, dedupe by post id, and sort by createdAt desc
        const combined = [...prev, ...batch];
        const map = new Map<string, (Post & { reportCount?: number })>();
        combined.forEach(p => {
          if (!p || !p.id) return;
          map.set(p.id, p);
        });
        const unique = Array.from(map.values());
        unique.sort((a, b) => {
          const toDate = (post: any) => {
            try {
              if (!post.createdAt) return 0;
              if (typeof (post.createdAt as any).toDate === 'function') return (post.createdAt as any).toDate().getTime();
              if (post.createdAt instanceof Date) return post.createdAt.getTime();
              if (typeof post.createdAt === 'number') return post.createdAt;
              if (typeof post.createdAt === 'string') return new Date(post.createdAt).getTime();
            } catch {}
            return 0;
          };
          return toDate(b) - toDate(a);
        });
        return unique;
      });
      setLastVisible(last);
      setHasMore(more);
    } catch (err) {
      setError('Failed to load more posts.');
    } finally {
      setIsFetchingMore(false);
    }
  };


  useEffect(() => {
    if (!currentUser?.id) {
      setShowRestrictedModal(false);
      setShowRevokedModal(false);
      return;
    }

    console.log('[Feed] Setting up immediate real-time access listener for user:', currentUser.id);
    
    const userDocRef = doc(db, 'users', currentUser.id);
    const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const userData = docSnapshot.data();
        const isRestricted = userData.restricted === true;
        const isRevoked = userData.revoked === true;
        
        console.log('[Feed] Immediate access check:', {
          userId: currentUser.id,
          restricted: isRestricted,
          revoked: isRevoked,
          timestamp: new Date().toISOString()
        });
        
        // Immediately set modal states - revoked takes priority over restricted
        if (isRevoked) {
          setShowRevokedModal(true);
          setShowRestrictedModal(false);
          console.log('[Feed] 🚨 ACCESS REVOKED - Revoked modal shown immediately');
        } else if (isRestricted) {
          setShowRestrictedModal(true);
          setShowRevokedModal(false);
          console.log('[Feed] 🚨 RESTRICTION ACTIVE - Restricted modal shown immediately');
        } else {
          setShowRestrictedModal(false);
          setShowRevokedModal(false);
          console.log('[Feed] ✅ ACCESS RESTORED - All modals hidden immediately');
        }
      } else {
        // User document doesn't exist, hide modals
        setShowRestrictedModal(false);
        setShowRevokedModal(false);
      }
    }, (error) => {
      console.error('[Feed] Error in immediate access listener:', error);
    });

    return () => {
      console.log('[Feed] Cleaning up immediate access listener');
      unsubscribe();
    };
  }, [currentUser?.id]); // Only depend on user ID

  // Handle restricted user acknowledgment
  const handleRestrictedUserAcknowledge = async () => {
    console.log('[Feed] Restricted user acknowledged, signing out');
    setShowRestrictedModal(false);
    
    try {
      // Import Firebase auth and sign out
      const { auth } = await import('../../firebase/config');
      const { signOut } = await import('firebase/auth');
      await signOut(auth);
      
      // Clear all session and local storage
      sessionStorage.clear();
      localStorage.clear();
      
      // Redirect to signin page
      window.location.replace('/signin');
    } catch (error) {
      console.error('[Feed] Error signing out restricted user:', error);
      // Force redirect even if sign out fails
      window.location.replace('/signin');
    }
  };

  // Handle revoked user acknowledgment
  const handleRevokedUserAcknowledge = async () => {
    console.log('[Feed] Revoked user acknowledged, signing out');
    setShowRevokedModal(false);
    
    try {
      // Import Firebase auth and sign out
      const { auth } = await import('../../firebase/config');
      const { signOut } = await import('firebase/auth');
      await signOut(auth);
      
      // Clear all session and local storage
      sessionStorage.clear();
      localStorage.clear();
      
      // Redirect to signin page
      window.location.replace('/signin');
    } catch (error) {
      console.error('[Feed] Error signing out revoked user:', error);
      // Force redirect even if sign out fails
      window.location.replace('/signin');
    }
  };

  // Setup realtime posts listener (skip when viewing Archives to avoid overwriting archived list)
  useEffect(() => {
    // When viewing the Archives tab, we intentionally do NOT subscribe to the general
    // realtime posts feed because it will overwrite the archived posts loaded via
    // `getArchivedPosts`. The archived view is populated by a separate loader.
    if (filter === 'archives') {
      console.log('[Feed] Skipping realtime posts listener while in Archives filter');
      setLoading(false);
      return;
    }

    // Avoid running initial batch and large realtime reads at the same time.
    // Start realtime subscription after the first batch attempt completes.
    if (!initialBatchAttempted) {
      return;
    }

    // Allow subscribing even for unauthenticated visitors (currentUser may be null during login)
    const uid = currentUser?.id || null;
    const role = currentUser?.role || 'guest';
    console.log('Setting up posts listener for user:', uid || 'guest', 'role:', role);
    // Only show loading state if we have no posts yet (avoid flicker when listener reconnects)
    if (posts.length === 0) setLoading(true);
    const unsubscribe = getPostsRealtime(
      uid,
      role,
      (fetchedPosts: Post[]) => {
        console.log('Received posts update:', fetchedPosts.length, 'posts');
        // console.log('Post IDs in update:', fetchedPosts.map(p => p.id));

        // Merge strategy: preserve any local optimistic posts not yet present in snapshot
        setPosts(prevPosts => {
          const prevById = new Map(prevPosts.map(p => [p.id, p] as [string, Post & { reportCount?: number }]));

          // Preserve object identity for unchanged posts to avoid unnecessary PostCard rerenders.
          const normalizedFetched = fetchedPosts.map((incomingPost) => {
            const previousPost = prevById.get(incomingPost.id);
            if (!previousPost) return incomingPost;
            if (getFeedPostRenderSignature(previousPost) === getFeedPostRenderSignature(incomingPost as Post & { reportCount?: number })) {
              return previousPost;
            }
            return incomingPost;
          });

          const fetchedMap = new Map(normalizedFetched.map(p => [p.id, p] as [string, Post]));
          // Preserve optimistic posts not yet in backend
          const optimisticStillMissing = prevPosts.filter(p => (p as any).isOptimistic && !fetchedMap.has(p.id));
          // Preserve older paginated posts (already loaded earlier) that are outside realtime window
          const olderPreserved = prevPosts.filter(p => !(p as any).isOptimistic && !fetchedMap.has(p.id));
          const merged = [...olderPreserved, ...optimisticStillMissing, ...normalizedFetched];
          const dedupMap = new Map<string, Post>();
          merged.forEach(p => { if (p && p.id) dedupMap.set(p.id, p); });
          const result = Array.from(dedupMap.values()).sort((a, b) => {
            const timeDiff = getComparableTimestamp((b as any).createdAt) - getComparableTimestamp((a as any).createdAt);
            if (timeDiff !== 0) return timeDiff;
            // Stable tie-breaker avoids reorder churn when timestamps are equal.
            return String(a.id).localeCompare(String(b.id));
          });
          console.log('[Feed] Merged posts (older preserved + optimistic + realtime). Count:', result.length);
          return result;
        });

        setLoading(false);
        setError(null);
        setRealtimeListenerAttempted(true);
      },
      (err: Error) => {
        console.error('Error fetching posts:', err);
        setError('Failed to load posts. Please try again later.');
        setLoading(false);
        setRealtimeListenerAttempted(true);
      },
      undefined, // visibilityFilter
      40 // fixed moderate realtime window for faster initial hydration
    );

    // Cleanup subscription on unmount or when filter/currentUser changes
    return () => unsubscribe();
  }, [currentUser, filter, initialBatchAttempted]);

  // Filter posts based on current filter
  // Defensive client-side filtering: always hide posts that have been archived (annual_archive_date set)
  // unless we're in the Archives filter. This protects against stale/cached entries.
  const filteredPosts = posts.filter(post => {
    if (filter === 'archives') return true;
    if ((post as any).annual_archive_date) return false;
    // If viewing archives, include all posts already loaded by the archives loader
    // (handled above when filter === 'archives')
    
    // Continue with normal per-filter filtering
    
    // Exclude draft posts from general feed unless viewer is the author or admin
    
    // ...
    
    // Note: remainder of logic follows below - keep semantics identical for other filters
    
    // Exclude draft posts from general feed unless viewer is the author or admin
    
    if (post.draft === true) {
      const isOwner = currentUser && post.userId === currentUser.id;
      const isAdminOrSuperAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'super admin');
      if (!isOwner && !isAdminOrSuperAdmin) return false;
    }
    // Handle announcements filter: show all posts with visibility 'public' and userRole admin or super admin
    if (filter === 'announcements') {
      return post.visibility === 'public' && (post.userRole === 'admin' || post.userRole === 'super admin');
    }
    // Handle polls filter: include posts that have polls
    if (filter === 'polls') {
      return post.isPoll === true || !!post.pollId;
    }
    // Handle reported posts filter: show only reported posts
    if (filter === 'reported') {
      return post.reported === true;
    }
    // Handle 'Your posts' filter: show only posts authored by current user
    if (filter === 'yours') {
      return currentUser && post.userId === currentUser.id;
    }
    // Handle visibility-based filtering
    if (filter === 'public') {
      return post.visibility === 'public';
    }
    // Handle role-based filtering (include additional staff roles)
    if (['student', 'faculty', 'alumni', 'admin', 'dean', 'infirmary', 'librarian'].includes(filter)) {
      return post.userRole === filter;
    }
    // Default: match visibility (covers 'all' because 'all' won't match any specific filter above)
    if (filter === 'all') return true;
    return post.visibility === filter as PostVisibility;
  });
  
  // console.log('Filtered posts:', filteredPosts.length, 'Filter:', filter);
  
  // Sort posts by date only (since pin functionality has been removed)
  // If we have a temporary pinned post id, separate it out for ordering/highlight
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    // Sort by date (newest first) with proper type handling
    let dateA = 0;
    let dateB = 0;
    // When in archives filter, sort by `annual_archive_date` (newest archive first).
    const pickDate = (p: any) => {
      const ts = filter === 'archives' ? p.annual_archive_date || p.createdAt : p.createdAt;
      if (!ts) return 0;
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (ts instanceof Date) return ts.getTime();
      if (typeof ts === 'number') return ts;
      if (typeof ts === 'string') return new Date(ts).getTime();
      return 0;
    };
    dateA = pickDate(a as any);
    dateB = pickDate(b as any);
    
    return dateB - dateA;
  });

  // Memo for highlighted post styling insertion at top (without mutating original order permanently)
  const displayPosts = useMemo(() => {
    if (!temporaryPinnedPostId) return sortedPosts;
    const targetIndex = sortedPosts.findIndex(p => p.id === temporaryPinnedPostId);
    if (targetIndex === -1) return sortedPosts; // Post not yet loaded
    const target = sortedPosts[targetIndex];
    const rest = sortedPosts.filter(p => p.id !== temporaryPinnedPostId);
    return [target, ...rest];
  }, [sortedPosts, temporaryPinnedPostId]);

  useEffect(() => {
    if (!highlightPostId) return;

    // Force re-trigger for repeated clicks on the same shared post by resetting first.
    setTemporaryPinnedPostId(null);
    setHighlightOpenedPostId(null);
    setHighlightFullscreenOpen(false);

    const timer = window.setTimeout(() => {
      setTemporaryPinnedPostId(highlightPostId);
      setHighlightOpenedPostId(highlightPostId);
      setHighlightFullscreenOpen(true);
      setHighlightDismissed(false);
      navigate(location.pathname, { replace: true });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [highlightPostId, highlightEventKey, navigate, location.pathname]);

  // Auto-remove highlight if user scrolls far or after certain time (e.g., 60s)
  useEffect(() => {
    if (!temporaryPinnedPostId) return;
    const timeout = setTimeout(() => {
      setTemporaryPinnedPostId(null);
      setHighlightDismissed(true);
    }, 60000); // 1 minute highlight window
    return () => clearTimeout(timeout);
  }, [temporaryPinnedPostId]);

  // Provide dismiss function (could be used later in UI badge)
  const dismissHighlight = () => {
    setTemporaryPinnedPostId(null);
    setHighlightDismissed(true);
  };

  // Check for potential alumni users AFTER terms & conditions are accepted
  useEffect(() => {
    if (!currentUser?.id || !currentUser?.idNumber) return;
    // Wait until user has accepted terms (isNewUser becomes false)
    if (currentUser.isNewUser) return; // Do not evaluate until terms accepted

    const checkAndMaybeShow = async () => {
      // Check graduation_check collection in Firestore for cross-device persistence
      let hasBeenPrompted = false;
      try {
        const checkRef = doc(db, 'graduation_check', currentUser.id);
        const checkSnap = await getDoc(checkRef);
        if (checkSnap.exists()) {
          const data = checkSnap.data() as any;
          hasBeenPrompted = data && data.isCompleted === true;
        }
      } catch (err) {
        console.error('[Feed] Error reading graduation_check:', err);
        // Fallback to localStorage to avoid blocking UX
        hasBeenPrompted = localStorage.getItem(`graduation-prompted-${currentUser.id}`) === 'true';
      }

      if (hasBeenPrompted) return;

      const idNumber = currentUser.idNumber.replace(/-/g, '');
      let enrollmentYear = 0;
      if (/^\d{10}$/.test(idNumber)) {
        enrollmentYear = parseInt(idNumber.substring(0, 4));
      }

      const isFirstLogin = sessionStorage.getItem(`first-login-check-${currentUser.id}`) !== 'true';
      if (isFirstLogin) {
        // Only mark first-login check once terms accepted, so alumni modal can still appear right after terms modal
        sessionStorage.setItem(`first-login-check-${currentUser.id}`, 'true');
      }

      if (enrollmentYear > 0 && enrollmentYear <= 2020 && isFirstLogin) {
        console.log('[Feed] Detected potential alumni user with enrollment year:', enrollmentYear, 'after terms acceptance');
        setShowGraduationModal(true);
      }
    };

    checkAndMaybeShow();
  }, [currentUser?.id, currentUser?.idNumber, currentUser?.isNewUser]);

  // Handle graduation status update (optimistic & background update)
  const handleGraduationConfirm = (batch: string) => {
    if (!currentUser?.id) return;

    // Immediately set localStorage + close modal for instant UX
    localStorage.setItem(`graduation-prompted-${currentUser.id}`, 'true');
    setShowGraduationModal(false);

    // Persist graduation_check so the user won't be re-prompted across devices
    (async () => {
      try {
        const checkRef = doc(db, 'graduation_check', currentUser.id);
        await setDoc(checkRef, { uid: currentUser.id, isCompleted: true, updatedAt: serverTimestamp() }, { merge: true });
        console.log('[Feed] Persisted graduation_check for user:', currentUser.id);
      } catch (err) {
        console.error('[Feed] Failed to persist graduation_check:', err);
      }
    })();

    // Firestore update runs in background (no await to avoid blocking UI)
    const userDocRef = doc(db, 'users', currentUser.id);
    updateDoc(userDocRef, {
      role: 'alumni',
      graduationBatch: batch,
      updatedAt: serverTimestamp()
    })
      .then(() => {
        console.log('[Feed] (Background) User role updated to alumni with batch:', batch);
      })
      .catch((err) => {
        console.error('[Feed] Error updating user role to alumni (background):', err);
        // Optional: could re-open modal or show toast; for now we simply log.
      });
  };

  // Handle not graduated confirmation (optimistic & background update)
  const handleNotGraduated = () => {
    if (!currentUser?.id) return;

    localStorage.setItem(`graduation-prompted-${currentUser.id}`, 'true');
    setShowGraduationModal(false);

    // Persist graduation_check so the user won't be re-prompted across devices
    (async () => {
      try {
        const checkRef = doc(db, 'graduation_check', currentUser.id);
        await setDoc(checkRef, { uid: currentUser.id, isCompleted: true, updatedAt: serverTimestamp() }, { merge: true });
        console.log('[Feed] Persisted graduation_check for user:', currentUser.id);
      } catch (err) {
        console.error('[Feed] Failed to persist graduation_check:', err);
      }
    })();

    const userDocRef = doc(db, 'users', currentUser.id);
    updateDoc(userDocRef, {
      role: 'student',
      updatedAt: serverTimestamp()
    })
      .then(() => {
        console.log('[Feed] (Background) User role confirmed as student');
      })
      .catch((err) => {
        console.error('[Feed] Error updating user role to student (background):', err);
      });
  };

  

  return (
    <div id="feed" className="flex-1 overflow-y-auto overflow-x-hidden w-full max-w-full mx-0 sm:mx-auto mobile-scrollbar-hide">
      {/* Debug Users Panel Toggle (visible to admins & super admins) */}
      {currentUser?.role === 'admin' && (
        <button
          type="button"
          onClick={() => {
            const next = !showDebugPanel;
            setShowDebugPanel(next);
            if (next && debugUsers.length === 0) {
              setDebugUsersLoading(true);
              setDebugUsersError(null);
              getAllUsers()
                .then(users => {
                  // Sort by role then name for easier scanning
                  const sorted = [...users].sort((a: any, b: any) => {
                    if (a.role === b.role) return (a.name || '').localeCompare(b.name || '');
                    return (a.role || '').localeCompare(b.role || '');
                  });
                  setDebugUsers(sorted);
                })
                .catch(err => {
                  console.error('[Feed][DebugUsers] Failed to load users', err);
                  setDebugUsersError('Failed to load users');
                })
                .finally(() => setDebugUsersLoading(false));
            }
          }}
          className={`fixed z-50 bottom-4 right-4 px-3 py-2 rounded-md text-xs font-medium shadow-lg border transition-colors backdrop-blur-sm ${showDebugPanel ? 'bg-emerald-700/80 border-emerald-400 text-white' : 'bg-slate-900/80 border-slate-600 text-emerald-300 hover:bg-slate-800/80'}`}
        >
          <span className="material-icons align-middle text-base mr-1">bug_report</span>
          {showDebugPanel ? 'Hide Users' : 'Users Debug'}
        </button>
      )}
      {showDebugPanel && currentUser?.role === 'admin' && (
        <div className="fixed z-50 bottom-16 right-4 w-[360px] max-h-[74vh] flex flex-col rounded-lg border border-emerald-600/40 bg-slate-950/95 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-800/40 bg-gradient-to-r from-emerald-800/40 to-slate-900/60 rounded-t-lg">
            <div className="flex items-center gap-2">
              <span className="material-icons text-emerald-300 text-base">group</span>
              {(() => { const online = Object.values(debugUserStatuses).filter(s => s && s.state === 'online').length; return (
                <span className="text-emerald-200 font-semibold text-xs tracking-wide uppercase">Users {online}/{debugUsers.length}</span>
              ); })()}
            </div>
            <div className="flex items-center gap-1">
              <button
                className="text-[10px] px-2 py-1 rounded bg-emerald-700/40 text-emerald-100 hover:bg-emerald-600/50 transition"
                onClick={() => {
                  setDebugUsersLoading(true);
                  setDebugUsersError(null);
                  getAllUsers()
                    .then(users => {
                      const sorted = [...users].sort((a: any, b: any) => {
                        if (a.role === b.role) return (a.name || '').localeCompare(b.name || '');
                        return (a.role || '').localeCompare(b.role || '');
                      });
                      setDebugUsers(sorted);
                    })
                    .catch(err => {
                      console.error('[Feed][DebugUsers] Refresh failed', err);
                      setDebugUsersError('Refresh failed');
                    })
                    .finally(() => setDebugUsersLoading(false));
                }}
              >Refresh</button>
              <button
                className="text-slate-400 hover:text-emerald-300 transition"
                onClick={() => setShowDebugPanel(false)}
              >
                <span className="material-icons text-sm">close</span>
              </button>
            </div>
          </div>
          <div className="p-2 text-[11px] text-slate-300 bg-slate-900/60 border-b border-slate-700/40 space-y-1">
            <div>
              <span className="mr-2">Role Legend:</span>
              <span className="text-emerald-300">student</span>, <span className="text-blue-300">faculty</span>, <span className="text-amber-300">alumni</span>, <span className="text-pink-300">admin</span>, <span className="text-red-300">super admin</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              <div className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> <span>online</span></div>
              <div className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-slate-500" /> <span>offline</span></div>
              <div className="flex items-center gap-1"><span className="material-icons text-[12px] text-slate-500">schedule</span> <span>last active</span></div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar text-xs divide-y divide-slate-800/60">
            {debugUsersLoading && (
              <div className="p-4 text-center text-emerald-300 animate-pulse">Loading users…</div>
            )}
            {!debugUsersLoading && debugUsersError && (
              <div className="p-3 text-center text-red-400">{debugUsersError}</div>
            )}
            {!debugUsersLoading && !debugUsersError && debugUsers.length === 0 && (
              <div className="p-3 text-center text-slate-400">No users found.</div>
            )}
            {!debugUsersLoading && !debugUsersError && debugUsers.map(u => {
              const status = debugUserStatuses[u.id];
              const online = status?.state === 'online';
              return (
                <div key={u.id} className="px-3 py-2 flex flex-col hover:bg-slate-800/40 transition">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-block w-2 h-2 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} title={online ? 'Online' : 'Offline'} />
                      <span className="font-medium truncate" title={u.name}>{u.name || 'Unnamed'}</span>
                    </div>
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ${
                      u.role === 'student' ? 'bg-emerald-700/30 text-emerald-300 border border-emerald-600/40' :
                      u.role === 'faculty' ? 'bg-blue-700/30 text-blue-300 border border-blue-600/40' :
                      u.role === 'alumni' ? 'bg-amber-700/30 text-amber-300 border border-amber-600/40' :
                      u.role === 'admin' ? 'bg-pink-700/30 text-pink-300 border border-pink-600/40' :
                      u.role === 'super admin' ? 'bg-red-800/40 text-red-300 border border-red-600/40' :
                      'bg-slate-700/30 text-slate-300 border border-slate-600/40'
                    }`}>{u.role}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
                    <span>ID: <span className="text-slate-300">{u.id}</span></span>
                    {u.idNumber && <span>ID# <span className="text-slate-300">{u.idNumber}</span></span>}
                    {u.department && <span>Dept <span className="text-slate-300">{u.department}</span></span>}
                    <span className="flex items-center gap-0.5"><span className="material-icons text-[12px] text-slate-500">schedule</span> <span className="text-slate-300">{online ? 'now' : formatRelativeTime(status?.lastActive)}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-2 text-[10px] text-right text-slate-500 border-t border-slate-800/60">
            Debug panel • RT status active
          </div>
        </div>
      )}
  
      
      {/* Create Post and Posts container */}
      <div className="w-full max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-0 sm:mx-auto">
        {currentUser && (
          <div className="px-0 sm:px-4 lg:px-6 pt-0 sm:pt-3 mb-0 sm:mb-1" data-tutorial="create-post">
              <CreatePost 
                onPostCreated={(newPost) => {
                  // Avoid inserting duplicates: if post already exists (realtime listener will deliver it), keep optimistic if needed
                  setPosts(prev => {
                    if (!newPost || !newPost.id) return prev;
                    const exists = prev.some(p => p.id === newPost.id);
                    if (exists) return prev;
                    // Remove any optimistic placeholder that matches by content/user and near timestamp
                    const optimisticFiltered = prev.filter(p => {
                      if (!p.isOptimistic) return true;
                      try {
                        const realSec = (newPost.createdAt as any)?.seconds || (typeof newPost.createdAt === 'number' ? Math.floor(newPost.createdAt/1000) : 0);
                        const optSec = (p.createdAt as any)?.seconds || (typeof p.createdAt === 'number' ? Math.floor((p.createdAt as any)/1000) : 0);
                        const sameAuthor = p.userId === newPost.userId;
                        const sameContent = p.content === newPost.content;
                        const timeClose = Math.abs((realSec || 0) - (optSec || 0)) < 12; // seconds
                        if (sameAuthor && sameContent && timeClose) return false; // drop optimistic placeholder
                      } catch {}
                      return true;
                    });
                    return [newPost, ...optimisticFiltered];
                  });
                }}
                onPollCreated={async () => {
                  // Refresh independent polls when a new one is created
                  try {
                    const polls = await getIndependentPolls();
                    setIndependentPolls(polls);
                  } catch (error) {
                    console.error('Error refreshing independent polls:', error);
                  }
                }}
              />
            </div>
        )}

        {/* Flares Section - positioned between Polls and CreatePost */}
        {filter === 'all' && <FlaresCarousel />}
        
        {/* Independent Polls Section */}
  {filter === 'all' && (
          <div className="px-0 sm:px-4 lg:px-6 mb-1 sm:mb-2">
            {pollsLoading ? (
              <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/95 border border-green-500/30 rounded-lg p-4 shadow-xl">
                <div className="space-y-3">
                  <PollCardSkeleton />
                  <PollCardSkeleton />
                </div>
              </div>
            ) : independentPolls.length > 0 ? (
              <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/95 border border-green-500/30 rounded-lg p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span className="material-icons text-green-400">poll</span>
                    Community Polls
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400 bg-gray-800/60 px-2 py-1 rounded-full">
                      {independentPolls.length} active
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); openCreatePollModal(); }}
                      className="p-1 text-green-300 hover:text-green-200 transition-colors rounded-md border border-green-700 bg-transparent flex items-center justify-center"
                      title="Create poll"
                      aria-label="Create poll"
                    >
                      <span className="material-icons text-sm">add</span>
                    </button>
                    <button
                      onClick={async () => {
                        setPollsLoading(true);
                        invalidateIndependentPollsCache();
                        try {
                          const polls = await getIndependentPolls();
                          setIndependentPolls(polls);
                        } catch (error) {
                          console.error('Error refreshing polls:', error);
                        } finally {
                          setPollsLoading(false);
                        }
                      }}
                      className="p-1 text-green-300 hover:text-green-200 transition-colors rounded-md bg-transparent"
                      title="Refresh polls"
                      aria-label="Refresh polls"
                    >
                      <span className="material-icons text-sm">refresh</span>
                    </button>
                    <button
                      onClick={() => {
                        const next = !pollsContainerMinimized;
                        window.dispatchEvent(new CustomEvent('set-polls-container-minimized', { detail: { minimized: next } }));
                      }}
                      className="p-1 text-green-300 hover:text-green-200 transition-colors rounded-md bg-transparent"
                      title={pollsContainerMinimized ? 'Expand Polls' : 'Minimize Polls'}
                      aria-label={pollsContainerMinimized ? 'Expand polls' : 'Minimize polls'}
                    >
                      <span className="material-icons text-sm">{pollsContainerMinimized ? 'expand_more' : 'expand_less'}</span>
                    </button>
                    {/* more options button removed per design */}
                  </div>
                </div>
                
                {!pollsContainerMinimized ? (
                  <>
                    <p className="text-sm text-gray-300 mb-4">
                      Participate in community polls and see what others think about various topics.
                    </p>
                    <div className="space-y-3">
                      {independentPolls.map((poll) => (
                        <PollCard
                          key={poll.id}
                          poll={poll}
                          className="w-full"
                          isMinimized={expandedPollId !== poll.id}
                          onMinimize={() => setExpandedPollId(prev => prev === poll.id ? null : poll.id)}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="p-4 bg-gray-800/60 rounded-lg border border-gray-700/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center border border-green-500/40">
                          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-200">{independentPolls.length} Active Poll{independentPolls.length !== 1 ? 's' : ''}</p>
                          <p className="text-xs text-gray-400">Click expand to view and participate</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-400 bg-green-500/20 px-2 py-1 rounded-full border border-green-500/40">
                          {independentPolls.length} poll{independentPolls.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {filter === 'polls' && (
          <div className="px-0 sm:px-4 lg:px-6 mb-1 sm:mb-2">
            <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/95 border border-green-500/30 rounded-lg p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="material-icons text-green-400">poll</span>
                  Community Polls
                </h3>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); openCreatePollModal(); }} className="p-1 text-green-300 hover:text-green-200 transition-colors rounded-md border border-green-700 bg-transparent flex items-center justify-center" title="Create poll" aria-label="Create poll">
                    <span className="material-icons text-sm">add</span>
                  </button>
                  <button onClick={async () => { setPollsLoading(true); invalidateIndependentPollsCache(); try { const polls = await getIndependentPolls(); setIndependentPolls(polls); } catch (error) { console.error('Error refreshing polls:', error); } finally { setPollsLoading(false); } }} className="p-1 text-green-300 hover:text-green-200 transition-colors rounded-md bg-transparent" title="Refresh polls" aria-label="Refresh polls"><span className="material-icons text-sm">refresh</span></button>
                  <button onClick={() => { const next = !pollsContainerMinimized; window.dispatchEvent(new CustomEvent('set-polls-container-minimized', { detail: { minimized: next } })); }} className="p-1 text-green-300 hover:text-green-200 transition-colors rounded-md bg-transparent" title={pollsContainerMinimized ? 'Expand Polls' : 'Minimize Polls'} aria-label={pollsContainerMinimized ? 'Expand polls' : 'Minimize polls'}><span className="material-icons text-sm">{pollsContainerMinimized ? 'expand_more' : 'expand_less'}</span></button>
                  {/* more options button removed per design */}
                </div>
              </div>
              {pollsLoading ? (
                <div className="space-y-3">
                  <PollCardSkeleton />
                  <PollCardSkeleton />
                  <PollCardSkeleton />
                </div>
              ) : independentPolls.length > 0 ? (
                <div className="space-y-3">
                  {independentPolls.map((poll) => (
                    <PollCard
                      key={poll.id}
                      poll={poll}
                      className="w-full"
                      isMinimized={expandedPollId !== poll.id}
                      onMinimize={() => setExpandedPollId(prev => prev === poll.id ? null : poll.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400">No polls found.</div>
              )}
            </div>
          </div>
        )}
        
  {filter === 'archives' && currentUser && (
    <div className="px-0 sm:px-4 lg:px-6 mb-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-300">Archived posts</div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 mr-2">School Year</label>
          <select
            value={selectedArchiveYear || ''}
            onChange={(e) => setSelectedArchiveYear(e.target.value || null)}
            className="bg-gray-800/60 text-sm text-gray-200 rounded-md px-2 py-1 border border-gray-700"
          >
            <option value="">All</option>
            {archivedYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )}

  <div className="pt-0 sm:pt-1 lg:pt-1 pb-0 sm:pb-4 lg:pb-6 px-0 sm:px-4 lg:px-6 space-y-0 sm:space-y-4 w-full max-w-full min-w-0 overflow-x-hidden" id="posts-container">
          {loading ? (
            // Show 4 skeletons during initial load
            <>
              {[...Array(4)].map((_, i) => (
                <PostCardSkeleton key={i} />
              ))}
            </>
          ) : error ? (
            <div className="bg-red-500/10 text-red-400 p-3 sm:p-4 rounded-none sm:rounded-lg text-sm sm:text-base">
              {error}
            </div>
          ) : sortedPosts.length === 0 && (initialBatchAttempted && realtimeListenerAttempted) ? (
            <>
              <div className="bg-gradient-to-br from-slate-950/95 to-gray-900/95 backdrop-blur-sm border-t border-b sm:border border-emerald-700/20 rounded-none sm:rounded-lg p-5 text-center shadow-md animate-fadeIn">
                <div className="flex items-center justify-center mb-3">
                  <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-gradient-to-br from-emerald-900/30 to-emerald-800/20 animate-pulse">
                    <span className="material-icons text-emerald-400" style={{fontSize: '22px'}}>
                      {filter === 'announcements' ? 'campaign' : filter === 'polls' ? 'poll' : filter !== 'all' ? 'filter_alt' : 'post_add'}
                    </span>
                  </div>
                </div>
                <h3 className="text-base font-semibold text-white mb-2">No posts to show</h3>
                <p className="text-sm text-gray-300 max-w-xl mx-auto mb-4">
                  {filter === 'announcements' && 'There are no announcement posts right now. Try refreshing or check back later.'}
                  {filter === 'polls' && 'No community polls available. You can create a poll or refresh to see new ones.'}
                  {filter !== 'all' && filter !== 'announcements' && filter !== 'polls' && 'No posts match the current filter. Try a different filter or refresh.'}
                  {filter === 'all' && (currentUser?.role === 'alumni' ? 'No posts yet — share your experiences to start the conversation.' : 'Be the first to create a post and start the conversation.')}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={async () => {
                      // Refresh posts batch
                      setLoading(true);
                      try {
                        const uid = currentUser?.id || null;
                        const role = currentUser?.role || 'guest';
                        const { posts: batch, lastVisible: last, hasMore } = await getPostsBatch(uid, role, 10, null);
                        setPosts(batch);
                        setLastVisible(last);
                        setHasMore(hasMore);
                        setError(null);
                      } catch (err) {
                        console.error('Refresh failed', err);
                        setError('Failed to refresh posts');
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="px-3 py-2 text-sm rounded-lg bg-gray-800/60 text-gray-200 hover:bg-gray-700/60 border border-gray-700"
                  >
                    <span className="material-icons align-middle mr-2" style={{fontSize: '16px'}}>refresh</span>
                    Refresh
                  </button>

                  {filter !== 'all' && (
                    <button onClick={() => setFilter('all')} className="px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-500">
                      Show all
                    </button>
                  )}

                    {/* Create post button intentionally removed from empty-state to avoid prompting in certain flows */}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1 sm:space-y-4">
              {loading ? (
  // Show 4 skeletons during initial load
  <>
    {[...Array(4)].map((_, i) => (
      <PostCardSkeleton key={i} />
    ))}
  </>
) : (
  <>
  {displayPosts.map((post, idx) => {
      let isTempPinned = post.id === temporaryPinnedPostId;
      return (
  <div key={post.id} className={isTempPinned ? 'relative ring-2 ring-emerald-400/70 rounded-lg' : ''}>
          {isTempPinned && (
            <div className="absolute -top-3 left-3 bg-emerald-600 text-white text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full shadow flex items-center gap-1 z-10">
              <span className="material-icons text-[14px] sm:text-sm">push_pin</span>
              Highlighted
              <button onClick={dismissHighlight} className="ml-1 text-white/70 hover:text-white">
                <span className="material-icons text-[14px] leading-none">close</span>
              </button>
            </div>
          )}
          <PostCard 
            post={post} 
            onPostUpdated={() => {
              // console.log('Feed: Post update detected for post:', post.id);
            }}
            onPostDeleted={(deletedId: string) => {
              console.log('Feed: Removing post immediately from state:', deletedId);
              setPosts(prev => prev.filter(p => p.id !== deletedId));
            }}
            currentFilter={filter}
            currentUserRole={currentUser?.role}
            // If this post is the currently highlighted one, request fullscreen on desktop
            openFullscreen={isTempPinned && !isMobileDevice()}
            onFullscreenClose={() => {
              // Clear both IDs so the next "View post" click causes
              // openFullscreen to transition false → true again (re-triggering PostCard).
              if (highlightOpenedPostId === post.id) {
                setHighlightOpenedPostId(null);
                setHighlightFullscreenOpen(false); // ← only this, pin stays
              }
            }}
          />
        </div>
      );
    })}
    <div ref={loaderRef} />
    {isFetchingMore && (
      // Show 2 skeletons while batch loading more
      <>
        {[...Array(2)].map((_, i) => (
          <PostCardSkeleton key={"fetching-"+i} />
        ))}
      </>
    )}
  </>
)}
              {!loading && !isFetchingMore && sortedPosts.length > 0 && !hasMore && (
                <div className="flex flex-col items-center justify-center py-6 sm:py-8 animate-fadeInSlow">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-green-900/30 to-green-800/20 mb-2 shadow-lg">
                    <span className="material-icons text-green-500 text-3xl animate-bounce">hourglass_empty</span>
                  </div>
                  <span className="text-gray-400 text-sm sm:text-base font-semibold tracking-wide select-none">
                    No more posts to load
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
  

      {/* Restricted User Modal */}
      <RestrictedUserModal
        isOpen={showRestrictedModal}
        onAcknowledge={handleRestrictedUserAcknowledge}
      />

      {/* Revoked User Modal */}
      <RevokedUserModal
        isOpen={showRevokedModal}
        onAcknowledge={handleRevokedUserAcknowledge}
      />

      {/* Create Poll Modal (moved from CreatePost) */}
      <CreatePollModal
        open={showCreatePollModal}
        onClose={closeCreatePollModal}
        onSubmit={handlePollSubmit}
        isSubmitting={isCreatingPoll}
      />

      {/* Alumni Graduation Modal */}
      <AlumniGraduationModal
        isOpen={showGraduationModal}
        onConfirmGraduated={handleGraduationConfirm}
        onConfirmNotGraduated={handleNotGraduated}
      />
      {/* Mobile: show the full-screen regular post modal when a post was highlighted via navigation */}
      {isMobileDevice() && temporaryPinnedPostId && (
        (() => {
          const highlighted = displayPosts.find(p => p.id === temporaryPinnedPostId);
          if (!highlighted) return null;
          return (
            <FullScreenRegularPostModal
              post={highlighted}
              isOpen={true}
              onClose={() => {
                // Dismiss highlight when modal closed
                dismissHighlight();
                setHighlightOpenedPostId(null);
              }}
              onPostUpdated={() => { /* no-op, feed will get updates via listener */ }}
            />
          );
        })()
      )}
    </div>
  );
};

export default Feed;

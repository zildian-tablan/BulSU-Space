import React, { useState, useEffect, useRef } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import MainLayout from '../components/layout/MainLayout';
import { useAuth } from '../contexts/AuthContext';
import { TutorialOverlay } from '../components/tutorial/TutorialOverlay';
import { Notification, listenToNotifications, markAllNotificationsAsRead, markNotificationAsRead, fetchNotificationsForUser, markNotificationsAsReadByIds } from '../services/notificationService';
import { postsAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

// --- PAGINATION HOOK ---
function usePagination<T>(items: T[], itemsPerPage: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.ceil(items.length / itemsPerPage);
  const paginated = items.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const goToPage = (p: number) => setPage(Math.max(1, Math.min(pageCount, p)));
  return { page, pageCount, paginated, goToPage };
}

// Extended UI model to allow grouped notifications representing multiple docs
type UINotification = Notification & {
  _ids?: string[]; // if grouped, underlying document IDs
  _mergedTypes?: Array<'reaction' | 'comment'>; // which types are represented
};

const NotificationItem: React.FC<{ 
  notification: UINotification; 
  onMarkAsRead: (id: string | string[]) => void;
  onNavigate: (notification: Notification) => void;
}> = ({ notification, onMarkAsRead, onNavigate }) => {
  // Safely format notification timestamp (supports Firestore Timestamp, clientTimestamp number, or Date)
  const formattedTime = (() => {
    try {
      // If we have a numeric clientTimestamp, prefer it for immediate UI
      if (!notification.timestamp && (notification as any).clientTimestamp) {
        return formatDistanceToNow(new Date((notification as any).clientTimestamp), { addSuffix: true });
      }
      if (!notification.timestamp) return 'Just now';
      // Firestore Timestamp
      if (typeof (notification.timestamp as any).toDate === 'function') {
        return formatDistanceToNow((notification.timestamp as any).toDate(), { addSuffix: true });
      }
      // Plain Date or numeric millis
      const ts = notification.timestamp as any;
      const d = ts instanceof Date ? ts : new Date(ts);
      return formatDistanceToNow(d, { addSuffix: true });
    } catch (e) {
      console.error('Error formatting notification time', e, notification);
      return 'Some time ago';
    }
  })();

  const msgRef = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showToggle, setShowToggle] = useState(false);

  // Detect if the message overflows (so we can show toggle on mobile)
  useEffect(() => {
    const el = msgRef.current;
    if (!el) return;

    const checkOverflow = () => {
      // If the rendered content is wider or taller than the container, it's overflowing.
      const isOverflowing = el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
      setShowToggle(isOverflowing);
    };

    // Run initially and on resize
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [notification.message]);

  // Get the icon based on notification type
  const getIcon = (type: string) => {
    switch (type) {
      case 'reaction': return 'favorite';
      case 'comment': return 'comment';
      case 'friend_request': return 'person_add';
      case 'friend_post': return 'post_add';
        case 'announcement': return 'campaign';
        case 'message_request': return 'mail';
        case 'warn': return 'warning';
        case 'takedown': return 'gavel';
        case 'space_invite': return 'group_add';
        case 'report_alert': return 'flag';
      case 'space_post': return 'groups';
      default: return 'notifications';
    }
  };

  

  return (
    <div 
      className={`px-2 py-2 sm:px-3 sm:py-3 rounded-xl transition-colors duration-200 cursor-pointer mb-1 border flex items-center gap-3 shadow-sm group hover:bg-green-900/10 w-full max-w-full min-w-0 overflow-x-hidden ${
        notification.type === 'announcement' && !notification.read
          ? 'bg-gradient-to-r from-green-900/60 via-gray-900/80 to-green-800/50 border-green-500/70 shadow-md'
          : notification.type === 'report_alert' && !notification.read
            ? 'bg-gradient-to-r from-amber-900/50 via-gray-900/70 to-amber-800/40 border-amber-500/70 shadow-md'
            : notification.read 
              ? 'bg-gray-900/60 border-gray-800/40' 
              : 'bg-gradient-to-r from-green-900/40 via-gray-900/80 to-green-800/30 border-green-800/60'
      }`}
    >
      <div 
        className="flex items-center gap-3 flex-1 min-w-0"
        onClick={() => {
          if (!notification.read) {
            // if grouped, mark all; else mark single
            if (Array.isArray(notification._ids) && notification._ids.length > 0) {
              onMarkAsRead(notification._ids);
            } else {
              onMarkAsRead(notification.id || '');
            }
          }
          onNavigate(notification);
        }}
      >
            <div className={`rounded-full p-2 flex items-center justify-center shadow-md transition-all duration-200 ${
              notification.type === 'announcement' && !notification.read
                ? 'bg-green-700/80 text-white animate-pulse'
                : (notification.type === 'warn' || notification.type === 'report_alert') && !notification.read
                  ? 'bg-amber-600/90 text-white animate-pulse'
                  : notification.read
                    ? 'bg-gray-800/60 text-green-700'
                    : 'bg-green-800/80 text-green-400 group-hover:bg-green-700/80 group-hover:text-green-300'
            }`}>
          <span className="material-icons text-lg sm:text-xl">
            {getIcon(notification.type)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p
            ref={msgRef}
            className={`text-sm ${notification.read ? 'text-green-200' : 'text-white font-semibold'} ${(expanded ? 'break-words whitespace-pre-wrap' : 'truncate')} ${(notification.type === 'warn' || notification.type === 'takedown') ? 'select-none' : ''}`}
            // Ensure the message cannot be selected for warn/takedown notifications
            style={(notification.type === 'warn' || notification.type === 'takedown') ? { userSelect: 'none' as const } : undefined}
          >
            {notification.message}
          </p>
          <p className="text-xs text-green-400 mt-0.5">{formattedTime}</p>
        </div>
  {!notification.read && (
          <div className="h-2 w-2 rounded-full bg-green-500 shadow-green-400/40 shadow animate-pulse"></div>
        )}
      {/* Mobile expand/collapse toggle - visible only on small screens */}
      {showToggle && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev); }}
          aria-label={expanded ? 'Collapse notification' : 'Expand notification'}
          // Make toggle button background transparent by default so it doesn't inherit the parent's gray
          className="sm:hidden ml-1 p-1 rounded-full text-green-300 bg-transparent hover:bg-green-800/20 transition"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <span className="material-icons text-base">{expanded ? 'expand_less' : 'expand_more'}</span>
        </button>
      )}
      </div>
      
      
    </div>
  );
};

const NotificationsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // Cache of postId -> post content snippet for reaction/comment notifications (used as excerpt when no comment excerpt available)
  const [postSnippets, setPostSnippets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // friend actions removed
  const [markingAll, setMarkingAll] = useState(false);

  // Set up real-time listener for notifications
  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    // friend-request notifications are no longer treated specially/removed

    // Debug: Log currentUser.id
    console.log('[NotificationsPage] currentUser.id:', currentUser.id);
    setLoading(true);

    // Try a one-time fetch first to populate UI quickly
    fetchNotificationsForUser(currentUser.id)
      .then(fetched => {
        if (!mounted) return;
        setNotifications(fetched);
        setLoading(false);
        setError(null);
      })
      .catch(err => {
        console.error('[NotificationsPage] initial fetch failed', err);
        if (!mounted) return;
        setError('Failed to load notifications');
        setLoading(false);
      });

    // Subscribe to notifications with real-time updates
    unsubscribe = listenToNotifications(currentUser.id, (fetchedNotifications) => {
      if (!mounted) return;
      // Debug: Log fetched notifications userId
      if (fetchedNotifications.length > 0) {
        console.log('[NotificationsPage] First notification userId:', fetchedNotifications[0].userId);
      } else {
        console.log('[NotificationsPage] No notifications fetched');
      }
      setNotifications(fetchedNotifications);
      setLoading(false);
      setError(null);
    });

    // Cleanup subscription on unmount
    return () => { mounted = false; if (unsubscribe) unsubscribe(); };
  }, [currentUser]);

  // Fetch post content snippets for reaction/comment notifications missing an excerpt so we can display
  useEffect(() => {
    if (!notifications || notifications.length === 0) return;
    // Collect unique relatedIds needing snippet
    const needed = Array.from(new Set(
      notifications
        .filter(n => (n.type === 'reaction' || n.type === 'comment') && !!n.relatedId && !((n.extra || {}).excerpt))
        .map(n => n.relatedId as string)
    )).filter(id => !postSnippets[id]);
    if (needed.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const id of needed) {
        try {
          const post = await postsAPI.getPostById(id);
          if (post && post.content) {
            const snippet = post.content.length > 120 ? post.content.slice(0, 117) + '...' : post.content;
            updates[id] = snippet;
          }
        } catch (e) {
          // silent fail
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setPostSnippets(prev => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
  }, [notifications, postSnippets]);

  // Handle marking a single notification as read
  const handleMarkAsRead = async (notificationId: string | string[]) => {
    if (!notificationId) return;
    try {
      if (Array.isArray(notificationId)) {
        await markNotificationsAsReadByIds(notificationId.filter(Boolean));
      } else {
        await markNotificationAsRead(notificationId);
      }
      // listener updates state
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Handle marking all notifications as read
  const handleMarkAllAsRead = async () => {
    if (!currentUser) return;
    if (markingAll) return;

    // Optimistic UI update for instant feedback
    setMarkingAll(true);
    setNotifications(prev => prev.map(n => n.read ? n : { ...n, read: true }));

    try {
      await markAllNotificationsAsRead(currentUser.id);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      // Let real-time listener eventually correct state; optionally could refetch
    } finally {
      setMarkingAll(false);
    }
  };

  // Handle accepting a friend request
  // friend actions removed: accept/decline handled elsewhere or disabled

  // Navigate to the relevant content based on notification type
  type ExtendedNotification = Notification & { type: Notification['type'] | 'message_request' };
  const handleNavigate = (notification: ExtendedNotification) => {
    const { type, relatedId, extra } = notification;

    switch (type) {
      case 'reaction':
      case 'comment':
        if (!relatedId) return;
        // Navigate to feed highlighting the related post temporarily (feed at /home)
        navigate(`/home`, { state: { highlightPostId: relatedId } });
        break;
      case 'warn':
        if (!relatedId) return;
        // Route warn notifications to flare only when explicitly tagged as flare.
        // Otherwise, treat relatedId as a postId and highlight it in feed.
        if ((extra as any)?.entityType === 'flare') {
          navigate(`/flares/${relatedId}`);
        } else {
          navigate(`/home?highlight=${encodeURIComponent(relatedId)}`);
        }
        break;
      case 'takedown':
        if (!relatedId) return;
        if ((extra as any)?.entityType === 'flare') {
          navigate(`/flares/${relatedId}`);
        } else {
          navigate(`/home?highlight=${encodeURIComponent(relatedId)}`);
        }
        break;
      case 'friend_request':
        if (!relatedId) return;
        // Navigate to the user's profile
        navigate(`/profile/${relatedId}`);
        break;
      case 'friend_post':
        if (!relatedId) return;
        // Highlight friend's new post in feed (feed at /home)
        navigate(`/home`, { state: { highlightPostId: relatedId } });
        break;
      case 'announcement':
        if (!relatedId) return;
        // Highlight announcement post in feed (feed at /home)
        navigate(`/home`, { state: { highlightPostId: relatedId } });
        break;
      case 'space_post':
        // Navigate to the specific space where the post was made
        // Extract groupId from the notification's extra data
        if (extra && (extra as any).groupId) {
          navigate(`/groups/${(extra as any).groupId}`);
        } else {
          // Fallback to general groups page if no groupId found
          navigate(`/groups`);
        }
        break;
      case 'space_invite': {
        const targetGroupId = (extra && (extra as any).groupId) || relatedId;
        if (!targetGroupId) {
          navigate('/groups');
          break;
        }
        const params = new URLSearchParams({ join: '1', via: 'invite' });
        const spaceCode = extra && (extra as any).spaceCode;
        if (spaceCode) {
          params.set('code', spaceCode);
        }
        navigate(`/groups/${targetGroupId}?${params.toString()}`);
        break;
      }
      case 'report_alert': {
        const state: Record<string, any> = { targetFilter: 'reported' };
        if (relatedId) {
          state.highlightPostId = relatedId;
        }
        navigate(`/home`, { state });
        break;
      }
      case 'message_request':
        if (!relatedId) return;
        // Open Messaging page and show message requests panel; optionally focus the specific chat
        navigate(`/messages`, { state: { showRequests: true, focusChatId: relatedId } });
        break;
      default:
        break;
    }
  };

  // Normalize timestamp safely
  const getMillis = (n: Notification) => {
    try {
      if ((n as any).clientTimestamp) return (n as any).clientTimestamp as number;
      const ts: any = n.timestamp;
      if (!ts) return Date.now();
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (ts instanceof Date) return ts.getTime();
      return new Date(ts).getTime();
    } catch {
      return Date.now();
    }
  };

  // First: combine reaction/comment per post (relatedId) into single UI item if needed
  const combinedByPost: UINotification[] = React.useMemo(() => {
    const map = new Map<string, UINotification>();
    const others: UINotification[] = [];
    for (const n of notifications) {
      // only combine reactions/comments that have a relatedId
      if ((n.type === 'reaction' || n.type === 'comment') && n.relatedId) {
        const key = `post:${n.relatedId}`;
        const existing = map.get(key);
        if (!existing) {
          // Build dynamic message even for single notification so we can show two names if actorCount>=2 and include snippet
          const extra = (n.extra && typeof n.extra === 'object') ? n.extra : {};
          const actorsArr = Array.isArray(extra.actors) ? extra.actors : (extra.latestActor ? [extra.latestActor] : []);
          const actorCount: number = typeof extra.actorCount === 'number' ? extra.actorCount : actorsArr.length;
          const names = actorsArr.map((a: any) => a?.name).filter(Boolean);
          const first = names[0] || 'Someone';
          const second = names[1];
          const othersCount = Math.max(0, actorCount - 1);
          // Determine excerpt: prefer comment excerpt else post snippet
          const excerpt = (n.type === 'comment' && (extra as any).excerpt) 
            || postSnippets[n.relatedId] 
            || (extra as any).excerpt 
            || undefined;
          const includeReacted = n.type === 'reaction';
          const includeCommented = n.type === 'comment';
          let actionPhrase = '';
          if (includeReacted && includeCommented) actionPhrase = 'reacted/commented on your post';
          else if (includeCommented) actionPhrase = 'commented on your post';
          else actionPhrase = 'reacted to your post';
          let message: string;
          if (actorCount === 1) message = `${first} ${actionPhrase}${excerpt ? `: "${excerpt}"` : ''}`;
          else if (actorCount === 2 && second) message = `${first} and ${second} ${actionPhrase}${excerpt ? `: "${excerpt}"` : ''}`;
          else message = `${first} and ${othersCount} others ${actionPhrase}${excerpt ? `: "${excerpt}"` : ''}`;
          map.set(key, { ...n, message, extra: { ...n.extra, excerpt }, _ids: [n.id!].filter(Boolean), _mergedTypes: [n.type] as any });
        } else {
          // merge: pick most recent by millis
          const base = getMillis(n) >= getMillis(existing) ? n : existing;
          const ids = new Set<string>([...(existing._ids || []), n.id!].filter(Boolean));
          // merge actors/counts
          const actorsA = Array.isArray(existing.extra?.actors) ? existing.extra!.actors : [];
          const actorsB = Array.isArray(n.extra?.actors) ? n.extra!.actors : [];
          const mergedActorsMap = new Map<string, { id: string; name: string }>();
          [...actorsA, ...actorsB].forEach((a: any) => { if (a && a.id) mergedActorsMap.set(a.id, { id: a.id, name: a.name }); });
          const mergedActors = Array.from(mergedActorsMap.values());
          const countA = typeof existing.extra?.actorCount === 'number' ? existing.extra!.actorCount : actorsA.length;
          const countB = typeof n.extra?.actorCount === 'number' ? n.extra!.actorCount : actorsB.length;
          const mergedCount = Math.max(countA, countB, mergedActors.length);
          const types = new Set([...(existing._mergedTypes || []), n.type as any]);

          // determine excerpt preference: prefer comment excerpt, else post snippet
          const excerpt = (n.type === 'comment' && (n.extra as any)?.excerpt)
            || (existing._mergedTypes?.includes('comment') && (existing.extra as any)?.excerpt)
            || postSnippets[n.relatedId]
            || postSnippets[existing.relatedId!]
            || (existing.extra as any)?.excerpt
            || (n.extra as any)?.excerpt
            || undefined;

          // construct message per spec: "John Doe and n others reacted/commented on your post: \"content\""
          const namesSet = new Set<string>();
          mergedActors.forEach(a => a?.name && namesSet.add(a.name));
          if (base.extra?.latestActor?.name) namesSet.add(base.extra.latestActor.name);
          const names = Array.from(namesSet);
          const first = names[0] || 'Someone';
          const second = names[1];
          const othersCount = Math.max(0, mergedCount - 1);

          const includeReacted = types.has('reaction');
          const includeCommented = types.has('comment');
          let actionPhrase = '';
          if (includeReacted && includeCommented) actionPhrase = 'reacted/commented on your post';
          else if (includeCommented) actionPhrase = 'commented on your post';
          else actionPhrase = 'reacted to your post';

          let message: string;
          if (mergedCount === 1) {
            message = `${first} ${actionPhrase}${excerpt ? `: "${excerpt}"` : ''}`;
          } else if (mergedCount === 2 && second) {
            message = `${first} and ${second} ${actionPhrase}${excerpt ? `: "${excerpt}"` : ''}`;
          } else {
            message = `${first} and ${othersCount} others ${actionPhrase}${excerpt ? `: "${excerpt}"` : ''}`;
          }

          const merged: UINotification = {
            ...(base as Notification),
            message,
            extra: { ...base.extra, actors: mergedActors, actorCount: mergedCount, latestActor: base.extra?.latestActor, excerpt },
            _ids: Array.from(ids),
            _mergedTypes: Array.from(types) as any,
          };
          map.set(key, merged);
        }
      } else {
        // keep non reaction/comment notifications as-is
        others.push(n);
      }
    }
    // return merged list combined with others, sorted by recency
    const mergedList = Array.from(map.values()).concat(others);
    return mergedList.sort((a, b) => getMillis(b) - getMillis(a));
  }, [notifications, postSnippets]);

  // Group notifications by date (using normalized millis)
  const groupedNotifications = combinedByPost.reduce((groups, notification) => {
    let dateStr = 'today';
    try {
      const ms = getMillis(notification);
      const d = new Date(ms);
      dateStr = format(d, 'yyyy-MM-dd');
    } catch {}
    if (!groups[dateStr]) groups[dateStr] = [] as UINotification[];
    (groups[dateStr] as UINotification[]).push(notification);
    return groups;
  }, {} as Record<string, UINotification[]>);

  // Format date for display
  const formatGroupDate = (dateStr: string) => {
    if (dateStr === 'today') return 'Today';
    
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
      return 'Today';
    } else if (format(date, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd')) {
      return 'Yesterday';
    } else {
      return format(date, 'MMMM d, yyyy');
    }
  };

  // Check if there are any unread notifications
  const hasUnread = notifications.some(notification => !notification.read);

  // --- PAGINATION LOGIC ---
  const notificationsFlat = Object.entries(groupedNotifications)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .flatMap(([date, dateNotifications]) =>
      (dateNotifications as UINotification[])
        .filter(n => n.type !== 'message') // filter before paginating
        .map(n => ({ ...n, _group: date }))
    );
  const { page, pageCount, paginated, goToPage } = usePagination(notificationsFlat, 20);
  // Group paginated notifications by date
  const paginatedGrouped = paginated.reduce((groups, notification: any) => {
    const date = notification._group;
    if (!groups[date]) groups[date] = [];
    groups[date].push(notification);
    return groups;
  }, {} as Record<string, Notification[]>);

  return (
    <MainLayout>
      <div className="container mx-auto px-1.5 sm:px-2 md:px-4 w-full max-w-full sm:max-w-3xl md:max-w-4xl lg:max-w-6xl overflow-x-hidden" data-tutorial="notifications-page">
  <div className="flex flex-row items-center justify-between mb-4 sm:mb-6 gap-2 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-green-500 to-green-400 animate-gradient-x drop-shadow-lg">
            Notifications
          </h1>
  {hasUnread && (
    <button
    onClick={handleMarkAllAsRead}
    disabled={markingAll}
  className={`ml-auto mt-3 sm:mt-0 px-3 py-1.5 text-xs sm:text-sm rounded-full shadow transition-all font-semibold text-white bg-transparent hover:bg-gradient-to-r hover:from-green-700/70 hover:to-green-600/80 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 shrink-0 w-auto ${markingAll ? 'animate-pulse' : ''}`}
      >
    {markingAll && <span className="material-icons text-sm animate-spin">autorenew</span>}
    {markingAll ? 'Marking...' : 'Mark all as read'}
      </button>
          )}
        </div>
        <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 rounded-xl sm:rounded-2xl border-2 border-green-800/70 shadow-2xl overflow-hidden w-full">
          {loading ? (
            <div className="flex justify-center items-center p-8 sm:p-10">
              <div className="animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 border-t-2 border-b-2 border-green-500"></div>
            </div>
          ) : error ? (
            <div className="bg-red-700/20 text-red-400 p-3 sm:p-4 rounded-lg text-sm shadow">
              {error}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 sm:p-10 text-center">
              <div className="inline-block p-3 sm:p-4 rounded-full bg-gray-800/70 mb-3 shadow">
                <span className="material-icons text-green-700 text-2xl sm:text-3xl">notifications_off</span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-green-300 mb-1">No notifications yet</h3>
              <p className="text-sm sm:text-base text-green-400/70">When you get notifications, they'll show up here.</p>
            </div>
          ) : (
            <div className="divide-y divide-green-900/60">
              {Object.entries(paginatedGrouped)
                .filter(([_, dateNotifications]) => dateNotifications.filter(n => n.type !== 'message').length > 0)
                .map(([date, dateNotifications]) => (
                  <div key={date} className="py-3 px-1 sm:py-4 sm:px-6 bg-gradient-to-r from-green-900/10 to-green-800/5 border-l-4 border-green-500/70 mb-2 rounded-lg sm:rounded-xl shadow-green-900/10 shadow-md">
                    <h2 className="text-xs sm:text-sm font-bold text-green-400 mb-2 sm:mb-3 px-2 uppercase tracking-wider opacity-90 flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                      {formatGroupDate(date)}
                    </h2>
                    <div className="space-y-1 sm:space-y-2">
                      {dateNotifications.filter(n => n.type !== 'message').map((notification) => (
                        <NotificationItem 
                          key={notification.id} 
                          notification={notification}
                          onMarkAsRead={handleMarkAsRead}
                          onNavigate={handleNavigate}
                          /* friend actions removed */
                        />
                      ))}
                    </div>
                  </div>
                ))}
              {/* PAGINATION CONTROLS */}
              {pageCount > 1 && notificationsFlat.length > 20 && (
                <div className="flex flex-col sm:flex-row justify-center items-center gap-2 p-3 sm:p-4 mt-2">
                  <button
                    className="px-3 py-1 rounded-full bg-transparent hover:bg-green-700/70 text-white font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                    onClick={() => goToPage(page - 1)}
                    disabled={page === 1}
                  >Prev</button>
                  <span className="text-green-300 font-semibold text-xs sm:text-base">Page {page} of {pageCount}</span>
                  <button
                    className="px-3 py-1 rounded-full bg-transparent hover:bg-green-700/70 text-white font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                    onClick={() => goToPage(page + 1)}
                    disabled={page === pageCount}
                  >Next</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default NotificationsPage;

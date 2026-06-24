"use client"

import type React from "react"
import ReactDOM from "react-dom"
import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react"
import { format } from "date-fns"
import DOMPurify from "dompurify"
import { useAuth } from "../../contexts/AuthContext"
import ProfanityModal from "../modals/ProfanityModal"
import { detectProfanity } from "../../utils/profanityFilter"
import type { Post, Comment, PostVisibility, SharedPostRecord } from "../../models/Post"
import { POST_VISIBILITY_OPTIONS } from "../../models/Post"
import RoleBadge from "../common/RoleBadge"
import {
  addComment,
  deleteComment,
  deletePost,
  deletePostQuick,
  hidePost,
  // togglePinPost has been removed
  getCommentsRealtime,
  getReactionStatusRealtime,
  addReaction,
  updatePost,
  markPostAsViewed,
  sharePost,
} from "../../services/postService"
import { getRepliesRealtime } from "../../services/postService"
import { reportPost, unreportPost } from "../../services/reportService"
import ReportBadge from "../common/ReportBadge"
import { db, storage } from "../../firebase/config"
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { v4 as uuidv4 } from 'uuid'
import { doc, getDoc, onSnapshot } from "firebase/firestore"
import { Timestamp } from "firebase/firestore"
import { getUserNameRealtime, getUserProfilePicRealtime } from "../../services/userNameService"
import {
  HeartIcon,
  TrashIcon,
  CheckIcon,
  GlobeAltIcon,
  UserGroupIcon,
  UserIcon,
  DocumentTextIcon,
  BuildingOfficeIcon,
  PaperAirplaneIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  NoSymbolIcon,
} from "@heroicons/react/24/outline"
// Use material-icons webfont instead of @mui icons to avoid SvgIcon issues
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid"
import { processStorageUrl, getStorageDownloadUrl, refreshDownloadUrl } from "../../firebase/storage-proxy"
import SmartMedia from "../common/SmartMedia"
import ConfirmDialog from "components/common/ConfirmDialog"
import LoaderOverlay from "components/common/LoaderOverlay"
import { isMobileDevice } from "../../utils/mobileUtils"
import { useNavigate } from "react-router-dom"
import PostActionSheet from "./PostActionSheet"
import { useSocialActivityTracking } from "../../hooks/useActivityTracking"
import { notifyWarnUser, notifyTakedownUser } from "../../services/notificationTriggers"
import PollCard from "./PollCard"
import { getPollsByPostId, getCachedPollsByPostId } from "../../services/pollService"
import FullScreenRegularPostModal from "./FullScreenRegularPostModal"
// import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react'

// Utility for visibility icon and label (match CreatePost)
const getVisibilityIcon = (visibility: string) => {
  switch (visibility) {
    case "public":
      return <GlobeAltIcon className="h-4 w-4 mr-1 text-green-400" />
    case "friends":
      return <UserGroupIcon className="h-4 w-4 mr-1 text-green-400" />
    case "poshed":
    case "fipo":
    case "afea":
    case "shatmo":
      return <BuildingOfficeIcon className="h-4 w-4 mr-1 text-green-400" />
    default:
      return <UserIcon className="h-4 w-4 mr-1 text-green-400" />
  }
}
const getVisibilityLabel = (visibility: string) => {
  switch (visibility) {
    case "public":
      return "Everyone at BulSU Space"
    case "friends":
      return "Friends"
    case "poshed":
      return "POSHED (BSIT Program)"
    case "afea":
      return "AFEA (BSEd, BEEd, BSTLEd)"
    case "shatmo":
      return "SHATMO (BSTM and BSHM)"
    case "fipo":
      return "FIPO (BIT)"
    default:
      return visibility.toUpperCase()
  }
}

interface EnhancedPost extends Post {
  mediaUrls?: string[]
  taggedFriends?: string[]
  taggedGroups?: string[]
  reportCount?: number // Allow reportCount for admin/super admin reported posts
}

interface PostCardProps {
  post: EnhancedPost
  onPostUpdated?: () => void
  onPostDeleted?: (id: string) => void
  currentFilter?: string
  currentUserRole?: string
  // Controlled fullscreen: parent can request opening fullscreen for this post
  openFullscreen?: boolean
  // Notifies parent when fullscreen modal is closed
  onFullscreenClose?: () => void
}

interface MediaItem {
  type: 'image' | 'video' | 'document'
  url: string
  name: string
  size?: number
  thumbnailUrl?: string
  storagePath?: string
}

const ROLE_COLOR_MAP: Record<string, string> = {
  student: '#34d399',
  faculty: '#60a5fa',
  alumni: '#f472b6',
  admin: '#fbbf24',
  'super admin': '#fb923c',
  dean: '#facc15',
  staff: '#2dd4bf',
  parent: '#a78bfa',
  unknown: '#9ca3af',
}

const ROLE_COLOR_FALLBACKS = ['#22d3ee', '#34d399', '#c084fc', '#fb7185', '#fcd34d', '#38bdf8']

const ROLE_LABEL_MAP: Record<string, string> = {
  student: 'Students',
  faculty: 'Faculty',
  alumni: 'Alumni',
  admin: 'Admins',
  'super admin': 'Super Admins',
  dean: 'Deans',
  staff: 'Staff',
  parent: 'Parents',
  unknown: 'Unclassified',
}

const getReadableRoleLabel = (roleKey: string) => {
  const normalized = roleKey ? roleKey.toLowerCase() : 'unknown'
  if (ROLE_LABEL_MAP[normalized]) return ROLE_LABEL_MAP[normalized]
  return normalized
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const getStableMediaItemKey = (
  prefix: string,
  postId: string,
  item: unknown,
  fallbackIndex: number
): string => {
  if (typeof item === 'string' && item) {
    return `${prefix}-${postId}-${item}`
  }

  if (item && typeof item === 'object') {
    const candidate = (item as any).storagePath || (item as any).url || (item as any).name
    if (typeof candidate === 'string' && candidate) {
      return `${prefix}-${postId}-${candidate}`
    }

    const itemType = (item as any).type
    if (typeof itemType === 'string' && itemType) {
      return `${prefix}-${postId}-${itemType}-${fallbackIndex}`
    }
  }

  return `${prefix}-${postId}-idx-${fallbackIndex}`
}

const getComparableTimestamp = (value: any): number => {
  if (!value) return 0
  if (typeof value?.toDate === 'function') {
    const date = value.toDate()
    return date instanceof Date ? date.getTime() : 0
  }
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value?.seconds === 'number') {
    const nanos = typeof value?.nanoseconds === 'number' ? value.nanoseconds : 0
    return value.seconds * 1000 + Math.floor(nanos / 1_000_000)
  }
  return 0
}

const getMediaSignature = (media: any): string => {
  if (!Array.isArray(media) || media.length === 0) return ''
  return media
    .map((item) => {
      if (typeof item === 'string') return `s:${item}`
      if (!item || typeof item !== 'object') return 'x:'
      const type = typeof (item as any).type === 'string' ? (item as any).type : ''
      const url = typeof (item as any).url === 'string' ? (item as any).url : ''
      const storagePath = typeof (item as any).storagePath === 'string' ? (item as any).storagePath : ''
      const name = typeof (item as any).name === 'string' ? (item as any).name : ''
      return `o:${type}|${url}|${storagePath}|${name}`
    })
    .join('||')
}

const getPostRenderSignature = (post: EnhancedPost): string => {
  const shared = post.sharedPostSnapshot as any
  const sharedSignature = shared
    ? [
        shared.id || '',
        shared.originalPostId || shared.original_post_id || '',
        shared.updatedAt ? getComparableTimestamp(shared.updatedAt) : 0,
        shared.createdAt ? getComparableTimestamp(shared.createdAt) : 0,
        typeof shared.originalPostContent === 'string' ? shared.originalPostContent : '',
        getMediaSignature(shared.originalPostMedia),
      ].join('|')
    : ''

  return [
    post.id,
    getComparableTimestamp(post.createdAt),
    getComparableTimestamp(post.updatedAt),
    post.userId || '',
    post.userName || '',
    post.userProfilePic || '',
    post.content || '',
    post.visibility || '',
    post.reactionCount || 0,
    post.commentCount || 0,
    post.viewCount || 0,
    (post as any).role || '',
    post.isPoll ? '1' : '0',
    post.isShare ? '1' : '0',
    post.sharedFromPostId || '',
    post.originalPostId || '',
    getMediaSignature(post.media),
    getMediaSignature(post.mediaUrls),
    sharedSignature,
  ].join('~')
}

const PostCard: React.FC<PostCardProps> = ({ post, onPostUpdated, onPostDeleted, currentFilter, currentUserRole, openFullscreen, onFullscreenClose }) => {
  const { currentUser } = useAuth()
  const { logCommentAdd, logReactionAdd } = useSocialActivityTracking()
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState("")
  // Reply state: id of the comment being replied to (null = new top-level comment)
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Map of commentId -> replies
  const [repliesMap, setRepliesMap] = useState<Record<string, Comment[]>>({});
  const [hasReacted, setHasReacted] = useState(false)
  const [reactionCount, setReactionCount] = useState(post.reactionCount || 0)
  const [commentCount, setCommentCount] = useState(post.commentCount || 0)
  const [viewCount, setViewCount] = useState(post.viewCount || 0)
  const [viewRoleCounts, setViewRoleCounts] = useState<Record<string, number>>(post.viewRoleBreakdown || {})
  const [viewedByUsers, setViewedByUsers] = useState<string[]>(Array.isArray(post.viewedBy) ? post.viewedBy : [])
  const [showViewInsights, setShowViewInsights] = useState(false)
  const [viewRoleLoading, setViewRoleLoading] = useState(false)
  const [viewRoleError, setViewRoleError] = useState<string | null>(null)
  const [recentReactors, setRecentReactors] = useState<{ userId: string; userName: string; profilePic?: string }[]>([])
  const [showReactors, setShowReactors] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState("")
  const [editedVisibility, setEditedVisibility] = useState<PostVisibility>(post.visibility)
  const [editedMedia, setEditedMedia] = useState<MediaItem[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const replaceIndexRef = useRef<number | null>(null)
  const [isContentExpanded, setIsContentExpanded] = useState(false)
  const [isHidden, setIsHidden] = useState(false) // Track if post is hidden locally

  // Profanity modal state for comments
  const [profanityModalOpen, setProfanityModalOpen] = useState(false)
  const [detectedProfaneWords, setDetectedProfaneWords] = useState<string[]>([])
  const [showTaggedFriends, setShowTaggedFriends] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportReason, setReportReason] = useState("")
  const [reportDetails, setReportDetails] = useState("")
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)

  // Add animation state for pop heart effect
  const [showHeartAnimation, setShowHeartAnimation] = useState(false)

  // Add a reaction processing state and lock mechanism
  const [isReactionProcessing, setIsReactionProcessing] = useState(false)
  const reactionLockRef = useRef(false)
  const reactionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const replyUnsubscribeMapRef = useRef<Map<string, () => void>>(new Map())
  const pendingReplyUpdatesRef = useRef<Record<string, Comment[]>>({})
  const replyBatchFrameRef = useRef<number | null>(null)

  // full-screen modal removed — view action disabled

  // Dynamic user name and profile picture state
  const [displayName, setDisplayName] = useState(post.userName || "")
  const [profilePic, setProfilePic] = useState(post.userProfilePic || "")
  const [userInfoLoading, setUserInfoLoading] = useState(
    !(post.userName && post.userName.trim()) || !(post.userProfilePic && post.userProfilePic.trim()),
  )
  const [userInfoError, setUserInfoError] = useState(false)

  // State for tagged friends
  const [taggedFriendsData, setTaggedFriendsData] = useState<{ id: string; name: string }[]>([])
  const [taggedFriendsLoading, setTaggedFriendsLoading] = useState(false)

  // Post action sheet state
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false)
  // Share/Hide confirmations
  const [showShareConfirm, setShowShareConfirm] = useState(false)
  const [shareProcessing, setShareProcessing] = useState(false)
  // Caption modal for share flow
  const [showCaptionModal, setShowCaptionModal] = useState(false)
  const [shareCaption, setShareCaption] = useState('')
  const [showHideConfirm, setShowHideConfirm] = useState(false)
  const [hideProcessing, setHideProcessing] = useState(false)
  const [isDeleteProcessing, setIsDeleteProcessing] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  // Warn confirmation state (Program Chair admin)
  const [showWarnConfirm, setShowWarnConfirm] = useState(false)
  const [warnProcessing, setWarnProcessing] = useState(false)
  const deleteSuccessTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [deleteFeedbackStatus, setDeleteFeedbackStatus] = useState<'pending' | 'success'>('success')

  // Debounce timer for loading state to prevent flickering
  const loadingTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [previewImages, setPreviewImages] = useState<string[]>([])
  // Video preview state (matches SpacePostCard behavior)
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false)
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null)
  // Attachment (document) preview state
  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false)
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null)
  const [attachmentPreviewName, setAttachmentPreviewName] = useState<string | null>(null)
  const [attachmentPreviewMime, setAttachmentPreviewMime] = useState<string | null>(null)
  const [attachmentPreviewStoragePath, setAttachmentPreviewStoragePath] = useState<string | null>(null)
  // Shared-chain state: immediate shared post and root original post (if any)
  const [sharedPostDetails, setSharedPostDetails] = useState<SharedPostRecord | null>(post.sharedPostSnapshot || null)
  const [sharedPostLoading, setSharedPostLoading] = useState(false)
  const [sharedPostError, setSharedPostError] = useState<string | null>(null)
  const [sharedOriginalMissing, setSharedOriginalMissing] = useState(false)
  // Desktop fullscreen modal state
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  // Poll state
  const [polls, setPolls] = useState<any[]>([])
  const [pollsLoading, setPollsLoading] = useState(false)
  const prevShowCommentsRef = useRef<boolean>(false)

  // ---------------- Media Resolution State ----------------
  // We normalize post.media / post.mediaUrls into a resolved array of URLs (Firebase storage paths -> download URLs)
  const [resolvedMedia, setResolvedMedia] = useState<(string | MediaItem)[]>([])
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const mediaResolveAbortRef = useRef<boolean>(false)
  const rawMediaEntries = useMemo<(string | MediaItem)[]>(() => {
    return (post.media && post.media.length > 0 ? post.media : post.mediaUrls) || []
  }, [post.media, post.mediaUrls, post.id])
  const mediaSourceSignature = useMemo(() => getMediaSignature(rawMediaEntries), [rawMediaEntries])

  // Helper: detect media type from a (possibly processed) URL
  const detectType = (u: string): 'image' | 'video' | 'document' => {
    if (!u) return 'document'
    const lower = u.split('?')[0].toLowerCase()
    if (/(\.mp4|\.webm|\.ogg)(?:$|\?)/.test(lower)) return 'video'
    if (/(\.jpe?g|\.png|\.gif|\.webp)(?:$|\?)/.test(lower)) return 'image'
    return 'document'
  }

  const extractNameFromUrl = (u: string) => {
    try {
      const cleaned = u.split('?')[0].split('#')[0]
      let raw = cleaned.split('/').pop() || 'file'
      try { raw = decodeURIComponent(raw) } catch (_) {}
      // strip common uuid prefix like 8-4-4-4-12 or 36-char with dashes
      raw = raw.replace(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_?/, '')
      raw = raw.replace(/^[0-9a-fA-F]{32}_?/, '')
      return raw || 'file'
    } catch (e) {
      return 'file'
    }
  }

  const safeDeleteStoragePath = async (path?: string | null) => {
    if (!path) return
    try {
      await deleteObject(storageRef(storage, path))
    } catch (e: any) {
      // Ignore object-not-found errors (already deleted or never existed)
      if (e?.code === 'storage/object-not-found' || (e?.message && e.message.includes('does not exist'))) {
        // console.debug('[PostCard] safeDeleteStoragePath: object not found, ignoring', path)
        return
      }
      // console.warn('[PostCard] safeDeleteStoragePath failed for', path, e)
    }
  }

  // Resolve raw entries (string | MediaItem) to stable downloadable URLs.
  useEffect(() => {
    if (!rawMediaEntries.length) {
      setResolvedMedia([])
      setMediaLoading(false)
      return
    }
    let active = true
    mediaResolveAbortRef.current = false
    setMediaLoading(true)
    setMediaError(null)

    const run = async () => {
      const out: (string | MediaItem)[] = []
      const errors: string[] = []
      
      // Process media items with concurrency limit to avoid overwhelming the browser
      const BATCH_SIZE = 3
      for (let i = 0; i < rawMediaEntries.length; i += BATCH_SIZE) {
        if (mediaResolveAbortRef.current || !active) return
        
        const batch = rawMediaEntries.slice(i, i + BATCH_SIZE)
        const batchResults = await Promise.allSettled(
          batch.map(async (item) => {
            try {
              let originalUrl = typeof item === 'string' ? item : item.url
              if (!originalUrl) {
                throw new Error('Empty URL')
              }
              
              let finalUrl = originalUrl
              // If not an http(s) URL we assume it's a storage path
              if (!/^https?:/i.test(originalUrl)) {
                try {
                  finalUrl = await getStorageDownloadUrl(originalUrl)
                } catch (e) {
                  // console.warn('[PostCard] getStorageDownloadUrl failed for path', originalUrl, e)
                  throw e
                }
              } else {
                // If it's already a storage URL add CORS params
                finalUrl = processStorageUrl(originalUrl)
              }
              
              const type = typeof item === 'string' ? detectType(finalUrl) : (item.type || detectType(finalUrl))
              if (typeof item === 'string') {
                return { url: finalUrl, type, name: extractNameFromUrl(finalUrl) }
              } else {
                return { ...item, url: finalUrl, type }
              }
            } catch (e: any) {
              // console.error('[PostCard] Failed resolving media item', item, e)
              throw e
            }
          })
        )
        
        // Collect successful results
        batchResults.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            out.push(result.value)
          } else {
            errors.push(`Media ${i + idx + 1}: ${result.reason?.message || 'Unknown error'}`)
          }
        })
      }
      
      if (active && !mediaResolveAbortRef.current) {
        setResolvedMedia(out)
        setMediaLoading(false)
        
        if (errors.length > 0 && out.length === 0) {
          // All media failed
          setMediaError('Failed to load all media')
        } else if (errors.length > 0) {
          // Some media failed
          // console.warn('[PostCard] Some media items failed to load:', errors)
        }
      }
    }
    run()
    return () => {
      active = false
      mediaResolveAbortRef.current = true
    }
  }, [post.id, mediaSourceSignature])

  // Manual media refresh (e.g., if token expired). Exposed via retry buttons.
  const refreshAllMedia = async () => {
    if (!resolvedMedia.length && !rawMediaEntries.length) return
    
    // console.log('[PostCard] Manually refreshing all media URLs')
    setMediaLoading(true)
    setMediaError(null)
    
    const refreshed: (string | MediaItem)[] = []
    
    for (const item of rawMediaEntries) {
      try {
        const url = typeof item === 'string' ? item : item.url
        if (!url) continue
        
        const fresh = await refreshDownloadUrl(url)
        const type = typeof item === 'string' ? detectType(fresh) : (item as MediaItem).type || detectType(fresh)
        
        if (typeof item === 'string') {
          refreshed.push({ url: fresh, type, name: extractNameFromUrl(fresh) })
        } else {
          refreshed.push({ ...(item as MediaItem), url: fresh, type })
        }
      } catch (e) {
        // console.warn('[PostCard] refreshAllMedia failed for', item, e)
        // Keep original item if refresh fails
        refreshed.push(item)
      }
    }
    
    setResolvedMedia(refreshed)
    setMediaLoading(false)
    // console.log('[PostCard] Media refresh complete')
  }

  // If parent requests opening fullscreen, sync internal state
  useEffect(() => {
    if (openFullscreen) {
      setIsFullscreen(true)
    }
  }, [openFullscreen])

  // Notify parent when fullscreen is closed (if parent initiated it)
  useEffect(() => {
    if (!isFullscreen && openFullscreen && typeof onFullscreenClose === 'function') {
      onFullscreenClose()
    }
  }, [isFullscreen, openFullscreen, onFullscreenClose])

  // Centralized comment action: open fullscreen modal on all devices; mobile uses dedicated FullScreenRegularPostModal
  const handleCommentAction = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setIsFullscreen(true)
  }

  // Confirm sending a warning (Program Chair admin)
  const handleWarnConfirm = async () => {
    if (!currentUser) return
    setWarnProcessing(true)
    setShowWarnConfirm(false)
    let excerpt: string | undefined = undefined
    try {
      if (post.content) {
        const plain = post.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        const phraseMatch = plain.match(/^[^\n\r]+?[.?!](?=\s|$)/)
        if (phraseMatch && phraseMatch[0]) {
          excerpt = phraseMatch[0].trim()
        } else {
          excerpt = plain.substring(0, 120).trim()
        }
        if (excerpt) excerpt = excerpt.replace(/\s+/g, ' ').trim()
      }
    } catch (ex) {
      console.error('Error preparing excerpt for warn confirm', ex)
      excerpt = undefined
    }
    try {
      const warnSent = await notifyWarnUser(post.id, currentUser.id, post.userId, excerpt)
      // console.log(`[PostCard] Warn user result for post ${post.id} ->`, warnSent)
    } catch (e) {
      // console.error('[PostCard] warn user failed', e)
      alert('Failed to send warning. Please try again.')
    } finally {
      setWarnProcessing(false)
    }
  }

  // Sound effect for reaction
  const playReactionSound = () => {
    const audio = new window.Audio("/audio/pop-heart-sound.mp3")
    audio.play()
  }
  // Function to safely update loading state with debounce
  const updateLoadingState = (isLoading: boolean) => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current)
    }

    // Only update to false after a small delay to prevent flickering
    if (!isLoading) {
      loadingTimerRef.current = setTimeout(() => {
        setUserInfoLoading(false)
      }, 300) // 300ms delay before hiding skeleton
    } else {
      // For setting to true, update immediately
      setUserInfoLoading(true)
    }
  }

  // Timeout for user info loading
  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined = undefined

    if (userInfoLoading) {
      timeout = setTimeout(() => {
        setUserInfoError(true)
        updateLoadingState(false)
      }, 4000) // 4 seconds
    }

    return () => {
      if (timeout) clearTimeout(timeout)
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current)
      }
    }
  }, [userInfoLoading])

  // Create refs for tooltips and dropdowns
  const visibilityRef = useRef<HTMLDivElement>(null)
  const reactorsRef = useRef<HTMLDivElement>(null)
  const taggedFriendsRef = useRef<HTMLDivElement>(null)
  const mediaContainerRef = useRef<HTMLDivElement | null>(null)
  const viewInsightsAnchorRef = useRef<HTMLDivElement | null>(null)
  const viewInsightsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Anchor for fullscreen menu dropdown positioning via portal
  const fullscreenMenuBtnRef = useRef<HTMLButtonElement>(null)
  // Anchor for desktop header menu dropdown positioning via portal
  const headerMenuBtnRef = useRef<HTMLButtonElement>(null)

  // Add navigation for profile links
  const navigate = useNavigate()

  // Helper for fallback avatar
  const getInitials = (name?: string) => {
    if (!name) return "U"
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  // Memoize the user info to prevent unnecessary re-renders
  const userInfo = useMemo(() => {
    return {
      name: displayName || post.userName || "Unknown User",
      profilePic: profilePic || post.userProfilePic || "",
      hasData: Boolean(displayName || post.userName) && Boolean(profilePic || post.userProfilePic),
    }
  }, [displayName, profilePic, post.userName, post.userProfilePic])

  const normalizedAuthorName = useMemo(() => {
    return (displayName || post.userName || "").trim()
  }, [displayName, post.userName])

  const shouldHideForMissingAuthor = useMemo(() => {
    if (!post.userId) return true
    const lowered = normalizedAuthorName.toLowerCase()
    const isPlaceholder =
      lowered === "unknown user" || lowered === "user not found" || lowered === "deleted user"
    return !normalizedAuthorName || isPlaceholder || userInfoError
  }, [normalizedAuthorName, post.userId, userInfoError])

  useEffect(() => {
    if (shouldHideForMissingAuthor) {
      // console.warn(`[PostCard] Hiding post ${post.id} because author data is missing`, {
        // postId: post.id,
        // userId: post.userId,
        // normalizedAuthorName,
        // userInfoError,
      // })
    }
  }, [shouldHideForMissingAuthor, post.id, post.userId, normalizedAuthorName, userInfoError])

  // Share handler (open confirm modal)
  const handleShare = () => {
    if (!currentUser || isSharing) return
    if (currentUser.id === post.userId) {
      console.warn("Authors cannot share their own posts.")
      return
    }
    // Open caption overlay first
    setShareCaption('')
    setShowCaptionModal(true)
  }

  // Confirm share action
  const confirmShare = async () => {
    if (!currentUser) return
    setShareProcessing(true)
    setIsSharing(true)
    try {
      // console.log('[PostCard] Sharing post', { postId: post.id, userId: currentUser.id, caption: shareCaption })
      const newShareId = await sharePost(post.id, currentUser.id, undefined, shareCaption || undefined)
      // console.log('[PostCard] Share created', newShareId)
      setShowShareConfirm(false)
      // Give user quick feedback
      try { alert('Post shared successfully') } catch (_) {}
    } catch (e) {
      console.error("Share failed", e)
      try {
        const msg = (e as any)?.message || String(e)
        alert(`Failed to share post: ${msg}`)
      } catch (_) {}
    } finally {
      setShareProcessing(false)
      setIsSharing(false)
    }
  }

  const submitCaptionAndOpenConfirm = () => {
    // Close caption modal and open final confirmation
    setShowCaptionModal(false)
    setShowShareConfirm(true)
  }

  const openImagePreview = (images: string[], startIndex: number) => {
    setPreviewImages(images)
    setCurrentImageIndex(startIndex)
    setPreviewOpen(true)
  }

  const openVideoPreview = (url: string) => {
    setPreviewVideoUrl(url)
    setVideoPreviewOpen(true)
  }

  // Pause any video elements inside this post when opening previews
  useEffect(() => {
    if (!mediaContainerRef.current) return
    const videos = Array.from(mediaContainerRef.current.querySelectorAll('video')) as HTMLVideoElement[]
    if (videoPreviewOpen || previewOpen) {
      videos.forEach((v) => {
        try { v.pause() } catch (e) {}
      })
    }
    // No resume behavior here; user must play video explicitly in preview/modal
  }, [videoPreviewOpen, previewOpen])

  // Preload preview media (images/videos) to reduce navigation lag
  const preloadedMediaRef = useRef<Record<string, { img?: HTMLImageElement; video?: HTMLVideoElement; loaded: boolean }>>({})

  useEffect(() => {
    if (!previewOpen || !previewImages || !previewImages.length) return
    let cancelled = false
    const toPreload = previewImages.slice()

    toPreload.forEach((url) => {
      if (preloadedMediaRef.current[url]) return
      const lower = (url || '').toLowerCase()
      const isVideo = /\.(mp4|webm|ogg)(\?|$)/i.test(lower)
      if (isVideo) {
        try {
          const v = document.createElement('video')
          v.preload = 'metadata'
          v.src = url
          const onLoaded = () => {
            if (cancelled) return
            preloadedMediaRef.current[url] = { video: v, loaded: true }
          }
          v.addEventListener('loadedmetadata', onLoaded, { once: true })
          // keep reference even before loaded to avoid duplicate creation
          preloadedMediaRef.current[url] = { video: v, loaded: false }
        } catch (err) {
          // ignore
        }
      } else {
        const img = new Image()
        img.src = url
        preloadedMediaRef.current[url] = { img, loaded: false }
        img.onload = () => {
          if (cancelled) return
          preloadedMediaRef.current[url].loaded = true
        }
        img.onerror = () => {
          if (cancelled) return
          preloadedMediaRef.current[url].loaded = false
        }
      }
    })

    return () => {
      cancelled = true
      // Optionally clear preloaded elements to free memory when closing preview
      // Keep them for session to benefit further navigations; we won't remove here
    }
  }, [previewOpen, previewImages])

  const getWatermarkedFilename = (url: string, blob: Blob | null) => {
    const typeMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/ogg": "ogg",
    }

    const cleanUrl = (value: string) => value.split("#")[0].split("?")[0]

    const extractLastSegment = (value: string) => {
      try {
        const parsed = new URL(value, window.location.href)
        return parsed.pathname.split("/").filter(Boolean).pop() || ""
      } catch (err) {
        return cleanUrl(value).split("/").filter(Boolean).pop() || ""
      }
    }

    const rawSegment = extractLastSegment(url)
    let decodedSegment = rawSegment
    try {
      decodedSegment = decodeURIComponent(rawSegment)
    } catch (err) {
      decodedSegment = rawSegment
    }

    let baseName = decodedSegment.replace(/\.[^./\\]+$/, "")
    let extension = decodedSegment.match(/\.([a-zA-Z0-9]{1,6})$/)?.[1] || ""

    if (!extension && blob) {
      const mapped = typeMap[blob.type]
      if (mapped) {
        extension = mapped
      } else if (blob.type.includes("/")) {
        extension = blob.type.split("/").pop() || ""
      }
    }

    if (!extension) {
      extension = "bin"
    }

    if (!baseName) {
      baseName = Date.now().toString()
    }

    baseName = baseName.replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    if (!baseName) {
      baseName = Date.now().toString()
    }

    return `BULSU-SPACE-${baseName}.${extension}`
  }

  const downloadImage = async (url: string) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = downloadUrl
      link.download = getWatermarkedFilename(url, blob)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error("Failed to download image:", error)
    }
  }

  const downloadFile = async (url: string | null | undefined, suggestedName?: string, storagePath?: string | null) => {
    try {
      let finalUrl = url || ''

      // If we have a canonical storage path, prefer resolving a fresh download URL
      if (storagePath) {
        try {
          finalUrl = await getStorageDownloadUrl(storagePath)
        } catch (e) {
          // console.warn('[PostCard] getStorageDownloadUrl failed, falling back to original URL', e)
          finalUrl = url || ''
        }
      } else if (finalUrl && finalUrl.startsWith('http') && finalUrl.includes('firebasestorage.googleapis.com')) {
        // Try to refresh token / resolve to fresh URL when only a URL is available
        try {
          finalUrl = await refreshDownloadUrl(finalUrl)
        } catch (e) {
          // console.warn('[PostCard] refreshDownloadUrl failed, using existing URL', e)
        }
      }

      if (!finalUrl) {
        throw new Error('No URL available to download')
      }

      const response = await fetch(finalUrl)
      if (!response.ok) throw new Error(`Download request failed: ${response.status}`)
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = suggestedName || getWatermarkedFilename(finalUrl, blob)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Failed to download file:', error)
      // As a fallback, try opening the original URL in a new tab
      try {
        if (url) window.open(url, '_blank', 'noopener')
      } catch (e) {}
    }
  }

  const goToPrevious = () => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : previewImages.length - 1))
  }

  const goToNext = () => {
    setCurrentImageIndex((prev) => (prev < previewImages.length - 1 ? prev + 1 : 0))
  }

  // ...all hooks above...
  // Rendering logic below

  // We should always render the post content, even if user info is still loading
  // Only hide completely if there's an error AND no data
  const shouldRenderContent = true // We'll always render the post, but may show loading states inside

  const hasViewRoleData = useMemo(() => {
    return Object.values(viewRoleCounts || {}).some((count) => count > 0)
  }, [viewRoleCounts])

  const derivedViewInsights = useMemo(() => {
    const normalizedCounts: Record<string, number> = {}
    if (viewRoleCounts) {
      Object.entries(viewRoleCounts).forEach(([roleKey, value]) => {
        const numericValue = typeof value === 'number' && !Number.isNaN(value) ? value : 0
        if (numericValue <= 0) return
        const normalizedRole = roleKey ? roleKey.toLowerCase() : 'unknown'
        normalizedCounts[normalizedRole] = (normalizedCounts[normalizedRole] || 0) + numericValue
      })
    }
    const fallbackTotal = viewCount || viewedByUsers.length || 0
    const countsTotal = Object.values(normalizedCounts).reduce((sum, val) => sum + val, 0)
    if (fallbackTotal > countsTotal) {
      const missing = fallbackTotal - countsTotal
      if (missing > 0) {
        normalizedCounts.unknown = (normalizedCounts.unknown || 0) + missing
      }
    }
    const total = Math.max(fallbackTotal, countsTotal)
    const entries = Object.entries(normalizedCounts).sort((a, b) => b[1] - a[1])
    return { total, entries }
  }, [viewRoleCounts, viewCount, viewedByUsers.length])

  const viewInsightSegments = useMemo(() => {
    if (!derivedViewInsights.total || !derivedViewInsights.entries.length) return []
    let cursor = 0
    return derivedViewInsights.entries.map(([role, value], index) => {
      const ratio = value / derivedViewInsights.total
      const startAngle = cursor
      const endAngle = cursor + ratio * 360
      cursor = endAngle
      const color = ROLE_COLOR_MAP[role] || ROLE_COLOR_FALLBACKS[index % ROLE_COLOR_FALLBACKS.length]
      return {
        role,
        value,
        percent: ratio * 100,
        startAngle,
        endAngle,
        color,
      }
    })
  }, [derivedViewInsights])

  const pieGradient = useMemo(() => {
    if (!viewInsightSegments.length) {
      return 'radial-gradient(circle, #1f2937 0%, #111827 100%)'
    }
    const segments = viewInsightSegments
      .map((segment) => `${segment.color} ${segment.startAngle}deg ${segment.endAngle}deg`)
      .join(', ')
    return `conic-gradient(${segments})`
  }, [viewInsightSegments])

  // Format tagged friends display text
  const getTaggedFriendsDisplayText = () => {
    // Safety check for undefined or empty array
    if (!taggedFriendsData || !Array.isArray(taggedFriendsData) || taggedFriendsData.length === 0) {
      return ""
    }
    // Single friend case
    if (taggedFriendsData.length === 1) {
      const friend = taggedFriendsData[0]
      if (!friend || typeof friend !== "object" || typeof friend.name !== "string") {
        return "with a friend"
      }
      return `with ${friend.name}`
    }

    // Two friends case
    if (taggedFriendsData.length === 2) {
      const friend1 = taggedFriendsData[0]
      const friend2 = taggedFriendsData[1]
      const firstName = friend1 && typeof friend1 === "object" && typeof friend1.name === "string" ? friend1.name : "a friend"
      const secondName = friend2 && typeof friend2 === "object" && typeof friend2.name === "string" ? friend2.name : "another friend"
      return `with ${firstName} and ${secondName}`
    }

    // More than two friends: show first friend's name and count
    if (taggedFriendsData.length > 2) {
      const first = taggedFriendsData[0]
      const firstName = first && first.name ? first.name : "a friend"
      return `with ${firstName} and ${taggedFriendsData.length - 1} others`
    }

    return "with friends"
  }

  // Navigate to a user's profile when their avatar/name is clicked
  const handleProfileClick = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (post.userId && typeof post.userId === "string") {
      navigate(`/profile/${post.userId}`)
    } else {
      console.error("Invalid user ID for navigation:", post.userId)
    }
  }

  // Navigate to a tagged friend's profile
  const handleTaggedFriendClick = (e: React.MouseEvent, friendId: string) => {
    e.stopPropagation()
    if (friendId && typeof friendId === "string" && friendId.trim() !== "") {
      navigate(`/profile/${friendId}`)
    } else {
      console.error("Invalid friend ID for navigation:", friendId)
    }
  }

  // Return a display string for tagged groups
  const getTaggedGroupsDisplayText = () => {
    if (!post.taggedGroups || !Array.isArray(post.taggedGroups) || post.taggedGroups.length === 0) return ""
    return post.taggedGroups.join(", ")
  }

  // Unified media error handler for images & videos
  const handleMediaError = (e: React.SyntheticEvent<HTMLImageElement | HTMLVideoElement>) => {
    const el = e.currentTarget as HTMLImageElement | HTMLVideoElement
    if (el.tagName === 'IMG') {
      const img = el as HTMLImageElement
      if (!img.dataset.fallbackApplied) {
        img.dataset.fallbackApplied = 'true'
        img.src = '/images/placeholder.png'
        img.alt = 'Image unavailable'
        img.classList.add('object-contain','bg-gray-800','text-gray-400')
      }
    } else if (el.tagName === 'VIDEO') {
      const parent = el.parentElement
      if (parent && !parent.querySelector('.media-fallback')) {
        try { el.remove() } catch {}
        const fallback = document.createElement('div')
        fallback.className = 'media-fallback w-full h-full flex flex-col items-center justify-center gap-2 bg-gray-900/60 text-gray-400 text-xs sm:text-sm p-4'
        fallback.innerHTML = `
          <div class="flex items-center gap-2">\n            <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5 text-gray-500' fill='none' viewBox='0 0 24 24' stroke='currentColor' stroke-width='1.5'>\n              <path stroke-linecap='round' stroke-linejoin='round' d='M15.75 10.5l4.5-2.25v7.5l-4.5-2.25M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z' />\n            </svg>\n            <span>Video failed to load</span>\n          </div>\n          <button type='button' class='retry-btn px-3 py-1.5 rounded-md bg-gray-800/70 hover:bg-gray-700 text-gray-200 text-xs border border-gray-700/50 transition-colors'>Retry</button>`
        parent.appendChild(fallback)
        const retryBtn = fallback.querySelector('.retry-btn') as HTMLButtonElement | null
        if (retryBtn) {
          retryBtn.onclick = () => {
            const newVideo = document.createElement('video')
            Array.from(el.attributes).forEach(attr => {
              if (attr.name !== 'src') newVideo.setAttribute(attr.name, attr.value)
            })
            newVideo.src = (el as HTMLVideoElement).currentSrc || (el as HTMLVideoElement).getAttribute('src') || ''
            newVideo.className = el.className
            newVideo.onerror = (evt) => handleMediaError(evt as any)
            newVideo.onloadeddata = () => { fallback.remove() }
            parent.appendChild(newVideo)
            newVideo.load()
          }
        }
      }
    }
  }

  const ensureViewRoleData = useCallback(async () => {
    if (viewRoleLoading || hasViewRoleData || !viewedByUsers.length) {
      return
    }
    setViewRoleLoading(true)
    setViewRoleError(null)
    try {
      const chunkSize = 15
      const counts: Record<string, number> = {}
      for (let i = 0; i < viewedByUsers.length; i += chunkSize) {
        const chunk = viewedByUsers.slice(i, i + chunkSize)
        const roles = await Promise.all(
          chunk.map(async (uid) => {
            try {
              const userSnap = await getDoc(doc(db, 'users', uid))
              if (userSnap.exists()) {
                const rawRole = userSnap.data().role
                if (typeof rawRole === 'string' && rawRole.trim()) {
                  return rawRole.trim().toLowerCase()
                }
              }
              return 'unknown'
            } catch (error) {
              // console.warn('[PostCard] Failed to get role for viewer', { uid, error })
              return 'unknown'
            }
          })
        )
        roles.forEach((roleKey) => {
          counts[roleKey] = (counts[roleKey] || 0) + 1
        })
      }
      setViewRoleCounts(counts)
    } catch (error) {
      // console.error('[PostCard] Unable to compute viewer breakdown', error)
      setViewRoleError('Unable to load viewer insights right now.')
    } finally {
      setViewRoleLoading(false)
    }
  }, [viewRoleLoading, hasViewRoleData, viewedByUsers])

  // Real-time listener for user name and profile picture changes
  useEffect(() => {
    let unsubscribeName = () => {}
    let unsubscribePic = () => {}
    let nameLoaded = false
    let picLoaded = false

    if (post.userId) {
      // Start with loading state if data is missing
      if (!post.userName || !post.userProfilePic) {
        updateLoadingState(true)
      }
      setUserInfoError(false)

      unsubscribeName = getUserNameRealtime(post.userId, (name) => {
        if (name && name !== displayName) {
          setDisplayName(name)
        }
        nameLoaded = true
        if (picLoaded && nameLoaded) {
          updateLoadingState(false)
        }
      })

      unsubscribePic = getUserProfilePicRealtime(post.userId, (pic) => {
        if (pic && pic !== profilePic) {
          setProfilePic(pic)
        }
        picLoaded = true
        if (nameLoaded && picLoaded) {
          updateLoadingState(false)
        }
      })
    } else {
      // If no userId, make sure we're not showing loading state
      updateLoadingState(false)
    }

    return () => {
      unsubscribeName()
      unsubscribePic()
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current)
      }
    }
  }, [post.userId])

  // visibility dropdown removed; no outside-click handling needed

  // Handle click outside for reactors tooltip
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (reactorsRef.current && !reactorsRef.current.contains(event.target as Node)) {
        setShowReactors(false)
      }
    }

    if (showReactors) {
      document.addEventListener("mousedown", handleClickOutside)
    } else {
      document.removeEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [showReactors])
  // Format the post date with better type safety
  const formattedDate = useMemo(() => {
    if (!post.createdAt) return "Just now"

    try {
      // Handle Firestore Timestamp objects
      if (typeof post.createdAt.toDate === "function") {
        return format(post.createdAt.toDate(), "MMM d, yyyy • h:mm a")
      }

      // Handle JavaScript Date objects
      if (post.createdAt instanceof Date) {
        return format(post.createdAt, "MMM d, yyyy • h:mm a")
      }

      // Optimistic posts might have string or number timestamps
      if (typeof post.createdAt === "string" || typeof post.createdAt === "number") {
        return format(new Date(post.createdAt), "MMM d, yyyy • h:mm a")
      }

      return "Just now"
    } catch (e) {
      console.error("Error formatting post date:", e)
      return "Just now"
    }
  }, [post.createdAt])
  // Check if current user is the author or an admin/super admin
  const isAuthor = currentUser?.id === post.userId
  const userRole = currentUser?.role as string | undefined
  const isAdminOrSuperAdmin = userRole === "admin" || userRole === "super admin"
  const canEditPost = isAuthor && !post.isShare
  // Add explicit logging for debugging the admin delete functionality
  // console.log("PostCard info:", {
  //   currentUserId: currentUser?.id,
  //   postAuthorId: post.userId,
  //   isAuthor,
  //   userRole,
  //   isAdminOrSuperAdmin,
  //   postId: post.id,
  // })

  // Load comments and their replies when comment section is opened
  useEffect(() => {
    let unsubscribeComments: () => void = () => {}

    const flushReplyUpdates = () => {
      replyBatchFrameRef.current = null
      const pendingUpdates = pendingReplyUpdatesRef.current
      const pendingIds = Object.keys(pendingUpdates)

      if (pendingIds.length === 0) return

      pendingReplyUpdatesRef.current = {}
      setRepliesMap((prev) => {
        let changed = false
        const next = { ...prev }

        pendingIds.forEach((commentId) => {
          const nextReplies = pendingUpdates[commentId]
          if (prev[commentId] === nextReplies) return
          next[commentId] = nextReplies
          changed = true
        })

        return changed ? next : prev
      })
    }

    const enqueueReplyUpdate = (commentId: string, replies: Comment[]) => {
      pendingReplyUpdatesRef.current[commentId] = replies
      if (replyBatchFrameRef.current !== null) return
      replyBatchFrameRef.current = window.requestAnimationFrame(flushReplyUpdates)
    }

    const clearReplyListeners = () => {
      replyUnsubscribeMapRef.current.forEach((unsubscribe) => unsubscribe())
      replyUnsubscribeMapRef.current.clear()
    }

    if (showComments) {
      unsubscribeComments = getCommentsRealtime(post.id, (newComments) => {
        setComments(newComments)

        // Keep commentCount accurate from top-level comments only.
        // The service layer is responsible for persisting post.commentCount.
        setCommentCount(newComments.length)

        const nextCommentIds = new Set(newComments.map((c) => c.id))

        // Remove listeners for comments that are no longer visible.
        replyUnsubscribeMapRef.current.forEach((unsubscribe, commentId) => {
          if (nextCommentIds.has(commentId)) return
          unsubscribe()
          replyUnsubscribeMapRef.current.delete(commentId)
        })

        // Keep only reply entries for currently loaded comments.
        setRepliesMap((prev) => {
          const next: Record<string, Comment[]> = {}
          Object.entries(prev).forEach(([commentId, replies]) => {
            if (nextCommentIds.has(commentId)) {
              next[commentId] = replies
            }
          })
          return next
        })

        // Subscribe only for newly discovered comments.
        newComments.forEach((comment) => {
          if (replyUnsubscribeMapRef.current.has(comment.id)) return
          const unsubscribeReplies = getRepliesRealtime(post.id, comment.id, (replies) => {
            enqueueReplyUpdate(comment.id, replies)
          })
          replyUnsubscribeMapRef.current.set(comment.id, unsubscribeReplies)
        })
      })
    }

    return () => {
      unsubscribeComments()
      clearReplyListeners()
      if (replyBatchFrameRef.current !== null) {
        window.cancelAnimationFrame(replyBatchFrameRef.current)
        replyBatchFrameRef.current = null
      }
      pendingReplyUpdatesRef.current = {}
      setRepliesMap({})
    }
  }, [post.id, showComments])

  // Check if user has reacted to this post and get real-time reaction data
  useEffect(() => {
    let unsubscribe: () => void = () => {}

    if (currentUser) {
      // Clear any existing reaction state when post changes
      setHasReacted(false)

      // console.log(`[PostCard] Setting up reactions listener for post ${post.id}`)

      // Track if there's a pending optimistic update
      const hasPendingUpdate = reactionLockRef.current

      unsubscribe = getReactionStatusRealtime(post.id, currentUser.id, (hasReacted, count, reactors) => {
        // console.log(`[PostCard] Reaction update received: hasReacted=${hasReacted}, count=${count}`)

        // Only update the reaction state if we're not in the middle of a reaction operation
        // This prevents the realtime listener from overriding optimistic updates
        if (hasReacted !== null && !reactionLockRef.current) {
          setHasReacted(hasReacted)
        } else {
          // console.log("[PostCard] Skipping hasReacted update due to pending optimistic update")
        }

        // Only update count if we have a valid count from the server and not in the middle of an operation
        if (count !== -1) {
          if (!reactionLockRef.current && !isReactionProcessing) {
            // console.log(`[PostCard] Updating reaction count from ${reactionCount} to ${count}`)
            setReactionCount(count)
          } else {
            // console.log("[PostCard] Skipping count update due to pending optimistic update")
          }
        }

        if (reactors) {
          setRecentReactors(reactors)
        }

        // After receiving data from Firebase, it's safe to unlock if there was no pending update
        if (!hasPendingUpdate && reactionLockRef.current) {
          reactionLockRef.current = false
          setIsReactionProcessing(false)
        }
      })
    }

    return () => unsubscribe()
  }, [post.id, currentUser])

  useEffect(() => {
    if (!canEditPost && isEditing) {
      setIsEditing(false)
    }
  }, [canEditPost, isEditing])

  useEffect(() => {
    setViewRoleCounts(post.viewRoleBreakdown || {})
  }, [post.viewRoleBreakdown, post.id])

  useEffect(() => {
    setViewedByUsers(Array.isArray(post.viewedBy) ? post.viewedBy : [])
  }, [post.viewedBy, post.id])

  useEffect(() => {
    if (!showViewInsights) return
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (viewInsightsAnchorRef.current && !viewInsightsAnchorRef.current.contains(event.target as Node)) {
        setShowViewInsights(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [showViewInsights])

  // Set initial edited content and visibility when editing starts
  useEffect(() => {
    // Always run the effect, but only set state if isEditing is true
    if (isEditing) {
      setEditedContent(post.content)
      setEditedVisibility(post.visibility)
      // Initialize editable media from post.media (preserve storagePath if present)
      try {
        const baseMedia: MediaItem[] = (post.media && post.media.length > 0 ? post.media : (post.mediaUrls || [])).map((m: any) => {
          if (!m) return null as any
          if (typeof m === 'string') {
            const rawName = (m.split('?')[0].split('/').pop() || 'file')
            return { url: m, type: detectType(m), name: rawName } as MediaItem
          }
          return { ...(m as MediaItem) }
        }).filter(Boolean)
        setEditedMedia(baseMedia)
      } catch (e) {
        // console.warn('[PostCard] Failed to initialize editedMedia', e)
        setEditedMedia([])
      }
    }
  }, [isEditing, post.content, post.visibility])

  // Always listen for post document changes for lightweight counters/metadata.
  useEffect(() => {
    const postRef = doc(db, "posts", post.id)

    const unsubscribe = onSnapshot(
      postRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const postData = docSnapshot.data()

          // While comments panel is closed, reflect stored post count.
          // While open, count is driven by the realtime comments listener.
          const storedCommentCount = postData.commentCount || 0
          if (!showComments) {
            setCommentCount(storedCommentCount)
          }

          // Get data from the post document
          const newViewCount = postData.viewCount || 0

          // console.log(
            // `[PostCard] Post document updated: commentCount=${postData.commentCount || 0}, reactionCount=${newReactionCount}, viewCount=${newViewCount}`,
          // )

          // Reaction count is sourced from /posts/{postId}/reactions realtime listener.
          // Avoid overriding it with post document `reactionCount`, which can be stale
          // and cause the UI to briefly show 1 then snap back to 0.

          // Always update view count with server values
          setViewCount(newViewCount)

          if (Array.isArray(postData.viewedBy)) {
            setViewedByUsers(postData.viewedBy)
          } else {
            setViewedByUsers([])
          }

          if (postData.viewRoleBreakdown) {
            setViewRoleCounts(postData.viewRoleBreakdown)
            setViewRoleError(null)
          }
        } else {
          // console.log(`[PostCard] Post ${post.id} does not exist in database, might be deleted or not saved yet`)
        }
      },
      (error) => {
        // console.error(`[PostCard] Error listening to post ${post.id}:`, error)
      },
    )

    return () => unsubscribe()
  }, [post.id, showComments])
  // Handle adding a new comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim() || !currentUser) return

    setIsSubmitting(true)
    const submittedCommentText = commentText
    try {
      // Actually add the comment or reply to the database
      const commentId = await addComment(post.id, currentUser.id, submittedCommentText, replyToCommentId || null)

      // Log the comment activity
      await logCommentAdd(commentId, post.id)

  // Only clear the comment text and reply state after successful submission
  setCommentText("")
  setReplyToCommentId(null)
    } catch (error) {
      console.error("Error adding comment:", error)
    } finally {
      setIsSubmitting(false)
    }
  }
  // Handle deleting a comment
  const handleDeleteComment = async (commentId: string, commentUserId: string) => {
    if (!currentUser || !window.confirm("Are you sure you want to delete this comment?")) return

    try {
      // Actually delete the comment from the database
      await deleteComment(post.id, commentId, currentUser.id, isAdminOrSuperAdmin)
    } catch (error) {
      console.error("Error deleting comment:", error)
    }
  }

  const handleLike = async () => {
    // Don't allow multiple reaction operations at once
    if (!currentUser || reactionLockRef.current || isReactionProcessing) {
      if (!currentUser) {
        // Redirect to sign in page if no user
        window.location.href = "/signin"
      }
      return
    }

    // Lock reaction to prevent double-clicks and race conditions
    reactionLockRef.current = true
    setIsReactionProcessing(true)

    // Clear any pending timeouts
    if (reactionTimeoutRef.current) {
      clearTimeout(reactionTimeoutRef.current)
    }

    // Track current reaction state and count for proper rollback
    const wasReacted = hasReacted
    const originalCount = reactionCount

    console.log(`[handleLike] Current reaction state: hasReacted=${hasReacted}, count=${reactionCount}`)

    // Optimistically update UI for instant response
    const newReactionState = !hasReacted
    setHasReacted(newReactionState)

    // Calculate the new count based on the reaction toggle action
    const optimisticNewCount = reactionCount + (hasReacted ? -1 : 1)
    setReactionCount(optimisticNewCount)

    if (!hasReacted) {
      setShowHeartAnimation(true)
      playReactionSound()
      // Reset animation after it completes
      setTimeout(() => setShowHeartAnimation(false), 600)
    }

    console.log(`[handleLike] Optimistically updated count to ${optimisticNewCount}`)

    try {
      // Import and use the new AuthService for robust authentication verification
      const { AuthService } = await import("../../services/authService")

      // Run full auth diagnostics first to ensure best chance of success
      console.log("[handleLike] Running auth diagnostics before reaction")
      const diagnostics = await AuthService.runAuthDiagnostics()

      if (diagnostics.fixed) {
        console.log("[handleLike] Auth diagnostics fixed issues:", diagnostics)
      }

      // Verify authentication status with enforced redirect if needed
      const authenticatedUserId = await AuthService.verifyAuthentication(false)

      if (!authenticatedUserId) {
        console.error("[handleLike] Not authenticated according to AuthService")
        throw new Error("Authentication required")
      }

      // Verify user ID match with current context
      if (currentUser.id !== authenticatedUserId) {
        console.error("[handleLike] User ID mismatch:", {
          contextId: currentUser.id,
          authServiceId: authenticatedUserId,
        })
        throw new Error("User ID mismatch")
      }

      // Always refresh token before secure operations - wait for result
      const refreshed = await AuthService.refreshAuthToken()
      console.log("[handleLike] Token refresh result:", refreshed)

      // Perform the reaction after authentication verification
      try {
        // Use a more reliable function with better error handling
        await addReaction(post.id, currentUser.id)
        console.log("[handleLike] Reaction action completed successfully")

        // Log the reaction activity
        await logReactionAdd("like", post.id)

        // After a successful operation, set a delay before allowing another reaction
        // This prevents rapid clicking and ensures Firebase has time to propagate changes
        reactionTimeoutRef.current = setTimeout(() => {
          reactionLockRef.current = false
          setIsReactionProcessing(false)
        }, 1000) // Reduced to 1 second for better UX
      } catch (reactionError: any) {
        console.error("[handleLike] Initial reaction attempt failed:", reactionError)

        // Check for permission errors and try again with alternative approach
        if (reactionError.code === "permission-denied") {
          console.log("[handleLike] Permission denied, trying alternative approach")

          // Force token refresh again to ensure latest credentials
          await AuthService.refreshAuthToken()

          // Try with a different reference pattern
          const { db } = await import("../../firebase/config")
          const { doc, setDoc, deleteDoc, getDoc, increment, updateDoc } = await import("firebase/firestore")

          // Use direct path pattern - most reliable across Firebase SDK versions
          const postRef = doc(db, "posts", post.id)
          // Use direct document reference with full path
          const reactionRef = doc(db, "posts", post.id, "reactions", currentUser.id)

          try {
            const reactionExists = (await getDoc(reactionRef)).exists()

            if (reactionExists) {
              await deleteDoc(reactionRef)
              console.log("[handleLike] Alternative approach: removed reaction")

              // Also update the count in the post document to ensure consistency
              await updateDoc(postRef, {
                reactionCount: increment(-1),
              })
            } else {
              await setDoc(reactionRef, {
                userId: currentUser.id,
                timestamp: new Date(), // Use client-side date as fallback
              })
              console.log("[handleLike] Alternative approach: added reaction")

              // Also update the count in the post document to ensure consistency
              await updateDoc(postRef, {
                reactionCount: increment(1),
              })
            }

            // Set a delay before allowing another reaction
            reactionTimeoutRef.current = setTimeout(() => {
              reactionLockRef.current = false
              setIsReactionProcessing(false)
            }, 1000)
          } catch (alternativeError) {
            console.error("[handleLike] Alternative approach failed:", alternativeError)
            throw alternativeError // Re-throw for outer catch
          }
        } else {
          throw reactionError // Re-throw for outer catch
        }
      }
    } catch (error: any) {
      console.error("Error toggling reaction:", error)

      const isMinorError =
        error.message?.includes("reaction was added") || error.message?.includes("reaction was deleted")

      if (!isMinorError) {
        // Only revert UI state for actual failures
        console.log(`[handleLike] Reverting to original state: hasReacted=${wasReacted}, count=${originalCount}`)
        setHasReacted(wasReacted)
        setReactionCount(originalCount)

        // Force a fresh fetch of the post data to ensure count accuracy
        const { db } = await import("../../firebase/config")
        const { doc, getDoc } = await import("firebase/firestore")
        const postRef = doc(db, "posts", post.id)
        getDoc(postRef)
          .then((docSnapshot) => {
            if (docSnapshot.exists()) {
              const postData = docSnapshot.data()
              const serverCount = postData.reactionCount || 0
              console.log(`[handleLike] Refreshed reaction count from server: ${serverCount}`)
              setReactionCount(serverCount)
            }
          })
          .catch((err) => {
            console.error("[handleLike] Failed to refresh reaction count:", err)
          })

        alert("Failed to like post. Please try again later.")
      } else {
        console.log("[handleLike] Minor error detected, UI state maintained")
        // The reaction toggle worked, so just release the lock
        reactionLockRef.current = false
        setIsReactionProcessing(false)
        return
      }

      // Handle all authentication-related errors consistently
      if (
        error.message?.includes("must be logged in") ||
        error.message?.includes("Authentication") ||
        error.message?.includes("permissions") ||
        (error.code && (error.code.includes("permission-denied") || error.code.includes("unauthenticated")))
      ) {
        // Dynamic import to avoid circular dependencies
        const { AuthService } = await import("../../services/authService")

        // Try one more approach with a complete auth refresh
        console.log("[handleLike] Auth error, running full diagnostics")
        const diagnostics = await AuthService.runAuthDiagnostics()

        if (diagnostics.fixed) {
          console.log("[handleLike] Auth diagnostics fixed issues, retrying reaction")
          try {
            await AuthService.refreshAuthToken()
            await addReaction(post.id, currentUser.id)
            setHasReacted(!wasReacted) // Restore optimistic update

            // Set a delay before allowing another reaction
            reactionTimeoutRef.current = setTimeout(() => {
              reactionLockRef.current = false
              setIsReactionProcessing(false)
            }, 1000)
            return
          } catch (finalError) {
            console.error("[handleLike] Final retry failed:", finalError)
          }
        }

        // Show meaningful error and redirect
        alert("Your session has expired. Please log in again to continue.")
        window.location.href = "/signin"
      }

      // Always unlock reactions even if there was an error
      reactionLockRef.current = false
      setIsReactionProcessing(false)
    }
  }

  // Get visibility icon for the dropdown
  const getVisibilityIcon = (visibility: PostVisibility) => {
    switch (visibility) {
      case "public":
        return <GlobeAltIcon className="h-5 w-5" />
      case "friends":
        return <UserGroupIcon className="h-5 w-5" />
      case "poshed":
      case "fipo":
      case "afea":
      case "shatmo":
        return <BuildingOfficeIcon className="h-5 w-5" />
      default:
        return <UserIcon className="h-5 w-5" />
    }
  }

  // Get visibility label for the dropdown
  const getVisibilityLabel = (visibility: PostVisibility) => {
    const found = POST_VISIBILITY_OPTIONS.find((option) => option.value === visibility)
    return found ? found.label : "Unknown"
  }

  // List of visibility options for editing
  interface VisibilityOption {
    value: PostVisibility
    label: string
    Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  } // Create visibility options dynamically based on user's department
  const userDepartment = currentUser?.department

  const POST_VISIBILITY_OPTIONS: VisibilityOption[] = [
    { value: "public", label: "Everyone at BulSU Space", Icon: GlobeAltIcon },
    { value: "friends", label: "Friends", Icon: UserGroupIcon },
  ]

  // If the post has a department-specific visibility and we're editing it,
  // make sure to include that option even if current user doesn't have that department
  if (
    post.visibility &&
    ["poshed", "fipo", "afea", "shatmo"].includes(post.visibility) &&
    !POST_VISIBILITY_OPTIONS.some((opt) => opt.value === post.visibility)
  ) {
    let deptLabel = ""
    switch (post.visibility) {
      case "poshed":
        deptLabel = "POSHED (BSIT Program)"
        break
      case "fipo":
        deptLabel = "FIPO (BIT)"
        break
      case "afea":
        deptLabel = "AFEA (BSEd, BEEd, BSTLEd)"
        break
      case "shatmo":
        deptLabel = "SHATMO (BSTM and BSHM)"
        break
      default:
        deptLabel = post.visibility.toUpperCase()
    }

    POST_VISIBILITY_OPTIONS.push({
      value: post.visibility as PostVisibility,
      label: deptLabel,
      Icon: BuildingOfficeIcon,
    })
  }

  // Add user's department if they have one
  if (
    userDepartment &&
    userDepartment !== "NONE" &&
    !POST_VISIBILITY_OPTIONS.some((opt) => opt.value === userDepartment.toLowerCase())
  ) {
    let deptLabel = ""
    switch (userDepartment.toLowerCase()) {
      case "poshed":
        deptLabel = "POSHED (BSIT Program)"
        break
      case "fipo":
        deptLabel = "FIPO (BIT)"
        break
      case "afea":
        deptLabel = "AFEA (BSEd, BEEd, BSTLEd)"
        break
      case "shatmo":
        deptLabel = "SHATMO (BSTM and BSHM)"
        break
      default:
        deptLabel = userDepartment
    }

    POST_VISIBILITY_OPTIONS.push({
      value: userDepartment.toLowerCase() as PostVisibility,
      label: deptLabel,
      Icon: BuildingOfficeIcon,
    })
  }

  const handleStartEdit = () => {
    if (!canEditPost) return
    setIsEditing(true)
  }

  // Handle post edit submission
  const handleEditSubmit = async () => {
    if (!currentUser || !editedContent.trim() || !canEditPost) return

    try {
      // Update post with edited content and visibility
      await updatePost(post.id, currentUser.id, editedContent, editedMedia, editedVisibility)

      // Update local post state to show changes immediately
      if (onPostUpdated) {
        onPostUpdated()
      } else {
        // If no update handler is provided, update the post locally
        post.content = editedContent
        post.visibility = editedVisibility
        post.isEdited = true
        post.updatedAt = new Timestamp(Math.floor(Date.now() / 1000), 0)
      }

      setIsEditing(false)
    } catch (error) {
      console.error("Error updating post:", error)
    }
  } // Handle post deletion confirmation

  // Trigger file input to replace a media item at index
  const triggerReplace = (index: number) => {
    replaceIndexRef.current = index
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  // Handle file selected for replacement or adding
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const file = files[0]
    const idx = replaceIndexRef.current
    try {
      if (!currentUser) throw new Error('Not authenticated')
      const id = uuidv4()
      const path = `posts/${currentUser.id}/${id}_${file.name}`
      const sRef = storageRef(storage, path)
      await uploadBytes(sRef, file)
      const downloadUrl = await getDownloadURL(sRef)
      const mediaType: 'image' | 'video' | 'document' = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document'
      const newMedia: MediaItem = {
        type: mediaType,
        url: await getStorageDownloadUrl(sRef.fullPath),
        name: file.name,
        size: file.size,
        storagePath: sRef.fullPath,
      }

      let oldPath: string | undefined
      setEditedMedia((prev) => {
        const copy = [...prev]
        if (typeof idx === 'number' && idx >= 0 && idx < copy.length) {
          const old = copy[idx]
          oldPath = old?.storagePath
          copy[idx] = newMedia
        } else {
          copy.push(newMedia)
        }
        return copy
      })

      // Delete old object if present (handled asynchronously and safely)
      if (oldPath) {
        await safeDeleteStoragePath(oldPath)
      }
    } catch (err) {
      // console.error('[PostCard] Failed to replace/upload media', err)
      alert('Failed to upload replacement media. Please try again.')
    } finally {
      replaceIndexRef.current = null
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveMedia = async (index: number) => {
    try {
      let removedPath: string | undefined
      setEditedMedia((prev) => {
        const copy = [...prev]
        const removed = copy.splice(index, 1)[0]
        removedPath = removed?.storagePath
        return copy
      })

      if (removedPath) {
        await safeDeleteStoragePath(removedPath)
      }
    } catch (err) {
      // console.error('[PostCard] Failed to remove media', err)
      alert('Failed to remove media. Please try again.')
    }
  }
  const handleDeleteConfirm = async () => {
    if (!currentUser) {
      console.error("Delete confirm called but no current user")
      return
    }

    // Optimistic: hide the post immediately and notify parent so UI feels fast.
    setShowDeleteConfirm(false)
    setIsDeleteProcessing(true)
    setIsHidden(true)
    setDeleteFeedbackStatus('pending')
    setShowDeleteSuccess(true)

    try {
      console.log("Deleting post (quick delete) - postId:", post.id)
      await deletePostQuick(post.id, currentUser.id, isAdminOrSuperAdmin)
      console.log("Delete successful for post:", post.id)
      setDeleteFeedbackStatus('success')

      // If this was an admin deleting someone else's post, notify the author and super admins
      try {
        if (isAdminOrSuperAdmin && currentUser.id !== post.userId) {
          // Prepare a short excerpt from the post content (strip HTML, first sentence or up to 120 chars)
          let excerpt: string | undefined = undefined
          try {
            if (post.content) {
              const plain = post.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
              // First try to capture the first phrase up to sentence-ending punctuation or a newline
              const phraseMatch = plain.match(/^[^\n\r]+?[.?!](?=\s|$)/)
              if (phraseMatch && phraseMatch[0]) {
                excerpt = phraseMatch[0].trim()
              } else {
                // Fallback: first clause up to 120 characters
                excerpt = plain.substring(0, 120).trim()
              }
              // Final safety: ensure excerpt is not empty and trim whitespace
              if (excerpt) {
                excerpt = excerpt.replace(/\s+/g, ' ').trim()
              }
            }
          } catch (ex) {
            console.error('Error preparing excerpt for notifyWarnUser', ex)
            excerpt = undefined
          }

          // Notify the original author: use 'takedown' if deleter is super admin, otherwise 'warn'
          try {
            if (userRole === 'super admin') {
              const takedownSent = await notifyTakedownUser(post.id, currentUser.id, post.userId, excerpt)
              // console.log(`[PostCard] notifyTakedownUser result for post ${post.id} ->`, takedownSent)
            } else {
              const warnSent = await notifyWarnUser(post.id, currentUser.id, post.userId, excerpt)
              // console.log(`[PostCard] notifyWarnUser result for post ${post.id} ->`, warnSent)
            }
          } catch (e) {
            // console.error('[PostCard] notify (warn/takedown) failed', e)
          }

          // No super-admin notification: only the post author is notified for admin deletes per request
        }
      } catch (notifyErr) {
        console.error('Error during post-deletion notifications:', notifyErr)
      }

    } catch (error: any) {
      console.error("Error deleting post:", error)
      if (deleteSuccessTimeoutRef.current) {
        clearTimeout(deleteSuccessTimeoutRef.current)
        deleteSuccessTimeoutRef.current = null
      }
      setShowDeleteSuccess(false)
      setDeleteFeedbackStatus('success')
      // Revert optimistic UI on failure and ask parent to refresh
      setIsHidden(false)
      if (onPostUpdated) onPostUpdated()
      const msg = typeof error === 'string' ? error : error?.message || 'Failed to delete post.'
      if (msg.toLowerCase().includes('permission')) {
        alert('Permission denied: could not delete post.')
      } else {
        alert(`Failed to delete post: ${msg}`)
      }
    } finally {
      setIsDeleteProcessing(false)
    }
  }

  const handleDeleteSuccessClose = () => {
    if (deleteFeedbackStatus !== 'success') {
      return
    }
    try {
      if (deleteSuccessTimeoutRef.current) {
        clearTimeout(deleteSuccessTimeoutRef.current)
        deleteSuccessTimeoutRef.current = null
      }
      setShowDeleteSuccess(false)
      setDeleteFeedbackStatus('success')
      if (onPostDeleted) {
        try {
          onPostDeleted(post.id)
        } catch (cbErr) {
          // console.error('[PostCard] onPostDeleted callback failed', cbErr)
        }
      }
    } catch (err) {
      // console.error('[PostCard] Error closing delete success dialog', err)
      setShowDeleteSuccess(false)
      setDeleteFeedbackStatus('success')
    }
  }

  // Handle hiding a post
  // Hide handler (open confirm modal)
  const handleHide = () => {
    if (!currentUser) return
    const isAuthor = post.userId === currentUser.id
    if (isAuthor) {
      console.error("Post authors cannot hide their own posts")
      return
    }
    setShowHideConfirm(true)
  }

  // Confirm hide action
  const confirmHide = async () => {
    if (!currentUser) return
    setHideProcessing(true)
    try {
      setIsHidden(true) // Hide post instantly
      await hidePost(post.id, currentUser.id)
      if (onPostUpdated) onPostUpdated()
      setShowHideConfirm(false)
    } catch (error) {
      setIsHidden(false) // Revert on error
      console.error("Error hiding post:", error)
    } finally {
      setHideProcessing(false)
    }
  }

  // (Legacy share handler removed; unified sharePost integration earlier in file)

  // Handle reporting a post
  const handleReport = () => {
    // Prevent admins and super admins from reporting posts
    if (currentUser?.role === "admin" || currentUser?.role === "super admin") {
      console.error("Admins and super admins cannot report posts")
      return
    }

    // Show report modal
    setShowReportModal(true)
    setReportReason("")
  }

  // Empty function since pin functionality has been removed
  const handleTogglePin = async () => {
    // Pin functionality has been removed
    console.log("Pin functionality has been removed")
  }
  // Add after other useEffect hooks
  // Handle window resize for responsive character limits
  const [isMobile, setIsMobile] = useState(isMobileDevice())

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(isMobileDevice())
    }

    handleResize() // Set initial state
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const handleViewInsightsHover = useCallback(
    (isEntering: boolean) => {
      if (isMobile) return
      if (viewInsightsTimeoutRef.current) {
        clearTimeout(viewInsightsTimeoutRef.current)
        viewInsightsTimeoutRef.current = null
      }
      if (isEntering) {
        setShowViewInsights(true)
        ensureViewRoleData()
      } else {
        viewInsightsTimeoutRef.current = setTimeout(() => {
          setShowViewInsights(false)
        }, 120)
      }
    },
    [isMobile, ensureViewRoleData]
  )

  const handleViewInsightsClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isMobile) return
      event.stopPropagation()
      const nextState = !showViewInsights
      setShowViewInsights(nextState)
      if (nextState) {
        ensureViewRoleData()
      }
    },
    [isMobile, showViewInsights, ensureViewRoleData]
  )

  useEffect(() => {
    return () => {
      if (deleteSuccessTimeoutRef.current) {
        clearTimeout(deleteSuccessTimeoutRef.current)
        deleteSuccessTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      if (viewInsightsTimeoutRef.current) {
        clearTimeout(viewInsightsTimeoutRef.current)
        viewInsightsTimeoutRef.current = null
      }
    }
  }, [])

  // Function to process post content with responsive character limit
  const processPostContent = () => {
    // Handle empty content gracefully
    if (!post.content || !post.content.trim()) {
      // For shared posts, avoid showing a "No content" placeholder when the sharer didn't add a caption.
      // The shared block below will display the original post's content/media if available.
      if (post.isShare) {
        return userInfoLoading ? '<div class="text-gray-500 italic">Loading content...</div>' : ''
      }
      return userInfoLoading
        ? '<div class="text-gray-500 italic">Loading content...</div>'
        : '<div class="text-gray-500 italic">No content</div>'
    }
    // Convert newlines and sanitize
    let sanitizedContent = DOMPurify.sanitize(post.content.replace(/\n/g, "<br>"))

    // Inject green styling for hashtags (desktop & mobile regular posts)
    sanitizedContent = sanitizedContent.replace(/#(\w+)/g, '<span class="text-green-400 font-semibold">#$1</span>')

    // If content is already expanded, return the full content
    if (isContentExpanded) {
      return sanitizedContent
    }

    const charLimit = isMobile ? 200 : 800

    // If content is under the character limit, return the full content
    if (sanitizedContent.length <= charLimit) {
      return sanitizedContent
    }

    // Truncate without breaking a word and add See more link inline
    // Find the last space before the charLimit
    let truncIndex = sanitizedContent.lastIndexOf(" ", charLimit)
    if (truncIndex === -1) truncIndex = charLimit // fallback to hard cut
    const truncated = sanitizedContent.substring(0, truncIndex)

    // Return truncated content with inline See more button
    return `${truncated}<span class='see-more-inline'>... <button type='button' style=\"color: #22c55e !important; font-weight: 500; background: none; border: none; padding: 0; cursor: pointer; WebkitTextFillColor: #22c55e; textShadow: 0 0 0 #22c55e\" class=\"text-green-500 hover:text-green-400 text-sm font-medium inline-block transition-colors\">See more</button></span>`
  }

  // Fetch polls for this post
  useEffect(() => {
    const fetchPolls = async () => {
      if (post.isPoll && post.pollId) {
        const cached = getCachedPollsByPostId(post.id);
        if (cached) {
          setPolls(cached);
          setPollsLoading(false);
        } else {
          setPollsLoading(true);
        }
        try {
          const postPolls = await getPollsByPostId(post.id);
          setPolls(postPolls);
        } catch (error) {
          // console.error('[PostCard] Error fetching polls:', error);
        } finally {
          setPollsLoading(false);
        }
      }
    };

    fetchPolls();
  }, [post.id, post.isPoll, post.pollId]);

  // Fetch shared post snapshot from shared_posts collection
  useEffect(() => {
    let cancelled = false
    let unsubscribeOriginal: (() => void) | null = null
    if (!post.isShare || !post.sharedPostRefId) {
      setSharedPostDetails(null)
      setSharedPostError(null)
      setSharedOriginalMissing(false)
      setSharedPostLoading(false)
      return
    }
    const fetchSharedPost = async () => {
      setSharedPostLoading(true)
      setSharedPostError(null)
      setSharedOriginalMissing(false)
      try {
        const sharedRef = doc(db, 'shared_posts', post.sharedPostRefId!)
        const sharedSnap = await getDoc(sharedRef)
        if (!sharedSnap.exists()) {
          // Shared_posts doc not present. Treat as original missing but keep the post itself.
          if (!cancelled) {
            setSharedPostDetails(null)
            setSharedPostError(null)
            setSharedOriginalMissing(true)
          }
        } else {
          if (!cancelled) {
            const sharedData = sharedSnap.data() as SharedPostRecord

            // If the shared snapshot includes an originalPostId, verify that original still exists.
            const originalPostId = (sharedData && (sharedData.originalPostId || (sharedData as any).original_post_id)) || post.originalPostId || post.sharedFromPostId
            let originalExists = true
            let latestOriginalData: any = null
            if (originalPostId) {
              try {
                const originalSnap = await getDoc(doc(db, 'posts', String(originalPostId)))
                if (!originalSnap.exists()) {
                  originalExists = false
                } else {
                  latestOriginalData = originalSnap.data() || {}
                }
              } catch (err) {
                // console.warn('[PostCard] Failed to verify original post existence for', originalPostId, err)
                // On transient error, assume original exists to avoid hiding content
                originalExists = true
              }
            }

            if (!originalExists) {
              // Original post no longer exists -> do not show stored metadata
              setSharedPostDetails(null)
              setSharedOriginalMissing(true)
              setSharedPostError(null)
            } else {
              const mergedSharedData = {
                ...(sharedData || {}),
                id: sharedSnap.id,
                ...(latestOriginalData ? {
                  originalPostId: String(originalPostId),
                  originalPostAuthorId: latestOriginalData.userId || (sharedData as any)?.originalPostAuthorId,
                  originalPostAuthorName: latestOriginalData.userName || (sharedData as any)?.originalPostAuthorName,
                  originalPostAuthorProfilePic: latestOriginalData.userProfilePic || (sharedData as any)?.originalPostAuthorProfilePic,
                  originalPostContent: typeof latestOriginalData.content === 'string' ? latestOriginalData.content : ((sharedData as any)?.originalPostContent || ''),
                  originalPostMedia: Array.isArray(latestOriginalData.media) ? latestOriginalData.media : ((sharedData as any)?.originalPostMedia || []),
                  originalPostCreatedAt: latestOriginalData.createdAt || (sharedData as any)?.originalPostCreatedAt,
                  originalPostUpdatedAt: latestOriginalData.updatedAt || (sharedData as any)?.originalPostUpdatedAt,
                  originalPostVisibility: latestOriginalData.visibility || (sharedData as any)?.originalPostVisibility || 'public'
                } : {})
              } as SharedPostRecord
              setSharedPostDetails(mergedSharedData)
              setSharedOriginalMissing(false)

              if (originalPostId) {
                unsubscribeOriginal = onSnapshot(
                  doc(db, 'posts', String(originalPostId)),
                  (originalSnapshot) => {
                    if (cancelled) return
                    if (!originalSnapshot.exists()) {
                      setSharedPostDetails(null)
                      setSharedOriginalMissing(true)
                      return
                    }
                    const liveOriginal = originalSnapshot.data() || {}
                    setSharedPostDetails((prev) => ({
                      ...((prev as any) || (sharedData as any) || {}),
                      id: sharedSnap.id,
                      originalPostId: String(originalPostId),
                      originalPostAuthorId: liveOriginal.userId || ((prev as any)?.originalPostAuthorId ?? (sharedData as any)?.originalPostAuthorId),
                      originalPostAuthorName: liveOriginal.userName || ((prev as any)?.originalPostAuthorName ?? (sharedData as any)?.originalPostAuthorName),
                      originalPostAuthorProfilePic: liveOriginal.userProfilePic || ((prev as any)?.originalPostAuthorProfilePic ?? (sharedData as any)?.originalPostAuthorProfilePic),
                      originalPostContent: typeof liveOriginal.content === 'string' ? liveOriginal.content : (((prev as any)?.originalPostContent ?? (sharedData as any)?.originalPostContent) || ''),
                      originalPostMedia: Array.isArray(liveOriginal.media) ? liveOriginal.media : (((prev as any)?.originalPostMedia ?? (sharedData as any)?.originalPostMedia) || []),
                      originalPostCreatedAt: liveOriginal.createdAt || ((prev as any)?.originalPostCreatedAt ?? (sharedData as any)?.originalPostCreatedAt),
                      originalPostUpdatedAt: liveOriginal.updatedAt || ((prev as any)?.originalPostUpdatedAt ?? (sharedData as any)?.originalPostUpdatedAt),
                      originalPostVisibility: liveOriginal.visibility || ((prev as any)?.originalPostVisibility ?? (sharedData as any)?.originalPostVisibility) || 'public'
                    }) as SharedPostRecord)
                    setSharedOriginalMissing(false)
                    setSharedPostError(null)
                  },
                  () => {
                    // Keep previously-rendered snapshot on listener errors
                  }
                )
              }
            }
          }
        }
      } catch (e) {
        // console.error('[PostCard] Failed to load shared post snapshot', e)
        if (!cancelled) {
          // Only surface an error for transient failures; non-existence is handled above
          setSharedPostError('Unable to load the shared post data right now.')
          setSharedOriginalMissing(false)
        }
      } finally {
        if (!cancelled) {
          setSharedPostLoading(false)
        }
      }
    }
    fetchSharedPost()
    return () => {
      cancelled = true
      if (unsubscribeOriginal) unsubscribeOriginal()
    }
  }, [post.isShare, post.sharedPostRefId, post.originalPostId, post.sharedFromPostId])

  // Fetch tagged friends data
  useEffect(() => {
    const fetchTaggedFriendsData = async () => {
      // console.log("[PostCard] Post:", post)
      // console.log("[PostCard] Tagged friends from post:", post.taggedFriends)

      if (post.taggedFriends && Array.isArray(post.taggedFriends) && post.taggedFriends.length > 0) {
        setTaggedFriendsLoading(true)
        try {
          const friendsData = await Promise.all(
            post.taggedFriends.map(async (friendId) => {
              if (!friendId || typeof friendId !== "string") {
                // console.warn("[PostCard] Invalid friend ID:", friendId)
                return { id: "unknown", name: "Unknown User" }
              }

              try {
                const userDocRef = doc(db, "users", friendId)
                const userDoc = await getDoc(userDocRef)
                if (userDoc.exists()) {
                  const userData = userDoc.data()
                  return {
                    id: friendId,
                    name: userData && typeof userData.name === "string" ? userData.name : "Unknown User",
                  }
                }
                // console.warn("[PostCard] User document not found for ID:", friendId)
                return { id: friendId, name: "Unknown User" }
              } catch (err) {
                // console.error(`[PostCard] Error fetching user ${friendId}:`, err)
                return { id: friendId, name: "Unknown User" }
              }
            }),
          )

          // Filter out any undefined or null values for extra safety
          const validFriendsData = friendsData.filter(
            (friend) => friend && typeof friend === "object" && friend.id && friend.name,
          )

          // console.log("[PostCard] Valid tagged friends data:", validFriendsData)
          setTaggedFriendsData(validFriendsData)
        } catch (error) {
          // console.error("[PostCard] Error fetching tagged friends data:", error)
          setTaggedFriendsData([]) // Set to empty array on error
        } finally {
          setTaggedFriendsLoading(false)
        }
      } else {
        // If no tagged friends, make sure we have an empty array
        // console.log("[PostCard] No tagged friends found in post")
        setTaggedFriendsData([])
      }
    }

    fetchTaggedFriendsData()
  }, [post])

  // Click outside handler for tagged friends dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (taggedFriendsRef.current && !taggedFriendsRef.current.contains(event.target as Node)) {
        setShowTaggedFriends(false)
      }
    }

    if (showTaggedFriends) {
      document.addEventListener("mousedown", handleClickOutside)
    } else {
      document.removeEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [showTaggedFriends])

  // Track when a post is viewed by a user
  useEffect(() => {
    const trackPostView = async () => {
      if (currentUser) {
        try {
          // Mark post as viewed by current user
          const updatedViewCount = await markPostAsViewed(post.id, currentUser.id)
          // Update local view count if it's different
          if (updatedViewCount !== viewCount) {
            setViewCount(updatedViewCount)
          }
        } catch (error) {
          console.error("Error tracking post view:", error)
        }
      }
    }

    trackPostView()
  }, [post.id, currentUser, viewCount])

  // Listen for post deletion from Firebase
  useEffect(() => {
    const postRef = doc(db, "posts", post.id)

    const unsubscribe = onSnapshot(
      postRef,
      (docSnapshot) => {
        if (!docSnapshot.exists()) {
          // console.log(`[PostCard] Post ${post.id} has been deleted from Firebase, resetting isHidden state`)
          // Post has been deleted from Firebase, reset the local hidden state
          // This will allow the real-time listener in the parent component to handle the removal
          setIsHidden(false)
        }
      },
      (error) => {
        // console.error(`[PostCard] Error listening to post ${post.id} for deletion:`, error)
      },
    )

    return () => unsubscribe()
  }, [post.id])

  // Handle card click to open full-screen view (mobile uses dedicated modal)
  const handleMobileCardClick = (e: React.MouseEvent) => {
    // Don't open modal if clicking on interactive elements
    const target = e.target as HTMLElement
    const isInteractiveElement = target.closest("button, a, input, textarea, .dropdown, .actions, .post-menu")

    // Close the tagged friends dropdown if it's open
    if (showTaggedFriends) {
      setShowTaggedFriends(false)
    }

    // If clicking on an interactive element, let it handle its own behavior
    if (isInteractiveElement) return

    // On mobile, open the dedicated fullscreen modal; on desktop, do nothing here
    if (isMobile) {
      setIsFullscreen(true)
    }
  }

  // Close fullscreen on Escape
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    if (isFullscreen) document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [isFullscreen])

  // When entering fullscreen, remember comment open state and force comments open. Restore on exit.
  useEffect(() => {
    if (isFullscreen) {
      prevShowCommentsRef.current = showComments
      setShowComments(true)
      // prevent background scroll
      document.body.style.overflow = "hidden"
    } else {
      // restore comment visibility
      setShowComments(prevShowCommentsRef.current)
      document.body.style.overflow = ""
    }
  }, [isFullscreen])

  // Enhanced post card styling
  const isAdminAnnouncement = post.userRole === "admin" || post.userRole === "super admin"

  // Check if the post is within 24 hours for highlighting with better type safety
  const isRecentAnnouncement = useMemo(() => {
    const postCreatedAt = post.createdAt
    if (!postCreatedAt) return false

    try {
      const now = Date.now()
      let postTime: number

      // Handle different timestamp formats
      if (typeof postCreatedAt.toDate === "function") {
        // Firestore Timestamp
        postTime = postCreatedAt.toDate().getTime()
      } else if (postCreatedAt instanceof Date) {
        // JavaScript Date
        postTime = postCreatedAt.getTime()
      } else if (typeof postCreatedAt === "string" || typeof postCreatedAt === "number") {
        // String or number timestamp
        postTime = new Date(postCreatedAt).getTime()
      } else {
        return false
      }

      const hours24 = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
      return now - postTime < hours24
    } catch (e) {
      console.error("Error checking if announcement is recent:", e)
      return false
    }
  }, [post.createdAt])

  // Only highlight admin announcements if they're recent (within 24 hours)
  const shouldHighlightAnnouncement = isAdminAnnouncement && isRecentAnnouncement

  // Instead of early return, use a variable to control rendering
  const shouldRenderPost = !isHidden && !shouldHideForMissingAuthor

  // Add debugging for delete action
  // console.log(
    // `[PostCard] Post ${post.id} - isHidden: ${isHidden}, shouldHideForMissingAuthor: ${shouldHideForMissingAuthor}, shouldRenderPost: ${shouldRenderPost}`,
  // )

  const postCardClasses = `post-card w-full max-w-full min-w-0 bg-gradient-to-b from-gray-800/90 to-gray-900/95 rounded-none sm:rounded-2xl shadow-none sm:shadow-xl border-0 sm:border border-t border-b border-gray-700/40 overflow-hidden hover:shadow-2xl hover:shadow-green-900/20 transition-all duration-300 backdrop-blur-md ${shouldHighlightAnnouncement ? "sm:ring-4 ring-0 sm:border-green-500/60 border-t-green-500/60 border-b-green-500/60 bg-gradient-to-b from-green-900/40 to-gray-900/95" : ""} ${isMobile ? "cursor-pointer touch-manipulation" : ""}`
  const editingActive = canEditPost && isEditing
  const previewActionBtnBase =
    "preview-action-btn flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white shadow-lg backdrop-blur-md transition-transform transition-colors duration-200 hover:scale-105 focus:outline-none focus-visible:ring-2"
  const previewNavBtnBase =
    "preview-nav-btn flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-md transition-transform transition-colors duration-200 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400/60"
  const previewCounterBase =
    "preview-counter bg-black/60 border border-white/10 px-4 py-2 rounded-full text-white text-sm shadow-lg backdrop-blur-md"

  // Handle post deletion - triggers confirmation modal
  const handleDelete = () => {
    console.log("Delete action triggered for post:", post.id)
    setShowDeleteConfirm(true)
    // Close the action sheet when delete confirmation is shown
    setIsActionSheetOpen(false)
  }

  // In the PostCard component, add a handler:
  const handleUnreport = async () => {
    if (!post.id) return
    await unreportPost(post.id)
    if (onPostUpdated) onPostUpdated()
  }

  return !shouldRenderPost ? null : (
    <>
      {previewOpen &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <>
            {/* Overlay background */}
            <div className="fixed inset-0 bg-black/90 z-[2147483646]" onClick={() => setPreviewOpen(false)} />
            {/* Main image centered on screen, not page */}
            <img
              src={previewImages[currentImageIndex] || "/placeholder.svg"}
              alt="Preview"
              className="fixed left-1/2 top-1/2 z-[2147483647] max-w-full max-h-full object-contain"
              style={{ transform: "translate(-50%, -50%)" }}
              onClick={(e) => e.stopPropagation()}
            />
            {/* Action buttons */}
            <div className="fixed top-6 right-6 z-[2147483648] flex flex-col items-center gap-3 sm:flex-row">
              <button
                onClick={() => downloadImage(previewImages[currentImageIndex])}
                className={`${previewActionBtnBase} hover:bg-black/75 hover:text-green-300 focus-visible:ring-green-400/70`}
                aria-label="Download image"
                title="Download"
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => setPreviewOpen(false)}
                className={`${previewActionBtnBase} hover:bg-black/80 hover:text-red-300 focus-visible:ring-red-400/70`}
                aria-label="Close preview"
                title="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            {/* Navigation buttons */}
            {previewImages.length > 1 && (
              <>
                <button
                  onClick={goToPrevious}
                  className={`${previewNavBtnBase} fixed left-6 top-1/2 -translate-y-1/2 z-[2147483649]`}
                  aria-label="Previous image"
                  title="Previous"
                >
                  <ChevronLeftIcon className="h-6 w-6" />
                </button>
                <button
                  onClick={goToNext}
                  className={`${previewNavBtnBase} fixed right-6 top-1/2 -translate-y-1/2 z-[2147483649]`}
                  aria-label="Next image"
                  title="Next"
                >
                  <ChevronRightIcon className="h-6 w-6" />
                </button>
              </>
            )}
            {/* Image counter */}
            {previewImages.length > 1 && (
              <div
                className={`${previewCounterBase} fixed bottom-6 left-1/2 z-[2147483649] -translate-x-1/2`}
              >
                {currentImageIndex + 1} / {previewImages.length}
              </div>
            )}
          </>,
          document.body,
        )}
        {videoPreviewOpen && previewVideoUrl && typeof document !== "undefined" &&
          ReactDOM.createPortal(
            <>
              <div className="fixed inset-0 bg-black/90 z-[2147483646]" onClick={() => setVideoPreviewOpen(false)} />
              <video
                src={previewVideoUrl}
                controls
                autoPlay
                className="fixed left-1/2 top-1/2 z-[2147483647] object-contain"
                style={{ transform: "translate(-50%, -50%)", maxWidth: '90vw', maxHeight: '90vh' }}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="fixed top-6 right-6 z-[2147483648] flex flex-col items-center gap-3 sm:flex-row">
                <button
                  onClick={() => downloadImage(previewVideoUrl || '')}
                  className={`${previewActionBtnBase} hover:bg-black/75 hover:text-green-300 focus-visible:ring-green-400/70`}
                  aria-label="Download video"
                  title="Download"
                >
                  <ArrowDownTrayIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setVideoPreviewOpen(false)}
                  className={`${previewActionBtnBase} hover:bg-black/80 hover:text-red-300 focus-visible:ring-red-400/70`}
                  aria-label="Close preview"
                  title="Close"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </>,
            document.body,
          )}
        {attachmentPreviewOpen && attachmentPreviewUrl && typeof document !== 'undefined' && ReactDOM.createPortal(
          <>
            <div className="fixed inset-0 bg-black/90 z-[2147483646]" onClick={() => setAttachmentPreviewOpen(false)} />
            <div className="fixed left-1/2 top-1/2 z-[2147483647] max-w-[92vw] w-full max-h-[92vh] overflow-auto" style={{ transform: 'translate(-50%, -50%)' }} onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto bg-gray-900 rounded-2xl border border-gray-700/40 shadow-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/40">
                  <div className="flex items-center gap-3">
                    <DocumentTextIcon className="h-5 w-5 text-gray-200" />
                    <div className="text-sm text-white truncate max-w-[60vw]">{attachmentPreviewName}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-1 rounded bg-gray-800/60 border border-gray-700/50 text-xs text-gray-200 hover:bg-gray-700/60" onClick={() => { if (attachmentPreviewUrl) downloadFile(attachmentPreviewUrl, attachmentPreviewName || undefined, attachmentPreviewStoragePath); }}>
                      <ArrowDownTrayIcon className="h-4 w-4 inline" />
                      <span className="ml-2">Download</span>
                    </button>
                    <button className="px-3 py-1 rounded bg-gray-800/60 border border-gray-700/50 text-xs text-gray-200 hover:bg-gray-700/60" onClick={() => setAttachmentPreviewOpen(false)}>
                      Close
                    </button>
                  </div>
                </div>
                {/* Body */}
                <div className="p-4">
                  {attachmentPreviewMime === 'pdf' ? (
                    <iframe src={processStorageUrl(attachmentPreviewUrl)} title={attachmentPreviewName || 'Preview'} className="w-full h-[70vh] bg-gray-800" />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-sm text-gray-300">
                      <div className="inline-flex items-center gap-2 rounded-full border border-dashed border-gray-700/60 bg-gray-800/60 px-4 py-2 text-gray-200">
                        <NoSymbolIcon className="h-4 w-4 text-gray-300" />
                        <span className="font-medium">Preview not available</span>
                      </div>
                      <p className="text-xs text-gray-400">Use the download button above to access this file.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>, document.body
        )}
      <div id={`post-${post.id}`} className={postCardClasses} onClick={handleMobileCardClick}>
        {/* Post Header */}
        <div className="py-5 px-3 sm:p-7 border-b border-gray-800/40 bg-gray-900/80 relative w-full max-w-full">
          {/* Options button - visible only on desktop and positioned absolutely in top right */}
          {!isMobile && (
            <div className="absolute top-3 right-3 z-50" onClick={(e) => e.stopPropagation()}>
              <div className="relative flex items-center gap-2">
                {/* Desktop: Fullscreen toggle placed beside post menu button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsFullscreen((s) => !s)
                  }}
                  aria-label={isFullscreen ? "Exit full screen" : "Open full screen"}
                  aria-pressed={isFullscreen}
                  title={isFullscreen ? "Exit full screen" : "Open full screen"}
                  className="p-1.5 rounded-full bg-transparent hover:bg-gray-800/80 active:bg-gray-700 transition-colors focus:outline-none focus:ring-1 focus:ring-green-500/40 touch-manipulation"
                >
                  {isFullscreen ? (
                    // Close icon when in fullscreen
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    // Enter fullscreen icon
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9V6a1 1 0 011-1h3M21 15v3a1 1 0 01-1 1h-3M21 9V6a1 1 0 00-1-1h-3M3 15v3a1 1 0 001 1h3" />
                    </svg>
                  )}
                </button>

                <div className="relative">
                  <button
                    ref={headerMenuBtnRef}
                    className="p-1.5 rounded-full  bg-transparent hover:bg-gray-800/80 active:bg-gray-700 transition-colors focus:outline-none focus:ring-1 focus:ring-green-500/40 touch-manipulation"
                    aria-label="Post options"
                    onClick={() => {
                      // If a fullscreen modal is active, ignore the header dropdown toggle to avoid opening the background card dropdown
                      if (isFullscreen) {
                        console.log("🔘 Header post options click ignored because fullscreen modal is active for post:", post.id)
                        return
                      }
                      console.log("🔘 Desktop: Toggling post action sheet for post:", post.id)
                      console.log("🔘 Device is mobile:", isMobile)
                      console.log("🔘 Current isActionSheetOpen:", isActionSheetOpen)
                      console.log("🔘 Post author check:", {
                        currentUserId: currentUser?.id,
                        postAuthorId: post.userId,
                        isAuthor,
                      })
                      console.log("🔘 Admin check:", { userRole: currentUser?.role, isAdminOrSuperAdmin })
                      setIsActionSheetOpen(!isActionSheetOpen)
                      console.log("🔘 isActionSheetOpen toggled to:", !isActionSheetOpen)
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
                      />
                    </svg>
                  </button>

                  <PostActionSheet
                    post={post}
                    isAuthor={isAuthor}
                    onEdit={handleStartEdit}
                    onDelete={handleDelete}
                    onHide={handleHide}
                    isMobile={isMobile}
                    isAdminOrSuperAdmin={isAdminOrSuperAdmin}
                    onShare={handleShare}
                    onReport={handleReport}
                    onWarn={() => setShowWarnConfirm(true)}
                    onActionComplete={(action) => {
                      // console.log(`[PostCard] Post action completed: ${action} for post ${post.id}`)
                      // Additional handling for specific actions if needed
                      if (action === "delete" || action === "hide") {
                        // console.log(`[PostCard] Setting isHidden to true for post ${post.id}`)
                        // Set local state to hide the post immediately for better user experience
                        if (action === "delete") {
                          setIsHidden(true)
                        }
                        if (onPostUpdated) {
                          // console.log(`[PostCard] Calling onPostUpdated for post ${post.id}`)
                          onPostUpdated()
                        }
                      }
                    }}
                    isOpen={isActionSheetOpen}
                    onClose={() => setIsActionSheetOpen(false)}
                    onUnreport={handleUnreport}
                    currentFilter={currentFilter}
                    currentUserRole={currentUserRole}
                    canEdit={canEditPost}
                    anchorRef={headerMenuBtnRef}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 min-w-0 w-full">
            <div className="relative">
              {userInfoLoading ? (
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-green-500 bg-gray-700/60 shadow-md animate-pulse"></div>
              ) : profilePic ? (
                <img
                  src={profilePic || "/placeholder.svg"}
                  alt={displayName}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-green-500 object-cover shadow-md cursor-pointer hover:border-blue-400 transition-all duration-200"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.onerror = null
                    target.src = "/images/default-avatar.png"
                  }}
                  onClick={handleProfileClick}
                  title={`View ${displayName}'s profile`}
                />
              ) : (
                <div
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-green-500 bg-gray-800 flex items-center justify-center text-green-400 font-bold text-xl shadow-md cursor-pointer hover:border-blue-400 transition-all duration-200"
                  onClick={handleProfileClick}
                  title={`View ${displayName}'s profile`}
                >
                  {displayName ? displayName.charAt(0).toUpperCase() : "U"}
                </div>
              )}
              {post.userRole && (
                <div className="absolute -bottom-1 -right-1">
                  <RoleBadge
                    role={post.userRole}
                    size="medium"
                    className="border border-white/20"
                    isSpaceAdmin={post.userRole === "admin" || post.userRole === "super admin"}
                  />
                </div>
              )}
              {/* Pin indicator has been removed */}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-lg font-semibold text-white leading-tight break-words">
                {userInfoLoading && !displayName ? (
                  <span className="h-6 bg-gray-700/70 rounded-md w-32 inline-block animate-pulse"></span>
                ) : (
                  <>
                    <span
                      className="hover:text-blue-400 cursor-pointer transition-colors duration-200"
                      onClick={handleProfileClick}
                      title={`View ${displayName}'s profile`}
                    >
                      {displayName}
                    </span>
                    {post.isShare && (
                      <span className="ml-2 text-sm font-normal text-gray-300">
                        <span className="text-gray-400">shared a post from</span>{" "}
                        <span className="text-green-400">
                          {sharedPostDetails?.originalPostAuthorName || post.sharedFromUserName || "an account"}
                        </span>
                      </span>
                    )}

                    {/* Tagged Friends */}
                    {post.taggedFriends && Array.isArray(post.taggedFriends) && post.taggedFriends.length > 0 && (
                      <span className="text-gray-300 text-sm font-normal ml-1">
                        {taggedFriendsLoading ? (
                          <span className="h-4 bg-gray-700/70 rounded-md w-16 inline-block animate-pulse align-middle ml-1"></span>
                        ) : (
                          <span className="text-green-400">
                            {Array.isArray(taggedFriendsData) &&
                            taggedFriendsData.length === 1 &&
                            taggedFriendsData[0] &&
                            taggedFriendsData[0].id ? (
                              <>
                                with{" "}
                                <span
                                  onClick={(e) => handleTaggedFriendClick(e, taggedFriendsData[0].id || "")}
                                  className="text-green-400 hover:text-green-300 cursor-pointer hover:underline"
                                >
                                  {taggedFriendsData[0].name || "a friend"}
                                </span>
                              </>
                            ) : Array.isArray(taggedFriendsData) &&
                              taggedFriendsData.length === 2 &&
                              taggedFriendsData[0] &&
                              taggedFriendsData[0].id &&
                              taggedFriendsData[1] &&
                              taggedFriendsData[1].id ? (
                              <>
                                with{" "}
                                <span
                                  onClick={(e) => handleTaggedFriendClick(e, taggedFriendsData[0].id || "")}
                                  className="text-green-400 hover:text-green-300 cursor-pointer hover:underline"
                                >
                                  {taggedFriendsData[0].name || "a friend"}
                                </span>{" "}
                                and{" "}
                                <span
                                  onClick={(e) => handleTaggedFriendClick(e, taggedFriendsData[1].id || "")}
                                  className="text-green-400 hover:text-green-300 cursor-pointer hover:underline"
                                >
                                  {taggedFriendsData[1].name || "another friend"}
                                </span>
                              </>
                            ) : Array.isArray(taggedFriendsData) &&
                              taggedFriendsData.length > 2 &&
                              taggedFriendsData[0] &&
                              taggedFriendsData[0].id ? (
                              <>
                                with{" "}
                                <span
                                  onClick={(e) => handleTaggedFriendClick(e, taggedFriendsData[0].id || "")}
                                  className="text-green-400 hover:text-green-300 cursor-pointer hover:underline"
                                >
                                  {taggedFriendsData[0].name || "a friend"}
                                </span>{" "}
                                and{" "}
                                <span
                                  className="text-green-400 hover:text-green-300 cursor-pointer hover:underline"
                                  onClick={(e) => setShowTaggedFriends(!showTaggedFriends)}
                                >
                                  {taggedFriendsData.length - 1} others
                                </span>
                              </>
                            ) : (
                              <>with friends</>
                            )}
                          </span>
                        )}
                      </span>
                    )}

                    {/* Tagged Groups (for Super Admin posts) */}
                    {post.taggedGroups && Array.isArray(post.taggedGroups) && post.taggedGroups.length > 0 && (
                      <span className="text-cyan-400 text-sm font-bold ml-1">{getTaggedGroupsDisplayText()}</span>
                    )}
                  </>
                )}
                {isAdminAnnouncement && (
                  <>
                    <span
                      className={`ml-2 px-2 py-0.5 rounded-full ${shouldHighlightAnnouncement ? "bg-green-600/80 text-white font-bold animate-pulse" : "bg-gray-700/80 text-gray-300 font-semibold"} text-xs align-middle announcement-badge`}
                    >
                      Announcement
                    </span>
                  </>
                )}
                {currentFilter === "reported" &&
                  (currentUserRole === "admin" || currentUserRole === "super admin") &&
                  post.reported &&
                  post.reportReason && (
                    <>
                      <ReportBadge reason={post.reportReason} className="ml-2" />
                      {typeof post.reportCount === "number" && post.reportCount > 0 && (
                        <span className="ml-1 px-2 py-0.5 rounded-full bg-red-700 text-white text-xs font-bold align-middle">
                          {post.reportCount} report{post.reportCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </>
                  )}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-gray-400">{formattedDate}</p>
                {post.visibility === 'public' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-700/60 text-green-100 text-xs font-semibold">
                    <GlobeAltIcon className="w-3 h-3 text-green-200" />
                    <span>Everyone</span>
                  </span>
                )}
              </div>

              {/* Tagged Friends Dropdown */}
              {showTaggedFriends && taggedFriendsData.length > 0 && (
                <div
                  ref={taggedFriendsRef}
                  className="mt-1.5 ml-2 z-30 absolute bg-gray-900/95 backdrop-blur-sm border border-green-600/30 rounded shadow-xl p-2 max-w-[200px] max-h-[150px] overflow-y-auto scrollbar-thin scrollbar-thumb-green-900 scrollbar-track-gray-800"
                >
                  <h4 className="text-xs text-green-400 font-medium mb-1.5 border-b border-green-600/20 pb-1">
                    Tagged Friends
                  </h4>
                  <div className="space-y-1.5">
                    {taggedFriendsData.map((friend) => (
                      <div
                        key={friend.id}
                        onClick={(e) => handleTaggedFriendClick(e, friend.id)}
                        className="text-xs text-gray-300 hover:text-green-300 cursor-pointer flex items-center p-1 hover:bg-green-800/20 rounded transition-colors"
                      >
                        <div className="w-5 h-5 bg-green-900/40 rounded-full border border-green-600/30 flex items-center justify-center text-[9px] text-green-400 mr-1.5 flex-shrink-0">
                          {friend.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="hover:underline truncate">{friend.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center ml-auto" onClick={(e) => e.stopPropagation()}>
                {/* Desktop-only: View button moved to the top-right options area */}

              {/* Add an action button to open the action sheet - only visible on mobile */}
              {isMobile && (
                <button
                  className="p-1.5 rounded-full hover:bg-gray-800/80 active:bg-gray-700 transition-colors focus:outline-none focus:ring-1 focus:ring-green-500/40 touch-manipulation"
                  aria-label="Post options"
                  onClick={() => {
                    console.log("🔘 Mobile: Toggling post action sheet for post:", post.id)
                    console.log("🔘 Device is mobile:", isMobile)
                    console.log("🔘 Current isActionSheetOpen:", isActionSheetOpen)
                    console.log("🔘 Post author check:", {
                      currentUserId: currentUser?.id,
                      postAuthorId: post.userId,
                      isAuthor,
                    })
                    console.log("🔘 Admin check:", { userRole: currentUser?.role, isAdminOrSuperAdmin })
                    setIsActionSheetOpen(!isActionSheetOpen)
                    console.log("🔘 isActionSheetOpen toggled to:", !isActionSheetOpen)
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Mobile Action Sheet */}
          {isMobile && isActionSheetOpen && (
            <PostActionSheet
              post={post}
              isAuthor={isAuthor}
              onEdit={handleStartEdit}
              onDelete={handleDelete}
              onHide={handleHide}
              isMobile={isMobile}
              isAdminOrSuperAdmin={isAdminOrSuperAdmin}
              onShare={handleShare}
              onReport={handleReport}
              onWarn={() => setShowWarnConfirm(true)}
              onActionComplete={(action) => {
                // console.log(`[PostCard] Mobile post action completed: ${action} for post ${post.id}`)
                // Additional handling for specific actions if needed
                if (action === "delete" || action === "hide") {
                  // console.log(`[PostCard] Mobile setting isHidden to true for post ${post.id}`)
                  // Set local state to hide the post immediately for better user experience
                  if (action === "delete") {
                    setIsHidden(true)
                  }
                  if (onPostUpdated) {
                    // console.log(`[PostCard] Mobile calling onPostUpdated for post ${post.id}`)
                    onPostUpdated()
                  }
                }
              }}
              isOpen={isActionSheetOpen}
              onClose={() => setIsActionSheetOpen(false)}
              onUnreport={handleUnreport}
              currentFilter={currentFilter}
              currentUserRole={currentUserRole}
              canEdit={canEditPost}
            />
          )}
        </div>
        {/* Post Content */}
        <div className="px-3 sm:px-8 py-6 sm:py-8 bg-gray-900/70 w-full max-w-full">
          {editingActive ? (
            <div className="relative">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full p-2.5 sm:p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg text-sm sm:text-base text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-transparent"
                rows={4}
              />
              {/* Media edit controls (inline) */}
              {isEditing && (
                <div className="mt-3 flex flex-col gap-2">
                  {editedMedia && editedMedia.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {editedMedia.map((m, i) => (
                        <div key={i} className="flex items-center gap-2 bg-gray-800/50 border border-gray-700/50 rounded px-2 py-1">
                          <span className="text-xs text-gray-200 truncate max-w-xs">{m.name || (m.url || '').split('/').pop()}</span>
                          <button type="button" onClick={() => triggerReplace(i)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white">Replace</button>
                          <button type="button" onClick={() => handleRemoveMedia(i)} className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs text-white">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <button type="button" onClick={() => { replaceIndexRef.current = null; if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); } }} className="px-3 py-1.5 bg-gray-800/60 hover:bg-gray-700 rounded text-sm text-white">Add media</button>
                  </div>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-800/80 text-[10px] sm:text-xs">
                    {getVisibilityIcon(editedVisibility)}
                    <span className="ml-1">{getVisibilityLabel(editedVisibility)}</span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditSubmit}
                    disabled={!editedContent.trim() || isSubmitting}
                    className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm rounded-md text-white ${
                      editedContent.trim() && !isSubmitting
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-gray-700 cursor-not-allowed"
                    } transition-colors flex items-center gap-1`}
                  >
                    {isSubmitting ? (
                      <div className="h-3 w-3 sm:h-4 sm:w-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                    ) : (
                      <CheckIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                    )}
                    <span>Save</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="post-content text-base sm:text-lg text-gray-200 space-y-4 break-words text-justify hyphens-auto leading-relaxed">
                {userInfoLoading && !post.content.trim() ? (
                  // Show loading skeleton for content
                  <div className="space-y-3">
                    <div className="h-5 bg-gray-700/50 rounded-md animate-pulse w-11/12"></div>
                    <div className="h-5 bg-gray-700/50 rounded-md animate-pulse w-10/12"></div>
                    <div className="h-5 bg-gray-700/50 rounded-md animate-pulse w-9/12"></div>
                  </div>
                ) : (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: processPostContent(),
                    }}
                    onClick={(e) => {
                      if (
                        e.target instanceof HTMLElement &&
                        e.target.tagName === "BUTTON" &&
                        e.target.closest(".see-more-inline")
                      ) {
                        setIsContentExpanded(true)
                      }
                    }}
                  />
                )}
                {post.content.length > (isMobile ? 200 : 800) && isContentExpanded && (
                  <div className="text-right mt-2">
                    <button
                      onClick={() => setIsContentExpanded(false)}
                      style={{
                        color: "#22c55e",
                        fontWeight: 500,
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        WebkitTextFillColor: "#22c55e",
                        textShadow: "0 0 0 #22c55e",
                      }}
                      className="text-green-500 hover:text-green-400 text-sm font-medium inline-block transition-colors"
                    >
                      See less
                    </button>
                  </div>
                )}
              </div>
              {post.isShare && (
                <div className="mt-4 border border-gray-800/60 rounded-xl bg-gray-900/60 p-4">
                  {sharedPostLoading && (
                    <div className="space-y-3">
                      <div className="h-4 bg-gray-800/70 rounded w-1/2 animate-pulse"></div>
                      <div className="h-4 bg-gray-800/70 rounded w-full animate-pulse"></div>
                      <div className="h-4 bg-gray-800/70 rounded w-5/6 animate-pulse"></div>
                    </div>
                  )}
                  {!sharedPostLoading && sharedPostError && (
                    <p className="text-sm text-red-400">{sharedPostError}</p>
                  )}
                  {!sharedPostLoading && !sharedPostError && sharedPostDetails && (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                              {(sharedPostDetails && (sharedPostDetails as any).originalPostAuthorProfilePic) ? (
                                <img
                                  src={(sharedPostDetails && (sharedPostDetails as any).originalPostAuthorProfilePic)}
                                  alt={(sharedPostDetails && (sharedPostDetails as any).originalPostAuthorName) || post.originalPostUserName || (post as any).sharedFromUserName || 'User'}
                                  className="w-9 h-9 rounded-lg object-cover border border-gray-700/40 hover:border-green-500/30 cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const authorId = (sharedPostDetails && (sharedPostDetails as any).originalPostAuthorId) || post.originalPostUserId || (post as any).sharedFromUserId
                                    if (authorId) navigate(`/profile/${authorId}`)
                                  }}
                                  onError={(e) => { const target = e.target as HTMLImageElement; target.onerror = null; target.src = '/images/default-avatar.png' }}
                                />
                              ) : (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const authorId = (sharedPostDetails && (sharedPostDetails as any).originalPostAuthorId) || post.originalPostUserId || (post as any).sharedFromUserId
                                    if (authorId) navigate(`/profile/${authorId}`)
                                  }}
                                  className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center text-green-400 font-bold text-sm border border-gray-700/40 cursor-pointer"
                                >
                                  {((sharedPostDetails && (sharedPostDetails as any).originalPostAuthorName) || post.originalPostUserName || (post as any).sharedFromUserName || 'U').charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm text-gray-400">
                                Original post by{" "}
                                <span className="text-green-400 font-semibold">
                                  {sharedPostDetails.originalPostAuthorName || "BulSU Space user"}
                                </span>
                              </span>
                              {(() => {
                                const source = sharedPostDetails.originalPostCreatedAt
                                if (!source) return null
                                try {
                                  let date: Date
                                  if (typeof (source as any).toDate === "function") {
                                    date = (source as any).toDate()
                                  } else if (source instanceof Date) {
                                    date = source
                                  } else {
                                    date = new Date(source as any)
                                  }
                                  if (!Number.isNaN(date.getTime())) {
                                    return <span className="text-xs text-gray-500">{format(date, "MMM d, yyyy • h:mm a")}</span>
                                  }
                                } catch (_) {
                                  return null
                                }
                                return null
                              })()}
                            </div>
                          </div>
                        </div>
                        {(() => {
                          // Determine root original post ID from available sources
                          const originalId =
                            (sharedPostDetails && (sharedPostDetails as any).originalPostId) ||
                            post.originalPostId ||
                            (post as any).sharedFromPostId ||
                            null

                          if (!originalId) return null

                          return (
                            <div className="ml-3 flex-shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  try {
                                    const encodedOriginalId = encodeURIComponent(String(originalId))
                                    const highlightEventKey = Date.now()
                                    navigate(`/feed?highlight=${encodedOriginalId}&highlightEvent=${highlightEventKey}`)
                                  } catch (err) {
                                    // console.error('[PostCard] Failed to navigate to original post highlight', err)
                                  }
                                }}
                                className="px-2 py-1 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-green-300 border border-gray-700/60"
                              >
                                View original
                              </button>
                            </div>
                          )
                        })()}
                      </div>
                      {sharedPostDetails.originalPostContent ? (
                        <div
                          className="text-sm text-gray-100 leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(sharedPostDetails.originalPostContent.replace(/\n/g, "<br>")),
                          }}
                        />
                      ) : null}
                      {sharedPostDetails.originalPostMedia && sharedPostDetails.originalPostMedia.length > 0 && (
                        <div className="mt-2">
                          {(() => {
                            const raw: any[] = sharedPostDetails.originalPostMedia || []
                            // Normalize items into { type, url, name, storagePath }
                            const normalized = raw
                              .map((mi) => {
                                if (!mi) return null
                                const url = typeof mi === 'string' ? mi : (mi.url || '')
                                if (!url) return null
                                const resolved = processStorageUrl(url)
                                const type = (mi && mi.type) || detectType(resolved)
                                return {
                                  type,
                                  url: resolved,
                                  name: mi && mi.name ? mi.name : typeof mi === 'string' ? undefined : (mi.url || '').split('/').pop(),
                                  storagePath: mi && mi.storagePath ? mi.storagePath : undefined,
                                }
                              })
                              .filter(Boolean) as { type: string; url: string; name?: string; storagePath?: string }[]

                            const imageItems = normalized.filter((i) => i.type === 'image')
                            const documentItems = normalized.filter((i) => i.type === 'document')
                            const visualMediaItems = normalized.filter((i) => i.type === 'image' || i.type === 'video')
                            const imageUrls = imageItems.map((i) => i.url)
                            const imageIndexMap = new Map<string, number>()
                            imageItems.forEach((it, idx) => imageIndexMap.set(it.url, idx))

                            if (!normalized.length) return null

                            // Visual grid rendering (same logic as main media area)
                            const visualCount = visualMediaItems.length
                            const displayedItems = visualMediaItems.slice(0, Math.min(4, visualCount))
                            const remainingCount = visualCount > 4 ? visualCount - 4 : 0
                            const mediaObjectFitClass = visualCount === 1 ? 'w-full h-full object-contain' : 'w-full h-full object-cover'

                            const visualSection = (() => {
                              if (!visualCount) return null
                              let containerClasses = 'relative grid gap-0 overflow-hidden rounded-2xl border border-gray-700/40 bg-gray-800/60 shadow'
                              const containerStyle: React.CSSProperties = { gridAutoRows: 'minmax(0, 1fr)' }
                              if (visualCount === 1) {
                                containerClasses += ' grid-cols-1'
                                containerStyle.aspectRatio = '16 / 9'
                              } else if (visualCount === 2) {
                                containerClasses += ' grid-cols-2'
                                containerStyle.aspectRatio = '3 / 2'
                              } else {
                                containerClasses += ' grid-cols-2'
                                containerStyle.gridTemplateRows = 'repeat(2, minmax(0, 1fr))'
                                containerStyle.aspectRatio = visualCount === 3 ? '3 / 2' : '1'
                              }

                              return (
                                <div className={containerClasses} style={containerStyle}>
                                  {displayedItems.map((item, index) => {
                                    const isTrailingWideTile = visualCount === 3 && index === 2
                                    const isOverflowTile = remainingCount > 0 && index === 3
                                    const tileClasses = [
                                      'relative flex items-center justify-center bg-black',
                                      'overflow-hidden',
                                      'w-full h-full',
                                      'cursor-pointer',
                                      '!p-0',
                                      '!px-0',
                                      '!py-0',
                                      'focus:outline-none',
                                      'focus-visible:ring-2',
                                      'focus-visible:ring-green-400/60',
                                      'border-0',
                                    ]

                                    if (isTrailingWideTile) {
                                      tileClasses.push('col-span-2')
                                    }

                                    const borderClasses: string[] = []
                                    if (visualCount === 2) {
                                      if (index === 0) borderClasses.push('border-r border-r-green-500/60')
                                    } else if (visualCount === 3) {
                                      if (index === 0) {
                                        borderClasses.push('border-r border-r-green-500/60', 'border-b border-b-green-500/60')
                                      }
                                      if (index === 1) {
                                        borderClasses.push('border-b border-b-green-500/60')
                                      }
                                    } else if (visualCount >= 4) {
                                      if (index === 0 || index === 2) borderClasses.push('border-r border-r-green-500/60')
                                      if (index === 0 || index === 1) borderClasses.push('border-b border-b-green-500/60')
                                    }

                                    if (borderClasses.length) tileClasses.push(...borderClasses)

                                    const handleVisualTileClick = (it: any) => {
                                      if (it.type === 'video') {
                                        openVideoPreview(it.url)
                                        return
                                      }
                                      const imageIndex = imageIndexMap.get(it.url) ?? 0
                                      openImagePreview(imageUrls, imageIndex)
                                    }

                                    return (
                                      <button
                                        type="button"
                                        key={getStableMediaItemKey('shared-visual', post.id, item, index)}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleVisualTileClick(item)
                                        }}
                                        className={tileClasses.join(' ')}
                                      >
                                        <SmartMedia
                                          type={item.type === 'video' ? 'video' : undefined}
                                          src={item.url}
                                          videoProps={
                                            item.type === 'video'
                                              ? {
                                                  controls: true,
                                                  className: mediaObjectFitClass,
                                                  onClick: (ev: any) => {
                                                    ev.preventDefault()
                                                    ev.stopPropagation()
                                                    try { (ev.currentTarget as HTMLVideoElement).pause() } catch (err) {}
                                                    handleVisualTileClick(item)
                                                  },
                                                  onTouchStart: (ev: any) => {
                                                    ev.preventDefault()
                                                    ev.stopPropagation()
                                                    try { (ev.currentTarget as HTMLVideoElement).pause() } catch (err) {}
                                                    handleVisualTileClick(item)
                                                  },
                                                }
                                              : undefined
                                          }
                                          className={mediaObjectFitClass}
                                          skeletonClassName="w-full h-full"
                                        />
                                        {isOverflowTile && (
                                          <div className="absolute inset-0 bg-black/65 flex items-center justify-center pointer-events-none">
                                            <span className="text-white text-3xl font-semibold">+{remainingCount}</span>
                                          </div>
                                        )}
                                      </button>
                                    )
                                  })}
                                </div>
                              )
                            })()

                            const documentSection = documentItems.length > 0 ? (
                              <div className="flex flex-wrap items-start gap-2 mt-3">
                                {documentItems.map((item, idx) => {
                                  const url = item.url
                                  const name = item.name || 'File'
                                  const extMatch = name.match(/\.([a-zA-Z0-9]+)$/)
                                  const ext = extMatch ? extMatch[1].toLowerCase() : ''
                                  return (
                                    <button
                                      key={getStableMediaItemKey('shared-doc', post.id, item, idx)}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        e.preventDefault()
                                        setAttachmentPreviewUrl(url)
                                        setAttachmentPreviewName(name)
                                        setAttachmentPreviewMime(ext)
                                        setAttachmentPreviewStoragePath(item.storagePath || null)
                                        setAttachmentPreviewOpen(true)
                                      }}
                                      className="flex items-center bg-gradient-to-r from-gray-800/60 via-gray-700/40 to-green-900/30 border border-gray-700/30 rounded-lg shadow px-3 py-2 my-1 min-w-0 max-w-xs hover:from-gray-800/80 hover:to-green-800/50 hover:shadow-green-900/10 transition-colors group backdrop-blur-sm text-white hover:text-green-100 text-left"
                                    >
                                      <div className="flex items-center gap-2">
                                        <DocumentTextIcon className="h-5 w-5 text-gray-300" />
                                        <span className="text-sm text-gray-200 truncate max-w-[200px]">{name}</span>
                                      </div>
                                      <div className="ml-auto flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); downloadFile(url, name, item.storagePath); }}
                                          className="px-2 py-1 rounded bg-gray-800/60 border border-gray-700/50 text-xs text-gray-200 hover:bg-gray-700/60 transition-colors"
                                        >
                                          <ArrowDownTrayIcon className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null

                            return (
                              <div className="space-y-3">
                                {visualSection}
                                {documentSection}
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                  {!sharedPostLoading && !sharedPostError && !sharedPostDetails && (
                    <p className="text-sm text-gray-400">This original post is no longer available.</p>
                  )}
                </div>
              )}

              {/* Poll Display */}
              {post.isPoll && polls.length > 0 && (
                <div className="mt-4">
                  {pollsLoading ? (
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/30">
                      <div className="animate-pulse">
                        <div className="h-4 bg-gray-700 rounded mb-3"></div>
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="h-8 bg-gray-700 rounded"></div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    polls.map((poll) => (
                      <PollCard key={poll.id} poll={poll} />
                    ))
                  )}
                </div>
              )}
              
              {/* Post Media (if any) */}
              {/* Media Section (normalized + consistent SmartMedia usage) */}
              {(resolvedMedia && resolvedMedia.length > 0) ? (
                <div ref={mediaContainerRef} className="mt-6">
                  {(() => {
                    const mediaItems: (string | MediaItem)[] = resolvedMedia

                    type NormalizedMedia = {
                      type: 'image' | 'video' | 'document'
                      url: string
                      name?: string
                      size?: number
                      thumbnailUrl?: string
                      storagePath?: string
                      original?: string | MediaItem
                    }

                    const normalizedMedia = mediaItems.map<NormalizedMedia>((item) => {
                      if (typeof item === 'string') {
                        const url = item
                        return {
                          type: detectType(url),
                          url,
                          name: extractNameFromUrl(url),
                          original: item,
                        }
                      }

                      const url = item.url
                      return {
                        type: item.type || detectType(url),
                        url,
                        name: item.name || extractNameFromUrl(url),
                        size: item.size,
                        thumbnailUrl: item.thumbnailUrl,
                        storagePath: item.storagePath,
                        original: item,
                      }
                    })

                    const imageItems = normalizedMedia.filter((item) => item.type === "image")
                    const documentItems = normalizedMedia.filter((item) => item.type === "document")
                    const visualMediaItems = normalizedMedia.filter((item) => item.type === "image" || item.type === "video")
                    const imageUrls = imageItems.map((item) => item.url).filter(Boolean)
                    const imageIndexMap = new Map<string, number>()
                    imageItems.forEach((item, idx) => {
                      if (item.url) {
                        imageIndexMap.set(item.url, idx)
                      }
                    })

                    if (mediaLoading) {
                      // Show skeleton placeholders shaped like the eventual media layout
                      const count = (mediaItems && mediaItems.length) || 1
                      const one = count === 1
                      const two = count === 2
                      const three = count === 3
                      const fourPlus = count >= 4

                      const SkeletonTile = ({ className = "" }: { className?: string }) => (
                        <div className={"bg-gray-700/60 animate-pulse " + className} />
                      )

                      return (
                        <div className="w-full flex items-center justify-center py-4">
                          {one && (
                            <div className="w-full rounded-2xl overflow-hidden border border-gray-700/40 shadow bg-gray-800/40" style={{ aspectRatio: '16/9' }}>
                              <SkeletonTile className="w-full h-full" />
                            </div>
                          )}

                          {two && (
                            <div className="grid grid-cols-2 gap-3 w-full">
                              <div className="rounded-2xl overflow-hidden border border-gray-700/40 shadow bg-gray-800/40" style={{ aspectRatio: '3/2' }}>
                                <SkeletonTile className="w-full h-full" />
                              </div>
                              <div className="rounded-2xl overflow-hidden border border-gray-700/40 shadow bg-gray-800/40" style={{ aspectRatio: '3/2' }}>
                                <SkeletonTile className="w-full h-full" />
                              </div>
                            </div>
                          )}

                          {three && (
                            <div className="grid grid-cols-2 gap-3 w-full" style={{ gridTemplateRows: 'repeat(2, minmax(0, 1fr))' }}>
                              <div className="rounded-2xl overflow-hidden border border-gray-700/40 shadow bg-gray-800/40" style={{ aspectRatio: '3/2' }}>
                                <SkeletonTile className="w-full h-full" />
                              </div>
                              <div className="rounded-2xl overflow-hidden border border-gray-700/40 shadow bg-gray-800/40" style={{ aspectRatio: '3/2' }}>
                                <SkeletonTile className="w-full h-full" />
                              </div>
                              <div className="col-span-2 rounded-2xl overflow-hidden border border-gray-700/40 shadow bg-gray-800/40" style={{ aspectRatio: '3/2' }}>
                                <SkeletonTile className="w-full h-full" />
                              </div>
                            </div>
                          )}

                          {fourPlus && (
                            <div className="grid grid-cols-2 gap-3 w-full">
                              <div className="rounded-2xl overflow-hidden border border-gray-700/40 shadow bg-gray-800/40" style={{ aspectRatio: '1' }}>
                                <SkeletonTile className="w-full h-full" />
                              </div>
                              <div className="rounded-2xl overflow-hidden border border-gray-700/40 shadow bg-gray-800/40" style={{ aspectRatio: '1' }}>
                                <SkeletonTile className="w-full h-full" />
                              </div>
                              <div className="rounded-2xl overflow-hidden border border-gray-700/40 shadow bg-gray-800/40" style={{ aspectRatio: '1' }}>
                                <SkeletonTile className="w-full h-full" />
                              </div>
                              <div className="rounded-2xl overflow-hidden border border-gray-700/40 shadow bg-gray-800/40" style={{ aspectRatio: '1' }}>
                                <SkeletonTile className="w-full h-full" />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    }
                    if (mediaError && !mediaItems.length) {
                      return (
                        <div className="w-full flex flex-col items-center justify-center gap-3 py-8 text-sm text-gray-400">
                          <span>Failed to load media.</span>
                          <button onClick={refreshAllMedia} className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs border border-gray-600">Retry</button>
                        </div>
                      )
                    }

                    // If only one video and no images, render video full width outside grid
                    const handleVisualTileClick = (item: NormalizedMedia) => {
                      if (item.type === "video") {
                        openVideoPreview(processStorageUrl(item.url))
                        return
                      }
                      const imageIndex = imageIndexMap.get(item.url) ?? 0
                      openImagePreview(imageUrls, imageIndex)
                    }

                    const visualSection = (() => {
                      const visualCount = visualMediaItems.length
                      if (!visualCount) {
                        return null
                      }

                      const displayedItems = visualMediaItems.slice(0, Math.min(4, visualCount))
                      const remainingCount = visualCount > 4 ? visualCount - 4 : 0
                      const mediaObjectFitClass = visualCount === 1 ? "w-full h-full object-contain" : "w-full h-full object-cover"

                      let containerClasses = "relative grid gap-0 overflow-hidden rounded-2xl border border-gray-700/40 bg-gray-800/60 shadow"
                      const containerStyle: React.CSSProperties = {
                        gridAutoRows: "minmax(0, 1fr)",
                      }

                      if (visualCount === 1) {
                        containerClasses += " grid-cols-1"
                        containerStyle.aspectRatio = "16 / 9"
                      } else if (visualCount === 2) {
                        containerClasses += " grid-cols-2"
                        containerStyle.aspectRatio = "3 / 2"
                      } else {
                        containerClasses += " grid-cols-2"
                        containerStyle.gridTemplateRows = "repeat(2, minmax(0, 1fr))"
                        containerStyle.aspectRatio = visualCount === 3 ? "3 / 2" : "1"
                      }

                      return (
                        <div className={containerClasses} style={containerStyle}>
                          {displayedItems.map((item, index) => {
                            const isTrailingWideTile = visualCount === 3 && index === 2
                            const isOverflowTile = remainingCount > 0 && index === 3
                            const tileClasses = [
                              "relative flex items-center justify-center bg-black",
                              "overflow-hidden",
                              "w-full h-full",
                              "cursor-pointer",
                              "!p-0",
                              "!px-0",
                              "!py-0",
                              "focus:outline-none",
                              "focus-visible:ring-2",
                              "focus-visible:ring-green-400/60",
                              "border-0",
                            ]

                            if (isTrailingWideTile) {
                              tileClasses.push("col-span-2")
                            }
                            // Add thin green dividers between tiles without doubling thickness
                            const borderClasses: string[] = []
                            // Rules assume a 2-column grid for multi-tile layouts
                            if (visualCount === 2) {
                              // single row with two columns: add right border on first tile
                              if (index === 0) borderClasses.push('border-r border-r-green-500/60')
                            } else if (visualCount === 3) {
                              // layout: top row (0,1), bottom full-width (2)
                              if (index === 0) {
                                borderClasses.push('border-r border-r-green-500/60', 'border-b border-b-green-500/60')
                              }
                              if (index === 1) {
                                borderClasses.push('border-b border-b-green-500/60')
                              }
                              // index 2 (full-width) gets no extra borders (top row bottom borders provide separation)
                            } else if (visualCount >= 4) {
                              // 2x2 grid: add right border on left column (0,2) and bottom border on top row (0,1)
                              if (index === 0 || index === 2) borderClasses.push('border-r border-r-green-500/60')
                              if (index === 0 || index === 1) borderClasses.push('border-b border-b-green-500/60')
                            }

                            if (borderClasses.length) {
                              tileClasses.push(...borderClasses)
                            }

                            return (
                              <button
                                type="button"
                                key={getStableMediaItemKey('visual-media', post.id, item, index)}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleVisualTileClick(item)
                                }}
                                className={tileClasses.join(" ")}
                              >
                                <SmartMedia
                                  type={item.type === "video" ? "video" : undefined}
                                  src={item.url}
                                  videoProps={
                                    item.type === "video"
                                      ? {
                                          controls: true,
                                          className: mediaObjectFitClass,
                                          onClick: (ev: any) => {
                                            ev.preventDefault()
                                            ev.stopPropagation()
                                            try { (ev.currentTarget as HTMLVideoElement).pause() } catch (err) {}
                                            handleVisualTileClick(item)
                                          },
                                          onTouchStart: (ev: any) => {
                                            ev.preventDefault()
                                            ev.stopPropagation()
                                            try { (ev.currentTarget as HTMLVideoElement).pause() } catch (err) {}
                                            handleVisualTileClick(item)
                                          },
                                        }
                                      : undefined
                                  }
                                  className={mediaObjectFitClass}
                                  skeletonClassName="w-full h-full"
                                />
                                {isOverflowTile && (
                                  <div className="absolute inset-0 bg-black/65 flex items-center justify-center pointer-events-none">
                                    <span className="text-white text-3xl font-semibold">+{remainingCount}</span>
                                  </div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })()

                    let documentSection: React.ReactNode = null
                    if (documentItems.length > 0) {
                      documentSection = (
                        <div className="flex flex-wrap items-start gap-2">
                          {documentItems.map((item, index) => {
                            const url = item.url
                            const name = item.name || "File"
                            const extMatch = name.match(/\.([a-zA-Z0-9]+)$/)
                            const ext = extMatch ? extMatch[1].toLowerCase() : ""

                            let icon: React.ReactNode = null
                            const codeExts = [
                              "js",
                              "jsx",
                              "ts",
                              "tsx",
                              "php",
                              "html",
                              "css",
                              "scss",
                              "json",
                              "xml",
                              "py",
                              "java",
                              "c",
                              "cpp",
                              "cs",
                              "rb",
                              "go",
                              "sh",
                              "bat",
                              "pl",
                              "swift",
                              "kt",
                              "rs",
                              "dart",
                            ]

                            if (codeExts.includes(ext)) {
                              icon = (
                                <img
                                  src="https://cdn-icons-png.flaticon.com/512/4725/4725948.png"
                                  alt="Code file icon"
                                  className="h-6 w-6"
                                  style={{ minWidth: 24, minHeight: 24 }}
                                />
                              )
                            } else if (ext === "pdf") {
                              icon = (
                                <img
                                  src="https://cdn-icons-png.flaticon.com/512/337/337946.png"
                                  alt="PDF icon"
                                  className="h-6 w-6"
                                  style={{ minWidth: 24, minHeight: 24 }}
                                />
                              )
                            } else if (["doc", "docx"].includes(ext)) {
                              icon = (
                                <img
                                  src="https://cdn-icons-png.flaticon.com/512/5968/5968517.png"
                                  alt="DOCX icon"
                                  className="h-6 w-6"
                                  style={{ minWidth: 24, minHeight: 24 }}
                                />
                              )
                            } else if (["xls", "xlsx"].includes(ext)) {
                              icon = (
                                <img
                                  src="https://cdn-icons-png.flaticon.com/512/4725/4725976.png"
                                  alt="Excel icon"
                                  className="h-6 w-6"
                                  style={{ minWidth: 24, minHeight: 24 }}
                                />
                              )
                            } else if (["ppt", "pptx"].includes(ext)) {
                              icon = (
                                <img
                                  src="https://cdn-icons-png.flaticon.com/512/337/337932.png"
                                  alt="PPT icon"
                                  className="h-6 w-6"
                                  style={{ minWidth: 24, minHeight: 24 }}
                                />
                              )
                            } else if (ext === "txt") {
                              icon = (
                                <img
                                  src="https://cdn-icons-png.flaticon.com/512/3022/3022503.png"
                                  alt="TXT icon"
                                  className="h-6 w-6"
                                  style={{ minWidth: 24, minHeight: 24 }}
                                />
                              )
                            } else if (["zip", "rar"].includes(ext)) {
                              icon = (
                                <img
                                  src="https://cdn-icons-png.flaticon.com/512/9704/9704802.png"
                                  alt="ZIP icon"
                                  className="h-6 w-6"
                                  style={{ minWidth: 24, minHeight: 24 }}
                                />
                              )
                            } else {
                              icon = <DocumentTextIcon className="h-6 w-6 text-gray-400" />
                            }

                            const fileName = name
                            const fileBase = fileName.split('.').slice(0, -1).join('.') || fileName
                            const fileExt = fileName.split('.').pop()?.toUpperCase() || ""

                            return (
                              <button
                                key={getStableMediaItemKey('doc', post.id, item, index)}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  e.preventDefault()
                                  setAttachmentPreviewUrl(url)
                                  setAttachmentPreviewName(fileName)
                                  setAttachmentPreviewMime(ext)
                                  setAttachmentPreviewStoragePath(item.storagePath || null)
                                  setAttachmentPreviewOpen(true)
                                }}
                                className="flex items-center bg-gradient-to-r from-gray-800/60 via-gray-700/40 to-green-900/30 border border-gray-700/30 rounded-lg shadow px-3 py-2 my-1 min-w-0 max-w-xs hover:from-gray-800/80 hover:to-green-800/50 hover:shadow-green-900/10 transition-colors group backdrop-blur-sm text-white hover:text-green-100 text-left"
                                style={{ height: "2.5rem", maxWidth: "260px", marginRight: 0, marginLeft: 0 }}
                                title={fileName}
                              >
                                <span className="flex-shrink-0 mr-2">{icon}</span>
                                <span className="flex flex-col min-w-0">
                                  <span
                                    className="truncate text-xs font-semibold group-hover:text-green-300"
                                    style={{ maxWidth: "140px", color: "inherit" }}
                                  >
                                    {fileBase}
                                  </span>
                                  <span className="text-[10px] text-gray-500 font-bold tracking-widest group-hover:text-blue-600">
                                    {fileExt}
                                  </span>
                                </span>
                                <div className="ml-3 flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      e.preventDefault()
                                      downloadFile(url, fileName, item.storagePath)
                                    }}
                                    className="px-2 py-1 rounded bg-gray-800/60 border border-gray-700/50 text-xs text-gray-200 hover:bg-gray-700/60 transition-colors"
                                    title="Download"
                                  >
                                    <ArrowDownTrayIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )
                    }

                    if (!visualSection && !documentSection) {
                      return null
                    }

                    return (
                      <div className="flex flex-col gap-3">
                        {visualSection}
                        {documentSection}
                      </div>
                    )
                  })()}
                </div>
              ) : null}
            </>
          )}
        </div>{" "}
        {/* Post Actions */}
        <div className="px-3 sm:px-7 py-3 sm:py-4 border-t border-gray-800/40 flex items-center justify-between bg-transparent relative">
          {showHeartAnimation && (
            <div className="absolute left-8 top-1/2 transform -translate-y-1/2 pointer-events-none z-10">
              <div className="animate-bounce">
                <HeartIconSolid className="h-8 w-8 text-red-500 animate-pulse" />
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 sm:gap-6">
            <button
              onClick={handleLike}
              disabled={isReactionProcessing}
              className={`flex items-center gap-1.5 sm:gap-2 p-2 rounded-lg transition-all duration-200 touch-manipulation bg-transparent relative ${
                hasReacted ? "text-green-500 hover:text-green-400 scale-105" : "text-gray-400 hover:text-gray-300"
              } ${isReactionProcessing ? "opacity-70 cursor-wait" : "hover:scale-110"}`}
              aria-label={hasReacted ? "Unlike post" : "Like post"}
            >
              {hasReacted ? (
                <HeartIconSolid
                  className={`h-4 w-4 sm:h-5 sm:w-5 text-green-500 transition-all duration-200 ${showHeartAnimation ? "animate-ping" : ""}`}
                />
              ) : (
                <HeartIcon className="h-4 w-4 sm:h-5 sm:w-5 transition-all duration-200" />
              )}
              <span
                className={`text-xs sm:text-sm font-medium ${hasReacted ? "bg-green-700/40" : "bg-transparent"} px-1.5 py-0.5 rounded-md transition-all duration-300`}
                title={`${reactionCount} ${reactionCount === 1 ? "person" : "people"} reacted to this post`}
              >
                {reactionCount > 0 ? reactionCount : "0"}
              </span>
            </button>

            <button
              onClick={(e) => handleCommentAction(e)}
              className="flex items-center gap-1.5 sm:gap-2 p-2 rounded-lg text-gray-400 hover:text-gray-300 transition-colors touch-manipulation bg-transparent"
              aria-label={showComments ? "Hide comments" : "Show comments"}
              title={isMobileDevice() ? (showComments ? "Hide comments" : "Show comments") : "View comments on mobile"}
            >
              <span className="material-icons text-[18px] sm:text-[20px] align-middle">chat_bubble</span>
              <span
                className="text-xs sm:text-sm font-medium bg-transparent px-1.5 py-0.5 rounded-md"
                title={`${commentCount} ${commentCount === 1 ? "comment" : "comments"} on this post`}
              >
                {commentCount > 0 ? commentCount : "0"}
              </span>
            </button>
            <div
              ref={viewInsightsAnchorRef}
              className="relative"
              onMouseEnter={() => handleViewInsightsHover(true)}
              onMouseLeave={() => handleViewInsightsHover(false)}
              onClick={(e) => handleViewInsightsClick(e)}
            >
              <div className="flex items-center gap-2 p-2 text-gray-400 cursor-default">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5 sm:h-6 sm:w-6"
                >
                  <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                  <path
                    fillRule="evenodd"
                    d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-xs sm:text-sm font-medium bg-transparent px-1.5 py-0.5 rounded-md">
                  {viewCount > 0 ? viewCount : "0"}
                </span>
              </div>
              {showViewInsights && (
                <div className="absolute left-1/2 bottom-full z-30 w-72 -translate-x-1/2 pb-2">
                  <div className="rounded-2xl border border-gray-800/70 bg-gray-900/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-white">View insights</p>
                      <span className="text-xs text-gray-400">
                        {derivedViewInsights.total || viewCount || 0} total
                      </span>
                    </div>
                    {viewRoleLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />
                      </div>
                    ) : viewRoleError ? (
                      <p className="text-xs text-red-400">{viewRoleError}</p>
                    ) : derivedViewInsights.total === 0 ? (
                      <p className="text-xs text-gray-400">No one has viewed this post yet.</p>
                    ) : viewInsightSegments.length === 0 ? (
                      <p className="text-xs text-gray-400">No viewer role data yet.</p>
                    ) : (
                      <div className="flex gap-4">
                        <div className="relative h-20 w-20 flex-shrink-0">
                          <div
                            className="h-20 w-20 rounded-full border border-gray-700"
                            style={{ background: pieGradient }}
                          />
                          <div className="absolute inset-3 rounded-full bg-gray-900/95 flex flex-col items-center justify-center text-[10px] uppercase tracking-wide text-gray-400">
                            <span className="text-lg font-semibold text-white">{derivedViewInsights.total}</span>
                            <span>views</span>
                          </div>
                        </div>
                        <div className="flex-1 space-y-2">
                          {viewInsightSegments.slice(0, 5).map((segment) => (
                            <div key={segment.role} className="flex items-center justify-between text-xs text-gray-200">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-1.5 w-6 rounded-full"
                                  style={{ backgroundColor: segment.color }}
                                />
                                <span className="font-medium text-gray-100">{getReadableRoleLabel(segment.role)}</span>
                              </div>
                              <div className="text-gray-400">
                                <span className="font-semibold text-white">{segment.value}</span>
                                <span className="ml-1 text-[11px] text-gray-500">({Math.round(segment.percent)}%)</span>
                              </div>
                            </div>
                          ))}
                          {viewInsightSegments.length > 5 && (
                            <div className="text-[11px] text-gray-500">
                              +{viewInsightSegments.length - 5} more roles
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleShare}
              disabled={isSharing || (!!currentUser && currentUser.id === post.userId)}
              className={`flex items-center gap-1.5 sm:gap-2 p-2 rounded-lg transition-colors touch-manipulation bg-transparent ${isSharing || (!!currentUser && currentUser.id === post.userId) ? "text-gray-600 cursor-not-allowed" : "text-gray-400 hover:text-gray-300"}`}
              aria-label="Share post"
              title={
                !!currentUser && currentUser.id === post.userId ? "You cannot share your own post" : "Share this post"
              }
            >
              {isSharing ? (
                  <div className="h-4 w-4 sm:h-5 sm:w-5 border-2 border-t-transparent border-current rounded-full animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-[20px] sm:text-[22px] align-middle">screen_rotation_up</span>
                )}
            </button>
          </div>
          {/* Desktop fullscreen modal portal */}
          {!isMobile && (
            <>
              {isFullscreen && typeof document !== "undefined" &&
                ReactDOM.createPortal(
                  <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4">
                    {/* Enhanced backdrop with better blur and gradient */}
                    <div 
                      className="absolute inset-0 bg-gradient-to-br from-black/90 via-black/85 to-gray-900/80 backdrop-blur-md animate-fadeIn" 
                      onClick={() => setIsFullscreen(false)} 
                    />
                    
                    {/* Enhanced modal container with better styling and animations */}
                    <div
                      className="relative w-full max-w-4xl max-h-[90vh] rounded-3xl bg-gradient-to-b from-gray-900/98 via-gray-900/95 to-gray-800/90 border border-gray-700/50 shadow-2xl shadow-green-900/20 z-50 overflow-hidden flex flex-col animate-pop-in backdrop-blur-xl"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(34, 197, 94, 0.1)',
                        background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.98) 0%, rgba(17, 24, 39, 0.95) 50%, rgba(31, 41, 55, 0.9) 100%)'
                      }}
                    >
                      {/* Enhanced header (slim) */}
                      <div className="relative p-4 pb-3 border-b border-gray-700/20 bg-gradient-to-r from-gray-900/40 to-gray-800/25">
                        {/* Compact right-side controls: menu + close, vertically centered */}
                        <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center z-60" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setIsFullscreen(false)}
                            className="p-1.5 rounded-md bg-gray-800/60 hover:bg-gray-700/70 text-gray-300 focus:outline-none focus:ring-1 focus:ring-green-500/30 transition-all duration-150 border border-gray-700/30 hover:border-gray-600/40"
                            aria-label="Close post modal"
                            title="Close"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </div>
                        
                          {/* Compact header content */}
                        <div className="flex items-start gap-3">
                          {/* Compact avatar */}
                          <div className="relative">
                            {profilePic ? (
                              <img 
                                src={profilePic} 
                                alt={displayName} 
                                className="w-12 h-12 rounded-xl object-cover border border-green-500/30 shadow-sm hover:border-green-400/40 transition-all duration-150" 
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center text-green-400 font-bold text-sm border border-green-500/30 shadow-sm hover:border-green-400/40 transition-all duration-150">
                                {getInitials(displayName)}
                              </div>
                            )}
                            {/* Role badge positioning */}
                            {post.userRole && (
                              <div className="absolute -bottom-1 -right-1">
                                <RoleBadge
                                  role={post.userRole}
                                  size="medium"
                                  className="border border-white/20 shadow-sm"
                                  isSpaceAdmin={post.userRole === "admin" || post.userRole === "super admin"}
                                />
                              </div>
                            )}
                          </div>
                          
                          {/* Compact user info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="text-lg font-semibold text-white mb-0.5 leading-tight">{displayName}</h3>
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                  <p className="text-gray-400">{formattedDate}</p>
                                  {post.visibility === 'public' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-700/30 text-green-200 text-[11px] font-medium border border-green-600/25">
                                      <GlobeAltIcon className="w-3 h-3 text-green-300" />
                                      <span>Everyone</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              {/* close button moved to right-side control group */}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Enhanced scrollable content area */}
                      <div className="relative flex-1 overflow-auto">
                        <div className="p-6">
                          {/* Enhanced content / Edit form in fullscreen */}
                          {editingActive ? (
                            <div className="relative mb-6">
                              <textarea
                                value={editedContent}
                                onChange={(e) => setEditedContent(e.target.value)}
                                className="w-full p-4 bg-gray-800/50 border border-gray-700/50 rounded-2xl text-base text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-all duration-200 resize-none"
                                rows={6}
                                placeholder="What's on your mind?"
                              />
                              {/* Media edit controls (fullscreen) */}
                              {isEditing && (
                                <div className="mt-4 flex flex-col gap-3">
                                  {editedMedia && editedMedia.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-3">
                                      {editedMedia.map((m, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-gray-800/50 border border-gray-700/50 rounded px-3 py-2">
                                          <div className="flex-1 min-w-0">
                                            <div className="truncate text-sm text-gray-200">{m.name || (m.url || '').split('/').pop()}</div>
                                            <div className="text-[11px] text-gray-400">{m.type}</div>
                                          </div>
                                          <div className="flex-shrink-0 flex items-center gap-2">
                                            <button type="button" onClick={() => triggerReplace(i)} className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-white">Replace</button>
                                            <button type="button" onClick={() => handleRemoveMedia(i)} className="px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-xs text-white">Remove</button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div>
                                    <button type="button" onClick={() => { replaceIndexRef.current = null; if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); } }} className="px-4 py-2 bg-gray-800/60 hover:bg-gray-700 rounded-xl text-sm text-white">Add media</button>
                                  </div>
                                </div>
                              )}
                              <div className="mt-4 flex items-center justify-between">
                                <div className="flex items-center gap-3 text-sm text-gray-400">
                                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-800/80 text-sm border border-gray-700/50">
                                    {getVisibilityIcon(editedVisibility)}
                                    <span>{getVisibilityLabel(editedVisibility)}</span>
                                  </span>
                                </div>
                                <div className="flex gap-3">
                                  <button
                                    onClick={() => setIsEditing(false)}
                                    className="px-4 py-2 bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 rounded-xl transition-all duration-200 border border-gray-700/50 hover:border-gray-600/50 font-medium"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={handleEditSubmit}
                                    disabled={!editedContent.trim() || isSubmitting}
                                    className={`px-4 py-2 rounded-xl text-white font-medium transition-all duration-200 flex items-center gap-2 ${
                                      editedContent.trim() && !isSubmitting
                                        ? "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 shadow-lg hover:shadow-green-500/25"
                                        : "bg-gray-700 cursor-not-allowed"
                                    }`}
                                  >
                                    {isSubmitting ? (
                                      <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                                    ) : (
                                      <CheckIcon className="h-4 w-4" />
                                    )}
                                    <span>Save Changes</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="mb-6">
                              <div 
                                className="text-lg text-gray-200 leading-relaxed break-words" 
                                dangerouslySetInnerHTML={{ __html: processPostContent() }} 
                              />
                            </div>
                          )}

                          {/* Enhanced media preview in fullscreen */}
                          {(() => {
                            const mediaItems: (string | MediaItem)[] = (post.media && post.media.length > 0 ? post.media : post.mediaUrls) || []
                            if (mediaItems.length === 0) return null

                            const videoItems = mediaItems.filter((item: string | MediaItem) => {
                              const type = typeof item === "string" ? (item.match(/\.(mp4|webm|ogg)$/i) ? "video" : "other") : item.type
                              return type === "video"
                            })
                            const imageItems = mediaItems.filter((item: string | MediaItem) => {
                              const type =
                                typeof item === "string"
                                  ? item.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                                    ? "image"
                                    : "other"
                                  : item.type
                              return type === "image"
                            })
                            const imageUrls = imageItems
                              .map((item: string | MediaItem) => (typeof item === "string" ? item : item.url))
                              .filter(Boolean) as string[]

                            // Enhanced media container
                            return (
                              <div className="mb-6">
                                <div className="h-[280px] sm:h-[380px] overflow-hidden mx-auto max-w-[92%] rounded-2xl border border-gray-700/40 shadow-xl">
                                  {/* If only one video and no images, render video full width outside grid */}
                                  {videoItems.length === 1 && imageItems.length === 0 && mediaItems.length === 1 ? (
                                    (() => {
                                      const item = videoItems[0]
                                      const url = typeof item === "string" ? item : item.url
                                      return (
                                        <div
                                          className="relative rounded-2xl overflow-hidden bg-gray-800/60 border border-gray-700/40 w-full shadow-lg aspect-video min-h-[60px] max-h-[120px] sm:min-h-[80px] sm:max-h-[120px] flex items-center justify-center"
                                          style={{ width: "100%" }}
                                        >
                                          <video
                                            src={processStorageUrl(url)}
                                            controls
                                            onError={handleMediaError}
                                            onClick={(e) => { e.stopPropagation(); openVideoPreview(processStorageUrl(url)); }}
                                            onTouchStart={(e) => { e.stopPropagation(); openVideoPreview(processStorageUrl(url)); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); }}
                                            className="w-full h-full object-cover rounded-2xl cursor-pointer hover:opacity-95 transition-opacity duration-200"
                                            style={{
                                              width: "100%",
                                              maxWidth: "100%",
                                              minWidth: 0,
                                              maxHeight: "100%",
                                              height: "100%",
                                              background: "#111",
                                              display: "block",
                                            }}
                                          />
                                        </div>
                                      )
                                    })()
                                  ) : imageItems.length === 1 ? (
                                    (() => {
                                      const item = imageItems[0]
                                      const url = typeof item === "string" ? item : item.url
                                      return (
                                        <div className="relative rounded-2xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow-lg h-full">
                                          <img
                                            src={url || "/placeholder.svg"}
                                            alt="Post media"
                                            className="w-full h-full object-cover rounded-2xl cursor-pointer hover:opacity-95 transition-opacity duration-200"
                                            loading="lazy"
                                            onClick={() => openImagePreview(imageUrls, 0)}
                                            onError={(e) => { ;(e.target as HTMLImageElement).src = "/images/placeholder.png" }}
                                          />
                                        </div>
                                      )
                                    })()
                                  ) : imageItems.length === 2 ? (
                                    <div className="grid grid-cols-2 gap-3 h-full">
                                      {imageItems.map((item: string | MediaItem, index: number) => {
                                        const url = typeof item === "string" ? item : item.url
                                        return (
                                          <div key={getStableMediaItemKey('preview-image-two', post.id, item, index)} className="relative rounded-2xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow-lg h-full">
                                            <img
                                              src={url || "/placeholder.svg"}
                                              alt="Post media"
                                              className="w-full h-full object-cover rounded-2xl cursor-pointer hover:opacity-95 transition-opacity duration-200"
                                              loading="lazy"
                                              onClick={() => openImagePreview(imageUrls, index)}
                                              onError={(e) => { ;(e.target as HTMLImageElement).src = "/images/placeholder.png" }}
                                            />
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : imageItems.length === 3 ? (
                                    <div className="grid grid-cols-2 grid-rows-2 gap-3 h-full w-full">
                                      <div className="relative rounded-2xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow-lg row-span-2 h-full">
                                        <img
                                          src={(typeof imageItems[0] === "string" ? imageItems[0] : imageItems[0].url) || "/placeholder.svg"}
                                          alt="Post media"
                                          className="absolute inset-0 w-full h-full object-cover rounded-2xl cursor-pointer hover:opacity-95 transition-opacity duration-200"
                                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                                          loading="lazy"
                                          onClick={() => openImagePreview(imageUrls, 0)}
                                          onError={(e) => { ;(e.target as HTMLImageElement).src = "/images/placeholder.png" }}
                                        />
                                      </div>
                                      <div className="relative rounded-2xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow-lg h-full">
                                        <img
                                          src={(typeof imageItems[1] === "string" ? imageItems[1] : imageItems[1].url) || "/placeholder.svg"}
                                          alt="Post media"
                                          className="absolute inset-0 w-full h-full object-cover rounded-2xl cursor-pointer hover:opacity-95 transition-opacity duration-200"
                                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                                          loading="lazy"
                                          onClick={() => openImagePreview(imageUrls, 1)}
                                          onError={(e) => { ;(e.target as HTMLImageElement).src = "/images/placeholder.png" }}
                                        />
                                      </div>
                                      <div className="relative rounded-2xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow-lg h-full">
                                        <img
                                          src={(typeof imageItems[2] === "string" ? imageItems[2] : imageItems[2].url) || "/placeholder.svg"}
                                          alt="Post media"
                                          className="absolute inset-0 w-full h-full object-cover rounded-2xl cursor-pointer hover:opacity-95 transition-opacity duration-200"
                                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                                          loading="lazy"
                                          onClick={() => openImagePreview(imageUrls, 2)}
                                          onError={(e) => { ;(e.target as HTMLImageElement).src = "/images/placeholder.png" }}
                                        />
                                      </div>
                                    </div>
                                  ) : imageItems.length >= 4 ? (
                                    (() => {
                                      const displayItems = imageItems.slice(0, 4)
                                      const remainingCount = imageItems.length - 4
                                      return (
                                        <div className="grid grid-cols-2 gap-3 h-full">
                                          {displayItems.map((item: string | MediaItem, index: number) => {
                                            const url = typeof item === "string" ? item : item.url
                                            const isLastItem = index === 3
                                            return (
                                              <div key={getStableMediaItemKey('preview-image-grid', post.id, item, index)} className="relative rounded-2xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow-lg h-full">
                                                <img
                                                  src={url || "/placeholder.svg"}
                                                  alt="Post media"
                                                  className={`w-full h-full object-cover rounded-2xl cursor-pointer hover:opacity-95 transition-opacity duration-200 ${isLastItem ? "blur-sm" : ""}`}
                                                  loading="lazy"
                                                  onClick={() => openImagePreview(imageUrls, index)}
                                                  onError={(e) => { ;(e.target as HTMLImageElement).src = "/images/placeholder.png" }}
                                                />
                                                {isLastItem && remainingCount > 0 && (
                                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none rounded-2xl">
                                                    <span className="text-white font-bold text-xl">+{remainingCount} more</span>
                                                  </div>
                                                )}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )
                                    })()
                                  ) : (
                                    // Enhanced file/document rendering
                                    <div className="mt-4 grid grid-cols-1 sm:flex sm:flex-row sm:flex-wrap items-start gap-2" style={{ gap: "8px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                                      {mediaItems.map((item, index) => {
                                        const url = typeof item === "string" ? item : item.url
                                        const type = typeof item === "string"
                                          ? url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                                            ? "image"
                                            : url.match(/\.(mp4|webm|ogg)$/i)
                                              ? "video"
                                              : "document"
                                          : item.type

                                        if (type === "image") {
                                          return (
                                            <div key={getStableMediaItemKey('mixed-image', post.id, item, index)} className="relative rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow-lg aspect-square" style={{ minWidth: 64, minHeight: 64 }}>
                                              <img
                                                src={url || "/placeholder.svg"}
                                                alt="Post media"
                                                className="w-full h-full object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity duration-200"
                                                onClick={() => openImagePreview(imageUrls, index)}
                                                loading="lazy"
                                              />
                                            </div>
                                          )
                                        }

                                        if (type === "video") {
                                          return (
                                            <div key={getStableMediaItemKey('mixed-video', post.id, item, index)} className="relative rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 w-full shadow-lg aspect-video min-h-[56px] flex items-center justify-center">
                                              <video
                                                src={processStorageUrl(url)}
                                                controls
                                                onError={handleMediaError}
                                                onClick={(e) => { e.stopPropagation(); openVideoPreview(processStorageUrl(url)); }}
                                                className="w-full h-full object-cover rounded-xl cursor-pointer"
                                              />
                                            </div>
                                          )
                                        }

                                        // Enhanced file/document styling
                                        let ext = ""
                                        if (typeof item === "string") {
                                          const match = url.match(/\.([a-zA-Z0-9]+)$/)
                                          ext = match ? match[1].toLowerCase() : ""
                                        } else if ((item as MediaItem).name) {
                                          const match = (item as MediaItem).name!.match(/\.([a-zA-Z0-9]+)$/)
                                          ext = match ? match[1].toLowerCase() : ""
                                        }
                                        let icon = null
                                        const codeExts = ["js","jsx","ts","tsx","php","html","css","scss","json","xml","py","java","c","cpp","cs","rb","go","sh","bat","pl","swift","kt","rs","dart"]
                                        if (codeExts.includes(ext)) {
                                          icon = <img src="https://cdn-icons-png.flaticon.com/512/4725/4725948.png" alt="Code file icon" className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />
                                        } else if (ext === "pdf") {
                                          icon = <img src="https://cdn-icons-png.flaticon.com/512/337/337946.png" alt="PDF icon" className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />
                                        } else if (["doc","docx"].includes(ext)) {
                                          icon = <img src="https://cdn-icons-png.flaticon.com/512/5968/5968517.png" alt="DOCX icon" className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />
                                        } else if (["xls","xlsx"].includes(ext)) {
                                          icon = <img src="https://cdn-icons-png.flaticon.com/512/4725/4725976.png" alt="Excel icon" className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />
                                        } else if (["ppt","pptx"].includes(ext)) {
                                          icon = <img src="https://cdn-icons-png.flaticon.com/512/337/337932.png" alt="PPT icon" className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />
                                        } else if (["txt"].includes(ext)) {
                                          icon = <img src="https://cdn-icons-png.flaticon.com/512/3022/3022503.png" alt="TXT icon" className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />
                                        } else if (["zip","rar"].includes(ext)) {
                                          icon = <img src="https://cdn-icons-png.flaticon.com/512/9704/9704802.png" alt="ZIP icon" className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />
                                        } else {
                                          icon = <DocumentTextIcon className="h-6 w-6 text-gray-400" />
                                        }
                                        const fileName = (typeof item === "string" ? url.split("/").pop() : (item as MediaItem).name) || "File"
                                        const fileBase = fileName.split(".").slice(0, -1).join(".") || fileName
                                        return (
                                          <button
                                                      key={getStableMediaItemKey('mixed-doc', post.id, item, index)}
                                                      type="button"
                                                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setAttachmentPreviewUrl(url); setAttachmentPreviewName(fileName); setAttachmentPreviewMime(ext); setAttachmentPreviewStoragePath(typeof item === 'object' ? (item as MediaItem).storagePath || null : null); setAttachmentPreviewOpen(true); }}
                                                      className="flex items-center bg-gradient-to-r from-gray-800/80 via-gray-700/60 to-green-900/40 border border-gray-700/50 rounded-xl shadow-lg px-4 py-3 my-1 min-w-0 max-w-xs hover:from-gray-800/90 hover:to-green-800/60 hover:shadow-green-900/20 transition-all duration-200 group backdrop-blur-sm text-white hover:text-green-100 hover:scale-105 text-left"
                                                      style={{ height: "3rem", maxWidth: "280px", marginRight: 0, marginLeft: 0 }}
                                                      title={fileName}
                                                    >
                                            <span className="flex-shrink-0 mr-3">{icon}</span>
                                            <span className="flex flex-col min-w-0">
                                              <span className="truncate text-sm font-semibold group-hover:text-green-300" style={{ maxWidth: "160px", color: "inherit" }}>{fileBase}</span>
                                              <span className="text-xs text-gray-400">{(fileName.split('.').pop() || '').toUpperCase()}</span>
                                            </span>
                                            <div className="ml-3 flex items-center gap-2">
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); const sp = typeof item === 'object' ? (item as MediaItem).storagePath : undefined; downloadFile(url, fileName, sp); }}
                                                className="px-2 py-1 rounded bg-gray-800/60 border border-gray-700/50 text-xs text-gray-200 hover:bg-gray-700/60 transition-colors"
                                                title="Download"
                                              >
                                                <ArrowDownTrayIcon className="h-4 w-4" />
                                              </button>
                                            </div>
                                            </button>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })()}

                          {/* Enhanced actions (like, comment, share) */}
                          <div className="flex items-center gap-6 mb-6">
                            <button
                              onClick={handleLike}
                              className={`flex items-center gap-3 p-3 rounded-xl bg-transparent text-gray-200 transition-all duration-200 ${
                                hasReacted 
                                  ? 'text-green-500 hover:text-green-400 bg-green-500/10 hover:bg-green-500/20' 
                                  : 'hover:text-gray-100 hover:bg-gray-800/50'
                              }`}
                            >
                              {hasReacted ? <HeartIconSolid className="w-6 h-6" /> : <HeartIcon className="w-6 h-6" />} 
                              <span className="font-medium">{reactionCount}</span>
                            </button>

                            <button
                              onClick={() => handleCommentAction()}
                              className="flex items-center gap-3 p-3 rounded-xl bg-transparent text-gray-200 hover:text-gray-100 hover:bg-gray-800/50 transition-all duration-200"
                            >
                              <span className="material-icons w-6 h-6 align-middle">chat_bubble</span>
                              <span className="font-medium">{commentCount}</span>
                            </button>

                            <button
                              onClick={handleShare}
                              className="flex items-center gap-3 p-3 rounded-xl bg-transparent text-gray-200 hover:text-gray-100 hover:bg-gray-800/50 transition-all duration-200"
                            >
                              <span className="material-symbols-outlined text-3xl">screen_rotation_up</span>
                          
                            </button>
                          </div>

                          {/* Enhanced comments area (fullscreen) */}
                          {showComments && (
                            <div className="border-t border-gray-700/30 pt-6 relative">
                              {/* Enhanced comments list */}
                              <div className="pr-2 space-y-4 mb-6 pb-32">
                                  {comments.length === 0 ? (
                                  <div className="text-center py-8">
                                    <p className="text-gray-500 text-lg">No comments yet</p>
                                    <p className="text-gray-600 text-sm mt-1">Be the first to share your thoughts!</p>
                                  </div>
                                    ) : (
                                  comments
                                    .filter((c) => !c.replyTo)
                                    .map((c, idx) => (
                                      <div key={c.id}>
                                        <div className={`group flex items-start gap-1 p-1 rounded-md transition-all duration-150 hover:bg-gray-800/25 ${idx === comments.length - 1 ? 'mb-1' : ''}`}>
                                          {/* Enhanced avatar (slightly smaller) */}
                                          <div className="flex-shrink-0">
                                            {c.userProfilePic ? (
                                              <img 
                                                src={c.userProfilePic} 
                                                alt={c.userName} 
                                                className="w-8 h-8 rounded-lg object-cover border border-gray-700/40 hover:border-green-500/30 transition-all duration-150" 
                                                onError={(e) => { const target = e.target as HTMLImageElement; target.onerror = null; target.src = '/images/default-avatar.png' }} 
                                              />
                                            ) : (
                                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center text-green-400 font-bold text-xs border border-gray-700/40 hover:border-green-500/30 transition-all duration-150">
                                                {c.userName ? c.userName.charAt(0).toUpperCase() : 'U'}
                                              </div>
                                            )}
                                          </div>

                                          {/* Enhanced content bubble (tighter spacing) */}
                                          <div className="flex-1 min-w-0">
                                            <div className="bg-gray-800/40 rounded-md px-2 py-1 border border-gray-700/20">
                                              <div className="flex items-start justify-between gap-1">
                                                <div className="min-w-0 flex-1">
                                                  <div className="flex items-center gap-1 mb-1">
                                                    <h4 className="text-[11px] font-semibold text-gray-200 truncate">{c.userName}</h4>
                                                    {c.userId === post.userId && (
                                                      <span className="text-[9px] text-green-500 font-bold bg-green-500/20 px-1.5 py-0.5 rounded-full">Author</span>
                                                    )}
                                                    {c.userRole === 'admin' || c.userRole === 'super admin' ? (
                                                      <span className="text-[9px] text-blue-400 font-bold bg-blue-500/20 px-1.5 py-0.5 rounded-full">Admin</span>
                                                    ) : null}
                                                  </div>
                                                  <div className="text-[11px] text-gray-300 break-words leading-tight">{c.content}</div>
                                                </div>

                                                <div className="flex-shrink-0 text-right">
                                                  <p className="text-[9px] text-gray-500 mb-0">{c.createdAt instanceof Timestamp ? format(c.createdAt.toDate(), 'MMM d • h:mm a') : 'Just now'}</p>
                                                  <div className="flex items-center justify-end gap-1">
                                                    {(currentUser?.id === c.userId || isAdminOrSuperAdmin) ? (
                                                      <button
                                                        onClick={() => handleDeleteComment(c.id, c.userId)}
                                                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 rounded-md bg-transparent hover:bg-red-500/10 transition-all duration-150"
                                                        title="Delete comment"
                                                        aria-label="Delete comment"
                                                      >
                                                        <span className="material-icons text-[16px] align-middle">delete_forever</span>
                                                      </button>
                                                    ) : null}
                                                    <button
                                                      onClick={() => { setReplyToCommentId(c.id); handleCommentAction(); }}
                                                      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-green-400 rounded-md bg-transparent hover:bg-green-500/10 transition-all duration-150"
                                                      title="Reply"
                                                      aria-label={`Reply to ${c.userName}`}
                                                    >
                                                      <span className="material-icons text-[16px] align-middle">reply</span>
                                                    </button>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Enhanced replies container (reduced indent and spacing) */}
                                        {(repliesMap[c.id] || []).length > 0 && (
                                          <div className="ml-6 mt-1 space-y-1">
                                            {(repliesMap[c.id] || []).map((r) => (
                                              <div key={r.id} className="flex items-start gap-1 p-0.5 rounded-md bg-gray-800/10 border border-gray-700/10">
                                                <div className="flex-shrink-0">
                                                  {r.userProfilePic ? (
                                                    <img 
                                                      src={r.userProfilePic} 
                                                      alt={r.userName} 
                                                      className="w-5 h-5 rounded-sm object-cover border border-gray-700/40" 
                                                    />
                                                  ) : (
                                                    <div className="w-5 h-5 rounded-sm bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center text-green-400 font-bold text-[9px] border border-gray-700/40">
                                                      {r.userName ? r.userName.charAt(0).toUpperCase() : 'U'}
                                                    </div>
                                                  )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <div className="bg-gray-800/20 rounded-sm px-2 py-0.5 border border-gray-700/10">
                                                    <div className="flex items-center justify-between mb-0.5">
                                                      <div className="flex items-center gap-1">
                                                        <h5 className="text-[10px] font-medium text-gray-200">{r.userName} replied</h5>
                                                        <span className="material-icons text-[12px] text-gray-400 align-middle">reply</span>
                                                      </div>
                                                      <p className="text-[8px] text-gray-500">{r.createdAt instanceof Timestamp ? format(r.createdAt.toDate(), 'MMM d • h:mm a') : 'Just now'}</p>
                                                    </div>
                                                    <div className="text-[11px] text-gray-300">{r.content}</div>
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Enhanced pinned bottom input bar for fullscreen modal */}
                      {showComments && (
                        <div className="w-full border-t border-gray-700/30 p-4 bg-gradient-to-t from-gray-900/98 to-gray-900/95 backdrop-blur-xl rounded-b-3xl">
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault()
                              if (!commentText.trim()) return
                              const profaneWords = detectProfanity(commentText)
                              if (profaneWords.length > 0) {
                                setDetectedProfaneWords(profaneWords)
                                setProfanityModalOpen(true)
                                return
                              }
                              handleAddComment(e)
                            }}
                            className="flex items-center gap-4 w-full"
                          >
                            <div className="flex-shrink-0">
                              {currentUser?.profile_pic ? (
                                <img
                                  src={currentUser.profile_pic}
                                  alt={currentUser.name}
                                  className="w-9 h-9 rounded-lg object-cover border border-green-500/30 shadow-sm"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center text-green-400 font-bold text-sm border border-green-500/30 shadow-sm">
                                  {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                                {replyToCommentId && (
                                  <div className="mb-3 text-sm text-gray-400 bg-gray-800/50 px-3 py-2 rounded-xl border border-gray-700/30">
                                    Replying to comment • <button onClick={() => setReplyToCommentId(null)} className="text-green-400 underline hover:text-green-300 transition-colors">Cancel</button>
                                  </div>
                                )}
                                <div className="relative">
                                  <input
                                    type="text"
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    placeholder="Write a comment..."
                                    className="w-full bg-gray-800/60 border border-gray-700/50 rounded-lg py-2 pl-3 pr-10 text-sm text-gray-200 placeholder-gray-400 focus:ring-1 focus:ring-green-500/30 focus:border-green-500/40 transition-all duration-150"
                                  />
                                  <button
                                    type="submit"
                                    disabled={!commentText.trim() || isSubmitting}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 hover:text-green-400 disabled:text-gray-600 p-1.5 rounded-md bg-transparent hover:bg-green-500/10 transition-all duration-150"
                                  >
                                    {isSubmitting ? (
                                      <div className="w-3.5 h-3.5 border-2 border-t-transparent border-green-500 rounded-full animate-spin" />
                                    ) : (
                                      <PaperAirplaneIcon className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                          </form>
                        </div>
                      )}
                    </div>
                  </div>,
                  document.body,
                )}
            </>
          )}
        </div>{" "}
  {/* Comments Section: on mobile, only render when in fullscreen */}
  {showComments && isMobile && isFullscreen && (
          <div className="border-t border-gray-700/30 px-4 sm:px-6 py-3 bg-gray-900/70 relative flex flex-col">
            {/* Comment form with minimal styling */}
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!commentText.trim()) return
                // Profanity check before submitting comment
                const profaneWords = detectProfanity(commentText)
                if (profaneWords.length > 0) {
                  setDetectedProfaneWords(profaneWords)
                  setProfanityModalOpen(true)
                  return
                }
                // If clean, proceed as before
                handleAddComment(e)
              }}
              className="flex items-start gap-2 mb-3 sticky bottom-0 z-20 bg-gradient-to-t from-gray-900/95 to-transparent py-3"
              style={{ backdropFilter: "blur(6px)" }}
            >
              <div className="flex-shrink-0">
                {currentUser?.profile_pic ? (
                  <img
                    src={currentUser.profile_pic || "/placeholder.svg"}
                    alt={currentUser.name}
                    className="w-6 h-6 rounded-full object-cover border border-green-500/40"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-green-400 font-bold text-[10px] border border-green-500/40">
                    {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {replyToCommentId && (
                  <div className="mb-1 text-xs text-gray-400">
                    Replying to comment • <button onClick={() => setReplyToCommentId(null)} className="text-green-400 underline">Cancel</button>
                  </div>
                )}
                <div className="relative">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Write a comment..."
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-full py-1.5 pl-3 pr-8 text-xs text-gray-200 placeholder-gray-400 focus:ring-1 focus:ring-green-500/30 focus:border-green-500/50"
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim() || isSubmitting}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-green-500 hover:text-green-400 disabled:text-gray-600 touch-manipulation p-2 rounded-full bg-transparent transition-colors"
                  >
                    {isSubmitting ? (
                      <div className="w-3 h-3 border-1.5 border-t-transparent border-green-500 rounded-full animate-spin" />
                    ) : (
                      <PaperAirplaneIcon className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            </form>

            {/* Comments list with minimal styling */}
            <div className="space-y-2 pb-20 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-center text-xs text-gray-500 py-2">No comments yet</p>
              ) : (
                comments
                  .filter((c) => !c.replyTo)
                  .map((comment, idx) => (
                    <div key={comment.id} className={`space-y-1 ${idx === comments.length - 1 ? "mb-12" : ""}`}>
                      <div className={`group flex gap-2 hover:bg-gray-800/20 px-1 py-1.5 rounded-lg transition-colors`}>
                        {/* Comment author avatar */}
                        <div className="flex-shrink-0 mt-0.5">
                          {comment.userProfilePic ? (
                            <img
                              src={comment.userProfilePic || "/placeholder.svg"}
                              alt={comment.userName}
                              className="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-cover border border-gray-700"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement
                                target.onerror = null
                                target.src = "/images/default-avatar.png"
                              }}
                            />
                          ) : (
                            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gray-800 flex items-center justify-center text-green-400 font-bold text-[10px] border border-gray-700">
                              {comment.userName ? comment.userName.charAt(0).toUpperCase() : "U"}
                            </div>
                          )}
                        </div>

                        {/* Comment content */}
                        <div className="flex-1 min-w-0">
                          <div className="bg-gray-800/30 rounded-lg px-3 py-2">
                            <div className="flex justify-between items-start">
                              <h4 className="text-xs font-medium text-gray-300">
                                {comment.userName}
                                {comment.userId === post.userId && (
                                  <span className="ml-1 text-[9px] text-green-500 font-semibold">(Author)</span>
                                )}
                                {comment.userRole === "admin" || comment.userRole === "super admin" ? (
                                  <span className="ml-1 text-[9px] text-blue-400 font-semibold">(Admin)</span>
                                ) : null}
                              </h4>
                            </div>

                            <div className="mt-0.5 text-xs text-gray-200 break-words">{comment.content}</div>

                            <div className="mt-1 flex items-center justify-between">
                              <p className="text-[9px] text-gray-500">
                                {comment.createdAt instanceof Timestamp
                                  ? format(comment.createdAt.toDate(), "MMM d • h:mm a")
                                  : "Just now"}
                                {comment.isEdited && <span className="ml-0.5">(edited)</span>}
                              </p>

                              {/* Comment actions - reply + delete */}
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setReplyToCommentId(comment.id)}
                                  className={`text-gray-400 hover:text-green-300 ${isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity p-2 rounded-full bg-transparent`}
                                  title="Reply"
                                  aria-label={`Reply to ${comment.userName}`}
                                >
                                  <span className="material-icons text-[12px] align-middle">reply</span>
                                </button>
                                {(currentUser?.id === comment.userId || isAdminOrSuperAdmin) && (
                                  <button
                                    onClick={() => handleDeleteComment(comment.id, comment.userId)}
                                    className={`text-gray-400 hover:text-red-500 ${isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity p-2 rounded-full bg-transparent`}
                                    title="Delete comment"
                                  >
                                    <TrashIcon className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Replies under this comment (from replies subcollection) */}
                      {(repliesMap[comment.id] || []).map((reply) => (
                        <div key={reply.id} className="ml-6 flex gap-2 items-start">
                          <div className="flex-shrink-0 mt-0.5">
                            {reply.userProfilePic ? (
                              <img src={reply.userProfilePic || "/placeholder.svg"} alt={reply.userName} className="w-4 h-4 rounded-full object-cover border border-gray-700" />
                            ) : (
                              <div className="w-4 h-4 rounded-full bg-gray-800 flex items-center justify-center text-green-400 font-bold text-[9px] border border-gray-700">{reply.userName ? reply.userName.charAt(0).toUpperCase() : 'U'}</div>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="bg-gray-800/20 rounded-lg px-2 py-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-gray-300 font-medium">{reply.userName} replied</span>
                                  <span className="material-icons text-[12px] text-gray-400 align-middle">reply</span>
                                </div>
                                <p className="text-[9px] text-gray-500">{reply.createdAt instanceof Timestamp ? format(reply.createdAt.toDate(), 'MMM d • h:mm a') : 'Just now'}</p>
                              </div>
                              <div className="mt-1 text-[11px] text-gray-200">{reply.content}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
        {/* Modals - Wrapped properly */}
        <>
          <LoaderOverlay
            open={isDeleteProcessing}
            message={deleteFeedbackStatus === 'pending' ? 'Deleting post...' : 'Finalizing deletion...'}
          />
          {/* Profanity Modal for comments - Rendered outside PostCard container */}
          {profanityModalOpen && typeof document !== "undefined" &&
            ReactDOM.createPortal(
              <div style={{ zIndex: 2147483648 }}>
                <ProfanityModal
                  open={profanityModalOpen}
                  detectedWords={detectedProfaneWords}
                  onClose={() => setProfanityModalOpen(false)}
                />
              </div>,
              document.body
            )
          }

          {/* Mobile fullscreen post modal */}
          {isMobile && (
            <FullScreenRegularPostModal
              post={post}
              isOpen={isFullscreen}
              onClose={() => {
                setIsFullscreen(false)
                if (typeof onFullscreenClose === 'function') onFullscreenClose()
              }}
              onPostUpdated={onPostUpdated}
            />
          )}

          {/* Delete Confirmation (Unified ConfirmDialog style for author & admin) */}
          {showDeleteConfirm && typeof document !== 'undefined' && ReactDOM.createPortal(
            <div style={{ zIndex: 2147483648 }}>
              <ConfirmDialog
                open={showDeleteConfirm}
                title="Delete Post"
                message={
                  <div className="space-y-2 text-sm">
                    <p>This action will permanently remove the post and all its comments.</p>
                    <p className="text-red-400 font-medium">This cannot be undone.</p>
                  </div>
                }
                confirmLabel={isDeleteProcessing ? 'Deleting...' : 'Delete'}
                cancelLabel="Cancel"
                confirmTone="danger"
                isProcessing={isDeleteProcessing}
                onConfirm={handleDeleteConfirm}
                onCancel={() => { if (!isDeleteProcessing) setShowDeleteConfirm(false); }}
              />
            </div>,
            document.body
          )}

          {/* Delete success dialog */}
          {showDeleteSuccess && typeof document !== 'undefined' && ReactDOM.createPortal(
            <div style={{ zIndex: 2147483648 }}>
              <ConfirmDialog
                open={showDeleteSuccess}
                title="Post deleted"
                message={
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-3">
                      <CheckIcon className="h-5 w-5 text-green-400" />
                      <span>Post deleted successfully.</span>
                    </div>
                    {deleteFeedbackStatus === 'pending' && (
                      <p className="text-xs text-gray-400">Finalizing deletion…</p>
                    )}
                  </div>
                }
                confirmLabel="Done"
                showCancel={false}
                confirmTone="primary"
                headerTone="success"
                isProcessing={deleteFeedbackStatus === 'pending'}
                onConfirm={handleDeleteSuccessClose}
                onCancel={handleDeleteSuccessClose}
              />
            </div>,
            document.body
          )}

          {/* Report Post Modal - Rendered outside PostCard container */}
          {showReportModal && typeof document !== "undefined" &&
            ReactDOM.createPortal(
              <div className="fixed inset-0 flex items-center justify-center bg-black/60" style={{ zIndex: 2147483648 }}>
                <div className="bg-gray-950 rounded-2xl shadow-2xl border border-green-800 px-8 py-6 max-w-md w-full animate-fade-in-up">
                  <h2 className="text-xl font-bold text-green-400 mb-2">Report Post</h2>
                  <p className="text-gray-300 mb-4">Why are you reporting this post?</p>

                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full p-2.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-transparent mb-4"
                  >
                    <option value="">Select a reason</option>
                    <option value="inappropriate">Inappropriate content</option>
                    <option value="spam">Spam or misleading</option>
                    <option value="harassment">Harassment or bullying</option>
                    <option value="hate_speech">Hate speech</option>
                    <option value="violence">Violence or dangerous behavior</option>
                    <option value="intellectual_property">Intellectual property violation</option>
                    <option value="other">Other reason</option>
                  </select>

                  {reportReason === "other" && (
                    <textarea
                      value={reportDetails}
                      onChange={(e) => setReportDetails(e.target.value)}
                      placeholder="Please provide additional details..."
                      className="w-full p-2.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-transparent mb-4"
                      rows={3}
                    />
                  )}

                  <div className="flex justify-end gap-3 mt-4">
                    <button
                      className="px-5 py-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 transition-all font-semibold"
                      onClick={() => setShowReportModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="px-5 py-2 rounded-lg bg-yellow-600 text-white hover:bg-yellow-500 transition-all font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!reportReason || isSubmittingReport}
                      onClick={async () => {
                        if (!currentUser || !reportReason) return

                        // Prevent admins and super admins from reporting posts
                        if (currentUser.role === "admin" || currentUser.role === "super admin") {
                          console.error("Admins and super admins cannot report posts")
                          setShowReportModal(false)
                          return
                        }

                        setIsSubmittingReport(true)
                        try {
                          await reportPost(post.id, currentUser.id, reportReason as any, reportDetails)
                          setShowReportModal(false)
                          setReportReason("")
                          setReportDetails("")
                          alert("Thank you for your report. We will review this post.")
                        } catch (error) {
                          console.error("Error submitting report:", error)
                          alert("Failed to submit report. Please try again.")
                        } finally {
                          setIsSubmittingReport(false)
                        }
                      }}
                    >
                      {isSubmittingReport ? "Submitting..." : "Submit Report"}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )
          }

          {/* Share Confirmation Dialog */}
          {/* Caption Overlay Modal (shown before final confirmation) */}
          {showCaptionModal && typeof document !== "undefined" &&
            ReactDOM.createPortal(
              <div className="fixed inset-0 z-[2147483650] flex items-center justify-center">
                <div className="absolute inset-0 bg-black/80" onClick={() => setShowCaptionModal(false)} />
                <div onClick={(e) => e.stopPropagation()} className="relative z-20 w-[min(720px,92%)] bg-[#0f1720] border border-gray-800 rounded-lg p-5">
                  <h3 className="text-white font-semibold mb-2">Add a caption</h3>
                  <textarea
                    id={`share-caption-${post.id}`}
                    value={shareCaption}
                    onChange={(e) => setShareCaption(e.target.value)}
                    placeholder="Write something about this post (optional)"
                    className="w-full min-h-[96px] max-h-[240px] bg-[#071018] border border-gray-700 rounded px-3 py-2 text-gray-100 resize-vertical focus:outline-none"
                    maxLength={2000}
                    autoFocus={true}
                  />
                  <div className="flex items-center justify-end gap-3 mt-3">
                    <button
                      onClick={() => setShowCaptionModal(false)}
                      className="px-4 py-2 rounded bg-transparent border border-gray-700 text-gray-300 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitCaptionAndOpenConfirm}
                      disabled={shareProcessing || isSharing}
                      className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )
          }

          {showShareConfirm && typeof document !== "undefined" &&
            ReactDOM.createPortal(
              <div style={{ zIndex: 2147483648 }}>
                <ConfirmDialog
                  open={showShareConfirm}
                  title="Share post"
                  message={<span>Share this post to your timeline?</span>}
                  confirmLabel="Share"
                  cancelLabel="Cancel"
                  confirmTone="primary"
                  isProcessing={shareProcessing || isSharing}
                  onConfirm={confirmShare}
                  onCancel={() => { if (!shareProcessing) setShowShareConfirm(false) }}
                />
              </div>,
              document.body
            )
          }

          {/* Hide Confirmation Dialog */}
          {showHideConfirm && typeof document !== "undefined" &&
            ReactDOM.createPortal(
              <div style={{ zIndex: 2147483648 }}>
                <ConfirmDialog
                  open={showHideConfirm}
                  title="Hide post"
                  message={<span>Hide this post from your feed? You can still see it on the author’s profile.</span>}
                  confirmLabel="Hide"
                  cancelLabel="Cancel"
                  confirmTone="neutral"
                  isProcessing={hideProcessing}
                  onConfirm={confirmHide}
                  onCancel={() => { if (!hideProcessing) setShowHideConfirm(false) }}
                />
              </div>,
              document.body
            )
          }

          {/* Warn Confirmation Dialog (Program Chair Admin) */}
          {showWarnConfirm && typeof document !== 'undefined' && ReactDOM.createPortal(
            <div style={{ zIndex: 2147483648 }}>
              <ConfirmDialog
                open={showWarnConfirm}
                title="Send warning"
                message={
                  <div className="space-y-2 text-sm">
                    <p>This will send a formal warning to the post author about this content.</p>
                    <p className="text-amber-400 font-medium">The author will be notified immediately.</p>
                  </div>
                }
                confirmLabel={warnProcessing ? 'Sending...' : 'Send warning'}
                cancelLabel="Cancel"
                confirmTone="primary"
                isProcessing={warnProcessing}
                onConfirm={handleWarnConfirm}
                onCancel={() => { if (!warnProcessing) setShowWarnConfirm(false) }}
              />
            </div>,
            document.body
          )}
        </>
          {/* Hidden file input used for replace/add media in edit mode */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,application/*"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
      </div>
    </>
  )
}

const arePostCardPropsEqual = (prev: PostCardProps, next: PostCardProps): boolean => {
  if (prev.openFullscreen !== next.openFullscreen) return false
  if ((prev.currentFilter || '') !== (next.currentFilter || '')) return false
  if ((prev.currentUserRole || '') !== (next.currentUserRole || '')) return false

  const prevPost = prev.post
  const nextPost = next.post

  if (prevPost.id !== nextPost.id) return false
  if (getPostRenderSignature(prevPost) !== getPostRenderSignature(nextPost)) return false

  return true
}

export default memo(PostCard, arePostCardPropsEqual)


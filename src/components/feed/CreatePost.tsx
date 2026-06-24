"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { useAuth } from "../../contexts/AuthContext"
import { createPost, archiveAllPosts } from "../../services/postService"
import { createPoll, Poll } from "../../services/pollService"
import { addNotification } from "../../services/notificationService"
import type { PostVisibility } from "../../models/Post"
import { isMobileDevice } from "../../utils/mobileUtils"
import { useSidebar } from '../../contexts/SidebarContext'
import { searchUsers, getAllUsers } from "../../services/userService"

import {
  DocumentTextIcon,
  PhotoIcon,
  XMarkIcon,
  GlobeAltIcon,
  UserGroupIcon,
  UserIcon,
  PaperAirplaneIcon,
  BriefcaseIcon,
  BuildingOfficeIcon,
  AcademicCapIcon,
} from "@heroicons/react/24/outline"
import ConfirmDialog from "../common/ConfirmDialog"
// Using material-icons font instead of @mui/icons-material to avoid SvgIcon build issues
import { getDoc, doc, collection, writeBatch, setDoc, serverTimestamp, updateDoc } from "firebase/firestore"
import { db } from "../../firebase/config"

import type { Post } from "../../models/Post"
import { useSocialActivityTracking } from "../../hooks/useActivityTracking"
import ProfanityModal from "../modals/ProfanityModal"
import { detectProfanity } from "../../utils/profanityFilter"
import PollCard from "./PollCard"

const FilterListIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
  </svg>
)
const getFirstTwoNames = (fullName?: string | null, fallback = "User") => {
  if (!fullName) return fallback
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 0) return fallback
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[1]}`
}

interface CreatePostProps {
  onPostCreated?: (post: Post) => void
  onPollCreated?: () => void
}

const CreatePost: React.FC<CreatePostProps> = ({ onPostCreated, onPollCreated }) => {
  const { currentUser } = useAuth()
  const { logPostCreate } = useSocialActivityTracking()

  const [content, setContent] = useState("")
  const [files, setFiles] = useState<File[]>([])

  // Set default visibility based on user role
  const userRole = currentUser?.role as string | undefined
  const isFaculty = userRole === "faculty"
  const isStudent = userRole === "student"
  const isAlumni = userRole === "alumni"
  const isDean = userRole === "dean"
  const isInfirmary = userRole === "infirmary"
  const isLibrarian = userRole === "librarian"
  const isAdminOrSuperAdmin = userRole === "admin" || userRole === "super admin"

  // Determine if current user is an admin assigned to the Program Chair office
  const isAdminProgramChair = (() => {
    if (!currentUser) return false
    const role = (currentUser.role || '').toLowerCase()
    if (role !== 'admin') return false
    const officeString: string | undefined = (currentUser as any)?.office
    const officesArray: string[] = Array.isArray((currentUser as any)?.offices)
      ? ((currentUser as any).offices as string[])
      : []

    const normalizedOffice = typeof officeString === 'string' ? officeString.toLowerCase() : ''
    const normalizedOffices = officesArray.map(o => (typeof o === 'string' ? o.toLowerCase() : ''))

    return normalizedOffice === 'program chair' || normalizedOffices.includes('program chair')
  })()
  // Force all new posts to be public so they are visible to everyone.
  const defaultVisibility = "public"
  const [visibility, setVisibility] = useState<PostVisibility>(defaultVisibility)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  // Poll modal state removed; poll creation moved to Polls section
  
  // Independent polls state
  const [createdPolls, setCreatedPolls] = useState<Poll[]>([])
  const [isCreatingPoll, setIsCreatingPoll] = useState(false)
  const [minimizedPolls, setMinimizedPolls] = useState<Set<string>>(new Set())
  // Allow minimizing the whole polls container
  const [pollsContainerMinimized, setPollsContainerMinimized] = useState(false)
  const [showVisibilityOptions, setShowVisibilityOptions] = useState(false)
  const [contentError, setContentError] = useState<string | null>(null)
  const [isProcessingContent, setIsProcessingContent] = useState(false)

  // Mobile state
  const [isMobile, setIsMobile] = useState(false)
  const [showFullScreenModal, setShowFullScreenModal] = useState(false)
  // Desktop tag overlay animation flag
  const [overlayEntered, setOverlayEntered] = useState(false)

  // Friends tagging state
  const [showFriendsList, setShowFriendsList] = useState(false)
  const [friends, setFriends] = useState<Array<{ id: string; name: string; profile_pic?: string }>>([])
  const [taggedFriends, setTaggedFriends] = useState<Array<{ id: string; name: string; profile_pic?: string }>>([])
  const [isLoadingFriends, setIsLoadingFriends] = useState(false)
  const [friendsSearchQuery, setFriendsSearchQuery] = useState("")
  const [displayedFriendsCount, setDisplayedFriendsCount] = useState(10)

  // Group tagging state for Super Admin
  const [showGroupTagging, setShowGroupTagging] = useState(false)
  const [taggedGroups, setTaggedGroups] = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const modalTextareaRef = useRef<HTMLTextAreaElement>(null)
  const filterMenuRef = useRef<HTMLDivElement | null>(null)
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [currentFilter, setCurrentFilter] = useState<string>('all')
  const overlayTimerRef = useRef<number | null>(null)
  const [profanityModalOpen, setProfanityModalOpen] = useState(false)
  const [detectedProfaneWords, setDetectedProfaneWords] = useState<string[]>([])

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(isMobileDevice())
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  const { openMobileOverlay } = useSidebar();

  // Focus textarea when modal opens (desktop only). On mobile, avoid auto-focus to prevent keyboard from opening.
  useEffect(() => {
    if (isMobile) return
    if (showFullScreenModal && modalTextareaRef.current) {
      const focusRequest = requestAnimationFrame(() => {
        if (modalTextareaRef.current) {
          modalTextareaRef.current.focus()
        }
      })

      return () => cancelAnimationFrame(focusRequest)
    }
  }, [showFullScreenModal, isMobile])

  // Open composer modal on both mobile and desktop
  const openCreateModal = useCallback(() => {
    setShowFullScreenModal(true)
  }, [])

  const closeModal = useCallback(() => {
    setShowFullScreenModal(false)
  }, [])

  // When the tagging list is closed, reset search and results to avoid stale state
  useEffect(() => {
    if (!showFriendsList) {
      setFriends([])
      setFriendsSearchQuery("")
      setDisplayedFriendsCount(10)
      setIsLoadingFriends(false)
    }
  }, [showFriendsList])

  // Trigger slide-in animation when tag overlay opens
  useEffect(() => {
    if (showFriendsList && !isAdminOrSuperAdmin) {
      setOverlayEntered(false)
      const id = requestAnimationFrame(() => setOverlayEntered(true))
      return () => cancelAnimationFrame(id)
    } else {
      setOverlayEntered(false)
    }
  }, [showFriendsList, isAdminOrSuperAdmin])

  // Function to toggle the tag/user list and fetch users (site-wide) if needed
  const toggleFriendsList = async () => {
    setShowFriendsList(!showFriendsList)
    // The actual fetch is handled by the debounced effect below which watches
    // `showFriendsList` and `friendsSearchQuery`. This keeps behavior consistent
    // for desktop and mobile and allows live search instead of only an initial load.
  }

  // Close helper for desktop overlay with slide-out animation
  const closeTagOverlay = useCallback(() => {
    // Start slide-out
    setOverlayEntered(false)
    // Clear any previous timer
    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current)
    }
    // Delay unmount to allow animation
    overlayTimerRef.current = window.setTimeout(() => {
      setShowFriendsList(false)
      overlayTimerRef.current = null
    }, 300)
  }, [])

  // Handler for the banner search button. Stops propagation so clicking
  // the search button doesn't trigger the banner's onClick (openCreateModal).
  const handleBannerSearchClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
  // Toggle the inline filter container above the role banner
  setShowFilterMenu((v) => !v)
  }

  // Close filter menu on outside click or escape
  // Close on Escape for accessibility
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setShowFilterMenu(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Listen for filter changes from Feed and keep the filter bar visible while a filter is active
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as any
        if (detail && typeof detail.filter === 'string') {
          setCurrentFilter(detail.filter)
        }
      } catch (err) {
        // ignore
      }
    }
    window.addEventListener('set-feed-filter', handler as EventListener)
    return () => window.removeEventListener('set-feed-filter', handler as EventListener)
  }, [])

  // When a non-'all' filter is active, ensure the filter container is visible
  useEffect(() => {
    if (currentFilter && currentFilter !== 'all') {
      setShowFilterMenu(true)
    } else {
      // If filter is back to 'all', hide unless user explicitly opened it
      setShowFilterMenu(false)
    }
  }, [currentFilter])

  const handleSelectFilter = (id: string) => {
    window.dispatchEvent(new CustomEvent('set-feed-filter', { detail: { filter: id } }))
  setCurrentFilter(id)
  // keep the menu visible when user selects a non-'all' filter
  if (id === 'all') setShowFilterMenu(false)
  else setShowFilterMenu(true)
  }

  // Debounced fetch: when tagging UI is open, fetch site users matching the search query
  useEffect(() => {
    if (!showFriendsList || !currentUser) return

    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        setIsLoadingFriends(true)
        const fetched = await searchUsers(friendsSearchQuery || "", currentUser.id, 200)
        if (cancelled) return

        const taggable = fetched
          .filter((u) => !!u && u.id && u.id !== currentUser.id)
          .filter((u) => u.role !== "admin" && u.role !== "super admin")
          .map((user) => ({ id: user.id, name: user.name || "Unknown User", profile_pic: user.profile_pic }))

        setFriends(taggable)
        // If there's an active search query, show more results by default
        setDisplayedFriendsCount(friendsSearchQuery ? Math.max(30, taggable.length) : 10)
      } catch (err) {
        console.error("Error fetching users for tagging:", err)
      } finally {
        if (!cancelled) setIsLoadingFriends(false)
      }
    }, 300) // 300ms debounce

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [friendsSearchQuery, showFriendsList, currentUser])

  // Function to handle tagging/untagging a friend
  const handleToggleTag = (friend: { id: string; name: string; profile_pic?: string }) => {
    const isAlreadyTagged = taggedFriends.some((taggedFriend) => taggedFriend.id === friend.id)

    if (isAlreadyTagged) {
      setTaggedFriends(taggedFriends.filter((taggedFriend) => taggedFriend.id !== friend.id))
    } else {
      setTaggedFriends([...taggedFriends, friend])
    }
  }

  // Function to get display text for tagged friends
  const getTaggedFriendsDisplayText = () => {
    if (taggedFriends.length === 0) return ""
    if (taggedFriends.length === 1) return `with ${taggedFriends[0].name}`
    return `with ${taggedFriends[0].name} and ${taggedFriends.length - 1} other${taggedFriends.length > 2 ? "s" : ""}`
  }

  // Function to get display text for tagged groups (Super Admin)
  const getTaggedGroupsDisplayText = () => {
    if (taggedGroups.length === 0) return ""
    if (taggedGroups.length === 1) return `to all ${taggedGroups[0]}`
    if (taggedGroups.length === 2) return `to all ${taggedGroups[0]} and all ${taggedGroups[1]}`
    return `to all ${taggedGroups[0]} and ${taggedGroups.length - 1} other groups`
  }

  // Function to filter friends based on search query
  const filteredFriends = friends.filter((friend) =>
    friend.name.toLowerCase().includes(friendsSearchQuery.toLowerCase()),
  )

  // Sort: selected users first, then by name
  const taggedIds = new Set(taggedFriends.map((f) => f.id))
  const sortedFriends = [...filteredFriends].sort((a, b) => {
    const aTagged = taggedIds.has(a.id)
    const bTagged = taggedIds.has(b.id)
    if (aTagged && !bTagged) return -1
    if (!aTagged && bTagged) return 1
    return a.name.localeCompare(b.name)
  })

  // Function to get displayed friends (limited to displayedFriendsCount)
  const displayedFriends = sortedFriends.slice(0, displayedFriendsCount)

  const BLOCKED_EXTENSIONS = [
    "exe",
    "msi",
    "com",
    "scr",
    "dll",
    "sys",
    "drv",
    "ps1",
    "vbs",
    "wsf",
    "hta",
    "jar",
    "iso",
    "img",
    "reg",
    "bat",
    "sh",
  ]
  const formatFileNameForChip = (rawUrlOrName: string) => {
    try {
      const rawSegment = (rawUrlOrName.split('?')[0].split('/').pop() || 'File')
      const decoded = decodeURIComponent(rawSegment)
      let fileName = decoded.includes('/') ? decoded.split('/').pop() || decoded : decoded
      fileName = fileName.replace(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_/, '')
      const ext = (fileName.split('.').pop() || '').toLowerCase()
      const fileBase = fileName.split('.').slice(0, -1).join('.') || fileName
      const fileExt = (fileName.split('.').pop() || '').toUpperCase()
      return { fileName, fileBase, fileExt, ext }
    } catch (e) {
      return { fileName: rawUrlOrName, fileBase: rawUrlOrName, fileExt: '', ext: '' }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      const blocked = newFiles.filter((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase()
        return ext && BLOCKED_EXTENSIONS.includes(ext)
      })
      if (blocked.length > 0) {
        setContentError("One or more selected files have a blocked extension and cannot be attached.")
        setTimeout(() => {
          setContent("")
          setFiles([])
          setPreviewUrls([])
          setVisibility(defaultVisibility)
          setContentError(null)
          setTaggedFriends([])
          setShowFriendsList(false)
          setFriendsSearchQuery("")
          setDisplayedFriendsCount(10)
          setTaggedGroups([])
          setShowGroupTagging(false)
        }, 5000)
        return
      }
      const newPreviewUrls = newFiles.map((file) =>
        file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : "",
      )
      setFiles((prevFiles) => [...prevFiles, ...newFiles])
      setPreviewUrls((prevUrls) => [...prevUrls, ...newPreviewUrls])
    }
  }
  // Poll creation was moved to the Polls section (Feed). Create-post no longer opens the poll modal.

  const handlePollSubmit = async (
    options: Array<{ id: string; text: string; count: number }>,
    question: string,
    durationDays?: number
  ) => {
    if (!currentUser || isCreatingPoll) return
    
    try {
      setIsCreatingPoll(true);
      const pollData = {
        type: 'post_poll' as const,
        question: question,
        options: options.map(opt => ({ id: opt.id, text: opt.text })),
        authorId: currentUser.id,
        authorName: currentUser.name,
        authorProfilePic: currentUser.profile_pic,
        authorRole: currentUser.role,
        postId: `independent_${Date.now()}`,
        ...(durationDays && durationDays >= 1 && durationDays <= 3 ? { durationDays } : {})
      };

      const pollId = await createPoll(pollData);
      console.debug('[CreatePost] Independent poll created successfully with ID:', pollId);

      const endDate = durationDays && durationDays >= 1 && durationDays <= 3
        ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
        : undefined;

      const newPoll = {
        id: pollId,
        type: 'post_poll' as const,
        question: question,
        options: options.map(opt => ({ id: opt.id, text: opt.text })),
        authorId: currentUser.id,
        authorName: currentUser.name,
        authorProfilePic: currentUser.profile_pic,
        authorRole: currentUser.role,
        postId: `independent_${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        totalVotes: 0,
        optionCount: options.length,
        ...(durationDays ? { durationDays } : {}),
        ...(endDate ? { endDate, endPollDateTime: endDate, endpollduration: endDate, endPollDuration: durationDays } : {})
      };

      setCreatedPolls(prev => [newPoll, ...prev]);
      
      if (onPollCreated) {
        onPollCreated();
      }
      
    } catch (error) {
      console.error('[CreatePost] Failed to create independent poll:', error);
      setContentError('Failed to create poll. Please try again.');
    } finally {
      setIsCreatingPoll(false);
    }
  }

  const removeFile = (index: number) => {
    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index))
    setPreviewUrls((prevUrls) => prevUrls.filter((_, i) => i !== index))
  }

  const removePoll = (pollId: string) => {
    setCreatedPolls(prev => prev.filter(poll => poll.id !== pollId))
  }

  const togglePollMinimization = (pollId: string) => {
    setMinimizedPolls(prev => {
      const newSet = new Set(prev)
      if (newSet.has(pollId)) {
        newSet.delete(pollId)
      } else {
        newSet.add(pollId)
      }
      return newSet
    })
  }

  const togglePollsContainer = () => {
    const next = !pollsContainerMinimized
    window.dispatchEvent(new CustomEvent('set-polls-container-minimized', { detail: { minimized: next } }))
  }

  // Sync polls container minimized state when other components toggle it
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as any;
        if (detail && typeof detail.minimized === 'boolean') {
          setPollsContainerMinimized(detail.minimized);
        }
      } catch (err) {
        console.error('CreatePost failed to handle set-polls-container-minimized event', err);
      }
    };
    window.addEventListener('set-polls-container-minimized', handler as EventListener);
    return () => window.removeEventListener('set-polls-container-minimized', handler as EventListener);
  }, []);

  const handleContentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value
    setContent(value)
    setContentError(null)
  }

  const handleTagButtonClick = () => {
    if (isAdminOrSuperAdmin) {
      setShowGroupTagging(!showGroupTagging)
    } else {
      toggleFriendsList()
    }
  }

  const handleFriendsSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFriendsSearchQuery(e.target.value)
    setDisplayedFriendsCount(10)
  }

  const clearFriendsSearch = () => {
    setFriendsSearchQuery("")
    setDisplayedFriendsCount(10)
  }

  const loadMoreFriends = () => {
    setDisplayedFriendsCount((prev) => prev + 10)
  }

  const resetDisplayedFriends = () => {
    setDisplayedFriendsCount(10)
  }
  const handleToggleGroupTag = (group: string) => {
    setTaggedGroups((prev) => (prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]))
  }

  const clearGroupTags = () => {
    setTaggedGroups([])
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setIsProcessingContent(true)
    setContentError(null)

    const profaneWords = detectProfanity(content)
    if (profaneWords.length > 0) {
      setDetectedProfaneWords(profaneWords)
      setProfanityModalOpen(true)
      setIsSubmitting(false)
      setIsProcessingContent(false)
      return
    }

    let postContent = content
    const postFiles = [...files]
    // Force post visibility to public regardless of any UI state
    const postVisibility: PostVisibility = 'public'
    const previewURLs = [...previewUrls]

  try {
      if (!currentUser) throw new Error("User not authenticated")

      let taggedFriendIds: string[] = []
      let taggedGroupsData: string[] = []

      if (isAdminOrSuperAdmin) {
        taggedGroupsData = taggedGroups
        console.log("[CreatePost] Tagged groups being sent:", taggedGroupsData)
      } else {
        taggedFriendIds = taggedFriends.map((friend) => friend.id)
        console.log("[CreatePost] Tagged friend IDs being sent:", taggedFriendIds)
      }

      const validTaggedFriendIds = taggedFriendIds.filter((id) => id && typeof id === "string")
      console.log("[CreatePost] Valid tagged friend IDs:", validTaggedFriendIds)

      const postId = await createPost(
        currentUser.id,
        content,
        files,
        postVisibility,
        currentUser,
        validTaggedFriendIds,
        taggedGroupsData,
        false // No longer creating draft posts for polls
      )



      if (postId && onPostCreated) {
        const postRef = doc(db, "posts", postId)
        const postDoc = await getDoc(postRef)
        if (postDoc.exists()) {
          const createdPost = { id: postDoc.id, ...postDoc.data() } as Post
          onPostCreated(createdPost)
        }
      }

      // Notify tagged users that they were tagged in this post
      try {
        if (postId && validTaggedFriendIds && validTaggedFriendIds.length > 0) {
          const posterName = currentUser.name || 'Someone'
          const notifyTargets = validTaggedFriendIds.filter(id => id && id !== currentUser.id)
          if (notifyTargets.length > 0) {
            const promises = notifyTargets.map((targetId) =>
              addNotification({
                userId: targetId,
                type: 'friend_post',
                message: `${posterName} tagged you in a post`,
                relatedId: postId,
                extra: { posterId: currentUser.id, posterName }
              }).catch((e) => console.error('[CreatePost] Failed to notify tagged user', targetId, e))
            )
            await Promise.all(promises)
            console.debug('[CreatePost] Sent tagged-user notifications for post', postId)
          }
        }
      } catch (notifErr) {
        console.error('[CreatePost] Error notifying tagged users:', notifErr)
      }

      // If admin used group tagging (e.g., Students, Faculties, Alumni, Admins), notify matching users
      try {
        if (postId && taggedGroupsData && taggedGroupsData.length > 0) {
          const posterName = currentUser.name || 'Someone'
          try {
            const allUsers = await getAllUsers()
            // Map common display group names to user.role values
            const groupToRoleMap: Record<string, string> = {
              Students: 'student',
              Faculties: 'faculty',
              Alumni: 'alumni',
              Admins: 'admin'
            }
            const targetRoles = taggedGroupsData.map(g => (groupToRoleMap[g] || g.toLowerCase()))
            const groupTargets = allUsers.filter(u => u && u.id && targetRoles.includes((u.role || '').toLowerCase()))
            const groupTargetIds = Array.from(new Set(groupTargets.map(u => u.id))).filter(id => id && id !== currentUser.id)
            if (groupTargetIds.length > 0) {
              const groupMsg = `${posterName} tagged ${taggedGroupsData.join(', ')} in a post`
              const promises = groupTargetIds.map((targetId) =>
                addNotification({
                  userId: targetId,
                  type: 'friend_post',
                  message: groupMsg,
                  relatedId: postId,
                  extra: { posterId: currentUser.id, posterName, taggedGroups: taggedGroupsData }
                }).catch((e) => console.error('[CreatePost] Failed to notify group member', targetId, e))
              )
              await Promise.all(promises)
              console.debug('[CreatePost] Sent group-tag notifications for post', postId, 'groups:', taggedGroupsData)
            }
          } catch (e) {
            console.error('[CreatePost] Error fetching users to notify for tagged groups:', e)
          }
        }
      } catch (grpNotifErr) {
        console.error('[CreatePost] Error notifying tagged groups:', grpNotifErr)
      }

      await logPostCreate(postId, postVisibility)

      setContent("")
      setFiles([])
      setPreviewUrls([])
      setVisibility(defaultVisibility)
      setContentError(null)
      setTaggedFriends([])
      setShowFriendsList(false)
      setFriendsSearchQuery("")
      setDisplayedFriendsCount(10)
      setTaggedGroups([])
      setShowGroupTagging(false)

      closeModal()
    } catch (error) {
      console.error("Post creation failed:", error)

      setContent(postContent)
      setFiles(postFiles)
      setPreviewUrls(previewURLs)
    setVisibility(postVisibility)
      setContentError("Failed to create post. Please try again.")
    } finally {
      setIsSubmitting(false)
      setIsProcessingContent(false)
    }
  }

  const getVisibilityIcon = (visibility: PostVisibility) => {
    switch (visibility) {
      case "public":
        return <GlobeAltIcon className="h-4 w-4 sm:h-5 sm:w-5" />
      case "friends":
        return <UserGroupIcon className="h-4 w-4 sm:h-5 sm:w-5" />
      case "poshed":
      case "fipo":
      case "afea":
      case "shatmo":
        return <BuildingOfficeIcon className="h-4 w-4 sm:h-5 sm:w-5" />
      default:
        return <UserIcon className="h-4 w-4 sm:h-5 sm:w-5" />
    }
  }
  const canCreatePost =
    !!currentUser && (
      isAdminOrSuperAdmin ||
      isStudent ||
      isFaculty ||
      isAlumni ||
      isDean ||
      isInfirmary ||
      isLibrarian
    )

  const POST_VISIBILITY_OPTIONS: { value: PostVisibility; label: string; icon: any }[] = []

  // Only add public option for non-faculty, non-student, and non-alumni users
  if (!isFaculty && !isStudent && !isAlumni) {
    POST_VISIBILITY_OPTIONS.push({ value: "public", label: "Everyone at BulSU Space", icon: GlobeAltIcon })
  }

  // Friends visibility option removed (KaSpace deprecated). Posts default to public.

  // Add user's organization if they have one
  const userDepartment = currentUser?.department
  if (userDepartment && userDepartment !== "NONE") {
    const departmentOption = {
      value: userDepartment.toLowerCase() as PostVisibility,
      label: userDepartment,
      icon: BuildingOfficeIcon,
    }
    POST_VISIBILITY_OPTIONS.push(departmentOption)
  }

  const getVisibilityLabel = (visibility: PostVisibility) => {
    const found = POST_VISIBILITY_OPTIONS.find((option) => option.value === visibility)
    return found ? found.label : "Unknown"
  }

  // If admin or super admin, force visibility to 'public'
  useEffect(() => {
    if (isAdminOrSuperAdmin && visibility !== "public") {
      setVisibility("public")
    }
  }, [isAdminOrSuperAdmin, visibility])

  if (!canCreatePost) return null

  return (
    <>
      <div className="w-full mb-0 sm:mb-1 relative">
        {showFilterMenu && (
          <div ref={filterMenuRef} className="mb-1 px-0 flex justify-center">
            <div className="w-full max-w-lg lg:max-w-4xl flex items-center justify-between gap-2 rounded-none sm:rounded-xl p-1 px-4 bg-gradient-to-r from-gray-900/80 to-gray-800/70 border border-gray-700/60 shadow-lg">
              <button
                type="button"
                onClick={() => handleSelectFilter("all")}
                aria-pressed={currentFilter === "all"}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-1 text-sm font-semibold rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                  currentFilter === "all"
                    ? "bg-white/10 text-white ring-1 ring-cyan-400"
                    : "bg-transparent text-gray-200 hover:bg-gray-700/40"
                }`}
              >
                <DocumentTextIcon className={`h-4 w-4 ${currentFilter === "all" ? "text-white" : "text-gray-300"}`} />
                <span className="hidden sm:inline">All</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectFilter("announcements")}
                aria-pressed={currentFilter === "announcements"}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-1 text-sm font-semibold rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                  currentFilter === "announcements"
                    ? "bg-white/10 text-white ring-1 ring-cyan-400"
                    : "bg-transparent text-gray-200 hover:bg-gray-700/40"
                }`}
              >
                <AcademicCapIcon className={`h-4 w-4 ${currentFilter === "announcements" ? "text-white" : "text-gray-300"}`} />
                <span className="hidden sm:inline">Announcements</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectFilter("yours")}
                aria-pressed={currentFilter === "yours"}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-1 text-sm font-semibold rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                  currentFilter === "yours"
                    ? "bg-white/10 text-white ring-1 ring-cyan-400"
                    : "bg-transparent text-gray-200 hover:bg-gray-700/40"
                }`}
              >
                <UserIcon className={`h-4 w-4 ${currentFilter === "yours" ? "text-white" : "text-gray-300"}`} />
                <span className="hidden sm:inline">Your posts</span>
              </button>


              <button
                type="button"
                onClick={() => handleSelectFilter("polls")}
                aria-pressed={currentFilter === "polls"}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-1 text-sm font-semibold rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                  currentFilter === "polls"
                    ? "bg-white/10 text-white ring-1 ring-cyan-400"
                    : "bg-transparent text-gray-200 hover:bg-gray-700/40"
                }`}
              >
                <UserGroupIcon className={`h-4 w-4 ${currentFilter === "polls" ? "text-white" : "text-gray-300"}`} />
                <span className="hidden sm:inline">Polls</span>
              </button>

              {/* ARCHIVE FILTER DISABLED: temporarily commenting out archives filter UI and logic
              <button
                type="button"
                onClick={() => handleSelectFilter("archives")}
                aria-pressed={currentFilter === "archives"}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-1 text-sm font-semibold rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                  currentFilter === "archives"
                    ? "bg-white/10 text-white ring-1 ring-cyan-400"
                    : "bg-transparent text-gray-200 hover:bg-gray-700/40"
                }`}
              >
                <span className={`material-icons text-base ${currentFilter === "archives" ? "text-white" : "text-gray-300"}`}>bookmark</span>
                <span className="hidden sm:inline">Archives</span>
              </button>
              */}
            </div>
          </div>
        )}
        {isMobile && (
          <>
            {isAdminOrSuperAdmin && (
              <div className="mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openMobileOverlay()
                  }}
                  aria-label="Open left panel"
                  title="Open left panel"
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-cyan-200 flex items-center justify-center group focus:outline-none focus:ring-0 md:hidden"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center">
                    <span className="material-icons text-cyan-200">menu_open</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-cyan-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                      <FilterListIcon className="w-6 h-6 text-cyan-200" />
                    </div>
                </button>
                {(isAdminOrSuperAdmin || isAdminProgramChair) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleBannerSearchClick(e as any)
                      window.dispatchEvent(new CustomEvent('set-feed-filter', { detail: { filter: 'reported' } }))
                      setCurrentFilter('reported')
                    }}
                    aria-label="Reported posts"
                    title="Reported posts"
                    className="absolute right-12 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-cyan-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                      <span className="material-icons text-cyan-200">report</span>
                    </div>
                  </button>
                )}
                
                
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-900/70 via-teal-800/60 to-blue-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none bg-gradient-to-r from-cyan-400/30 via-teal-400/30 to-blue-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-3 py-2 border border-cyan-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-14 h-0.5 bg-gradient-to-r from-transparent via-cyan-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="relative">
                      <div className="w-4 h-4 bg-cyan-500/20 rounded-none flex items-center justify-center backdrop-blur-sm border border-cyan-400/30">
                        <UserIcon className="w-2.5 h-2.5 text-cyan-300" />
                      </div>
                      <div className="absolute inset-0 w-4 h-4 bg-cyan-400/20 rounded-none animate-ping"></div>
                    </div>
                    <span className="text-cyan-100 text-xs font-bold tracking-wider bg-gradient-to-r from-cyan-200 to-teal-200 bg-clip-text text-transparent">
                      {userRole === "super admin" ? "Super Admin Announcement" : "Admin Announcement"}
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-20 h-0.5 bg-gradient-to-r from-transparent via-teal-300 to-transparent"></div>
                </div>
                
              </div>
            )}

            {isFaculty && (
              <div className="mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openMobileOverlay()
                  }}
                  aria-label="Open left panel"
                  title="Open left panel"
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-blue-200 flex items-center justify-center group focus:outline-none focus:ring-0 md:hidden"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center">
                    <span className="material-icons text-blue-200">menu_open</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-blue-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                    <FilterListIcon className="w-6 h-6 text-blue-200" />
                  </div>
                </button>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-900/70 via-purple-800/60 to-indigo-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none bg-gradient-to-r from-blue-400/30 via-purple-400/30 to-indigo-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-3 py-2 border border-blue-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-14 h-0.5 bg-gradient-to-r from-transparent via-blue-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="relative">
                      <div className="w-4 h-4 bg-blue-500/20 rounded-none flex items-center justify-center backdrop-blur-sm border border-blue-400/30">
                        <BriefcaseIcon className="w-2.5 h-2.5 text-blue-300" />
                      </div>
                      <div className="absolute inset-0 w-4 h-4 bg-blue-400/20 rounded-none animate-ping"></div>
                    </div>
                    <span className="text-blue-100 text-xs font-bold tracking-wider bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent">
                      Faculty Academic Post
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-18 h-0.5 bg-gradient-to-r from-transparent via-purple-300 to-transparent"></div>
                </div>
                
              </div>
            )}

            {isStudent && (
              <div className="mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openMobileOverlay()
                  }}
                  aria-label="Open left panel"
                  title="Open left panel"
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-green-200 flex items-center justify-center group focus:outline-none focus:ring-0 md:hidden"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center">
                    <span className="material-icons text-green-200">menu_open</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-green-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                    <FilterListIcon className="w-6 h-6 text-green-200" />
                  </div>
                </button>
                <div className="absolute inset-0 bg-gradient-to-r from-green-900/70 via-emerald-800/60 to-teal-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none bg-gradient-to-r from-green-400/30 via-emerald-400/30 to-teal-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-3 py-2 border border-green-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-14 h-0.5 bg-gradient-to-r from-transparent via-green-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="relative">
                      <div className="w-4 h-4 bg-green-500/20 rounded-none flex items-center justify-center backdrop-blur-sm border border-green-400/30">
                        <AcademicCapIcon className="w-2.5 h-2.5 text-green-300" />
                      </div>
                      <div className="absolute inset-0 w-4 h-4 bg-green-400/20 rounded-none animate-ping"></div>
                    </div>
                    <span className="text-green-100 text-xs font-bold tracking-wider bg-gradient-to-r from-green-200 to-emerald-200 bg-clip-text text-transparent">
                      Student Community Post
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-20 h-0.5 bg-gradient-to-r from-transparent via-emerald-300 to-transparent"></div>
                </div>
                
              </div>
            )}

            {isAlumni && (
              <div className="mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openMobileOverlay()
                  }}
                  aria-label="Open left panel"
                  title="Open left panel"
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-orange-200 flex items-center justify-center group focus:outline-none focus:ring-0 md:hidden"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center">
                    <span className="material-icons text-orange-200">menu_open</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-orange-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                    <FilterListIcon className="w-6 h-6 text-orange-200" />
                  </div>
                </button>
                <div className="absolute inset-0 bg-gradient-to-r from-orange-900/70 via-amber-800/60 to-yellow-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none bg-gradient-to-r from-orange-400/30 via-amber-400/30 to-yellow-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-3 py-2 border border-orange-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-14 h-0.5 bg-gradient-to-r from-transparent via-orange-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="relative">
                      <div className="w-4 h-4 bg-orange-500/20 rounded-none flex items-center justify-center backdrop-blur-sm border border-orange-400/30">
                        <UserIcon className="w-2.5 h-2.5 text-orange-300" />
                      </div>
                      <div className="absolute inset-0 w-4 h-4 bg-orange-400/20 rounded-none animate-ping"></div>
                    </div>
                    <span className="text-orange-100 text-xs font-bold tracking-wider bg-gradient-to-r from-orange-200 to-amber-200 bg-clip-text text-transparent">
                      Alumni Network Post
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-20 h-0.5 bg-gradient-to-r from-transparent via-amber-300 to-transparent"></div>
                </div>
                
              </div>
            )}

            {isDean && (
              <div className="mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openMobileOverlay()
                  }}
                  aria-label="Open left panel"
                  title="Open left panel"
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-violet-200 flex items-center justify-center group focus:outline-none focus:ring-0 md:hidden"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center">
                    <span className="material-icons text-violet-200">menu_open</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-violet-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                    <FilterListIcon className="w-6 h-6 text-violet-200" />
                  </div>
                </button>
                <div className="absolute inset-0 bg-gradient-to-r from-violet-900/70 via-purple-800/60 to-indigo-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none bg-gradient-to-r from-violet-400/30 via-purple-400/30 to-indigo-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-3 py-2 border border-violet-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-14 h-0.5 bg-gradient-to-r from-transparent via-violet-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="relative">
                      <div className="w-4 h-4 bg-violet-500/20 rounded-none flex items-center justify-center backdrop-blur-sm border border-violet-400/30">
                        <AcademicCapIcon className="w-2.5 h-2.5 text-violet-300" />
                      </div>
                      <div className="absolute inset-0 w-4 h-4 bg-violet-400/20 rounded-none animate-ping"></div>
                    </div>
                    <span className="text-violet-100 text-xs font-bold tracking-wider bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent">
                      Dean Advisory Post
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-20 h-0.5 bg-gradient-to-r from-transparent via-indigo-300 to-transparent"></div>
                </div>
              </div>
            )}

            {isInfirmary && (
              <div className="mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openMobileOverlay()
                  }}
                  aria-label="Open left panel"
                  title="Open left panel"
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-rose-200 flex items-center justify-center group focus:outline-none focus:ring-0 md:hidden"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center">
                    <span className="material-icons text-rose-200">menu_open</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-rose-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                    <FilterListIcon className="w-6 h-6 text-rose-200" />
                  </div>
                </button>
                <div className="absolute inset-0 bg-gradient-to-r from-rose-900/70 via-red-800/60 to-pink-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none bg-gradient-to-r from-rose-400/30 via-red-400/30 to-pink-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-3 py-2 border border-rose-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-14 h-0.5 bg-gradient-to-r from-transparent via-rose-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="relative">
                      <div className="w-4 h-4 bg-rose-500/20 rounded-none flex items-center justify-center backdrop-blur-sm border border-rose-400/30">
                        <UserGroupIcon className="w-2.5 h-2.5 text-rose-300" />
                      </div>
                      <div className="absolute inset-0 w-4 h-4 bg-rose-400/20 rounded-none animate-ping"></div>
                    </div>
                    <span className="text-rose-100 text-xs font-bold tracking-wider bg-gradient-to-r from-rose-200 to-pink-200 bg-clip-text text-transparent">
                      Infirmary Health Post
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-20 h-0.5 bg-gradient-to-r from-transparent via-pink-300 to-transparent"></div>
                </div>
              </div>
            )}

            {isLibrarian && (
              <div className="mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openMobileOverlay()
                  }}
                  aria-label="Open left panel"
                  title="Open left panel"
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-green-200 flex items-center justify-center group focus:outline-none focus:ring-0 md:hidden"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center">
                    <span className="material-icons text-green-200">menu_open</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-green-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                    <FilterListIcon className="w-6 h-6 text-green-200" />
                  </div>
                </button>
                <div className="absolute inset-0 bg-gradient-to-r from-green-900/70 via-emerald-800/60 to-teal-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none bg-gradient-to-r from-green-400/30 via-emerald-400/30 to-teal-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-3 py-2 border border-green-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-14 h-0.5 bg-gradient-to-r from-transparent via-green-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="relative">
                      <div className="w-4 h-4 bg-green-500/20 rounded-none flex items-center justify-center backdrop-blur-sm border border-green-400/30">
                        <DocumentTextIcon className="w-2.5 h-2.5 text-green-300" />
                      </div>
                      <div className="absolute inset-0 w-4 h-4 bg-green-400/20 rounded-none animate-ping"></div>
                    </div>
                    <span className="text-green-100 text-xs font-bold tracking-wider bg-gradient-to-r from-green-200 to-emerald-200 bg-clip-text text-transparent">
                      Librarian Resource Post
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-20 h-0.5 bg-gradient-to-r from-transparent via-emerald-300 to-transparent"></div>
                </div>
              </div>
            )}

            <div
              className={`
                ${
                  isAdminOrSuperAdmin
                    ? "bg-gradient-to-br from-cyan-900/20 via-gray-800/90 to-teal-900/20 border-cyan-500/40"
                    : isFaculty
                      ? "bg-gradient-to-br from-blue-900/20 via-gray-800/90 to-purple-900/20 border-blue-500/40"
                      : isStudent
                        ? "bg-gradient-to-br from-green-900/20 via-gray-800/90 to-teal-900/20 border-green-500/40"
                        : isAlumni
                          ? "bg-gradient-to-br from-orange-900/20 via-gray-800/90 to-amber-900/20 border-orange-500/40"
                          : "bg-gradient-to-b from-gray-800/80 to-gray-900/90 border-gray-700/50"
                } rounded-none sm:rounded-xl shadow-lg sm:shadow-xl border-0 sm:border border-t border-b overflow-hidden backdrop-blur-sm transition-all duration-300 mb-1 hover:shadow-2xl animate-fadeIn w-full
              `}
              onClick={openCreateModal}
            >
              <div
                className={`py-3 px-4 border-b flex items-center ${
                  isAdminOrSuperAdmin
                    ? "border-cyan-800/50 bg-cyan-900/10"
                    : isFaculty
                      ? "border-blue-800/50 bg-blue-900/10"
                      : isStudent
                        ? "border-green-800/50 bg-green-900/10"
                        : isAlumni
                          ? "border-orange-800/50 bg-orange-900/10"
                          : "border-gray-800/50"
                }`}
              >
                <div className="relative">
                  {currentUser?.profile_pic && currentUser.profile_pic.trim() !== "" ? (
                    <img
                      src={currentUser.profile_pic || "/placeholder.svg"}
                      alt={currentUser?.name || "User"}
                      className={`w-8 h-8 rounded-full mr-2.5 border-2 object-cover shadow-lg ${
                        isAdminOrSuperAdmin
                          ? "border-cyan-500/70"
                          : isFaculty
                            ? "border-blue-500/70"
                            : isStudent
                              ? "border-green-500/70"
                              : isAlumni
                                ? "border-orange-500/70"
                                : "border-gray-700/70"
                      }`}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.onerror = null
                        target.src = "/images/default-avatar.png"
                      }}
                    />
                  ) : (
                    <div
                      className={`w-8 h-8 rounded-full mr-2.5 border-2 bg-gray-800 flex items-center justify-center font-bold text-base ${
                        isAdminOrSuperAdmin
                          ? "border-cyan-500/50 text-cyan-400"
                          : isFaculty
                            ? "border-blue-500/50 text-blue-400"
                            : isStudent
                              ? "border-green-500/50 text-green-400"
                              : isAlumni
                                ? "border-orange-500/50 text-orange-400"
                                : "border-gray-700/50 text-green-500"
                      }`}
                    >
                      {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
                    </div>
                  )}
                </div>
                <div
                  className={`flex-1 py-2 px-4 ${
                    isAdminOrSuperAdmin
                      ? "bg-cyan-900/30 text-cyan-300"
                      : isFaculty
                        ? "bg-blue-900/30 text-blue-300"
                        : isStudent
                          ? "bg-green-900/30 text-green-300"
                          : isAlumni
                            ? "bg-orange-900/30 text-orange-300"
                            : "bg-gray-800/60 text-gray-300"
                  } rounded-lg text-[13px] shadow-inner relative ring-1 ring-opacity-30 ${
                    isAdminOrSuperAdmin
                      ? "ring-cyan-500"
                      : isFaculty
                        ? "ring-blue-500"
                        : isStudent
                          ? "ring-green-500"
                          : isAlumni
                            ? "ring-orange-500"
                            : "ring-gray-500"
                  }`}
                >
                  <div className="overflow-hidden w-full">
                    <span className="inline-block pr-1">
                      {isAdminOrSuperAdmin
                        ? `Share an announcement, ${getFirstTwoNames(currentUser?.name, "Admin")}...`
                        : isFaculty
                          ? `Share your academic insights, ${getFirstTwoNames(currentUser?.name, "Professor")}...`
                          : isStudent
                            ? `What's on your mind, ${getFirstTwoNames(currentUser?.name, "Student")}?`
                            : `What's on your mind, ${getFirstTwoNames(currentUser?.name, "User")}?`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {!isMobile && (
          <div>
            {isAdminOrSuperAdmin && (
              <div className="mb-0 sm:mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-cyan-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                    <FilterListIcon className="w-6 h-6 text-cyan-200" />
                  </div>
                </button>
                {(isAdminOrSuperAdmin || isAdminProgramChair) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      window.dispatchEvent(new CustomEvent('set-feed-filter', { detail: { filter: 'reported' } }))
                      setCurrentFilter('reported')
                    }}
                    aria-label="Reported posts"
                    title="Reported posts"
                    className="absolute right-14 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-cyan-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                      <span className="material-icons text-cyan-200">report</span>
                    </div>
                  </button>
                )}
                {/* ARCHIVE UI & ACTIONS DISABLED: Temporarily disabling Super Admin annual-archive UI and logic.
                {userRole === 'super admin' && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!currentUser) return
                        setShowArchiveConfirm(true)
                      }}
                      aria-label="Annual Archive Post"
                      title="Annual Archive Post"
                      className="absolute right-28 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-cyan-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                        <span className="material-symbols-outlined text-cyan-200">save_clock</span>
                      </div>
                    </button>

                    // Debug unarchive helper removed

                    <ConfirmDialog
                      open={showArchiveConfirm}
                      title="Move posts to Annual Archive"
                      message={
                        <div className="text-sm">
                          <p>
                            Move all posts that haven't been archived yet into the Annual Archive?
                            Archived posts will no longer show in the regular feed but can still be viewed
                            in the Archives section.
                          </p>
                          <p className="text-xs text-gray-400 mt-2">
                            This process may take a few minutes. Only Super Admins should run this. Do you want to continue?
                          </p>
                        </div>
                      }
                      confirmLabel={isArchiving ? 'Archiving…' : 'Archive posts'}
                      cancelLabel="Cancel"
                      confirmTone="danger"
                      headerTone="danger"
                      isProcessing={isArchiving}
                      onConfirm={async () => {
                        setShowArchiveConfirm(false)
                        try {
                          setIsArchiving(true)
                          const result = await archiveAllPosts(currentUser.id, { inclusive: true })
                          alert(`Archive completed. Archived ${result.archivedCount} posts.`)
                          window.dispatchEvent(new CustomEvent('set-feed-filter', { detail: { filter: 'archives' } }))
                        } catch (err: any) {
                          console.error('Annual archive failed', err)
                          alert('Annual archive failed: ' + (err?.message || String(err)))
                        } finally {
                          setIsArchiving(false)
                        }
                      }}
                      onCancel={() => { if (!isArchiving) setShowArchiveConfirm(false) }}
                    />
                  </>
                )}
                */}
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-900/70 via-teal-800/60 to-blue-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none sm:rounded-xl bg-gradient-to-r from-cyan-400/30 via-teal-400/30 to-blue-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-4 py-3 rounded-none sm:rounded-xl border border-cyan-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-16 h-0.5 bg-gradient-to-r from-transparent via-cyan-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="relative">
                      <div className="w-5 h-5 bg-cyan-500/20 rounded-none sm:rounded-full flex items-center justify-center backdrop-blur-sm border border-cyan-400/30">
                        <UserIcon className="w-3 h-3 text-cyan-300" />
                      </div>
                      <div className="absolute inset-0 w-5 h-5 bg-cyan-400/20 rounded-none sm:rounded-full animate-ping"></div>
                    </div>
                    <span className="text-cyan-100 text-sm font-bold tracking-wider bg-gradient-to-r from-cyan-200 to-teal-200 bg-clip-text text-transparent">
                      {userRole === "super admin" ? "Super Admin Announcement" : "Admin Announcement"}
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-20 h-0.5 bg-gradient-to-r from-transparent via-teal-300 to-transparent"></div>
                </div>
              </div>
            )}

            {isFaculty && (
              <div className="mb-0 sm:mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-blue-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                    <FilterListIcon className="w-6 h-6 text-blue-200" />
                  </div>
                </button>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-900/70 via-purple-800/60 to-indigo-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none sm:rounded-xl bg-gradient-to-r from-blue-400/30 via-purple-400/30 to-indigo-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-4 py-3 rounded-none sm:rounded-xl border border-blue-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-16 h-0.5 bg-gradient-to-r from-transparent via-blue-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="relative">
                      <div className="w-5 h-5 bg-blue-500/20 rounded-none sm:rounded-full flex items-center justify-center backdrop-blur-sm border border-blue-400/30">
                        <BriefcaseIcon className="w-3 h-3 text-blue-300" />
                      </div>
                      <div className="absolute inset-0 w-5 h-5 bg-blue-400/20 rounded-none sm:rounded-full animate-ping"></div>
                    </div>
                    <span className="text-blue-100 text-sm font-bold tracking-wider bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent">
                      Faculty Academic Post
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-20 h-0.5 bg-gradient-to-r from-transparent via-purple-300 to-transparent"></div>
                </div>
              </div>
            )}

            {isStudent && (
              <div className="mb-0 sm:mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-green-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                    <FilterListIcon className="w-6 h-6 text-green-200" />
                  </div>
                </button>
                <div className="absolute inset-0 bg-gradient-to-r from-green-900/70 via-emerald-800/60 to-teal-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none sm:rounded-xl bg-gradient-to-r from-green-400/30 via-emerald-400/30 to-teal-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-4 py-3 rounded-none sm:rounded-xl border border-green-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-16 h-0.5 bg-gradient-to-r from-transparent via-green-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="relative">
                      <div className="w-5 h-5 bg-green-500/20 rounded-none sm:rounded-full flex items-center justify-center backdrop-blur-sm border border-green-400/30">
                        <AcademicCapIcon className="w-3 h-3 text-green-300" />
                      </div>
                      <div className="absolute inset-0 w-5 h-5 bg-green-400/20 rounded-none sm:rounded-full animate-ping"></div>
                    </div>
                    <span className="text-green-100 text-sm font-bold tracking-wider bg-gradient-to-r from-green-200 to-emerald-200 bg-clip-text text-transparent">
                      Student Community Post
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-20 h-0.5 bg-gradient-to-r from-transparent via-emerald-300 to-transparent"></div>
                </div>
              </div>
            )}

            {isAlumni && (
              <div className="mb-0 sm:mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-orange-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                    <FilterListIcon className="w-6 h-6 text-orange-200" />
                  </div>
                </button>
                <div className="absolute inset-0 bg-gradient-to-r from-orange-900/70 via-amber-800/60 to-yellow-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none sm:rounded-xl bg-gradient-to-r from-orange-400/30 via-amber-400/30 to-yellow-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-4 py-3 rounded-none sm:rounded-xl border border-orange-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-16 h-0.5 bg-gradient-to-r from-transparent via-orange-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="relative">
                      <div className="w-5 h-5 bg-orange-500/20 rounded-none flex items-center justify-center backdrop-blur-sm border border-orange-400/30">
                        <UserIcon className="w-3 h-3 text-orange-300" />
                      </div>
                      <div className="absolute inset-0 w-5 h-5 bg-orange-400/20 rounded-none sm:rounded-full animate-ping"></div>
                    </div>
                    <span className="text-orange-100 text-sm font-bold tracking-wider bg-gradient-to-r from-orange-200 to-amber-200 bg-clip-text text-transparent">
                      Alumni Network Post
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-20 h-0.5 bg-gradient-to-r from-transparent via-amber-300 to-transparent"></div>
                </div>
              </div>
            )}

            {isDean && (
              <div className="mb-0 sm:mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-violet-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                    <FilterListIcon className="w-6 h-6 text-violet-200" />
                  </div>
                </button>
                <div className="absolute inset-0 bg-gradient-to-r from-violet-900/70 via-purple-800/60 to-indigo-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none sm:rounded-xl bg-gradient-to-r from-violet-400/30 via-purple-400/30 to-indigo-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-4 py-3 rounded-none sm:rounded-xl border border-violet-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-16 h-0.5 bg-gradient-to-r from-transparent via-violet-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="relative">
                      <div className="w-5 h-5 bg-violet-500/20 rounded-none sm:rounded-full flex items-center justify-center backdrop-blur-sm border border-violet-400/30">
                        <AcademicCapIcon className="w-3 h-3 text-violet-300" />
                      </div>
                      <div className="absolute inset-0 w-5 h-5 bg-violet-400/20 rounded-none sm:rounded-full animate-ping"></div>
                    </div>
                    <span className="text-violet-100 text-sm font-bold tracking-wider bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent">
                      Dean Advisory Post
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-20 h-0.5 bg-gradient-to-r from-transparent via-indigo-300 to-transparent"></div>
                </div>
              </div>
            )}

            {isInfirmary && (
              <div className="mb-0 sm:mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-rose-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                    <FilterListIcon className="w-6 h-6 text-rose-200" />
                  </div>
                </button>
                <div className="absolute inset-0 bg-gradient-to-r from-rose-900/70 via-red-800/60 to-pink-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none sm:rounded-xl bg-gradient-to-r from-rose-400/30 via-red-400/30 to-pink-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-4 py-3 rounded-none sm:rounded-xl border border-rose-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-16 h-0.5 bg-gradient-to-r from-transparent via-rose-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="relative">
                      <div className="w-5 h-5 bg-rose-500/20 rounded-none sm:rounded-full flex items-center justify-center backdrop-blur-sm border border-rose-400/30">
                        <UserGroupIcon className="w-3 h-3 text-rose-300" />
                      </div>
                      <div className="absolute inset-0 w-5 h-5 bg-rose-400/20 rounded-none sm:rounded-full animate-ping"></div>
                    </div>
                    <span className="text-rose-100 text-sm font-bold tracking-wider bg-gradient-to-r from-rose-200 to-pink-200 bg-clip-text text-transparent">
                      Infirmary Health Post
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-20 h-0.5 bg-gradient-to-r from-transparent via-pink-300 to-transparent"></div>
                </div>
              </div>
            )}

            {isLibrarian && (
              <div className="mb-0 sm:mb-1 relative overflow-hidden">
                <button
                  type="button"
                  onClick={handleBannerSearchClick}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 z-20 p-1 rounded-full bg-transparent text-green-200 flex items-center justify-center group focus:outline-none focus:ring-0"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center ring-0">
                    <FilterListIcon className="w-6 h-6 text-green-200" />
                  </div>
                </button>
                <div className="absolute inset-0 bg-gradient-to-r from-green-900/70 via-emerald-800/60 to-teal-900/70 animate-gradient-x"></div>
                <div className="absolute inset-0 rounded-none sm:rounded-xl bg-gradient-to-r from-green-400/30 via-emerald-400/30 to-teal-400/30 blur-sm animate-pulse"></div>
                <div className="relative px-4 py-3 rounded-none sm:rounded-xl border border-green-400/40 shadow-2xl backdrop-blur-sm">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-16 h-0.5 bg-gradient-to-r from-transparent via-green-300 to-transparent"></div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="relative">
                      <div className="w-5 h-5 bg-green-500/20 rounded-none sm:rounded-full flex items-center justify-center backdrop-blur-sm border border-green-400/30">
                        <DocumentTextIcon className="w-3 h-3 text-green-300" />
                      </div>
                      <div className="absolute inset-0 w-5 h-5 bg-green-400/20 rounded-none sm:rounded-full animate-ping"></div>
                    </div>
                    <span className="text-green-100 text-sm font-bold tracking-wider bg-gradient-to-r from-green-200 to-emerald-200 bg-clip-text text-transparent">
                      Librarian Resource Post
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-20 h-0.5 bg-gradient-to-r from-transparent via-emerald-300 to-transparent"></div>
                </div>
              </div>
            )}

            <div
              className={`
                ${
                  isAdminOrSuperAdmin
                    ? "bg-gradient-to-br from-cyan-900/20 via-gray-800/90 to-teal-900/20 border-cyan-500/40"
                    : isFaculty
                      ? "bg-gradient-to-br from-blue-900/20 via-gray-800/90 to-purple-900/20 border-blue-500/40"
                      : isStudent
                        ? "bg-gradient-to-br from-green-900/20 via-gray-800/90 to-teal-900/20 border-green-500/40"
                        : isAlumni
                          ? "bg-gradient-to-br from-orange-900/20 via-gray-800/90 to-amber-900/20 border-orange-500/40"
                          : "bg-gradient-to-b from-gray-800/80 to-gray-900/90 border-gray-700/50"
                } rounded-none sm:rounded-xl shadow-lg sm:shadow-xl border-0 sm:border border-t border-b overflow-hidden backdrop-blur-sm transition-all duration-300 mb-1 hover:shadow-2xl animate-fadeIn w-full cursor-pointer
              `}
              onClick={openCreateModal}
            >
              <div
                className={`py-3 px-4 border-b flex items-center ${
                  isAdminOrSuperAdmin
                    ? "border-cyan-800/50 bg-cyan-900/10"
                    : isFaculty
                      ? "border-blue-800/50 bg-blue-900/10"
                      : isStudent
                        ? "border-green-800/50 bg-green-900/10"
                        : isAlumni
                          ? "border-orange-800/50 bg-orange-900/10"
                          : "border-gray-800/50"
                }`}
              >
                <div className="relative">
                  {currentUser?.profile_pic && currentUser.profile_pic.trim() !== "" ? (
                    <img
                      src={currentUser.profile_pic || "/placeholder.svg"}
                      alt={currentUser?.name || "User"}
                      className={`w-8 h-8 rounded-full mr-2.5 border-2 object-cover shadow-lg ${
                        isAdminOrSuperAdmin
                          ? "border-cyan-500/70"
                          : isFaculty
                            ? "border-blue-500/70"
                            : isStudent
                              ? "border-green-500/70"
                              : isAlumni
                                ? "border-orange-500/70"
                                : "border-gray-700/70"
                      }`}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.onerror = null
                        target.src = "/images/default-avatar.png"
                      }}
                    />
                  ) : (
                    <div
                      className={`w-8 h-8 rounded-full mr-2.5 border-2 bg-gray-800 flex items-center justify-center font-bold text-base ${
                        isAdminOrSuperAdmin
                          ? "border-cyan-500/50 text-cyan-400"
                          : isFaculty
                            ? "border-blue-500/50 text-blue-400"
                            : isStudent
                              ? "border-green-500/50 text-green-400"
                              : isAlumni
                                ? "border-orange-500/50 text-orange-400"
                                : "border-gray-700/50 text-green-500"
                      }`}
                    >
                      {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
                    </div>
                  )}
                </div>
                <div
                  className={`flex-1 py-2 px-4 ${
                    isAdminOrSuperAdmin
                      ? "bg-cyan-900/30 text-cyan-300"
                      : isFaculty
                        ? "bg-blue-900/30 text-blue-300"
                        : isStudent
                          ? "bg-green-900/30 text-green-300"
                          : isAlumni
                            ? "bg-orange-900/30 text-orange-300"
                            : "bg-gray-800/60 text-gray-300"
                  } rounded-lg text-[13px] shadow-inner relative ring-1 ring-opacity-30 ${
                    isAdminOrSuperAdmin
                      ? "ring-cyan-500"
                      : isFaculty
                        ? "ring-blue-500"
                        : isStudent
                          ? "ring-green-500"
                          : isAlumni
                            ? "ring-orange-500"
                            : "ring-gray-500"
                  }`}
                >
                  <div className="overflow-hidden w-full">
                    <span className="inline-block pr-1">
                      {isAdminOrSuperAdmin
                        ? `Share an announcement, ${getFirstTwoNames(currentUser?.name, "Admin")}...`
                        : isFaculty
                          ? `Share your academic insights, ${getFirstTwoNames(currentUser?.name, "Professor")}...`
                          : isStudent
                            ? `What's on your mind, ${getFirstTwoNames(currentUser?.name, "Student")}?`
                            : `What's on your mind, ${getFirstTwoNames(currentUser?.name, "User")}?`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showFullScreenModal &&
        createPortal(
          <>
            <div
              className={`fixed inset-0 z-50 ${
                isMobile
                  ? "bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800"
                  : "bg-black/60 flex items-center justify-center p-4"
              }`}
              dir="ltr"
              lang="en"
            >
              <div className={`${isMobile ? "relative flex flex-col h-full backdrop-blur-sm" : "relative w-full max-w-2xl h-[80vh] rounded-2xl overflow-hidden border border-gray-700/40 shadow-2xl bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 backdrop-blur-md"}`}>
                <div
                  className={`flex items-center justify-between p-4 border-b backdrop-blur-md ${
                    isAdminOrSuperAdmin
                      ? "border-cyan-500/20 bg-gradient-to-r from-cyan-900/10 to-cyan-800/5"
                      : isFaculty
                        ? "border-blue-500/20 bg-gradient-to-r from-blue-900/10 to-blue-800/5"
                        : isStudent
                          ? "border-green-500/20 bg-gradient-to-r from-green-900/10 to-green-800/5"
                          : isAlumni
                            ? "border-orange-500/20 bg-gradient-to-r from-orange-900/10 to-orange-800/5"
                            : "border-green-500/20 bg-gradient-to-r from-green-900/10 to-green-800/5"
                  }`}
                >
                  <h2
                    className={`text-lg font-semibold tracking-tight ${
                      isAdminOrSuperAdmin
                        ? "text-cyan-50 drop-shadow-sm"
                        : isFaculty
                          ? "text-blue-50 drop-shadow-sm"
                          : isStudent
                            ? "text-green-50 drop-shadow-sm"
                            : isAlumni
                              ? "text-orange-50 drop-shadow-sm"
                              : "text-green-50 drop-shadow-sm"
                    }`}
                  >
                    {isAdminOrSuperAdmin
                      ? "Create Announcement"
                      : isFaculty
                        ? "Create Academic Post"
                        : isStudent
                          ? "Create Community Post"
                          : isAlumni
                            ? "Create Alumni Post"
                            : "Create Post"}
                  </h2>
                  <button
                    onClick={closeModal}
                    aria-label="Close"
                    className={`p-2 rounded-md transition-all duration-200 backdrop-blur-sm ${
                      isAdminOrSuperAdmin
                        ? "text-cyan-300 hover:text-cyan-100 hover:bg-cyan-500/20 hover:shadow-lg hover:shadow-cyan-500/25"
                        : isFaculty
                          ? "text-blue-300 hover:text-blue-100 hover:bg-blue-500/20 hover:shadow-lg hover:shadow-blue-500/25"
                          : isStudent
                            ? "text-green-300 hover:text-green-100 hover:bg-green-500/20 hover:shadow-lg hover:shadow-green-500/25"
                            : isAlumni
                              ? "text-orange-300 hover:text-orange-100 hover:bg-orange-500/20 hover:shadow-lg hover:shadow-orange-500/25"
                              : "text-green-300 hover:text-green-100 hover:bg-green-500/20 hover:shadow-lg hover:shadow-green-500/25"
                    }`}
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {!isMobile && showFriendsList && !isAdminOrSuperAdmin && (
                  <div className={`absolute inset-0 z-30 bg-gray-900/95 backdrop-blur-md flex flex-col transform transition-transform transition-opacity duration-300 ease-out ${overlayEntered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'}`}>
                    <div className="flex items-center justify-between p-3 border-b border-gray-700/40 bg-gray-900/70">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={closeTagOverlay}
                          className="p-2 rounded-md text-gray-300 hover:text-white transition-colors bg-transparent"
                          aria-label="Back"
                          title="Back"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M15.78 19.28a.75.75 0 01-1.06 0l-6-6a.75.75 0 010-1.06l6-6a.75.75 0 111.06 1.06L10.81 12l4.97 4.97a.75.75 0 010 1.06z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <h3 className="text-sm sm:text-base font-semibold text-gray-100 tracking-tight">Tag people</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {taggedFriends.length > 0 && (
                          <span className="hidden sm:inline text-xs text-gray-300">{taggedFriends.length} selected</span>
                        )}
                        <button
                          type="button"
                          onClick={closeTagOverlay}
                          className="p-2 rounded-md text-gray-300 hover:text-white transition-colors"
                          aria-label="Close tagging overlay"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3 border-b border-gray-700/30">
                      <div className="relative">
                        <input
                          type="text"
                          value={friendsSearchQuery}
                          onChange={handleFriendsSearchChange}
                          placeholder="Search users..."
                          className="w-full px-3 py-2 pr-9 text-sm bg-gradient-to-br from-gray-800/70 to-gray-700/50 border border-gray-600/40 rounded-xl text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400/50 focus:border-transparent backdrop-blur-sm shadow-inner"
                        />
                        {friendsSearchQuery && (
                          <button
                            type="button"
                            onClick={clearFriendsSearch}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                            aria-label="Clear search"
                          >
                            <XMarkIcon className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                      {taggedFriends.length > 0 && (
                        <div className="mt-2 text-[11px] text-gray-300">
                          Selected: {getTaggedFriendsDisplayText()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                      {isLoadingFriends && (
                        <div className="flex justify-center items-center py-10 text-gray-300">
                          <div className="w-7 h-7 border-3 border-t-transparent border-green-400 rounded-full animate-spin"></div>
                          <span className="ml-3 text-sm font-medium">Loading users...</span>
                        </div>
                      )}
                      {!isLoadingFriends && friends.length === 0 && (
                        <p className="text-sm font-medium text-gray-400 px-1">No users found to tag.</p>
                      )}
                      {!isLoadingFriends && friends.length > 0 && filteredFriends.length === 0 && friendsSearchQuery && (
                        <p className="text-sm font-medium text-gray-400 px-1">No users found matching "{friendsSearchQuery}".</p>
                      )}
                      {!isLoadingFriends && filteredFriends.length > 0 && (
                        <>
                          {friendsSearchQuery && (
                            <div className="text-xs font-medium text-gray-400 px-1 mb-2">
                              Found {filteredFriends.length} of {friends.length} users
                            </div>
                          )}
                          <ul className="space-y-1.5">
                            {displayedFriends.map((friend) => {
                              const isTagged = taggedFriends.some((taggedFriend) => taggedFriend.id === friend.id)
                              return (
                                <li key={friend.id}>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTag(friend)}
                                    className={`flex items-center w-full px-2.5 py-1.5 rounded-xl transition-all duration-200 bg-transparent ${
                                      isTagged
                                        ? "bg-gradient-to-r from-green-700/40 to-green-600/20 hover:from-green-700/50 hover:to-green-600/30 shadow-inner"
                                        : "hover:bg-gradient-to-br from-gray-700/30 to-gray-600/20"
                                    }`}
                                  >
                                    <div className="flex-shrink-0 w-8 h-8 relative">
                                      {friend.profile_pic ? (
                                        <img
                                          src={friend.profile_pic || "/placeholder.svg"}
                                          alt={friend.name}
                                          className="w-8 h-8 rounded-xl object-cover shadow-md"
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement
                                            target.onerror = null
                                            target.src = "/images/default-avatar.png"
                                          }}
                                        />
                                      ) : (
                                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center shadow-md">
                                          <span className="text-xs font-bold text-gray-300 tracking-wider">
                                            {friend.name.charAt(0).toUpperCase()}
                                          </span>
                                        </div>
                                      )}
                                      {isTagged && (
                                        <div className="absolute -right-1 -bottom-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center border-2 border-gray-900 shadow">
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-2.5 w-2.5 text-white"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                          >
                                            <path
                                              fillRule="evenodd"
                                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                              clipRule="evenodd"
                                            />
                                          </svg>
                                        </div>
                                      )}
                                    </div>
                  <span className={`ml-3 text-xs font-medium tracking-tight ${isTagged ? "text-green-100" : "text-gray-200"}`}>
                                      {friend.name}
                                    </span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                          {displayedFriends.length < filteredFriends.length && (
                            <div className="mt-3 pt-2 border-t border-gray-700/30">
                              <button
                                type="button"
                                onClick={loadMoreFriends}
                className="w-full px-3 py-2 text-xs font-medium text-gray-300 hover:text-gray-200 bg-gradient-to-br from-gray-700/50 to-gray-600/30 hover:from-gray-600/50 hover:to-gray-500/30 rounded-xl transition-colors shadow-sm"
                              >
                                Show {Math.min(10, filteredFriends.length - displayedFriends.length)} more users
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
          <div className="p-3 border-t border-gray-700/30 bg-gray-900/70">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeTagOverlay}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-500 transition-colors"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {isMobile && showFriendsList && !isAdminOrSuperAdmin && (
                  <div className={`absolute inset-0 z-30 bg-gray-900/95 backdrop-blur-md flex flex-col transform transition-transform transition-opacity duration-300 ease-out ${overlayEntered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'}`}>
                    <div className="flex items-center justify-between p-3 border-b border-gray-700/40 bg-gray-900/70">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={closeTagOverlay} className="p-2 rounded-md text-gray-300 hover:text-white transition-colors bg-transparent" aria-label="Back" title="Back">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M15.78 19.28a.75.75 0 01-1.06 0l-6-6a.75.75 0 010-1.06l6-6a.75.75 0 111.06 1.06L10.81 12l4.97 4.97a.75.75 0 010 1.06z" clipRule="evenodd" /></svg>
                        </button>
                        <h3 className="text-sm font-semibold text-gray-100 tracking-tight">Tag people</h3>
                      </div>
                      <button type="button" onClick={closeTagOverlay} className="p-2 rounded-md text-gray-300 hover:text-white transition-colors" aria-label="Close tagging overlay">
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="p-3 border-b border-gray-700/30">
                      <div className="relative">
                        <input type="text" value={friendsSearchQuery} onChange={handleFriendsSearchChange} placeholder="Search users..." className="w-full px-3 py-2 pr-9 text-sm bg-gradient-to-br from-gray-800/70 to-gray-700/50 border border-gray-600/40 rounded-xl text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400/50 focus:border-transparent backdrop-blur-sm shadow-inner" />
                        {friendsSearchQuery && (
                          <button type="button" onClick={clearFriendsSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300" aria-label="Clear search">
                            <XMarkIcon className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                      {taggedFriends.length > 0 && (
                        <div className="mt-2 text-[11px] text-gray-300">Selected: {getTaggedFriendsDisplayText()}</div>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                      {isLoadingFriends && (
                        <div className="flex justify-center items-center py-8 text-gray-300">
                          <div className="w-6 h-6 border-2 border-t-transparent border-green-400 rounded-full animate-spin"></div>
                          <span className="ml-3 text-sm font-medium">Loading users...</span>
                        </div>
                      )}
                      {!isLoadingFriends && friends.length === 0 && (
                        <p className="text-sm font-medium text-gray-400 px-1">No users found to tag.</p>
                      )}
                      {!isLoadingFriends && friends.length > 0 && filteredFriends.length === 0 && friendsSearchQuery && (
                        <p className="text-sm font-medium text-gray-400 px-1">No users found matching "{friendsSearchQuery}".</p>
                      )}
                      {!isLoadingFriends && filteredFriends.length > 0 && (
                        <>
                          {friendsSearchQuery && (
                            <div className="text-xs font-medium text-gray-400 px-1 mb-2">Found {filteredFriends.length} of {friends.length} users</div>
                          )}
                          <ul className="space-y-1.5">
                            {displayedFriends.map((friend) => {
                              const isTagged = taggedFriends.some((taggedFriend) => taggedFriend.id === friend.id)
                              return (
                                <li key={friend.id}>
                                  <button type="button" onClick={() => handleToggleTag(friend)} className={`flex items-center w-full px-2.5 py-1.5 rounded-xl transition-all duration-200 bg-transparent ${isTagged ? "bg-gradient-to-r from-green-700/40 to-green-600/20 hover:from-green-700/50 hover:to-green-600/30 shadow-inner" : "hover:bg-gradient-to-br from-gray-700/30 to-gray-600/20"}`}>
                                    <div className="flex-shrink-0 w-7 h-7 relative">
                                      {friend.profile_pic ? (
                                        <img src={friend.profile_pic || "/placeholder.svg"} alt={friend.name} className="w-7 h-7 rounded-xl object-cover shadow-md" onError={(e) => { const target = e.target as HTMLImageElement; target.onerror = null; target.src = "/images/default-avatar.png" }} />
                                      ) : (
                                        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center shadow-md"><span className="text-xs font-bold text-gray-300 tracking-wider">{friend.name.charAt(0).toUpperCase()}</span></div>
                                      )}
                                      {isTagged && (
                                        <div className="absolute -right-1 -bottom-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center border-2 border-gray-850 shadow">
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                        </div>
                                      )}
                                    </div>
                                    <span className={`ml-2.5 text-xs font-medium tracking-tight ${isTagged ? "text-green-100" : "text-gray-200"}`}>{friend.name}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                          {displayedFriends.length < filteredFriends.length && (
                            <div className="mt-3 pt-2 border-t border-gray-700/30">
                              <button type="button" onClick={loadMoreFriends} className="w-full px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-300 bg-gradient-to-br from-gray-700/50 to-gray-600/30 hover:from-gray-600/50 hover:to-gray-500/30 rounded-xl transition-colors shadow-sm">Show {Math.min(10, filteredFriends.length - displayedFriends.length)} more users</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div className="p-3 border-t border-gray-700/30 bg-gray-900/70">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={closeTagOverlay} className="px-3 py-2 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-500 transition-colors">Done</button>
                      </div>
                    </div>
                  </div>
                )}

                <div
                  className={`${isMobile ? "flex-1 overflow-y-auto p-4 pb-36" : "flex-1 overflow-y-auto p-4 pb-28"} bg-gradient-to-b from-transparent to-gray-900/20`}
                  style={isMobile ? { WebkitOverflowScrolling: "touch", paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' } : {}}
                >
                  <form onSubmit={handleSubmit}>
                    <div className="flex items-start space-x-3 mb-4">
                      {currentUser?.profile_pic && currentUser.profile_pic.trim() !== "" ? (
                        <div className="relative">
                          <img
                            src={currentUser.profile_pic || "/placeholder.svg"}
                            alt={currentUser?.name || "User"}
                            className={`w-10 h-10 rounded-xl border-2 object-cover shadow ${
                              isAdminOrSuperAdmin
                                ? "border-cyan-400/50 shadow-cyan-500/20"
                                : isFaculty
                                  ? "border-blue-400/50 shadow-blue-500/20"
                                  : isStudent
                                    ? "border-green-400/50 shadow-green-500/20"
                                    : isAlumni
                                      ? "border-orange-400/50 shadow-orange-500/20"
                                      : "border-green-400/50 shadow-green-500/20"
                            }`}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.onerror = null
                              target.src = "/images/default-avatar.png"
                            }}
                          />
                          <div
                            className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-gray-900 ${
                              isAdminOrSuperAdmin
                                ? "bg-cyan-400"
                                : isFaculty
                                  ? "bg-blue-400"
                                  : isStudent
                                    ? "bg-green-400"
                                    : isAlumni
                                      ? "bg-orange-400"
                                      : "bg-green-400"
                            }`}
                          ></div>
                        </div>
                      ) : (
                        <div
                          className={`w-12 h-12 rounded-xl border-2 bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center font-bold shadow-lg ${
                            isAdminOrSuperAdmin
                              ? "border-cyan-400/50 text-cyan-300 shadow-cyan-500/20"
                              : isFaculty
                                ? "border-blue-400/50 text-blue-300 shadow-blue-500/20"
                                : isStudent
                                  ? "border-green-400/50 text-green-300 shadow-green-500/20"
                                  : isAlumni
                                    ? "border-orange-400/50 text-orange-300 shadow-orange-500/20"
                                    : "border-green-400/50 text-green-300 shadow-green-500/20"
                          }`}
                        >
                          {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
                        </div>
                      )}
                      <div className="flex-1">
                        <h3
                          className={`text-lg font-semibold tracking-tight ${
                            isAdminOrSuperAdmin
                              ? "text-cyan-50"
                              : isFaculty
                                ? "text-blue-50"
                                : isStudent
                                  ? "text-green-50"
                                  : isAlumni
                                    ? "text-orange-50"
                                    : "text-green-50"
                          }`}
                        >
                          {currentUser?.name || "User"}
                        </h3>

                        <div className="mt-1">
                          <div
                            className="inline-flex items-center px-2 py-1 bg-gray-800/70 text-gray-100 rounded-full text-xs font-medium shadow-sm border border-gray-700/50"
                            role="status"
                            aria-label="Post visibility: Visible to everyone"
                            title="This post will be visible to everyone on BulSU Space"
                          >
                            <GlobeAltIcon className="w-4 h-4 mr-2 text-gray-200" />
                            <span>Visible to everyone</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <textarea
                      ref={modalTextareaRef}
                      value={content}
                      onChange={handleContentChange}
                      placeholder={`${
                        isAdminOrSuperAdmin
                          ? `Share an announcement, ${getFirstTwoNames(currentUser?.name, "Admin")}...`
                          : isFaculty
                            ? `Share your academic insights, ${getFirstTwoNames(currentUser?.name, "Professor")}...`
                            : isStudent
                              ? `What's on your mind, ${getFirstTwoNames(currentUser?.name, "Student")}?`
                              : `What's on your mind, ${getFirstTwoNames(currentUser?.name, "User")}?`
                      }`}
                      className={`w-full p-3 border rounded-2xl text-sm resize-none min-h-[140px] placeholder-gray-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:border-transparent backdrop-blur-sm shadow-sm ${
                        isAdminOrSuperAdmin
                          ? "bg-gradient-to-br from-cyan-900/10 to-cyan-800/5 border-cyan-400/30 text-cyan-50 focus:ring-cyan-400/50 hover:border-cyan-400/40 shadow-cyan-500/10"
                          : isFaculty
                            ? "bg-gradient-to-br from-blue-900/10 to-blue-800/5 border-blue-400/30 text-blue-50 focus:ring-blue-400/50 hover:border-blue-400/40 shadow-blue-500/10"
                            : isStudent
                              ? "bg-gradient-to-br from-green-900/10 to-green-800/5 border-green-400/30 text-green-50 focus:ring-green-400/50 hover:border-green-400/40 shadow-green-500/10"
                              : isAlumni
                                ? "bg-gradient-to-br from-orange-900/10 to-orange-800/5 border-orange-400/30 text-orange-50 focus:ring-orange-400/50 hover:border-orange-400/40 shadow-orange-500/10"
                                : "bg-gradient-to-br from-green-900/10 to-green-800/5 border-green-400/30 text-green-50 focus:ring-green-400/50 hover:border-green-400/40 shadow-green-500/10"
                      }`}
                      rows={5}
                    />

                    

                    <div className="mt-3 text-right">
                      <div
                        className={`text-sm font-medium ${content.length > 1800 ? "text-red-400" : "text-gray-400"}`}
                      >
                        {content.length}/2000
                      </div>
                    </div>

                    {taggedFriends.length > 0 && (
                      <div className="mt-4 px-4 py-3 bg-gradient-to-r from-green-900/20 to-green-800/10 border border-green-400/30 rounded-xl backdrop-blur-sm shadow-sm">
                        <p className="text-green-200 text-sm">
                          <span className="font-semibold">— {getTaggedFriendsDisplayText()}</span>
                        </p>
                      </div>
                    )}

                    {isAdminOrSuperAdmin && taggedGroups.length > 0 && (
                      <div className="mt-4 px-4 py-3 bg-gradient-to-r from-cyan-900/20 to-cyan-800/10 border border-cyan-400/30 rounded-xl backdrop-blur-sm shadow-sm">
                        <p className="text-cyan-200 text-sm">
                          <span className="font-semibold">— {getTaggedGroupsDisplayText()}</span>
                        </p>
                      </div>
                    )}
                    {showGroupTagging && isAdminOrSuperAdmin && (
                      <div className="mt-4 p-4 bg-gradient-to-r from-cyan-900/20 to-cyan-800/10 border border-cyan-400/30 rounded-xl backdrop-blur-sm shadow-lg">
                        <h4 className="text-lg font-semibold text-cyan-200 mb-4 tracking-tight">
                          Tag user groups for announcement
                        </h4>

                        <div className="grid grid-cols-2 gap-3">
                          {["Students", "Faculties", "Alumni", "Admins"].map((group) => {
                            const isTagged = taggedGroups.includes(group)
                            return (
                              <button
                                key={group}
                                type="button"
                                onClick={() => handleToggleGroupTag(group)}
                                className={`flex items-center px-5 py-3 rounded-xl transition-all duration-200 ${
                                  isTagged
                                    ? "bg-gradient-to-r from-cyan-700/40 to-cyan-600/20 hover:from-cyan-700/50 hover:to-cyan-600/30 shadow-inner"
                                    : "hover:bg-gradient-to-br from-gray-700/30 to-gray-600/20"
                                }`}
                              >
                                <div
                                  className={`w-5 h-5 rounded-full flex items-center justify-center mr-3 ${
                                    isTagged ? "bg-cyan-500 shadow" : "bg-gray-600"
                                  }`}
                                >
                                  {isTagged && (
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="h-3 w-3 text-white"
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  )}
                                </div>
                                <span className="text-base font-medium tracking-wide">All {group}</span>
                              </button>
                            )
                          })}
                        </div>

                        {taggedGroups.length > 0 && (
                          <div className="mt-5 pt-4 border-t border-cyan-700/30">
                            <button
                              type="button"
                              onClick={clearGroupTags}
                              className="w-full px-5 py-3 text-base font-medium text-cyan-300 hover:text-cyan-200 bg-gradient-to-br from-gray-700/50 to-gray-600/30 hover:from-gray-600/50 hover:to-gray-500/30 rounded-xl transition-colors shadow-sm"
                            >
                              Clear all group tags
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {contentError && (
                      <div
                        className={`flex items-center gap-3 mt-4 p-4 rounded-xl border backdrop-blur-sm shadow-sm ${
                          contentError.includes("checking is taking longer") ||
                          contentError.includes("models may be loading")
                            ? "bg-gradient-to-r from-blue-900/20 to-blue-800/10 border-blue-400/30 text-blue-200"
                            : "bg-gradient-to-r from-red-900/20 to-red-800/10 border-red-400/30 text-red-200"
                        }`}
                      >
                        {(contentError.includes("checking is taking longer") ||
                          contentError.includes("models may be loading")) && (
                          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                        )}
                        <p className="text-sm font-medium">{contentError}</p>
                      </div>
                    )}
                    {createdPolls.length > 0 && (
                      <div className="mt-4 space-y-3">
                        <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/95 border border-green-500/30 rounded-xl p-4 shadow-xl">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-base font-semibold text-green-200">Your Active Polls</h4>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{createdPolls.length} active</span>
                              <button
                                onClick={togglePollsContainer}
                                title={pollsContainerMinimized ? 'Expand polls' : 'Minimize polls'}
                                className="flex items-center gap-2 px-2 py-1 bg-green-700/20 text-green-100 rounded-md hover:bg-green-700/30 transition-all duration-150"
                              >
                                <span className="text-sm">{pollsContainerMinimized ? 'Expand' : 'Minimize'}</span>
                                <svg className="w-4 h-4 text-green-100" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  {pollsContainerMinimized ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  )}
                                </svg>
                              </button>
                            </div>
                          </div>

                          {!pollsContainerMinimized ? (
                            createdPolls.map((poll) => (
                              <PollCard
                                key={poll.id}
                                poll={poll}
                                onMinimize={() => togglePollMinimization(poll.id)}
                                isMinimized={minimizedPolls.has(poll.id)}
                                className="w-full mb-3"
                              />
                            ))
                          ) : (
                            <div className="p-3 bg-gray-800/60 rounded-md border border-gray-700/50">
                              <div className="flex items-center justify-between">
                                <div className="text-sm text-gray-200">{createdPolls.length} active poll{createdPolls.length !== 1 ? 's' : ''}</div>
                                <div className="text-xs text-gray-400">{createdPolls.map(p => p.question).slice(0,2).join(' • ')}{createdPolls.length > 2 ? ' • …' : ''}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {files.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        {files.map((file, index) => (
                          <div key={index} className="relative group">
                            {file.type.startsWith("image/") ? (
                              <div className="relative rounded-xl overflow-hidden shadow-lg border border-gray-600/50 backdrop-blur-sm">
                                <img
                                  src={previewUrls[index] || "/placeholder.svg"}
                                  alt={file.name}
                                  className="w-full h-28 object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeFile(index)}
                                  className="absolute top-2 right-2 bg-gray-900/90 text-white rounded-full p-1.5 hover:bg-red-600 transition-all duration-200 shadow-lg backdrop-blur-sm"
                                >
                                  <XMarkIcon className="h-4 w-4" />
                                </button>
                              </div>
                            ) : file.type.startsWith("video/") ? (
                              <div className="relative rounded-xl overflow-hidden shadow-lg border border-gray-600/50 backdrop-blur-sm">
                                <video src={previewUrls[index]} className="w-full h-28 object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removeFile(index)}
                                  className="absolute top-2 right-2 bg-gray-900/90 text-white rounded-full p-1.5 hover:bg-red-600 transition-all duration-200 shadow-lg backdrop-blur-sm"
                                >
                                  <XMarkIcon className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <div
                                role="link"
                                tabIndex={0}
                                onClick={() => { if (previewUrls[index]) window.open(previewUrls[index], '_blank', 'noopener,noreferrer'); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' && previewUrls[index]) window.open(previewUrls[index], '_blank', 'noopener,noreferrer'); }}
                                className="relative flex items-center justify-center bg-gradient-to-br from-gray-800/80 to-gray-700/60 rounded-xl p-3 h-28 border border-gray-600/50 shadow-lg backdrop-blur-sm"
                                title={file.name}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') removeFile(index); }}
                                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-0.5 bg-red-500 text-white rounded-full opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity touch-manipulation"
                                >
                                  <XMarkIcon className="h-3 w-3" />
                                </button>
                                <DocumentTextIcon className="h-7 w-7 text-gray-300" />
                                <span className="text-xs text-gray-200 ml-2 truncate max-w-[80px] font-medium">
                                  {file.name}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {isMobile ? (
                      <div
                        className="fixed left-0 right-0 bottom-0 z-50 bg-gradient-to-t from-gray-900/90 to-transparent p-4 border-t border-gray-700/30"
                        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                      >
                        <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-800/60 text-gray-100 hover:bg-gray-700/60 transition-all duration-150"
                              title="Attach media"
                            >
                              <PhotoIcon className="h-4 w-4" />
                            </button>

                                                         <button
                               type="button"
                               onClick={handleTagButtonClick}
                               className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-150 ${
                                 isAdminOrSuperAdmin
                                   ? "text-cyan-100 bg-gradient-to-r from-cyan-600/60 to-cyan-700/40 hover:from-cyan-500/70 hover:to-cyan-600/50 shadow-cyan-500/20"
                                   : isFaculty
                                     ? "text-blue-100 bg-gradient-to-r from-blue-600/60 to-blue-700/40 hover:from-blue-500/70 hover:to-blue-600/50 shadow-blue-500/20"
                                     : isStudent
                                       ? "text-green-100 bg-gradient-to-r from-green-600/60 to-green-700/40 hover:from-green-500/70 hover:to-green-600/50 shadow-green-500/20"
                                       : isAlumni
                                         ? "text-orange-100 bg-gradient-to-r from-orange-600/60 to-orange-700/40 hover:from-orange-500/70 hover:to-orange-600/50 shadow-orange-500/20"
                                         : "text-green-100 bg-gradient-to-r from-green-600/60 to-green-700/40 hover:from-green-500/70 hover:to-green-600/50 shadow-green-500/20"
                               }`}
                             >
                               <img src="https://firebasestorage.googleapis.com/v0/b/bulsuspace.firebasestorage.app/o/assets%2Ftag-user.png?alt=media&token=da089aba-59bf-4b34-9328-e4c0d59662a4" alt="Tag" className="h-5 w-5 object-contain" />
                               <span className="sr-only">Tag Someone</span>
                             </button>
                            {/* Create Poll option removed from Create Post modal (moved to Polls section) */}
                             

                           </>


                           </div>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />

                            <div className="flex-shrink-0 self-center">
                              <button
                                type="submit"
                                disabled={
                                  isSubmitting ||
                                  isProcessingContent ||
                                  (!!contentError) ||
                                  (!content.trim() && createdPolls.length === 0)
                                }
                                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-150 ${
                                    isSubmitting || isProcessingContent || (!content.trim() && createdPolls.length === 0)
                                    ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                                    : isAdminOrSuperAdmin
                                      ? "bg-cyan-600 text-white"
                                      : isFaculty
                                        ? "bg-blue-600 text-white"
                                        : isStudent
                                          ? "bg-green-600 text-white"
                                          : isAlumni
                                            ? "bg-orange-600 text-white"
                                            : "bg-green-600 text-white"
                                }`}
                              >
                                {isSubmitting || isProcessingContent ? (
                                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                                ) : (
                                  <PaperAirplaneIcon className="h-4 w-4" />
                                )}
                                <span className="text-sm">
                                  {isSubmitting || isProcessingContent
                                    ? "Checking..."
                                    : isAdminOrSuperAdmin
                                      ? "Announce"
                                      : isFaculty
                                        ? "Publish"
                                        : isStudent
                                          ? "Share"
                                          : "Post"}
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                    ) : (
                      <div className="absolute left-0 right-0 bottom-0 z-10 bg-gradient-to-t from-gray-900/95 to-gray-900/60 p-4 border-t border-gray-700/30">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-800/60 text-gray-100 hover:bg-gray-700/60 transition-all duration-150"
                              title="Attach media"
                            >
                              <PhotoIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={handleTagButtonClick}
                              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-150 ${
                                isAdminOrSuperAdmin
                                  ? "text-cyan-100 bg-gradient-to-r from-cyan-600/60 to-cyan-700/40 hover:from-cyan-500/70 hover:to-cyan-600/50 shadow-cyan-500/20"
                                  : isFaculty
                                    ? "text-blue-100 bg-gradient-to-r from-blue-600/60 to-blue-700/40 hover:from-blue-500/70 hover:to-blue-600/50 shadow-blue-500/20"
                                    : isStudent
                                      ? "text-green-100 bg-gradient-to-r from-green-600/60 to-green-700/40 hover:from-green-500/70 hover:to-green-600/50 shadow-green-500/20"
                                      : isAlumni
                                        ? "text-orange-100 bg-gradient-to-r from-orange-600/60 to-orange-700/40 hover:from-orange-500/70 hover:to-orange-600/50 shadow-orange-500/20"
                                        : "text-green-100 bg-gradient-to-r from-green-600/60 to-green-700/40 hover:from-green-500/70 hover:to-green-600/50 shadow-green-500/20"
                              }`}
                            >
                              <img src="https://firebasestorage.googleapis.com/v0/b/bulsuspace.firebasestorage.app/o/assets%2Ftag-user.png?alt=media&token=da089aba-59bf-4b34-9328-e4c0d59662a4" alt="Tag" className="h-4 w-4 object-contain" />
                              <span className="sr-only">Tag Someone</span>
                            </button>
                            {/* Create Poll option removed from Create Post modal (moved to Polls section) */}
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />
                          </div>
                          <button
                            type="submit"
                            disabled={
                              isSubmitting ||
                              isProcessingContent ||
                              (!!contentError) ||
                              (!content.trim() && createdPolls.length === 0)
                            }
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-150 ${
                                isSubmitting || isProcessingContent || (!content.trim() && createdPolls.length === 0)
                                ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                                : isAdminOrSuperAdmin
                                  ? "bg-cyan-600 text-white"
                                  : isFaculty
                                    ? "bg-blue-600 text-white"
                                    : isStudent
                                      ? "bg-green-600 text-white"
                                      : isAlumni
                                        ? "bg-orange-600 text-white"
                                        : "bg-green-600 text-white"
                            }`}
                          >
                            {isSubmitting || isProcessingContent ? (
                              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                            ) : (
                              <PaperAirplaneIcon className="h-4 w-4" />
                            )}
                            <span className="text-sm">
                              {isSubmitting || isProcessingContent
                                ? "Checking..."
                                : isAdminOrSuperAdmin
                                  ? "Announce"
                                  : isFaculty
                                    ? "Publish"
                                    : isStudent
                                      ? "Share"
                                      : "Post"}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            </div>
            <ProfanityModal
              open={profanityModalOpen}
              detectedWords={detectedProfaneWords}
              onClose={() => setProfanityModalOpen(false)}
            />
          </>,
          document.body
        )}
      {(!isMobile || !showFullScreenModal) && (
        <ProfanityModal
          open={profanityModalOpen}
          detectedWords={detectedProfaneWords}
          onClose={() => setProfanityModalOpen(false)}
        />
      )}

      {createdPolls.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/95 border border-green-500/30 rounded-lg p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-green-200"> Active Polls</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{createdPolls.length} active</span>
                <button
                  onClick={togglePollsContainer}
                  title={pollsContainerMinimized ? 'Expand polls' : 'Minimize polls'}
                  className="flex items-center gap-2 px-2 py-1 bg-green-700/20 text-green-100 rounded-md hover:bg-green-700/30 transition-all duration-150"
                >
                  <span className="text-sm">{pollsContainerMinimized ? 'Expand' : 'Minimize'}</span>
                  <svg className="w-4 h-4 text-green-100" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    {pollsContainerMinimized ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {!pollsContainerMinimized ? (
              createdPolls.map((poll) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  onMinimize={() => togglePollMinimization(poll.id)}
                  isMinimized={minimizedPolls.has(poll.id)}
                  className="w-full mb-3"
                />
              ))
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
                      <p className="text-sm font-medium text-gray-200">{createdPolls.length} Active Poll{createdPolls.length !== 1 ? 's' : ''}</p>
                      <p className="text-xs text-gray-400">Click expand to view and manage</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-400 bg-green-500/20 px-2 py-1 rounded-full border border-green-500/40">
                      {createdPolls.length} poll{createdPolls.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Poll creation modal moved to the Polls section (Feed) */}
    </>
  )
}

export default CreatePost

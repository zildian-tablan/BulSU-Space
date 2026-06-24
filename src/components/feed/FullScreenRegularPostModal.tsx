"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { formatDistanceToNow, format } from "date-fns"
import DOMPurify from "dompurify"
import type { Post, SharedPostRecord } from "../../models/Post"
import RoleBadge from "../common/RoleBadge"
import {
  HeartIcon,
  ChatBubbleLeftIcon,
  XMarkIcon,
  ShareIcon,
  TrashIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline"
import PostActionSheet from "./PostActionSheet"
import {
  HeartIcon as HeartIconSolid,
  ArrowUpCircleIcon,
} from "@heroicons/react/24/solid"
import { usePostInteractions } from "../../hooks/usePostInteractions"
import "./FullScreenRegularPostModal.css"
import { useNavigate } from "react-router-dom"
import ProfanityModal from "../modals/ProfanityModal"
import { detectProfanity } from "../../utils/profanityFilter"
import { sharePost } from "../../services/postService"
import { useAuth } from "../../contexts/AuthContext"
import { db } from "../../firebase/config"
import { doc, getDoc } from "firebase/firestore"
import { processStorageUrl } from "../../firebase/storage-proxy"

interface MediaItem {
  url: string
  type: string
  name?: string
}

interface FullScreenRegularPostModalProps {
  post: Post
  isOpen: boolean
  onClose: () => void
  onPostUpdated?: () => void
}

const FullScreenRegularPostModal: React.FC<FullScreenRegularPostModalProps> = ({
  post,
  isOpen,
  onClose,
  onPostUpdated,
}) => {
  const { currentUser } = useAuth()

  // Profanity modal state for comments
  const [profanityModalOpen, setProfanityModalOpen] = useState(false)
  const [detectedProfaneWords, setDetectedProfaneWords] = useState<string[]>([])
  // State for content expansion
  const [isContentExpanded, setIsContentExpanded] = useState(false)
  // State for tagged friends dropdown
  const [showTaggedFriends, setShowTaggedFriends] = useState(false)
  const taggedFriendsRef = useRef<HTMLDivElement>(null)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewImages, setPreviewImages] = useState<string[]>([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  // Heart animation and sound effect for reaction
  const [showHeartAnimation, setShowHeartAnimation] = useState(false)
  const playReactionSound = () => {
    const audio = new window.Audio("/audio/pop-heart-sound.mp3")
    audio.play()
  }

  // Post action sheet state (for 3-dots dropdown)
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false)

  // Share state
  const [isSharing, setIsSharing] = useState(false)
  // Caption modal state
  const [showCaptionModal, setShowCaptionModal] = useState(false)
  const [shareCaption, setShareCaption] = useState('')

  const [sharedPostDetails, setSharedPostDetails] = useState<SharedPostRecord | null>(post.sharedPostSnapshot || null)
  const [sharedPostLoading, setSharedPostLoading] = useState(false)
  const [sharedPostError, setSharedPostError] = useState<string | null>(null)

  // Use the shared hook for all post logic
  const {
  currentUser: hookCurrentUser,
  hasReacted,
  reactionCount,
  comments,
  commentText,
  setCommentText,
  commentCount,
  isSubmittingComment,
  commentError,
  setCommentError,
  displayName,
  profilePic,
  taggedFriendsData,
  taggedFriendsLoading,
  handleReaction,
  handleCommentSubmit,
  handleDeleteComment,
  } = usePostInteractions({ post, onPostUpdated, isOpen, listenComments: true })

  // Share handler
  const handleShare = async () => {
    if (!currentUser || isSharing) return
    if (currentUser.id === post.userId) {
      console.warn("Authors cannot share their own posts.")
      return
    }
    // Open caption overlay first
    setShareCaption('')
    setShowCaptionModal(true)
  }

  const submitCaptionAndShare = async () => {
    // Called when user confirms caption entry; will run confirmation then share
    try {
      setShowCaptionModal(false)
      // Ask for final confirmation
      const proceed = window.confirm("Share this post?")
      if (!proceed) return
      setIsSharing(true)
      console.log('[FullScreenRegularPostModal] Sharing post', { postId: post.id, userId: currentUser!.id, caption: shareCaption })
      const newShareId = await sharePost(post.id, currentUser!.id, undefined, shareCaption || undefined)
      console.log('[FullScreenRegularPostModal] Share created', newShareId)
      try { alert('Post shared successfully') } catch (_) {}
    } catch (e) {
      console.error('Share failed', e)
      try {
        const msg = (e as any)?.message || String(e)
        alert(`Failed to share post: ${msg}`)
      } catch (_) {}
    } finally {
      setIsSharing(false)
    }
  }

  const openImagePreview = (images: string[], startIndex: number) => {
    setPreviewImages(images)
    setCurrentImageIndex(startIndex)
    setPreviewOpen(true)
  }

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
    }
  }, [previewOpen, previewImages])

  const downloadImage = async (url: string) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = downloadUrl
      link.download = `image-${Date.now()}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error("Failed to download image:", error)
    }
  }

  const goToPrevious = () => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : previewImages.length - 1))
  }

  const goToNext = () => {
    setCurrentImageIndex((prev) => (prev < previewImages.length - 1 ? prev + 1 : 0))
  }

  // Handle navigation to user profile
  const handleProfileClick = () => {
    if (post.userId) {
      onClose()
      navigate(`/profile/${post.userId}`)
    }
  }

  // Handle navigation to tagged friend's profile
  const handleTaggedFriendClick = (friendId: string) => {
    onClose()
    navigate(`/profile/${friendId}`)
  }

  // Close tagged friends dropdown when clicking outside
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

  // Handle comment submission with length validation
  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return

    // Validate comment length
    if (commentText.length > 2000) {
      // maxLength should prevent this, but just in case
      return
    }

    // Profanity check
    const profaneWords = detectProfanity(commentText)
    if (profaneWords.length > 0) {
      setDetectedProfaneWords(profaneWords)
      setProfanityModalOpen(true)
      setCommentError("This comment contains inappropriate language.")
      return
    }

    handleCommentSubmit(e)
  }

  // Check permissions
  const userRole = currentUser?.role as string | undefined
  const isAdminOrSuperAdmin = userRole === "admin" || userRole === "super admin"
  const isAuthor = currentUser?.id === post.userId

  // Handle backdrop click to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = ""
      }
    }
  }, [isOpen])

  // Animation state for modal
  const [showModal, setShowModal] = useState(false)
  useEffect(() => {
    if (isOpen) {
      setShowModal(true)
    } else {
      const timeout = setTimeout(() => setShowModal(false), 200)
      return () => clearTimeout(timeout)
    }
  }, [isOpen])

  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    if (!post.isShare || !post.sharedPostRefId) {
      setSharedPostDetails(null)
      setSharedPostError(null)
      setSharedPostLoading(false)
      return
    }
    const fetchSharedPost = async () => {
      setSharedPostLoading(true)
      setSharedPostError(null)
      try {
        const sharedRef = doc(db, "shared_posts", post.sharedPostRefId!)
        const sharedSnap = await getDoc(sharedRef)
        if (!sharedSnap.exists()) {
          if (!cancelled) {
            setSharedPostDetails(null)
            setSharedPostError(null)
          }
        } else {
          if (!cancelled) {
            const sharedData = sharedSnap.data() as SharedPostRecord

            // Verify original post existence. If original is deleted, do not surface stored metadata.
            const originalPostId = (sharedData && (sharedData.originalPostId || (sharedData as any).original_post_id)) || post.originalPostId || post.sharedFromPostId
            let originalExists = true
            if (originalPostId) {
              try {
                const originalSnap = await getDoc(doc(db, 'posts', String(originalPostId)))
                if (!originalSnap.exists()) {
                  originalExists = false
                }
              } catch (err) {
                console.warn('[FullScreenRegularPostModal] Failed to verify original post existence for', originalPostId, err)
                originalExists = true
              }
            }

            if (!originalExists) {
              setSharedPostDetails(null)
              setSharedPostError(null)
            } else {
              setSharedPostDetails({ ...(sharedData || {}), id: sharedSnap.id })
            }
          }
        }
      } catch (error) {
        console.error("[FullScreenRegularPostModal] Failed to load shared post snapshot", error)
        if (!cancelled) {
          setSharedPostError("Unable to load the shared post data right now.")
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
    }
  }, [post.isShare, post.sharedPostRefId])

  if (!isOpen && !showModal) return null

  const modalContent = (
    <>
      {/* 3-dots post options button (always visible) */}
      {/* The trigger is in the header below. */}

      {/* Render PostActionSheet in a portal at the document body root for proper overlay (desktop & mobile) */}
      {isActionSheetOpen && typeof document !== 'undefined' && createPortal(
        <PostActionSheet
          post={post}
          isAuthor={isAuthor}
          isAdminOrSuperAdmin={isAdminOrSuperAdmin}
          onEdit={() => {}}
          onDelete={undefined}
          onHide={undefined}
          isMobile={/Mobi|Android/i.test(navigator.userAgent)}
          onShare={handleShare}
          onReport={undefined}
          onActionComplete={() => setIsActionSheetOpen(false)}
          isOpen={isActionSheetOpen}
          onClose={() => setIsActionSheetOpen(false)}
          currentFilter={undefined}
          currentUserRole={userRole}
        />,
        document.body
      )}
      {previewOpen && (
        <>
          <div className="fixed inset-0 bg-black/95 z-[2147483646]" onClick={() => setPreviewOpen(false)} />
          <img
            src={previewImages[currentImageIndex] || "/placeholder.svg"}
            alt="Preview"
            className="fixed left-1/2 top-1/2 z-[2147483647] max-w-full max-h-full object-contain"
            style={{ transform: "translate(-50%, -50%)" }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setPreviewOpen(false)}
            className="fixed top-4 right-4 z-[2147483648] p-2 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
          <button
            onClick={() => downloadImage(previewImages[currentImageIndex])}
            className="fixed top-4 right-16 z-[2147483648] p-2 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
          >
            <ArrowDownTrayIcon className="w-6 h-6" />
          </button>
          {previewImages.length > 1 && (
            <>
              <button
                onClick={goToPrevious}
                className="fixed left-4 top-1/2 z-[2147483649] p-2 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
                style={{ transform: "translateY(-50%)" }}
              >
                <ChevronLeftIcon className="w-6 h-6" />
              </button>
              <button
                onClick={goToNext}
                className="fixed right-4 top-1/2 z-[2147483649] p-2 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
                style={{ transform: "translateY(-50%)" }}
              >
                <ChevronRightIcon className="w-6 h-6" />
              </button>
              <div
                className="fixed bottom-4 left-1/2 z-[2147483649] bg-black/60 px-3 py-1 rounded-full text-white text-sm"
                style={{ transform: "translateX(-50%)" }}
              >
                {currentImageIndex + 1} / {previewImages.length}
              </div>
            </>
          )}
        </>
      )}

      {/* Caption overlay modal (shown before final confirmation) */}
      {showCaptionModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[2147483651] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80" onClick={() => setShowCaptionModal(false)} />
          <div onClick={(e) => e.stopPropagation()} className="relative z-20 w-[min(720px,92%)] bg-[#0f1720] border border-gray-800 rounded-lg p-5">
            <h3 className="text-white font-semibold mb-2">Add a caption</h3>
            <textarea
              id={`fs-share-caption-${post.id}`}
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
                onClick={submitCaptionAndShare}
                disabled={isSharing}
                className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white"
              >
                Continue
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div
        className={`fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col w-screen h-screen transition-all duration-300 ${isOpen ? "animate-fadeInScale" : "animate-fadeOutScale"}`}
        onClick={handleBackdropClick}
        aria-modal="true"
        role="dialog"
      >
        <div className="sticky top-0 flex items-center justify-between px-4 py-4 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-gray-800 z-10">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={profilePic || "/images/default-avatar.png"}
                alt={displayName}
                className="w-10 h-10 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                onClick={handleProfileClick}
                title={`View ${displayName}'s profile`}
              />
                
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div>
                  <h3
                    className="font-semibold text-white text-base cursor-pointer hover:text-green-400 transition-colors"
                    onClick={handleProfileClick}
                    title={`View ${displayName}'s profile`}
                  >
                    {displayName}
                  </h3>
                  {post.isShare && (
                    <div className="text-xs text-gray-400">
                      shared a post from{" "}
                      <span className="text-green-400">
                        {sharedPostDetails?.originalPostAuthorName || post.sharedFromUserName || "an account"}
                      </span>
                    </div>
                  )}
                  {post.taggedFriends && post.taggedFriends.length > 0 && (
                    <div className="text-sm text-gray-400 relative">
                      {taggedFriendsLoading ? (
                        <div className="h-3 bg-gray-700 rounded w-20 animate-pulse"></div>
                      ) : (
                        <>
                          {taggedFriendsData.length === 1 && (
                            <span>
                              with{" "}
                              <span
                                className="cursor-pointer hover:underline text-green-400"
                                onClick={() => handleTaggedFriendClick(taggedFriendsData[0].id)}
                              >
                                {taggedFriendsData[0].name}
                              </span>
                            </span>
                          )}
                          {taggedFriendsData.length === 2 && (
                            <span>
                              with{" "}
                              <span
                                className="cursor-pointer hover:underline text-green-400"
                                onClick={() => handleTaggedFriendClick(taggedFriendsData[0].id)}
                              >
                                {taggedFriendsData[0].name}
                              </span>{" "}
                              and{" "}
                              <span
                                className="cursor-pointer hover:underline text-green-400"
                                onClick={() => handleTaggedFriendClick(taggedFriendsData[1].id)}
                              >
                                {taggedFriendsData[1].name}
                              </span>
                            </span>
                          )}
                          {taggedFriendsData.length > 2 && (
                            <span>
                              with{" "}
                              <span
                                className="cursor-pointer hover:underline text-green-400"
                                onClick={() => handleTaggedFriendClick(taggedFriendsData[0].id)}
                              >
                                {taggedFriendsData[0].name}
                              </span>{" "}
                              and{" "}
                              <span
                                className="cursor-pointer hover:underline text-green-400"
                                onClick={() => setShowTaggedFriends(!showTaggedFriends)}
                              >
                                {taggedFriendsData.length - 1} others
                              </span>
                            </span>
                          )}

                          {showTaggedFriends && taggedFriendsData.length > 0 && (
                            <div
                              ref={taggedFriendsRef}
                              className="mt-2 z-30 absolute left-0 bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-xl p-3 max-w-[220px] max-h-[180px] overflow-y-auto"
                            >
                              <h4 className="text-xs text-green-400 font-medium mb-2 border-b border-gray-700 pb-2">
                                Tagged Friends
                              </h4>
                              <div className="space-y-2">
                                {taggedFriendsData.map((friend) => (
                                  <div
                                    key={friend.id}
                                    onClick={() => handleTaggedFriendClick(friend.id)}
                                    className="text-sm text-gray-300 hover:text-green-400 cursor-pointer flex items-center p-2 hover:bg-gray-800 rounded transition-colors"
                                  >
                                    <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center text-xs text-white font-medium mr-2">
                                      {friend.name.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="hover:underline truncate">{friend.name}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
                <RoleBadge role={post.userRole} size="small" isSpaceAdmin={false} />
              </div>
              <p className="text-sm text-gray-500">{formatDate(post.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 3-dots trigger button (always visible, both desktop and mobile) */}
            <button
              className="p-1.5 rounded-full hover:bg-gray-800/80 active:bg-gray-700 transition-colors focus:outline-none focus:ring-1 focus:ring-green-500/40"
              aria-label="Post options"
              onClick={() => setIsActionSheetOpen(!isActionSheetOpen)}
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
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
              aria-label="Close post modal"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="px-4 py-6 space-y-6">
            <div className="space-y-4">
              {/* Post text content */}
              <div
                className="text-gray-100 leading-relaxed text-base"
                style={{ wordBreak: "break-word", lineHeight: "1.6" }}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(processContentWithHashtags(post.content, isContentExpanded)),
                }}
                onClick={(e) => {
                  if (
                    e.target instanceof HTMLElement &&
                    (e.target.id === "seeMoreButton" || e.target.classList.contains("see-more-btn"))
                  ) {
                    setIsContentExpanded(true)
                    e.stopPropagation()
                  }
                }}
              />

              {/* See less button */}
              {isContentExpanded && post.content.length > 400 && (
                <button
                  onClick={() => setIsContentExpanded(false)}
                  className="text-green-400 hover:text-green-300 text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  See less
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              {post.isShare && (
                <div className="border border-gray-800/70 rounded-2xl bg-gray-900/60 p-4 space-y-3">
                  {sharedPostLoading && (
                    <div className="space-y-3">
                      <div className="h-4 bg-gray-800/70 rounded w-1/2 animate-pulse" />
                      <div className="h-4 bg-gray-800/70 rounded w-full animate-pulse" />
                      <div className="h-4 bg-gray-800/70 rounded w-2/3 animate-pulse" />
                    </div>
                  )}
                  {!sharedPostLoading && sharedPostError && (
                    <p className="text-sm text-red-400">{sharedPostError}</p>
                  )}
                  {!sharedPostLoading && !sharedPostError && sharedPostDetails && (
                    <>
                      <div className="flex flex-col gap-1">
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
                      <div
                        className="text-sm text-gray-100 leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: sharedPostDetails.originalPostContent
                            ? DOMPurify.sanitize(sharedPostDetails.originalPostContent.replace(/\n/g, "<br>"))
                            : '',
                        }}
                      />

                        {sharedPostDetails.originalPostMedia && sharedPostDetails.originalPostMedia.length > 0 && (
                          <div className="space-y-3">
                            {(() => {
                              const raw: any[] = sharedPostDetails.originalPostMedia || []
                              const normalized = raw
                                .map((m) => {
                                  if (!m) return null
                                  const url = m.url || (typeof m === 'string' ? m : '')
                                  const resolved = url ? processStorageUrl(url) : ''
                                  const type = m.type || (resolved ? (resolved.match(/\.(mp4|webm|ogg)$/i) ? 'video' : resolved.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar)$/i) ? 'document' : 'image') : 'image')
                                  return { url: resolved, type, name: (m as any).name }
                                })
                                .filter(Boolean) as MediaItem[]

                              const imageItems = normalized.filter((i) => i.type === 'image') as MediaItem[]
                              const visualItems = normalized.filter((i) => i.type === 'image' || i.type === 'video') as MediaItem[]
                              const documentItems = normalized.filter((i) => i.type === 'document') as MediaItem[]
                              const imageUrls = imageItems.map((i) => i.url)

                              if (!visualItems.length && documentItems.length > 0) {
                                return (
                                  <div className="flex flex-col gap-2">
                                    {documentItems.map((item, idx) => (
                                      <div key={idx} className="flex items-center justify-between bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          <DocumentTextIcon className="h-5 w-5 text-gray-300" />
                                          <span className="text-sm text-gray-200 truncate max-w-[220px]">{item.name || 'Attachment'}</span>
                                        </div>
                                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-400 hover:text-green-300">View</a>
                                      </div>
                                    ))}
                                  </div>
                                )
                              }

                              // Visual grid logic: mirror the main PostCard layout
                              if (imageItems.length === 1 && visualItems.length === 1) {
                                const item = imageItems[0]
                                return (
                                  <div className="rounded-2xl overflow-hidden bg-gray-900">
                                    <img src={item.url || '/placeholder.svg'} alt="Shared media" className="w-full h-auto max-h-96 object-cover cursor-pointer" onClick={() => openImagePreview(imageUrls, 0)} />
                                  </div>
                                )
                              }

                              if (imageItems.length === 2 && visualItems.length === 2) {
                                return (
                                  <div className="grid grid-cols-2 gap-1">
                                    {imageItems.map((it, i) => (
                                      <div key={i} className="rounded-2xl overflow-hidden bg-gray-900 aspect-square">
                                        <img src={it.url || '/placeholder.svg'} alt={`Shared ${i}`} className="w-full h-full object-cover cursor-pointer" onClick={() => openImagePreview(imageUrls, i)} />
                                      </div>
                                    ))}
                                  </div>
                                )
                              }

                              if (imageItems.length === 3 && visualItems.length === 3) {
                                return (
                                  <div className="grid grid-cols-2 grid-rows-2 gap-1 aspect-[3/2] w-full">
                                    <div className="relative rounded-2xl overflow-hidden row-span-2">
                                      <img src={imageItems[0].url || '/placeholder.svg'} alt="Shared 0" className="absolute inset-0 w-full h-full object-cover" onClick={() => openImagePreview(imageUrls, 0)} />
                                    </div>
                                    <div className="relative rounded-2xl overflow-hidden">
                                      <img src={imageItems[1].url || '/placeholder.svg'} alt="Shared 1" className="absolute inset-0 w-full h-full object-cover" onClick={() => openImagePreview(imageUrls, 1)} />
                                    </div>
                                    <div className="relative rounded-2xl overflow-hidden">
                                      <img src={imageItems[2].url || '/placeholder.svg'} alt="Shared 2" className="absolute inset-0 w-full h-full object-cover" onClick={() => openImagePreview(imageUrls, 2)} />
                                    </div>
                                  </div>
                                )
                              }

                              if (imageItems.length >= 4) {
                                const display = imageItems.slice(0, 4)
                                const remaining = imageItems.length - 4
                                return (
                                  <div className="grid grid-cols-2 gap-1">
                                    {display.map((it, idx) => (
                                      <div key={idx} className="relative rounded-2xl overflow-hidden bg-gray-900 aspect-square">
                                        <img src={it.url || '/placeholder.svg'} alt={`Shared ${idx}`} className={`w-full h-full object-cover cursor-pointer ${idx === 3 && remaining > 0 ? 'blur-sm' : ''}`} onClick={() => openImagePreview(imageUrls, idx)} />
                                        {idx === 3 && remaining > 0 && (
                                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-40">
                                            <span className="text-white font-semibold text-lg">+{remaining} more</span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )
                              }

                              // Fallback: render visual items sequentially
                              return (
                                <div className="space-y-3">
                                  {visualItems.map((it, idx) => (
                                    <div key={idx} className="rounded-2xl overflow-hidden border border-gray-800/50">
                                      {it.type === 'video' ? (
                                        <video src={it.url} controls className="w-full h-full object-cover" />
                                      ) : (
                                        <img src={it.url} alt={`Shared ${idx}`} className="w-full h-full object-cover" />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                    </>
                  )}
                  {!sharedPostLoading && !sharedPostError && !sharedPostDetails && (
                    <p className="text-sm text-gray-400">This original post is no longer available.</p>
                  )}
                </div>
              )}

              {((post.media && post.media.length > 0) || (post.mediaUrls && post.mediaUrls.length > 0)) && (
                <div className="space-y-4">
                  {(() => {
                    const mediaItems: (string | MediaItem)[] =
                      (post.media && post.media.length > 0 ? post.media : post.mediaUrls) || []

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

                    if (imageItems.length === 1) {
                      // Single large image
                      const item = imageItems[0]
                      const url = typeof item === "string" ? item : item.url
                      return (
                        <div className="rounded-lg overflow-hidden bg-gray-900">
                          <img
                            src={url || "/placeholder.svg"}
                            alt="Post media"
                            className="w-full h-auto max-h-96 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            loading="lazy"
                            onClick={() => openImagePreview(imageUrls, 0)}
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).src = "/placeholder.svg"
                            }}
                          />
                        </div>
                      )
                    } else if (imageItems.length === 2) {
                      // 2-column grid
                      return (
                        <div className="grid grid-cols-2 gap-1">
                          {imageItems.map((item: string | MediaItem, index: number) => {
                            const url = typeof item === "string" ? item : item.url
                            return (
                              <div key={index} className="rounded-lg overflow-hidden bg-gray-900 aspect-square">
                                <img
                                  src={url || "/placeholder.svg"}
                                  alt="Post media"
                                  className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                  loading="lazy"
                                  onClick={() => openImagePreview(imageUrls, index)}
                                  onError={(e) => {
                                    ;(e.target as HTMLImageElement).src = "/placeholder.svg"
                                  }}
                                />
                              </div>
                            )
                          })}
                        </div>
                      )
                    } else if (imageItems.length === 3) {
                      // Custom 2x2 grid: first image tall on left, next two stacked on right (like PostCard)
                      return (
                        <div className="grid grid-cols-2 grid-rows-2 gap-1 aspect-[4/3] w-full">
                          <div className="relative rounded-lg overflow-hidden bg-gray-900 row-span-2">
                            <img
                              src={
                                (typeof imageItems[0] === "string" ? imageItems[0] : imageItems[0].url) ||
                                "/placeholder.svg"
                              }
                              alt="Post media"
                              className="absolute inset-0 w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                              loading="lazy"
                              onClick={() => openImagePreview(imageUrls, 0)}
                              onError={(e) => {
                                ;(e.target as HTMLImageElement).src = "/placeholder.svg"
                              }}
                            />
                          </div>
                          <div className="relative rounded-lg overflow-hidden bg-gray-900">
                            <img
                              src={
                                (typeof imageItems[1] === "string" ? imageItems[1] : imageItems[1].url) ||
                                "/placeholder.svg"
                              }
                              alt="Post media"
                              className="absolute inset-0 w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                              loading="lazy"
                              onClick={() => openImagePreview(imageUrls, 1)}
                              onError={(e) => {
                                ;(e.target as HTMLImageElement).src = "/placeholder.svg"
                              }}
                            />
                          </div>
                          <div className="relative rounded-lg overflow-hidden bg-gray-900">
                            <img
                              src={
                                (typeof imageItems[2] === "string" ? imageItems[2] : imageItems[2].url) ||
                                "/placeholder.svg"
                              }
                              alt="Post media"
                              className="absolute inset-0 w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                              loading="lazy"
                              onClick={() => openImagePreview(imageUrls, 2)}
                              onError={(e) => {
                                ;(e.target as HTMLImageElement).src = "/placeholder.svg"
                              }}
                            />
                          </div>
                        </div>
                      )
                    } else if (imageItems.length >= 4) {
                      // 2x2 grid with 4th image blurred and "+N more" overlay
                      const displayItems = imageItems.slice(0, 4)
                      const remainingCount = imageItems.length - 4
                      return (
                        <div className="grid grid-cols-2 gap-1">
                          {displayItems.map((item: string | MediaItem, index: number) => {
                            const url = typeof item === "string" ? item : item.url
                            const isLastItem = index === 3

                            return (
                              <div
                                key={index}
                                className="relative rounded-lg overflow-hidden bg-gray-900 aspect-square"
                              >
                                <img
                                  src={url || "/placeholder.svg"}
                                  alt="Post media"
                                  className={`w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity ${
                                    isLastItem ? "blur-sm" : ""
                                  }`}
                                  loading="lazy"
                                  onClick={() => openImagePreview(imageUrls, index)}
                                  onError={(e) => {
                                    ;(e.target as HTMLImageElement).src = "/placeholder.svg"
                                  }}
                                />
                                {isLastItem && remainingCount > 0 && (
                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none">
                                    <span className="text-white font-semibold text-lg">+{remainingCount} more</span>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    }

                    return null
                  })()}

                  <div
                    className="grid grid-cols-1 sm:flex sm:flex-row sm:flex-wrap items-start gap-1.5 w-full"
                    style={{ gap: '5px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
                  >
                    {((post.media && post.media.length > 0 ? post.media : post.mediaUrls) || []).map((item, index) => {
                      const url = typeof item === "string" ? item : item.url
                      const type =
                        typeof item === "string"
                          ? url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                            ? "image"
                            : url.match(/\.(mp4|webm|ogg)$/i)
                              ? "video"
                              : "document"
                          : item.type

                      // Skip images as they're handled above
                      if (type === "image") return null

                      switch (type) {
                        case "video":
                          return (
                            <div
                              key={index}
                              className="rounded-lg overflow-hidden bg-gray-900 aspect-video w-full"
                              style={{ maxWidth: '100%' }}
                            >
                              <video src={url} controls className="w-full h-full object-cover" />
                            </div>
                          )
                        default:
                          // File attachment with proper icon
                          let ext = ""
                          if (typeof item === "string") {
                            const match = url.match(/\.([a-zA-Z0-9]+)$/)
                            ext = match ? match[1].toLowerCase() : ""
                          } else if (item.name) {
                            const match = item.name.match(/\.([a-zA-Z0-9]+)$/)
                            ext = match ? match[1].toLowerCase() : ""
                          }

                          let icon = null
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
                                src="https://cdn-icons-png.flaticon.com/512/732/732220.png"
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
                          } else if (["txt"].includes(ext)) {
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

                          const fileName = (typeof item === "string" ? url.split("/").pop() : item.name) || "File"
                          const fileBase = fileName.split(".").slice(0, -1).join(".") || fileName
                          const fileExt = fileName.split(".").pop()?.toUpperCase() || ""

                          return (
                            <a
                              key={index}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center bg-gradient-to-r from-gray-800/60 via-gray-700/40 to-green-900/30 border border-gray-700/30 rounded-lg shadow px-3 py-2 my-1 min-w-0 w-full max-w-full sm:max-w-xs hover:from-gray-800/80 hover:to-green-800/50 hover:shadow-green-900/10 transition-colors group backdrop-blur-sm text-white hover:text-green-100"
                              style={{ height: "2.5rem", maxWidth: "100%", width: "100%" }}
                              title={fileName}
                            >
                              <span className="flex-shrink-0 mr-2">{icon}</span>
                              <span className="flex flex-col min-w-0">
                                <span
                                  className="truncate text-xs font-semibold group-hover:text-green-100 w-full"
                                  style={{ maxWidth: "100%", color: "inherit" }}
                                >
                                  {fileBase}
                                </span>
                                <span className="text-[10px] text-gray-300 font-bold tracking-widest group-hover:text-green-200">
                                  {fileExt}
                                </span>
                              </span>
                            </a>
                          )
                      }
                    })}
                  </div>
                </div>
              )}

              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {post.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-gray-800 text-green-400 text-sm rounded-full font-medium border border-gray-700"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-around py-3 border-t border-b border-gray-800">
              <button
                onClick={async () => {
                  if (!hasReacted) {
                    setShowHeartAnimation(true);
                    playReactionSound();
                    setTimeout(() => setShowHeartAnimation(false), 600);
                  }
                  handleReaction();
                }}
                disabled={!currentUser}
                className={`flex items-center gap-2 transition-colors rounded-full bg-transparent border-none shadow-none ${
                  hasReacted ? "text-green-500" : "text-green-500 hover:text-green-400"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label="Like post"
              >
                {hasReacted || showHeartAnimation ? (
                  <HeartIconSolid className={`h-5 w-5 text-green-500 ${showHeartAnimation ? "animate-heart" : ""}`} />
                ) : (
                  <HeartIcon className="h-5 w-5 text-green-500" />
                )}
                <span className="text-sm font-medium text-green-500">{reactionCount > 0 ? `${reactionCount} Hearts` : "Like"}</span>
              </button>

              <div className="flex items-center gap-2">
                <ChatBubbleLeftIcon className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium text-green-500">{commentCount > 0 ? commentCount : "Comment"}</span>
              </div>

              <button
                onClick={handleShare}
                disabled={isSharing || (!!currentUser && currentUser.id === post.userId)}
                className={`flex items-center gap-2 transition-colors rounded-full bg-transparent border-none shadow-none ${
                  isSharing || (!!currentUser && currentUser.id === post.userId) 
                    ? "text-gray-600 cursor-not-allowed" 
                    : "text-green-500 hover:text-green-400"
                }`}
                aria-label="Share post"
                title={
                  !!currentUser && currentUser.id === post.userId 
                    ? "You cannot share your own post" 
                    : "Share this post"
                }
              >
                {isSharing ? (
                  <div className="h-5 w-5 border-2 border-t-transparent border-current rounded-full animate-spin" />
                ) : (
                  <ShareIcon className="h-5 w-5" />
                )}
                <span className={`text-sm font-medium ${
                  isSharing || (!!currentUser && currentUser.id === post.userId) 
                    ? "text-gray-600" 
                    : "text-green-500"
                }`}>
                  Share
                </span>
              </button>
            </div>

            {/* Comments section */}
            <div className="space-y-4">
              {currentUser && (
                <form onSubmit={handleSubmitComment}>
                  <div className="flex items-center gap-2 bg-[#181c20] border border-[#38444d] rounded-full px-4 py-2 shadow-sm focus-within:border-blue-400 transition-colors" style={{ boxShadow: '0 2px 8px 0 rgba(0,0,0,0.04)' }}>
                    <img
                      src={currentUser.profile_pic || "/images/default-avatar.png"}
                      alt={currentUser.name}
                      className="w-9 h-9 rounded-full object-cover border border-[#38444d]"
                    />
                    <input
                      value={commentText}
                      onChange={(e) => {
                        setCommentText(e.target.value);
                        if (commentError) setCommentError(null);
                      }}
                      placeholder="Post your reply"
                      className="flex-1 bg-transparent text-[#d9d9d9] border-none outline-none text-base placeholder-[#8899a6] px-2 py-2 focus:bg-[#22272b] transition-colors"
                      maxLength={2000}
                    />
                    <button
                      type="submit"
                      disabled={!commentText.trim() || isSubmittingComment}
                      className="flex items-center justify-center bg-blue-500 hover:bg-blue-400 disabled:bg-[#38444d] disabled:cursor-not-allowed text-white rounded-full transition-colors shadow-sm p-0 h-15 w-15 min-w-0 min-h-0"
                      aria-label="Send comment"
                      title="Send comment"
                    >
                      {isSubmittingComment ? (
                        // slightly larger spinner to match bigger icon
                        <div className="w-6 h-6 border-2 border-t-transparent border-white rounded-full animate-spin" />
                      ) : (
                        <img
                          src="https://firebasestorage.googleapis.com/v0/b/bulsuspace.firebasestorage.app/o/assets%2Fsend.png?alt=media&token=86933219-a5d0-4479-8828-7c090721e105"
                          alt="Send"
                          className="w-6 h-6 object-contain"
                          style={{ display: 'block' }}
                        />
                      )}
                    </button>
                  </div>

                  {commentError && (
                    <div className="text-red-400 text-sm mt-2 bg-red-900/20 px-3 py-2 rounded border border-red-800">
                      {commentError}
                    </div>
                  )}
                  <ProfanityModal
                    open={profanityModalOpen}
                    detectedWords={detectedProfaneWords}
                    onClose={() => setProfanityModalOpen(false)}
                  />
                </form>
              )}

              <div className="space-y-3">
                {comments.length > 0 ? (
                  comments
                    .slice()
                    .sort((a, b) => getDate(b.createdAt).getTime() - getDate(a.createdAt).getTime())
                    .map((comment) => (
                      <div
                        key={comment.id}
                        className="relative flex gap-3 group bg-gray-900/50 rounded-lg p-3 border border-gray-800"
                      >
                        <img
                          src={comment.userProfilePic || "/images/default-avatar.png"}
                          alt={comment.userName}
                          className="w-8 h-8 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => {
                            if (comment.userId) {
                              onClose()
                              navigate(`/profile/${comment.userId}`)
                            }
                          }}
                          title={`View ${comment.userName}'s profile`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="font-medium text-white text-sm cursor-pointer hover:text-green-400 transition-colors"
                              onClick={() => {
                                if (comment.userId) {
                                  onClose()
                                  navigate(`/profile/${comment.userId}`)
                                }
                              }}
                              title={`View ${comment.userName}'s profile`}
                            >
                              {comment.userName}
                            </span>
                            <RoleBadge role={comment.userRole} size="small" isSpaceAdmin={false} />
                          </div>
                          <p className="text-sm text-gray-200 break-words leading-relaxed">{comment.content}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            <span>{formatDate(comment.createdAt)}</span>
                            {comment.isEdited && <span className="text-green-400">Edited</span>}
                          </div>
                        </div>
                        {currentUser && (currentUser.id === comment.userId || isAdminOrSuperAdmin) && (
                          <button
                            onClick={() => handleDeleteComment(comment.id, comment.userId, isAdminOrSuperAdmin)}
                            className="absolute top-2 right-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-all p-1 rounded border border-red-800"
                            aria-label="Delete comment"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))
                ) : (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
                      <ChatBubbleLeftIcon className="h-6 w-6 text-gray-500" />
                    </div>
                    <p className="text-gray-400 text-sm">No comments yet</p>
                    <p className="text-gray-600 text-xs mt-1">Be the first to share your thoughts!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )

  return createPortal(modalContent, document.body)
}

// Helper: format date
const formatDate = (timestamp: any) => {
  if (!timestamp) return "Just now"
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return formatDistanceToNow(date, { addSuffix: true })
  } catch (error) {
    return "Just now"
  }
}
// Helper: get Date object from Firestore Timestamp or Date/string
const getDate = (ts: any) => (ts?.toDate ? ts.toDate() : new Date(ts))
const processContentWithHashtags = (content: string, isExpanded: boolean) => {
  const processedContent = content.replace(/#(\w+)/g, '<span class="text-green-400 font-medium">#$1</span>')

  const contentWithBreaks = processedContent.replace(/\n/g, "<br>")

  if (isExpanded) {
    return contentWithBreaks
  }

  const charLimit = 400

  if (contentWithBreaks.length <= charLimit) {
    return contentWithBreaks
  }

  let truncIndex = contentWithBreaks.lastIndexOf(" ", charLimit)
  if (truncIndex === -1) truncIndex = charLimit

  const truncated = contentWithBreaks.substring(0, truncIndex)
  return `${truncated}<span class=\"see-more-inline\">... <button id=\"seeMoreButton\" type=\"button\" class=\"see-more-btn text-green-400 hover:text-green-300 font-medium underline\" style=\"cursor: pointer;\">See more</button></span>`
}

export default FullScreenRegularPostModal

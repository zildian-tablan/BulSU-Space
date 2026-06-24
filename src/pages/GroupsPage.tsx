"use client"

import React, { useState, useEffect, useRef } from "react"
import ReactDOM from "react-dom"
import MainLayout from "../components/layout/MainLayout"
import SuccessDialog from "../components/common/SuccessDialog"
import { type Group, getGroupsRealtime, getUserGroupsRealtime, joinGroup, getGroupById, ensureMembershipForCreator } from "../services/groupService"
import { activityLogger } from "../services/activityLogService"
import { useAuth } from "../contexts/AuthContext"
import { UsersIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline"
import { useNavigate } from "react-router-dom"

const SkeletonCard: React.FC = () => {
  return (
    <div className="bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/70 border border-green-800/30 rounded-2xl overflow-hidden shadow-lg animate-pulse">
      {/* Skeleton cover image */}
      <div className="h-28 sm:h-36 bg-gray-700/50 relative">
        {/* Skeleton category badge */}
        <div className="absolute top-3 right-3 w-16 h-6 bg-gray-600/50 rounded-md"></div>
      </div>

      {/* Skeleton content */}
      <div className="p-4 bg-black/50 backdrop-blur-lg relative z-10 border-t border-green-800/20">
        {/* Skeleton title */}
        <div className="h-5 bg-gray-600/50 rounded mb-2 w-3/4"></div>

        {/* Skeleton description */}
        <div className="space-y-1 mb-3">
          <div className="h-3 bg-gray-700/50 rounded w-full"></div>
          <div className="h-3 bg-gray-700/50 rounded w-2/3"></div>
        </div>

        {/* Skeleton footer */}
        <div className="flex items-center justify-between pt-2 border-t border-green-900/30">
          <div className="flex items-center">
            <div className="h-4 w-4 bg-gray-600/50 rounded mr-1.5"></div>
            <div className="h-3 bg-gray-600/50 rounded w-16"></div>
          </div>
          <div className="h-6 w-12 bg-gray-600/50 rounded-lg"></div>
        </div>
      </div>
    </div>
  )
}

// Group card component
const GroupCard: React.FC<{
  group: Group
  isMember?: boolean
  onJoin: (groupId: string) => void
  onClick: (groupId: string) => void
}> = ({ group, isMember = false, onJoin, onClick }) => {
  return (
    <div
      className="bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/70 border border-green-800/30 rounded-2xl overflow-hidden shadow-lg hover:shadow-green-500/20 hover:-translate-y-1 transition-all duration-300 group relative cursor-pointer transform"
      onClick={() => onClick(group.id)}
    >
      {/* Enhanced cover image with animated overlay on hover */}
      <div
        className="h-28 sm:h-36 bg-cover bg-center relative overflow-hidden"
        style={{ backgroundImage: group.coverImage ? `url(${group.coverImage})` : "url(/images/space-coverimg.png)" }}
      >
        {/* Dynamic overlay with animated gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-100 group-hover:opacity-75 transition-opacity duration-300" />

        {/* Animated glow effect on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-green-500/0 to-blue-500/0 group-hover:from-green-500/20 group-hover:to-blue-500/10 transition-all duration-700 opacity-0 group-hover:opacity-100" />

        {/* Category badge */}
        {group.category && (
          <div className="absolute top-3 right-3 px-2 py-1 bg-green-500/20 backdrop-blur-md rounded-md border border-green-500/30 shadow-lg">
            <span className="text-xs font-medium text-green-300">{group.category}</span>
          </div>
        )}
      </div>

      {/* Content with improved glass morphism effect */}
      <div className="p-4 bg-black/50 backdrop-blur-lg relative z-10 border-t border-green-800/20 group-hover:bg-black/60 transition-all duration-300">
        {/* Name with animated underline effect */}
        <h3 className="text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-300 to-green-100 group-hover:from-green-200 group-hover:to-green-50 transition-all duration-300 mb-2 relative">
          <span className="truncate block">{group.name}</span>
          <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-green-400 to-blue-400 group-hover:w-full transition-all duration-300 opacity-0 group-hover:opacity-100"></span>
        </h3>

        {/* Description with better contrast */}
        <p className="text-xs text-green-100/90 line-clamp-2 mb-3 leading-relaxed group-hover:text-white/90 transition-colors">
          {group.description}
        </p>

        {/* Enhanced footer with animations and better visual hierarchy */}
        <div className="flex items-center justify-between pt-2 border-t border-green-900/30">
          <div className="flex items-center text-xs text-green-300/80 font-medium">
            <UsersIcon className="h-4 w-4 mr-1.5 opacity-60" />
            <span>
              {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
            </span>
          </div>

          {!isMember ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onJoin(group.id)
              }}
              className="px-3 py-1 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-300 hover:text-green-200 rounded-lg font-medium border border-green-500/30 hover:border-green-400/50 transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-green-500/20 transform active:scale-95"
            >
              Join
            </button>
          ) : (
            <span className="px-3 py-1 text-xs bg-green-400/20 text-green-300 rounded-md font-medium border border-green-400/30">
              Member
            </span>
          )}
        </div>
      </div>

      {/* Interactive hover effect - subtle glow around the card */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10 blur-xl bg-gradient-to-br from-green-500/10 via-transparent to-blue-500/10"></div>
    </div>
  )
}

// Create group modal (rendered via portal at document.body with maximum z-index)
const CreateGroupModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string, category: string, isPrivate: boolean, coverImage?: File) => void
}> = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState("")
  const [category, setCategory] = useState<"General" | "Private">("General")
  const [isLoading, setIsLoading] = useState(false)
  const [coverImage, setCoverImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      document.body.style.overflow = "hidden"
    } else {
      document.removeEventListener("mousedown", handleClickOutside)
      document.body.style.overflow = "unset"
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.body.style.overflow = "unset"
    }
  }, [isOpen, onClose])

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscapeKey)
    }

    return () => {
      document.removeEventListener("keydown", handleEscapeKey)
    }
  }, [isOpen, onClose])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setCoverImage(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeCoverImage = () => {
    setCoverImage(null)
    setImagePreview(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsLoading(true)
    try {
      await onCreate(
        name,
        // no description
        category,
        category === "Private",
        coverImage || undefined,
      )
      setName("")
      setCategory("General")
      setCoverImage(null)
      setImagePreview(null)
      onClose()
    } catch (error) {
      console.error("Error creating group:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  if (typeof window === "undefined" || typeof document === "undefined") return null

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-2xl bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 border border-green-800/40 shadow-2xl p-6 relative animate-[fadeIn_160ms_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-space-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="create-space-title"
          className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-200 mb-6"
        >
          Create New Space
        </h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Space Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Space Type*</label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="category"
                  value="General"
                  checked={category === "General"}
                  onChange={() => setCategory("General")}
                  className="text-green-500 focus:ring-green-500"
                />
                <span className="text-green-300 text-sm">General</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="category"
                  value="Private"
                  checked={category === "Private"}
                  onChange={() => setCategory("Private")}
                  className="text-green-500 focus:ring-green-500"
                />
                <span className="text-green-300 text-sm">Private</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              General spaces are public. Private spaces are only visible to invited members.
            </p>
          </div>

          {/* Cover Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Cover Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-900/40 file:text-green-300 hover:file:bg-green-800/60"
            />
            {imagePreview && (
              <div className="mt-3 relative">
                <img
                  src={imagePreview}
                  alt="Cover Preview"
                  className="w-full h-32 object-cover rounded-lg border border-gray-700/40"
                />
                <button
                  type="button"
                  onClick={removeCoverImage}
                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 text-xs shadow-lg border border-gray-700/60"
                  aria-label="Remove image"
                >
                  Remove
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">Optional. Recommended size: 1200x300px or similar wide image.</p>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              Space Name*
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 bg-gray-800/60 border border-gray-700 rounded-xl text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-transparent transition-colors"
              placeholder="Enter a name for your space"
              required
              autoFocus
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium bg-gray-800/70 hover:bg-gray-700/70 text-gray-300 border border-gray-700/60 hover:border-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isLoading}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg flex items-center gap-2 ${
                name.trim() && !isLoading
                  ? "bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white hover:shadow-green-500/30"
                  : "bg-gray-700 text-gray-300 cursor-not-allowed"
              }`}
            >
              {isLoading && (
                <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin" />
              )}
              Create Space
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

// Main Groups Page component
const GroupsPage: React.FC = () => {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [allGroups, setAllGroups] = useState<Group[]>([])
  const [myGroups, setMyGroups] = useState<Group[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(true)
  const [myGroupsLoading, setMyGroupsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"discover" | "mygroups">("discover")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [joiningGroup, setJoiningGroup] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768) // Add mobile detection
  const [showJoinSuccess, setShowJoinSuccess] = useState<{ open: boolean; groupId?: string; groupName?: string }>({ open: false })
  // For private group join modal
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeInput, setCodeInput] = useState("")
  const [codeError, setCodeError] = useState("")
  const [pendingGroup, setPendingGroup] = useState<Group | null>(null)
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 4

  useEffect(() => {
    if (!currentUser) {
      setAllGroups([])
      setMyGroups([])
      setDiscoverLoading(false)
      setMyGroupsLoading(false)
      return
    }

    // Subscribe to all groups with real-time updates
    const unsubscribeAll = getGroupsRealtime((fetchedGroups) => {
      setAllGroups(fetchedGroups)
      setDiscoverLoading(false)
      setError(null)
    })

    // Subscribe to user's groups with real-time updates
    const unsubscribeMy = getUserGroupsRealtime(currentUser.id, (fetchedGroups) => {
      setMyGroups(fetchedGroups)
      setMyGroupsLoading(false)
      setError(null)
    })

    // Cleanup subscriptions on unmount
    return () => {
      unsubscribeAll()
      unsubscribeMy()
    }
  }, [currentUser])

  // Handle joining a group (with private code check)
  const handleJoinGroup = async (groupId: string) => {
    if (!currentUser) return
    const group = allGroups.find((g) => g.id === groupId)
    if (group?.isPrivate) {
      setPendingGroup(group)
      setShowCodeModal(true)
      setCodeInput("")
      setCodeError("")
      return
    }
    await joinGroupDirect(groupId)
  }

  // Direct join (public or after code validated)
  const joinGroupDirect = async (groupId: string, joinCode?: string) => {
    if (!currentUser) return
    setJoiningGroup(groupId)
    try {
      await joinGroup(currentUser.id, groupId, joinCode)
      // Log the space_joined activity
      const group = await getGroupById(groupId)
  await activityLogger.logActivity(
        "space_joined",
        group ? `Joined space: ${group.name}` : "Joined a space",
        { spaceId: groupId, spaceName: group?.name || "" },
        "low",
        groupId,
        "space",
      )
  // Show success dialog; navigate will happen on confirm/auto-close
  setShowJoinSuccess({ open: true, groupId, groupName: group?.name })
    } catch (error) {
      console.error("Error joining group:", error)
      alert("Failed to join space. Please try again.")
    } finally {
      setJoiningGroup(null)
    }
  }

  // Handle code submit for private group
  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingGroup || !currentUser) return
    setCodeError("")
    setJoiningGroup(pendingGroup.id)
    try {
      // Get latest group data
      const group = await getGroupById(pendingGroup.id)
      if (!group || !group.spaceCode) {
        setCodeError("This space does not require a code.")
        setJoiningGroup(null)
        return
      }
      if (codeInput.trim() !== group.spaceCode) {
        setCodeError("Incorrect code")
        setJoiningGroup(null)
        return
      }
      setShowCodeModal(false)
      setPendingGroup(null)
      setCodeInput("")
  await joinGroupDirect(group.id, codeInput.trim())
    } catch (err) {
      setCodeError("Failed to validate code.")
      setJoiningGroup(null)
    }
  }

  // Handle creating a new group
  const handleCreateGroup = async (name: string, category: string, isPrivate: boolean, coverImage?: File) => {
    if (!currentUser) return
    try {
      const { createGroup } = await import("../services/groupService") // Dynamic import
      const groupId = await createGroup(name, "", currentUser.id, coverImage, category, isPrivate)
      if (groupId) {
        // Navigate immediately so user sees the new space instantly
        navigate(`/groups/${groupId}`)
      }
      setActiveTab("mygroups")
    } catch (error) {
      console.error("Error creating group:", error)
      throw error
    }
  }

  // Filter groups that the user is already a member of and apply search
  const filteredGroups = allGroups
    // Ensure each group has a unique ID and remove any duplicates
    .filter((group, index, self) => index === self.findIndex((g) => g.id === group.id))
    // Filter out groups user is already a member of
    .filter((group) => !myGroups.some((myGroup) => myGroup.id === group.id))
    // Apply search filter
    .filter(
      (group) =>
        searchQuery === "" ||
        group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        group.description.toLowerCase().includes(searchQuery.toLowerCase()),
    )

  // Filter my groups based on search query, ensuring unique groups
  const filteredMyGroups = myGroups
    // Remove any duplicates by ID
    .filter((group, index, self) => index === self.findIndex((g) => g.id === group.id))
    // Apply search filter
    .filter(
      (group) =>
        searchQuery === "" ||
        group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        group.description.toLowerCase().includes(searchQuery.toLowerCase()),
    )

  // Get current groups based on active tab
  const currentGroups = activeTab === "discover" ? filteredGroups : filteredMyGroups

  // Pagination calculations
  const totalPages = Math.ceil(currentGroups.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedGroups = currentGroups.slice(startIndex, endIndex)

  // Reset current page when tab changes or search changes
  React.useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, searchQuery])

  // Pagination handlers
  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1))
  }

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
  }

  const handlePageClick = (page: number) => {
    setCurrentPage(page)
  }

  // Handle window resize to update mobile state
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768) // Set mobile breakpoint at 768px (md)
    }

    window.addEventListener("resize", handleResize)
    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  const isCurrentTabLoading = activeTab === "discover" ? discoverLoading : myGroupsLoading

  return (
    <MainLayout>
      {/* Success dialog after joining */}
      <SuccessDialog
        open={showJoinSuccess.open}
        title="Joined successfully"
        message={
          showJoinSuccess.groupName ? (
            <span>
              You have joined <span className="font-semibold text-green-300">{showJoinSuccess.groupName}</span>.
            </span>
          ) : (
            <span>You have joined the space.</span>
          )
        }
        confirmLabel="Open space"
        onConfirm={() => {
          if (showJoinSuccess.groupId) navigate(`/groups/${showJoinSuccess.groupId}`)
          setShowJoinSuccess({ open: false })
        }}
        onClose={() => setShowJoinSuccess({ open: false })}
      />
      <div className="container mx-auto px-2 sm:px-4 max-w-6xl" data-tutorial="groups-page">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-green-500 to-green-400 animate-gradient-x drop-shadow-lg mb-2 md:mb-0">
            Spaces
          </h1>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-green-700/80 to-green-600/80 hover:from-green-600 hover:to-green-500 text-white rounded-full text-sm font-bold shadow transition-all"
            >
              <PlusIcon className="h-5 w-5" />
              <span>Create Space</span>
            </button>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search spaces..."
                className="w-full px-4 py-2.5 bg-gray-800/50 border border-gray-600 text-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-colors placeholder-gray-400"
              />
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-slate-900/80 via-gray-900/70 to-slate-900/80 rounded-3xl border border-slate-700/40 overflow-hidden mb-8 backdrop-blur-xl shadow-2xl ring-1 ring-white/5">
          {/* Ultra Modern Tab Container with Subtle Animations */}
          <div className="relative bg-gradient-to-r from-slate-900/30 via-gray-800/20 to-slate-900/30 backdrop-blur-sm">
            {/* Premium floating indicator with advanced styling */}
            <div
              className={`absolute bottom-0 h-0.5 w-1/2 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                activeTab === "discover" ? "translate-x-0" : "translate-x-full"
              }`}
            >
              {/* Multi-layered indicator with depth */}
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-green-400 to-cyan-400 rounded-full"></div>
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-300 via-green-300 to-cyan-300 rounded-full blur-sm opacity-70"></div>
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-200 via-green-200 to-cyan-200 rounded-full blur-md opacity-40"></div>
            </div>

            {/* Ambient background glow following active tab */}
            <div
              className={`absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-green-500/5 to-cyan-500/5 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                activeTab === "discover" ? "translate-x-0 opacity-100" : "translate-x-full opacity-100"
              }`}
            ></div>

            {/* Ultra Premium tab buttons with advanced micro-interactions */}
            <div className="flex relative">
              <button
                onClick={() => setActiveTab("discover")}
                className={`group flex-1 py-6 px-10 text-sm transition-all duration-500 relative overflow-hidden ${
                  activeTab === "discover"
                    ? "text-emerald-300 bg-gradient-to-b from-slate-800/50 to-gray-900/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-gradient-to-b hover:from-slate-800/25 hover:to-gray-900/15"
                }`}
              >
                {/* Advanced floating particle effect on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <div className="absolute top-2 left-4 w-1 h-1 bg-emerald-400/40 rounded-full animate-pulse delay-100"></div>
                  <div className="absolute top-4 right-6 w-0.5 h-0.5 bg-cyan-400/30 rounded-full animate-pulse delay-300"></div>
                  <div className="absolute bottom-3 left-1/3 w-0.5 h-0.5 bg-green-400/20 rounded-full animate-pulse delay-500"></div>
                </div>

                {/* Dynamic gradient background on active */}
                <div
                  className={`absolute inset-0 bg-gradient-to-r from-emerald-500/8 via-green-500/6 to-cyan-500/8 transition-all duration-500 ${
                    activeTab === "discover" ? "opacity-100" : "opacity-0 group-hover:opacity-50"
                  }`}
                ></div>

                <span className="relative flex items-center justify-center gap-3">
                  {/* Premium icon with morphing animations */}
                  <div
                    className={`transition-all duration-500 transform ${
                      activeTab === "discover"
                        ? "scale-110 text-emerald-400 rotate-12"
                        : "scale-100 group-hover:scale-105 group-hover:rotate-3"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={activeTab === "discover" ? 2.5 : 2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>

                  <span
                    className={`transition-all duration-500 ${
                      activeTab === "discover"
                        ? "font-bold tracking-wide text-emerald-300"
                        : "font-semibold tracking-normal group-hover:tracking-wide"
                    }`}
                  >
                    Discover Spaces
                  </span>
                </span>
              </button>

              <button
                onClick={() => setActiveTab("mygroups")}
                className={`group flex-1 py-6 px-10 text-sm transition-all duration-500 relative overflow-hidden ${
                  activeTab === "mygroups"
                    ? "text-emerald-300 bg-gradient-to-b from-slate-800/50 to-gray-900/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-gradient-to-b hover:from-slate-800/25 hover:to-gray-900/15"
                }`}
              >
                {/* Subtle hover background animation */}
                <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                <span className="relative flex items-center justify-center gap-3">
                  {/* Enhanced icon with smooth transitions */}
                  <div
                    className={`transition-all duration-300 ${
                      activeTab === "mygroups" ? "scale-110 text-green-400" : "scale-100 group-hover:scale-105"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={activeTab === "mygroups" ? 2.5 : 2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>

                  <span
                    className={`transition-all duration-300 ${
                      activeTab === "mygroups" ? "font-bold tracking-wide" : "font-semibold tracking-normal"
                    }`}
                  >
                    My Spaces
                  </span>

                  {/* Enhanced badge with better styling */}
                  {myGroups.length > 0 && (
                    <span
                      className={`ml-2 px-2 py-0.5 text-xs rounded-full font-bold transition-all duration-300 ${
                        activeTab === "mygroups"
                          ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30"
                          : "bg-gray-600/70 text-gray-300 group-hover:bg-gray-500/70"
                      }`}
                    >
                      {myGroups.length}
                    </span>
                  )}
                </span>
              </button>
            </div>

            {/* Subtle border separator */}
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gray-600/30 to-transparent"></div>
          </div>
          {isCurrentTabLoading ? (
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {/* Render 8 skeleton cards to match typical loading state */}
              {Array.from({ length: 8 }).map((_, index) => (
                <SkeletonCard key={index} />
              ))}
            </div>
          ) : error ? (
            <div className="m-6 bg-red-900/30 border border-red-700/50 text-red-300 p-6 rounded-2xl text-sm shadow-lg backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                {error}
              </div>
            </div>
          ) : currentGroups.length === 0 ? (
            <div className="p-16 text-center">
              <div className="relative inline-block mb-6">
                <div className="p-6 rounded-full bg-gradient-to-br from-green-900/40 to-green-800/40 shadow-2xl border border-green-700/30 backdrop-blur-sm">
                  <UsersIcon className="h-10 w-10 text-green-400" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-br from-green-500 to-green-600 rounded-full animate-pulse shadow-lg"></div>
              </div>
              <h3 className="text-xl font-bold text-green-300 mb-3">
                {activeTab === "discover"
                  ? "No spaces found"
                  : searchQuery
                    ? "No spaces found"
                    : "You haven't joined any spaces yet"}
              </h3>
              <p className="text-green-400/80 max-w-md mx-auto leading-relaxed">
                {activeTab === "discover"
                  ? searchQuery
                    ? `No spaces match "${searchQuery}". Try a different search term or create a new space!`
                    : "There are no spaces available. Be the first to create one!"
                  : searchQuery
                    ? `No spaces in your joined spaces match "${searchQuery}".`
                    : "Discover and join spaces to connect with others with similar interests"}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => (activeTab === "discover" ? setShowCreateModal(true) : setActiveTab("discover"))}
                  className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-700/80 to-green-600/80 hover:from-green-600 hover:to-green-500 text-white rounded-full text-sm font-bold shadow-lg transition-all transform hover:scale-105"
                >
                  {activeTab === "discover" ? (
                    <>
                      <PlusIcon className="h-4 w-4" />
                      Create First Space
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                      Discover Spaces
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {/* Check for and log any duplicate IDs for debugging */}
                {(() => {
                  const groupIds = new Set()
                  paginatedGroups.forEach((group) => {
                    if (groupIds.has(group.id)) {
                      console.warn(`Duplicate group ID detected: ${group.id}`)
                    }
                    groupIds.add(group.id)
                  })
                  return null
                })()}

                {/* Render unique groups */}
                {paginatedGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    isMember={activeTab === "mygroups"}
                    onJoin={handleJoinGroup}
                    onClick={(groupId) => navigate(`/groups/${groupId}`)}
                  />
                ))}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-slate-700/40">
                  <div className="flex items-center justify-between pt-4">
                    {/* Page info - Only shown on desktop */}
                    {/* Empty div for mobile to maintain spacing */}
                    {isMobile && <div></div>}
                    {/* Pagination buttons */}
                    <div className="flex items-center gap-2">
                      {/* Previous button */}
                      <button
                        onClick={handlePreviousPage}
                        disabled={currentPage === 1}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-300 bg-gray-800/50 border border-gray-600/30 rounded-lg hover:bg-gray-700/50 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-800/50 disabled:hover:text-gray-300 transition-all duration-200"
                      >
                        <ChevronLeftIcon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Previous</span>
                      </button>
                      {/* Page indicator for both desktop and mobile */}
                      <div className="px-2 text-xs font-medium text-gray-300">
                        {currentPage} / {totalPages}
                      </div>
                      {/* Next button */}
                      <button
                        onClick={handleNextPage}
                        disabled={currentPage === totalPages}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-300 bg-gray-800/50 border border-gray-600/30 rounded-lg hover:bg-gray-700/50 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-800/50 disabled:hover:text-gray-300 transition-all duration-200"
                      >
                        <span className="hidden sm:inline">Next</span>
                        <ChevronRightIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <CreateGroupModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateGroup}
        />
        {/* Modal for entering space code for private spaces */}
        {showCodeModal && pendingGroup && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <form
              onSubmit={handleCodeSubmit}
              className="bg-gray-900 rounded-2xl p-8 shadow-2xl border border-green-700/40 w-full max-w-xs flex flex-col gap-4"
            >
              <h2 className="text-lg font-bold text-green-300 mb-2">Enter Space Code</h2>
              <input
                type="text"
                className="p-2 rounded bg-gray-800 border border-green-700 text-green-200 focus:outline-none focus:ring-2 focus:ring-green-500"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="Space code"
                autoFocus
                disabled={joiningGroup === pendingGroup.id}
              />
              {codeError && <div className="text-red-400 text-sm">{codeError}</div>}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="flex-1 py-2 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
                  onClick={() => {
                    setShowCodeModal(false)
                    setPendingGroup(null)
                    setCodeInput("")
                    setCodeError("")
                  }}
                  disabled={joiningGroup === pendingGroup.id}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded bg-green-600 text-white hover:bg-green-500 font-bold"
                  disabled={joiningGroup === pendingGroup.id || !codeInput.trim()}
                >
                  {joiningGroup === pendingGroup.id ? "Joining..." : "Join"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

export default GroupsPage

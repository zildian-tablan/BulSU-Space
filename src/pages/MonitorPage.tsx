"use client"

import React from "react"
import Navbar from "../components/layout/Navbar"
import { useAuth } from "../contexts/AuthContext"
import { Link, useNavigate } from "react-router-dom"
import {
  getAllChats,
  getPaginatedMessages,
  type ChatWithDetails,
  type Message,
  type MessagePage,
  adminDeleteMessage,
  adminDeleteConversation,
} from "../services/messageService"
import { formatDistanceToNow } from "date-fns"
import type { Timestamp } from "firebase/firestore"

const ChatListSkeleton = () => (
  <div className="space-y-0">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="px-4 py-3 border-b border-gray-800 animate-pulse">
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-3 bg-gray-700 rounded w-24"></div>
              <div className="h-2 bg-gray-800 rounded w-12"></div>
            </div>
            <div className="h-2 bg-gray-800 rounded w-32"></div>
          </div>
          <div className="flex flex-col items-end justify-between">
            <div className="h-2 bg-gray-800 rounded w-8"></div>
            <div className="h-2 bg-gray-800 rounded w-12 mt-1"></div>
          </div>
        </div>
      </div>
    ))}
  </div>
)

const MessagesSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="rounded-lg border p-3 bg-gray-900/40 border-gray-800 animate-pulse">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-3 bg-gray-700 rounded w-20"></div>
          <div className="h-2 bg-gray-800 rounded w-16"></div>
        </div>
        <div className="space-y-1">
          <div className="h-3 bg-gray-800 rounded w-full"></div>
          <div className="h-3 bg-gray-800 rounded w-3/4"></div>
          {Math.random() > 0.5 && <div className="h-3 bg-gray-800 rounded w-1/2"></div>}
        </div>
      </div>
    ))}
  </div>
)

const MonitorPage: React.FC = () => {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const isAuthorized = currentUser && (currentUser.role === "admin" || currentUser.role === "super admin")

  // Conversation monitoring state
  const [chats, setChats] = React.useState<ChatWithDetails[]>([])
  const [filteredChats, setFilteredChats] = React.useState<ChatWithDetails[]>([])
  const [selectedChatId, setSelectedChatId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [chatSearch, setChatSearch] = React.useState("")
  const [loadingChats, setLoadingChats] = React.useState(true)
  const [loadingMessages, setLoadingMessages] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [messageDeleting, setMessageDeleting] = React.useState<string | null>(null)
  const [confirmState, setConfirmState] = React.useState<{
    type: "chat" | "message"
    id: string
    info?: string
  } | null>(null)
  const lastMessageIdRef = React.useRef<string | null>(null)
  const chatsUnsubRef = React.useRef<() => void>()

  const [initialLoad, setInitialLoad] = React.useState(true)

  // Mobile responsiveness (mirror approach from MessagingPage simplified)
  const [isMobileView, setIsMobileView] = React.useState<boolean>(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  )
  const [showChatList, setShowChatList] = React.useState<boolean>(
    typeof window !== "undefined" ? window.innerWidth >= 768 || !selectedChatId : true,
  )

  React.useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobileView(mobile)
      if (!mobile) {
        // Always show both panels on desktop
        setShowChatList(true)
      } else if (!selectedChatId) {
        // If no chat selected on mobile, ensure chat list visible
        setShowChatList(true)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [selectedChatId])

  React.useEffect(() => {
    if (!isAuthorized) return

    setLoadingChats(true)
    setInitialLoad(true)

    chatsUnsubRef.current = getAllChats((all) => {
      setChats(all)
      setLoadingChats(false)
      setInitialLoad(false)
    })
    return () => {
      chatsUnsubRef.current && chatsUnsubRef.current()
    }
  }, [isAuthorized])

  // Filter chats
  React.useEffect(() => {
    const term = chatSearch.trim().toLowerCase()
    if (!term) {
      setFilteredChats(chats)
      return
    }
    setFilteredChats(
      chats.filter((c) => {
        const nameParts: string[] = []
        if (c.isGroupChat && c.name) nameParts.push(c.name.toLowerCase())
        c.participantDetails?.forEach((u) => {
          if (u.name) nameParts.push(u.name.toLowerCase())
        })
        const lastContent = (c.lastMessage as any)?.content?.toLowerCase?.() || ""
        return (
          nameParts.some((p) => p.includes(term)) || lastContent.includes(term) || c.id.toLowerCase().includes(term)
        )
      }),
    )
  }, [chatSearch, chats])

  // Load messages on selection (paginated, on-demand)
  React.useEffect(() => {
    if (!selectedChatId) return
    // Reset state for new chat
    setMessages([])
    lastMessageIdRef.current = null
    setHasMore(false)
    setLoadingMessages(true)
    ;(async () => {
      try {
        const page: MessagePage = await getPaginatedMessages(selectedChatId, undefined, 50)
        setMessages(page.messages) // already ascending order
        // Store lastMessageId but also try to store cursor-friendly timestamp if available
        lastMessageIdRef.current = page.lastMessageId
        setHasMore(page.hasMore)
      } catch (e) {
        console.error("Failed to load messages for monitoring", e)
      } finally {
        setLoadingMessages(false)
      }
    })()
  }, [selectedChatId])

  const loadOlder = async () => {
    if (!selectedChatId || !hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      // If we have messages, prefer using the last message's createdAt millis as cursor
      const lastMsg = messages[0]
      const cursor = lastMsg?.createdAt ? (lastMsg.createdAt instanceof Object && typeof (lastMsg.createdAt as any).toMillis === 'function' ? (lastMsg.createdAt as any).toMillis() : undefined) : undefined
      const page = await getPaginatedMessages(selectedChatId, cursor ?? lastMessageIdRef.current ?? undefined, 50)
      setMessages((prev) => [...page.messages, ...prev])
      lastMessageIdRef.current = page.lastMessageId
      setHasMore(page.hasMore)
    } catch (e) {
      console.error("Failed to load older messages", e)
    } finally {
      setLoadingMore(false)
    }
  }

  const selectedChat = chats.find((c) => c.id === selectedChatId) || null

  const formatTs = (ts?: Timestamp) => {
    if (!ts) return ""
    try {
      return formatDistanceToNow(ts.toDate(), { addSuffix: true })
    } catch {
      return ""
    }
  }

  // --- Reusable fragments for desktop & mobile ---
  const chatListPanel = (
    <div
      className={`w-full md:w-80 xl:w-96 border-r border-gray-800 flex flex-col ${isMobileView ? "h-full" : ""}`}
      style={{ background: 'none', backgroundColor: 'transparent', boxShadow: 'none' }}
    >
      <div className="p-4 border-b border-gray-800 flex items-center gap-3">
        {isMobileView && selectedChatId && (
          <button
            onClick={() => {
              setSelectedChatId(null)
              setShowChatList(true)
            }}
            className="md:hidden mr-1 p-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            <span className="material-icons text-base">arrow_back</span>
          </button>
        )}
        <span className="material-icons text-emerald-400">dashboard</span>
        <div>
          <h1 className="text-lg font-semibold text-emerald-300">Monitor Conversations</h1>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Admin Visibility</p>
        </div>
      </div>
      <div className="p-3">
        <div className="relative">
          <input
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            placeholder="Search chats or users..."
            className="w-full bg-gray-800/70 border border-gray-700 rounded-lg px-10 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder-gray-500"
            disabled={loadingChats}
          />
          <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-base">
            search
          </span>
          {chatSearch && (
            <button
              onClick={() => setChatSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <span className="material-icons text-sm">close</span>
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loadingChats && <ChatListSkeleton />}

        {!loadingChats && filteredChats.length === 0 && !initialLoad && (
          <div className="p-4 text-xs text-gray-500">
            {chatSearch ? "No chats match your search." : "No chats found."}
          </div>
        )}

        {!loadingChats &&
          filteredChats.map((chat) => {
            const last = chat.lastMessage as any
            const title = chat.isGroupChat
              ? chat.name || `Group (${chat.participants.length})`
              : chat.participantDetails?.find((u) => u.id !== currentUser?.id)?.name || "Direct Chat"
            const preview = last?.content
              ? last.content.length > 40
                ? last.content.slice(0, 40) + "…"
                : last.content
              : "No messages yet"
            return (
              <button
                key={chat.id}
                onClick={() => {
                  setSelectedChatId(chat.id)
                  if (isMobileView) {
                    setShowChatList(false)
                  }
                }}
                className={`w-full text-left px-4 py-3 border-b border-gray-800 transition flex gap-3 hover:bg-gray-800/50 ${selectedChatId === chat.id ? 'bg-gray-800/70' : ''}`}
                style={selectedChatId === chat.id ? {} : { background: 'none', backgroundColor: 'transparent' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-300 truncate max-w-[140px]">{title}</span>
                    {chat.isGroupChat && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-700/30">
                        Group
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 truncate max-w-[180px]">{preview}</div>
                </div>
                <div className="flex flex-col items-end justify-between">
                  <span className="text-[10px] text-gray-500">{formatTs(last?.createdAt || last?.timestamp)}</span>
                  <span className="text-[9px] text-gray-600 mt-1">{chat.participants.length} users</span>
                </div>
              </button>
            )
          })}
      </div>
    </div>
  )

  const messagesPanel = (
    <div className="flex-1 flex flex-col min-h-0">
      {!selectedChatId && (
        <div className="h-full flex items-center justify-center text-gray-500 text-sm p-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="material-icons text-4xl text-gray-600">forum</span>
            <span>Select a chat to view messages</span>
          </div>
        </div>
      )}
      {selectedChat && (
        <>
          <div className="px-4 sm:px-5 py-3 border-b border-gray-800 flex items-center justify-between bg-gray-900/60 gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {isMobileView && (
                <button
                  onClick={() => {
                    setShowChatList(true)
                  }}
                  className="md:hidden p-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 flex-shrink-0"
                >
                  <span className="material-icons text-base">arrow_back</span>
                </button>
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-emerald-300 flex items-center gap-2 truncate">
                  <span className="material-icons text-emerald-400 text-base flex-shrink-0">forum</span>
                  <span className="truncate">
                    {selectedChat.isGroupChat
                      ? selectedChat.name || "Group Chat"
                      : selectedChat.participantDetails
                          ?.filter((u) => u.id !== currentUser?.id)
                          .map((u) => u.name)
                          .join(", ") || "Direct Chat"}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                  Chat ID: <span className="text-gray-400 font-mono">{selectedChat.id}</span>
                  <span className="mx-2">•</span>
                  Participants: {selectedChat.participants.length}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {selectedChat && (
                <button
                  disabled={deleting}
                  onClick={() => setConfirmState({ type: "chat", id: selectedChat.id })}
                  className="px-2 py-1 rounded-md bg-red-900/40 border border-red-700/40 text-[11px] text-red-300 flex items-center gap-1 hover:bg-red-900/60 disabled:opacity-50"
                >
                  <span className="material-icons text-xs">delete</span>
                  Delete Chat
                </button>
              )}
              <button
                onClick={() => {
                  setSelectedChatId(null)
                  if (isMobileView) {
                    setShowChatList(true)
                  }
                }}
                className="px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-[11px] text-gray-300 flex items-center gap-1"
              >
                <span className="material-icons text-xs">close</span>
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-gray-950/40 custom-scrollbar">
            <div className="flex justify-center">
              {hasMore && !loadingMessages && (
                <button
                  onClick={loadOlder}
                  disabled={loadingMore}
                  className={`text-[11px] px-3 py-1.5 mb-2 rounded-md bg-gray-800 text-emerald-300 border border-gray-700 disabled:opacity-50 ${!isMobileView ? "hover:bg-gray-700 hover:border-emerald-600" : ""}`}
                >
                  {loadingMore ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border border-emerald-300 border-t-transparent rounded-full animate-spin"></div>
                      Loading…
                    </div>
                  ) : (
                    "Load older messages"
                  )}
                </button>
              )}
            </div>

            {loadingMessages && <MessagesSkeleton />}

            {!loadingMessages && messages.length === 0 && (
              <div className="text-center py-8">
                <span className="material-icons text-3xl text-gray-600 mb-2 block">chat_bubble_outline</span>
                <div className="text-xs text-gray-600">No messages in this chat.</div>
              </div>
            )}

            {!loadingMessages &&
              messages.map((msg) => {
                const sender = selectedChat.participantDetails?.find((u) => u.id === (msg as any).senderId)
                const ts = (msg as any).createdAt || (msg as any).timestamp
                const isSystem = msg.type === "system"
                return (
                  <div
                    key={msg.id}
                    className={`group flex flex-col rounded-lg border p-3 bg-gray-900/40 border-gray-800 transition ${!isMobileView ? "hover:border-emerald-700/40" : ""} ${isSystem ? "opacity-75" : ""}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-emerald-300">
                        {sender?.name || (msg as any).senderId}
                      </span>
                      <span className="text-[10px] text-gray-500">{formatTs(ts)}</span>
                      {msg.edited && (
                        <span className="text-[9px] uppercase tracking-wide text-yellow-400/70">edited</span>
                      )}
                      <button
                        disabled={messageDeleting === msg.id}
                        onClick={() => setConfirmState({ type: "message", id: msg.id, info: msg.content.slice(0, 60) })}
                        className="ml-2 opacity-0 group-hover:opacity-100 transition text-red-400 hover:text-red-300 disabled:opacity-50"
                        title="Delete message"
                      >
                        <span className="material-icons text-[14px]">delete</span>
                      </button>
                    </div>
                    <div
                      className={`text-xs whitespace-pre-wrap ${isSystem ? "text-gray-400 italic" : "text-gray-200"}`}
                    >
                      {msg.content}
                    </div>
                    {(msg as any).attachments && (msg as any).attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(msg as any).attachments.map((att: string, idx: number) => (
                          <a
                            key={idx}
                            href={att}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`text-[10px] px-2 py-1 rounded bg-gray-800 text-emerald-300 border border-gray-700 ${!isMobileView ? "hover:border-emerald-600 hover:text-emerald-200" : ""}`}
                          >
                            Attachment {idx + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 flex flex-col">
      <Navbar />
      {!isAuthorized ? (
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center bg-gray-800/60 p-8 rounded-2xl border border-gray-700 shadow-lg">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/30">
              <span className="material-icons text-red-400 text-3xl">block</span>
            </div>
            <h1 className="text-xl font-semibold text-red-300 mb-2">Access Restricted</h1>
            <p className="text-sm text-gray-400 mb-6">You don't have permission to view the monitoring dashboard.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate(-1)}
                className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors"
              >
                Go Back
              </button>
              <Link
                to="/home"
                className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
              >
                Home
              </Link>
            </div>
          </div>
        </main>
      ) : (
        <main className="flex-1 flex min-h-0">
          {/* Desktop: both panels; Mobile: conditional */}
          {isMobileView ? (
            showChatList ? (
              chatListPanel
            ) : (
              messagesPanel
            )
          ) : (
            <>
              {chatListPanel}
              {messagesPanel}
            </>
          )}
          {/* Confirmation Modal */}
          {confirmState && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-xl">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-icons text-red-400">warning</span>
                  <h2 className="text-sm font-semibold text-red-300">
                    Confirm {confirmState.type === "chat" ? "Chat" : "Message"} Deletion
                  </h2>
                </div>
                <p className="text-xs text-gray-400 mb-4">
                  {confirmState.type === "chat" ? (
                    <>
                      This will permanently delete the entire conversation and all its messages for all participants.
                      This action cannot be undone.
                    </>
                  ) : (
                    <>
                      This will permanently delete the selected message for all participants. This action cannot be
                      undone.
                    </>
                  )}
                </p>
                {confirmState.info && (
                  <div className="text-[10px] bg-gray-800/70 rounded-md px-2 py-1 font-mono text-gray-300 mb-4 max-h-24 overflow-y-auto">
                    {confirmState.info}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmState(null)}
                    className="px-3 py-1.5 rounded-md text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-200"
                    disabled={deleting || messageDeleting !== null}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!currentUser) return
                      if (confirmState.type === "chat") {
                        try {
                          setDeleting(true)
                          await adminDeleteConversation(confirmState.id, currentUser.id)
                          setChats((prev) => prev.filter((c) => c.id !== confirmState.id))
                          if (selectedChatId === confirmState.id) setSelectedChatId(null)
                        } catch (e) {
                          console.error("Admin chat delete failed", e)
                        } finally {
                          setDeleting(false)
                          setConfirmState(null)
                        }
                      } else {
                        try {
                          setMessageDeleting(confirmState.id)
                          await adminDeleteMessage(confirmState.id, currentUser.id)
                          setMessages((prev) => prev.filter((m) => m.id !== confirmState.id))
                        } catch (e) {
                          console.error("Admin message delete failed", e)
                        } finally {
                          setMessageDeleting(null)
                          setConfirmState(null)
                        }
                      }
                    }}
                    className="px-3 py-1.5 rounded-md text-[11px] bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
                    disabled={deleting || messageDeleting !== null}
                  >
                    {confirmState.type === "chat"
                      ? deleting
                        ? "Deleting…"
                        : "Delete Chat"
                      : messageDeleting
                        ? "Deleting…"
                        : "Delete Message"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  )
}

export default MonitorPage

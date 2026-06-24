"use client";

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { formatDistanceToNow } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { SpacePost } from '../../models/SpacePost';
import RoleBadge from '../common/RoleBadge';
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
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';
import {
  addSpacePostReaction,
  addSpacePostComment,
  deleteSpacePostComment,
  getSpacePostCommentsRealtime,
  getSpacePostReactionStatusRealtime,
} from '../../services/spacePostService';
import { getUserNameRealtime, getUserProfilePicRealtime } from '../../services/userNameService';
import { useAuth } from '../../contexts/AuthContext';
import './FullScreenRegularPostModal.css';

interface FullScreenSpacePostProps {
  post: SpacePost;
  isOpen: boolean;
  onClose: () => void;
  onPostUpdated?: () => void;
}

interface CommentType {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userProfilePic: string;
  userRole?: string;
  content: string;
  createdAt: any;
  updatedAt?: any;
  isEdited?: boolean;
  replyTo?: string | null;
}

const FullScreenSpacePost: React.FC<FullScreenSpacePostProps> = ({ post, isOpen, onClose, onPostUpdated }) => {
  const { currentUser } = useAuth();

  // Core post user dynamic data
  const [displayName, setDisplayName] = useState(post.userName);
  const [profilePic, setProfilePic] = useState(post.userProfilePic);

  // Reaction state
  const [hasReacted, setHasReacted] = useState(false);
  const [reactionCount, setReactionCount] = useState(post.reactionCount || 0);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);

  // Comments state
  const [comments, setComments] = useState<CommentType[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Preview state (images)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Share state (placeholder – not implemented for space posts yet)
  const [isSharing, setIsSharing] = useState(false);

  // Modal animation mount state
  const [showModal, setShowModal] = useState(false);

  // Refs
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Effects: mount/unmount animation
  useEffect(() => {
    if (isOpen) {
      setShowModal(true);
    } else {
      const timeout = setTimeout(() => setShowModal(false), 200);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  // Dynamic user name + profile pic realtime update
  useEffect(() => {
    if (!post.userId) return;
    const unName = getUserNameRealtime(post.userId, (name) => { if (name) setDisplayName(name); });
    const unPic = getUserProfilePicRealtime(post.userId, (pic) => { if (pic) setProfilePic(pic); });
    return () => { unName(); unPic(); };
  }, [post.userId]);

  // Reaction realtime listener
  useEffect(() => {
    if (!currentUser || !isOpen) return;
    const unsub = getSpacePostReactionStatusRealtime(
      post.id,
      currentUser.id,
      (reacted, count) => {
        if (reacted !== null) setHasReacted(reacted);
        if (count !== -1) setReactionCount(count);
      },
      () => {}
    );
    return () => unsub();
  }, [post.id, currentUser, isOpen]);

  // Comments realtime listener
  useEffect(() => {
    if (!isOpen) return;
    const unsub = getSpacePostCommentsRealtime(post.id, (list) => {
      setComments(list as CommentType[]);
      onPostUpdated?.();
    });
    return () => unsub();
  }, [post.id, isOpen, onPostUpdated]);

  const handleReaction = async () => {
    if (!currentUser) return;
    const prevHas = hasReacted;
    const prevCount = reactionCount;
    try {
      setHasReacted(!prevHas);
      setReactionCount(prevHas ? prevCount - 1 : prevCount + 1);
      if (!prevHas) {
        setShowHeartAnimation(true);
        try { new window.Audio('/audio/pop-heart-sound.mp3').play(); } catch {}
        setTimeout(() => setShowHeartAnimation(false), 600);
      }
      await addSpacePostReaction(post.id, currentUser.id);
    } catch (e) {
      // revert
      setHasReacted(prevHas);
      setReactionCount(prevCount);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !commentText.trim()) return;
    setIsSubmittingComment(true);
    try {
      // optimistic
      const optimistic: CommentType = {
        id: 'temp-' + Date.now(),
        postId: post.id,
        userId: currentUser.id,
        userName: currentUser.name || '',
        userProfilePic: currentUser.profile_pic || '',
        userRole: currentUser.role || 'student',
        content: commentText,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isEdited: false,
        replyTo: null,
      };
      setComments((prev) => [...prev, optimistic]);
      await addSpacePostComment(post.id, currentUser.id, commentText, null);
      setCommentText('');
      onPostUpdated?.();
    } catch (e) {
      // failure: remove optimistic
      setComments((prev) => prev.filter((c) => !c.id.startsWith('temp-')));
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string, commentUserId: string) => {
    if (!currentUser) return;
    const userRole = currentUser.role as string | undefined;
    const isAdmin = userRole === 'admin' || userRole === 'super admin';
    const prev = comments;
    setComments((list) => list.filter((c) => c.id !== commentId));
    try {
      await deleteSpacePostComment(post.id, commentId, currentUser.id, isAdmin);
      onPostUpdated?.();
    } catch (e) {
      // revert
      setComments(prev);
    }
  };

  const openImagePreview = (images: string[], startIndex: number) => {
    setPreviewImages(images);
    setCurrentImageIndex(startIndex);
    setPreviewOpen(true);
  };

  const downloadImage = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `image-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Failed to download image');
    }
  };

  const goToPrevious = () => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : previewImages.length - 1));
  };
  const goToNext = () => {
    setCurrentImageIndex((prev) => (prev < previewImages.length - 1 ? prev + 1 : 0));
  };

  const isAuthor = currentUser?.id === post.userId;
  const userRole = currentUser?.role as string | undefined;
  const isAdminOrSuperAdmin = userRole === 'admin' || userRole === 'super admin';

  const commentCount = comments.length; // derive

  if (!isOpen && !showModal) return null;

  const imageItems = (post.mediaUrls || []).filter((u) => u.match(/\.(jpg|jpeg|png|gif|webp)$/i));
  const imageUrls = imageItems.slice();

  const modalContent = (
    <>
      {previewOpen && (
        <>
          <div className="fixed inset-0 bg-black/95 z-[2147483646]" onClick={() => setPreviewOpen(false)} />
          <img
            src={previewImages[currentImageIndex] || '/placeholder.svg'}
            alt="Preview"
            className="fixed left-1/2 top-1/2 z-[2147483647] max-w-full max-h-full object-contain"
            style={{ transform: 'translate(-50%, -50%)' }}
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
                className="fixed left-4 top-1/2 z-[2147483648] p-2 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
                style={{ transform: 'translateY(-50%)' }}
              >
                <ChevronLeftIcon className="w-6 h-6" />
              </button>
              <button
                onClick={goToNext}
                className="fixed right-4 top-1/2 z-[2147483648] p-2 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
                style={{ transform: 'translateY(-50%)' }}
              >
                <ChevronRightIcon className="w-6 h-6" />
              </button>
              <div
                className="fixed bottom-4 left-1/2 z-[2147483648] bg-black/60 px-3 py-1 rounded-full text-white text-sm"
                style={{ transform: 'translateX(-50%)' }}
              >
                {currentImageIndex + 1} / {previewImages.length}
              </div>
            </>
          )}
        </>
      )}

      <div
        className={`fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col w-screen h-screen transition-all duration-300 ${isOpen ? 'animate-fadeInScale' : 'animate-fadeOutScale'}`}
        aria-modal="true"
        role="dialog"
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-4 py-4 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-gray-800 z-10">
          <div className="flex items-center gap-3">
            <img
              src={profilePic || '/images/default-avatar.png'}
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover"
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white text-base">{displayName}</h3>
                <RoleBadge role={post.userRole} size="small" isSpaceAdmin={false} />
              </div>
              <p className="text-sm text-gray-500">{formatDate(post.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
              aria-label="Close post modal"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" ref={scrollRef}>
          <div className="px-4 py-6 space-y-6">
            <div className="space-y-4">
              <div
                className="text-gray-100 leading-relaxed text-base"
                style={{ wordBreak: 'break-word', lineHeight: '1.6' }}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(processContentWithHashtags(post.content)),
                }}
              />

              {(post.mediaUrls && post.mediaUrls.length > 0) && (
                <div className="space-y-4">
                  {(() => {
                    type MediaItemUnion = string | { url: string; type?: string; name?: string };
                    const mediaItems: MediaItemUnion[] = (post as any).media && (post as any).media.length > 0 ? (post as any).media : (post.mediaUrls || []);
                    const getUrl = (item: MediaItemUnion) => typeof item === 'string' ? item : item.url;
                    const extensionOf = (u: string) => (u.split('?')[0].match(/\.([a-zA-Z0-9]+)$/)?.[1] || '').toLowerCase();
                    const inferType = (item: MediaItemUnion) => {
                      const url = getUrl(item);
                      const ext = extensionOf(url);
                      if (/^(jpg|jpeg|png|gif|webp)$/.test(ext)) return 'image';
                      if (/^(mp4|webm|ogg)$/.test(ext)) return 'video';
                      return 'document';
                    };
                    const imageItems = mediaItems.filter(m => inferType(m) === 'image');
                    const videoItems = mediaItems.filter(m => inferType(m) === 'video');
                    const docItems = mediaItems.filter(m => inferType(m) === 'document');
                    const imageUrlsLocal = imageItems.map(getUrl);

                    // Single video only (no images, no docs)
                    if (imageItems.length === 0 && videoItems.length === 1 && docItems.length === 0) {
                      const vUrl = getUrl(videoItems[0]);
                      return (
                        <div className="rounded-xl overflow-hidden bg-gray-900 border border-gray-800 aspect-video w-full">
                          <video src={vUrl} controls className="w-full h-full object-cover" />
                        </div>
                      );
                    }

                    if (imageItems.length === 1) {
                      const url = imageUrlsLocal[0];
                      return (
                        <div className="rounded-lg overflow-hidden bg-gray-900">
                          <img
                            src={url || '/placeholder.svg'}
                            alt="Post media"
                            className="w-full h-auto max-h-96 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            loading="lazy"
                            onClick={() => openImagePreview(imageUrlsLocal, 0)}
                            onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                          />
                        </div>
                      );
                    } else if (imageItems.length === 2) {
                      return (
                        <div className="grid grid-cols-2 gap-1">
                          {imageUrlsLocal.map((url, i) => (
                            <div key={i} className="rounded-lg overflow-hidden bg-gray-900 aspect-square">
                              <img
                                src={url || '/placeholder.svg'}
                                alt="Post media"
                                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                loading="lazy"
                                onClick={() => openImagePreview(imageUrlsLocal, i)}
                                onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    } else if (imageItems.length === 3) {
                      return (
                        <div className="grid grid-cols-2 grid-rows-2 gap-1 aspect-[4/3] w-full">
                          <div className="relative rounded-lg overflow-hidden bg-gray-900 row-span-2">
                            <img
                              src={imageUrlsLocal[0] || '/placeholder.svg'}
                              alt="Post media"
                              className="absolute inset-0 w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              style={{ position: 'absolute', inset: 0 }}
                              loading="lazy"
                              onClick={() => openImagePreview(imageUrlsLocal, 0)}
                              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                            />
                          </div>
                          <div className="relative rounded-lg overflow-hidden bg-gray-900">
                            <img
                              src={imageUrlsLocal[1] || '/placeholder.svg'}
                              alt="Post media"
                              className="absolute inset-0 w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              style={{ position: 'absolute', inset: 0 }}
                              loading="lazy"
                              onClick={() => openImagePreview(imageUrlsLocal, 1)}
                              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                            />
                          </div>
                          <div className="relative rounded-lg overflow-hidden bg-gray-900">
                            <img
                              src={imageUrlsLocal[2] || '/placeholder.svg'}
                              alt="Post media"
                              className="absolute inset-0 w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              style={{ position: 'absolute', inset: 0 }}
                              loading="lazy"
                              onClick={() => openImagePreview(imageUrlsLocal, 2)}
                              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                            />
                          </div>
                        </div>
                      );
                    } else if (imageItems.length >= 4) {
                      const displayItems = imageUrlsLocal.slice(0,4);
                      const remainingCount = imageUrlsLocal.length - 4;
                      return (
                        <div className="grid grid-cols-2 gap-1">
                          {displayItems.map((url, idx) => {
                            const isLast = idx === 3;
                            return (
                              <div key={idx} className="relative rounded-lg overflow-hidden bg-gray-900 aspect-square">
                                <img
                                  src={url || '/placeholder.svg'}
                                  alt="Post media"
                                  className={`w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity ${isLast ? 'blur-sm' : ''}`}
                                  loading="lazy"
                                  onClick={() => openImagePreview(imageUrlsLocal, idx)}
                                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                                />
                                {isLast && remainingCount > 0 && (
                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none">
                                    <span className="text-white font-semibold text-lg">+{remainingCount} more</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Videos & Documents (non-image media) */}
                  {(() => {
                    type MediaItemUnion = string | { url: string; type?: string; name?: string };
                    const mediaItems: MediaItemUnion[] = (post as any).media && (post as any).media.length > 0 ? (post as any).media : (post.mediaUrls || []);
                    const getUrl = (item: MediaItemUnion) => typeof item === 'string' ? item : item.url;
                    const extensionOf = (u: string) => (u.split('?')[0].match(/\.([a-zA-Z0-9]+)$/)?.[1] || '').toLowerCase();
                    const inferType = (item: MediaItemUnion) => {
                      const url = getUrl(item);
                      const ext = extensionOf(url);
                      if (/^(jpg|jpeg|png|gif|webp)$/.test(ext)) return 'image';
                      if (/^(mp4|webm|ogg)$/.test(ext)) return 'video';
                      return 'document';
                    };
                    const nonImage = mediaItems.filter(m => inferType(m) !== 'image');
                    if (nonImage.length === 0) return null;
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
                        {nonImage.map((m, index) => {
                          const url = getUrl(m);
                          const type = inferType(m);
                          if (type === 'video') {
                            return (
                              <div key={index} className="rounded-xl overflow-hidden bg-gray-900/70 border border-gray-800 aspect-video w-full relative group">
                                <video src={url} controls className="w-full h-full object-cover" />
                                <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/30" />
                              </div>
                            );
                          }
                          // document
                          const rawName = url.split('?')[0].split('/').pop() || 'File';
                          const decoded = decodeURIComponent(rawName);
                          const fileName = decoded.includes('/') ? decoded.split('/').pop() || decoded : decoded;
                          const ext = (fileName.split('.').pop() || '').toLowerCase();
                          const fileBase = fileName.split('.').slice(0, -1).join('.') || fileName;
                          const fileExtUpper = ext.toUpperCase();
                          const codeExts = ['js','jsx','ts','tsx','php','html','css','scss','json','xml','py','java','c','cpp','cs','rb','go','sh','bat','pl','swift','kt','rs','dart'];
                          let icon: React.ReactNode = <DocumentTextIcon className="h-6 w-6 text-gray-400" />;
                          if (codeExts.includes(ext)) icon = <img src="https://cdn-icons-png.flaticon.com/512/4725/4725948.png" alt="Code" className="h-6 w-6" />;
                          else if (ext === 'pdf') icon = <img src="https://cdn-icons-png.flaticon.com/512/337/337946.png" alt="PDF" className="h-6 w-6" />;
                          else if (['doc','docx'].includes(ext)) icon = <img src="https://cdn-icons-png.flaticon.com/512/5968/5968517.png" alt="DOC" className="h-6 w-6" />;
                          else if (['xls','xlsx','csv'].includes(ext)) icon = <img src="https://cdn-icons-png.flaticon.com/512/732/732220.png" alt="XLS" className="h-6 w-6" />;
                          else if (['ppt','pptx'].includes(ext)) icon = <img src="https://cdn-icons-png.flaticon.com/512/337/337932.png" alt="PPT" className="h-6 w-6" />;
                          else if (ext === 'txt') icon = <img src="https://cdn-icons-png.flaticon.com/512/3022/3022503.png" alt="TXT" className="h-6 w-6" />;
                          else if (['zip','rar','7z'].includes(ext)) icon = <img src="https://cdn-icons-png.flaticon.com/512/9704/9704802.png" alt="Archive" className="h-6 w-6" />;
                          return (
                            <a
                              key={index}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center bg-gradient-to-r from-gray-800/60 via-gray-700/40 to-green-900/30 border border-gray-700/30 rounded-lg shadow px-3 py-2 my-1 min-w-0 w-full max-w-full sm:max-w-xs hover:from-gray-800/80 hover:to-green-800/50 hover:shadow-green-900/10 transition-colors group backdrop-blur-sm text-white hover:text-green-100 focus:outline-none focus:ring-2 focus:ring-green-500/40"
                              style={{ height: '2.75rem' }}
                              title={fileName}
                            >
                              <span className="flex-shrink-0 mr-2">{icon}</span>
                              <span className="flex flex-col min-w-0">
                                <span className="truncate text-xs font-semibold group-hover:text-green-100 w-full" style={{ maxWidth: '100%', color: 'inherit' }}>{fileBase}</span>
                                <span className="text-[10px] text-gray-300 font-bold tracking-widest group-hover:text-green-200">{fileExtUpper}</span>
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {post.tags.map((tag, i) => (
                    <span key={i} className="px-3 py-1 bg-gray-800 text-green-400 text-sm rounded-full font-medium border border-gray-700">#{tag}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-around py-3 border-t border-b border-gray-800">
              <button
                onClick={async () => { if (!hasReacted) { setShowHeartAnimation(true); setTimeout(() => setShowHeartAnimation(false), 600); } handleReaction(); }}
                disabled={!currentUser}
                className={`flex items-center gap-2 transition-colors rounded-full bg-transparent border-none shadow-none ${hasReacted ? 'text-green-500' : 'text-green-500 hover:text-green-400'} disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label="Like space post"
              >
                {hasReacted || showHeartAnimation ? <HeartIconSolid className={`h-5 w-5 text-green-500 ${showHeartAnimation ? 'animate-heart' : ''}`} /> : <HeartIcon className="h-5 w-5 text-green-500" />}
                <span className="text-sm font-medium text-green-500">{reactionCount > 0 ? `${reactionCount} Hearts` : 'Like'}</span>
              </button>

              <div className="flex items-center gap-2">
                <ChatBubbleLeftIcon className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium text-green-500">{commentCount > 0 ? commentCount : 'Comment'}</span>
              </div>

              <button
                disabled
                className="flex items-center gap-2 transition-colors rounded-full bg-transparent border-none shadow-none text-gray-600 cursor-not-allowed"
                aria-label="Share (disabled)"
                title="Share not available for space posts yet"
              >
                <ShareIcon className="h-5 w-5" />
                <span className="text-sm font-medium text-gray-600">Share</span>
              </button>
            </div>

            {/* Comments */}
            <div className="space-y-4">
              {currentUser && (
                <form onSubmit={handleAddComment}>
                  <div className="flex items-center gap-2 bg-[#181c20] border border-[#38444d] rounded-full px-4 py-2 shadow-sm focus-within:border-blue-400 transition-colors" style={{ boxShadow: '0 2px 8px 0 rgba(0,0,0,0.04)' }}>
                    <img src={currentUser.profile_pic || '/images/default-avatar.png'} alt={currentUser.name} className="w-9 h-9 rounded-full object-cover border border-[#38444d]" />
                    <input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Post your reply"
                      className="flex-1 bg-transparent text-[#d9d9d9] border-none outline-none text-base placeholder-[#8899a6] px-2 py-2 focus:bg-[#22272b] transition-colors"
                      maxLength={2000}
                    />
                    <button
                      type="submit"
                      disabled={!commentText.trim() || isSubmittingComment}
                      className="flex items-center justify-center bg-blue-500 hover:bg-blue-400 disabled:bg-[#38444d] disabled:cursor-not-allowed text-white rounded-full transition-colors shadow-sm h-9 w-9 min-w-0"
                      aria-label="Send comment"
                      title="Send comment"
                    >
                      {isSubmittingComment ? (
                        <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" />
                      ) : (
                        <span className="material-icons text-[20px] leading-none">send</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
              <div className="space-y-3">
                {comments.length > 0 ? (
                  comments
                    .slice()
                    .sort((a,b) => getDate(b.createdAt).getTime() - getDate(a.createdAt).getTime())
                    .map((c) => (
                      <div key={c.id} className="relative flex gap-3 group bg-gray-900/50 rounded-lg p-3 border border-gray-800">
                        <img
                          src={c.userProfilePic || '/images/default-avatar.png'}
                          alt={c.userName}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-white text-sm">{c.userName}</span>
                            <RoleBadge role={c.userRole || 'student'} size="small" isSpaceAdmin={false} />
                          </div>
                          <p className="text-sm text-gray-200 break-words leading-relaxed">{c.content}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            <span>{formatDate(c.createdAt)}</span>
                            {c.isEdited && <span className="text-green-400">Edited</span>}
                          </div>
                        </div>
                        {currentUser && (currentUser.id === c.userId || isAdminOrSuperAdmin) && (
                          <button
                            onClick={() => handleDeleteComment(c.id, c.userId)}
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
  );

  return createPortal(modalContent, document.body);
};

// Helpers
const formatDate = (timestamp: any) => {
  if (!timestamp) return 'Just now';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return 'Just now';
  }
};

const getDate = (ts: any) => (ts?.toDate ? ts.toDate() : new Date(ts));

const processContentWithHashtags = (content: string) => {
  const processedContent = content.replace(/#(\w+)/g, '<span class="text-green-400 font-medium">#$1</span>');
  return processedContent.replace(/\n/g, '<br>');
};

export default FullScreenSpacePost;

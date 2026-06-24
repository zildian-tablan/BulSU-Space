import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { detectProfanity } from '../../../utils/profanityFilter';
import { moderateWithOpenAI } from '../../../services/aiModerationService';
import { sendMessage } from '../../../services/messageService';
import { instantScrollToBottom } from '../utils';
import type { MessageInputProps } from '../types';

const MessageInput: React.FC<MessageInputProps> = ({
  messageText,
  setMessageText,
  messageInputRef,
  handleSendMessageWithReply,
  replyToMessage,
  setReplyToMessage,
  currentUser,
  selectedChat,
  editingMessage,
  setEditingMessage,
  isSendingMessage,
  setIsSendingMessage,
  isMobileView,
  setProfanityModalOpen,
  setDetectedProfaneWords
}): JSX.Element => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewItems, setPreviewItems] = useState<{ id: string; file: File; url: string }[]>([]);
  const [charCount, setCharCount] = useState(messageText.length);
  const [isProcessingContent, setIsProcessingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const MAX_CHARACTERS = 5000;
  const CHARACTER_WARNING_THRESHOLD = 4900;
  const isApproachingLimit = charCount > CHARACTER_WARNING_THRESHOLD;
  const isAtLimit = charCount >= MAX_CHARACTERS;
  
 
  useEffect(() => setCharCount(messageText.length), [messageText]);
  
  useEffect(() => {
    if (isMobileView && messageInputRef.current && isSendingMessage) {
  
      messageInputRef.current.focus();
      document.body.classList.add('keyboard-open');
    }
  }, [isSendingMessage, isMobileView]);
  

  useEffect(() => {
    if (isMobileView) {
      const handleKeyboardChange = () => {
     
        instantScrollToBottom();
      };
      
  
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const target = mutation.target as HTMLElement;
            if (target.classList.contains('keyboard-open') || !target.classList.contains('keyboard-open')) {
              handleKeyboardChange();
            }
          }
        });
      });
      
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
      });
      
      return () => observer.disconnect();
    }
  }, [isMobileView]);
  

  useLayoutEffect(() => {
    if (messageInputRef.current) {
      if (!messageText) {
        messageInputRef.current.style.height = '40px';
        messageInputRef.current.style.overflowY = 'hidden';
        return;
      }
      

      messageInputRef.current.style.height = '40px';
      const scrollHeight = messageInputRef.current.scrollHeight;
      const maxHeight = 90; 
      const newHeight = Math.min(Math.max(40, scrollHeight), maxHeight);
      messageInputRef.current.style.height = `${newHeight}px`;
      messageInputRef.current.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [messageText]);

  // Optimized input change handler for instant response with profanity detection
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessageText(value);    
    if (contentError) {
      setContentError(null);
    }
   
  }, [setMessageText, contentError]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      const isModifierSend = e.ctrlKey || e.metaKey;
      const isSendCombo = (isMobileView && !e.shiftKey) || (!isMobileView && isModifierSend && !e.shiftKey);
      if (isSendCombo) {
        e.preventDefault();
        const hasText = messageText.trim().length > 0;
        const hasAttachments = pendingFiles.length > 0;
        // If there are attachments but no text, submit the form to send media-only
        if (hasAttachments && !hasText) {
          // Reuse the same submit handler used by the form button
          // Cast event type to satisfy the handler signature
          handleSubmit(e as any);
        } else {
          // Default behavior: send text (with optional attachments if any)
          handleSendMessageWithReply(e as any);
        }
      }
    }
  };
  

  const handleInputFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (window.innerWidth < 768) {
 
      document.body.classList.add('keyboard-open');

      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      
      instantScrollToBottom();
    }
  };
  
  const handleInputBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {

    if (isSendingMessage) {
      return;
    }

    setTimeout(() => {
      if (!document.querySelector('input:focus, textarea:focus')) {
        document.body.classList.remove('keyboard-open');
      }
    }, 300);
  };

  const handleFileSelect = () => fileInputRef.current?.click();
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!currentUser || !selectedChat) return;


  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;


  const newFiles = files.map(f => f);
  const newPreviews = newFiles.map(f => ({ id: uuidv4(), file: f, url: URL.createObjectURL(f) }));
  setPendingFiles(prev => [...prev, ...newFiles]);
  setPreviewItems(prev => [...prev, ...newPreviews]);


  if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const handleSubmit = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    const hasText = messageText.trim().length > 0;
    const hasAttachments = pendingFiles.length > 0;
    if (!isAtLimit && (hasText || hasAttachments)) {
      setIsSendingMessage(true);
      setIsProcessingContent(true);
      setContentError(null);

      if (hasText) {
      
        const profaneWords = detectProfanity(messageText);
        if (profaneWords.length > 0) {
          setDetectedProfaneWords(profaneWords);
          setProfanityModalOpen(true);
          setIsSendingMessage(false);
          setIsProcessingContent(false);
          return;
        }

      
        try {
          const aiResult = await moderateWithOpenAI(messageText);
          if (aiResult.reason && aiResult.reason.includes('quota')) {
            console.warn('AI moderation skipped due to quota limits');
            setContentError(null);
          } else if (aiResult.flagged) {
            setContentError('Your message was flagged by our AI moderation system. Reason: ' + (aiResult.reason || 'Inappropriate content detected'));
            setIsSendingMessage(false);
            setIsProcessingContent(false);
            return;
          } else {
            setContentError(null);
          }
        } catch (err) {
          console.error('AI moderation error:', err);
          setContentError(null);
          if (process.env.NODE_ENV !== 'production') {
            console.warn('AI moderation service unavailable - proceeding without moderation');
          }
        }
      }

      setIsProcessingContent(false);

 
      if (pendingFiles.length > 0 && currentUser && selectedChat) {
        setIsSendingMessage(true);
        try {
          const { storage } = await import('../../../firebase/config');
          const { ref: storageRef, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');

          const uploadedUrls: string[] = [];

       
          for (const file of pendingFiles) {
          
            const id = uuidv4();
            const safeName = file.name.replace(/[^a-z0-9.\-_]/gi, '_');
            // Align storage path with security rules in storage.rules
            // Rules allow: match /messages/{chatId}/{fileName}
            const path = `messages/${selectedChat.id}/${Date.now()}_${id}_${safeName}`;
            const sRef = storageRef(storage, path);

         
            await new Promise<void>((resolve, reject) => {
              const uploadTask = uploadBytesResumable(sRef, file);
              uploadTask.on('state_changed', () => {}, (uploadErr) => {
                console.error('Upload failed', uploadErr);
                reject(uploadErr);
              }, async () => {
                try {
                  const downloadUrl = await getDownloadURL(sRef);
                  uploadedUrls.push(downloadUrl);
                  resolve();
                } catch (err) {
                  reject(err);
                }
              });
            });
          }


 
          const contentToSend = messageText.trim();

     
          await sendMessage(selectedChat.id, currentUser.id, contentToSend, 'file', uploadedUrls);

         
          setPendingFiles([]);
          previewItems.forEach(p => URL.revokeObjectURL(p.url));
          setPreviewItems([]);
          setMessageText('');
        } catch (err) {
          console.error('Failed to upload/send attachments', err);
          alert('Failed to send attachments. Please try again.');
        } finally {
          setIsSendingMessage(false);
        }
      } else if (hasText) {
    
        handleSendMessageWithReply(e);
      } else {
      
        setIsSendingMessage(false);
      }
    }
  };
  return (
    <div className="message-input-wrapper bg-[#121212] border-t border-gray-800/10 px-2 sm:px-4 py-2">
      {editingMessage && (
        <div className="flex items-center bg-blue-600/10 border-l-2 border-blue-500 px-2 sm:px-3 py-2 mb-2 rounded-r-lg">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-400 mb-0.5">Editing message</div>
            <div className="text-sm text-gray-300 truncate">{editingMessage.content}</div>
          </div>
          <button 
            type="button" 
            onClick={() => {
              setEditingMessage(null);
              setMessageText('');
            }}
            className="ml-2 p-1 rounded-full hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 transition-colors"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>
      )}
      {replyToMessage && (
        <div className="flex items-center bg-green-600/10 border-l-2 border-green-500 px-2 sm:px-3 py-2 mb-2 rounded-r-lg">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-400 mb-0.5">Replying to message</div>
            <div className="text-sm text-gray-300 truncate">{replyToMessage.content}</div>
          </div>
          <button 
            type="button" 
            onClick={() => setReplyToMessage(null)}
            className="ml-2 p-1 rounded-full hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 transition-colors"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>
      )}
        {/* Staged attachment previews (desktop + mobile) - moved above the input form */}
        {previewItems.length > 0 && (
          <div className="mb-2 px-2 sm:px-4">
            <div className="flex gap-2 items-center overflow-x-auto p-1">
              {previewItems.map(item => {
                const lower = item.file.name.toLowerCase();
                const isImage = item.file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|bmp|jff|jfif)$/.test(lower);
                const isVideo = item.file.type.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)$/.test(lower);
                return (
                  <div key={item.id} className="flex-shrink-0 relative">
                    {isImage ? (
                      <div className="w-20 h-20 rounded-lg overflow-hidden border border-gray-700 bg-black">
                        <img src={item.url} alt={item.file.name} className="w-full h-full object-cover" />
                      </div>
                    ) : isVideo ? (
                      <div className="w-20 h-20 rounded-lg overflow-hidden border border-gray-700 bg-black flex items-center justify-center">
                        <video src={item.url} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="material-icons text-white/90">play_circle</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-48 h-12 rounded-lg overflow-hidden border border-gray-700 bg-gray-900 flex items-center px-2">
                        <div className="w-8 h-8 flex-shrink-0 mr-2">
                          <img src={`https://cdn-icons-png.flaticon.com/512/337/337946.png`} alt="file" className="w-8 h-8" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-white truncate">{item.file.name}</div>
                          <div className="text-[10px] text-gray-400">{(item.file.size / 1024).toFixed(0)} KB</div>
                        </div>
                      </div>
                    )}
                    <button type="button" onClick={() => {
                   
                      setPreviewItems(prev => prev.filter(p => p.id !== item.id));
                      setPendingFiles(prev => prev.filter(f => f !== item.file));
                      URL.revokeObjectURL(item.url);
                    }} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-md flex items-center justify-center" aria-label="Remove attachment">
                      <span className="material-icons text-xs">close</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative w-full">
  <div className="flex items-stretch md:items-end gap-1.5 sm:gap-2 w-full">          {/* Modernized attachment button moved outside and to the left */}
          <button
            type="button"
            onClick={handleFileSelect}
            className="relative min-w-[40px] sm:min-w-[44px] flex items-center justify-center text-gray-400 hover:text-green-400 transition-all transform transition-transform duration-300 translate-y-1 group rounded-xl sm:rounded-2xl overflow-hidden self-end md:self-end"
            aria-label="Attach file"
          >
            <span className="material-icons text-[22px] transform transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110 group-active:scale-95 relative z-10">attach_file</span>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-green-500/0 via-green-400/5 to-green-300/0 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:scale-110 blur-sm"></div>
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-green-500/0 via-green-400/10 to-green-300/0 opacity-0 group-hover:opacity-100 transition-all duration-500 group-active:duration-200 blur-md"></div>
          </button>
          
          <div className="flex-1 relative flex bg-[#1e1e1e] rounded-xl sm:rounded-2xl shadow-inner">
      <div className="flex-1 min-w-0 relative">              <textarea
                ref={messageInputRef}
                placeholder={
                  editingMessage
                    ? "Edit your message..."
                    : ((selectedChat as any)?.isMessageRequest === true && (
                        ((selectedChat as any).initiator ?? (selectedChat as any).messageRequestInitiatorId) !== currentUser?.id
                      ))
                      ? "Type a reply to accept this message request..."
                      : "Message..."
                }
                value={messageText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
        className="block w-full bg-transparent text-white px-3 sm:px-4 
             focus:outline-none resize-none text-sm placeholder-gray-500
             transition-all duration-200 ease-out min-h-[40px]
             focus:ring-2 focus:ring-green-500/20 focus:border-green-500/40
             rounded-lg sm:rounded-xl desktop-input"
                style={{
                  height: '40px',
                  maxHeight: '90px', 
                  paddingTop: '8px',
                  paddingBottom: '8px',
                  lineHeight: '24px'
                }}
                maxLength={MAX_CHARACTERS}
              />
              <div className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 flex items-center">
                {isApproachingLimit && (
                  <span className="text-xs text-gray-400">{charCount}/{MAX_CHARACTERS}</span>
                )}
              </div>
            </div>
          </div>
          
          {/* Content Error Display */}
          {contentError && (
            (contentError.includes('checking is taking longer') || contentError.includes('models may be loading')) ? (
              <div className={`flex items-center gap-2 mt-2 p-2 rounded-lg border bg-blue-900/20 border-blue-500/30 text-blue-200`}>
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                <p className="text-xs sm:text-sm">{contentError}</p>
              </div>
            ) : null
          )}
          {/* Compute send readiness including attachments */}
          <button
        type="submit"
        disabled={isAtLimit || (!messageText.trim() && pendingFiles.length === 0) || isProcessingContent || isSendingMessage}
        className={`relative min-w-[40px] sm:min-w-[44px] rounded-xl sm:rounded-2xl flex items-center justify-center transition-all duration-300 flex-shrink-0 overflow-hidden group isolate self-end md:self-end ${
                (messageText.trim() || pendingFiles.length > 0) && !isAtLimit && !isProcessingContent && !isSendingMessage
                  ? 'bg-[#1a1a1a] hover:bg-[#222] focus:bg-[#222] active:bg-[#222] text-green-400 hover:text-green-300 focus:text-green-300 active:text-green-300 shadow-lg shadow-green-900/30 hover:shadow-xl hover:shadow-green-500/20 focus:shadow-xl focus:shadow-green-500/20 active:shadow-lg border border-green-500/40 hover:border-green-400/50 focus:border-green-400/50 active:border-green-400/50 ring-2 ring-green-500/10 hover:ring-green-400/20 focus:ring-green-400/20 active:ring-green-400/20 before:absolute before:inset-0 before:bg-gradient-to-r before:from-green-500/20 before:via-green-400/10 before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100 focus:before:opacity-100 active:before:opacity-100 sm:hover:scale-105 sm:focus:scale-105 sm:active:scale-100' 
                  : 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed border border-gray-800/50'
              }`}
            >
              {(isProcessingContent || isSendingMessage) ? (
                <div className="animate-spin h-4 w-4 border-2 border-green-400 border-t-transparent rounded-full"></div>
              ) : (
                <span className="material-icons text-[18px] sm:text-[20px] transform transition-transform duration-300 group-hover:scale-110 group-focus:scale-110 group-active:scale-95 relative z-10 group-hover:text-green-300 group-focus:text-green-300 group-active:text-green-300">
                  {editingMessage ? 'edit' : 'send'}
                </span>
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 via-green-400/15 to-green-300/5 opacity-0 group-hover:opacity-100 group-active:opacity-0 transition-opacity duration-300 pointer-events-none blur-sm"></div>
              <div className="absolute -inset-1 bg-gradient-to-r from-green-500/20 via-green-400/10 to-transparent opacity-0 group-hover:opacity-100 group-active:opacity-50 transition-opacity duration-300 pointer-events-none blur-xl"></div>
              <div className="absolute inset-0 bg-gradient-to-tr from-green-500/10 via-green-400/15 to-green-300/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none hidden sm:block"></div>
              <div className="absolute inset-0 bg-green-500/5 opacity-100 pointer-events-none"></div>
            </button>
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileUpload} 
          className="hidden" 
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          multiple
        />
      </form>
      
    </div>
  );
};

export default MessageInput;

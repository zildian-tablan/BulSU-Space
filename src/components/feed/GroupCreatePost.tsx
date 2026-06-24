import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createGroupPost } from '../../services/groupPostService';
import { moderateWithOpenAI } from '../../services/aiModerationService';
import { detectProfanity } from '../../utils/profanityFilter';
import { 
  PhotoIcon, 
  XMarkIcon, 
  PaperAirplaneIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import ProfanityModal from '../modals/ProfanityModal';

interface GroupCreatePostProps {
  groupId: string;
  placeholder?: string;
  onPost?: (content: string, images?: File[]) => Promise<void>;
}

const GroupCreatePost: React.FC<GroupCreatePostProps> = ({ 
  groupId, 
  placeholder = "Share something with the space...",
  onPost 
}) => {
  const { currentUser } = useAuth();
  const [content, setContent] = useState('');  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);  const [contentError, setContentError] = useState<string | null>(null);
  const [isProcessingContent, setIsProcessingContent] = useState(false);
  const [profanityModalOpen, setProfanityModalOpen] = useState(false);
  const [detectedProfaneWords, setDetectedProfaneWords] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounce timer for real-time content checking
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);



  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const newPreviewUrls = newFiles.map(file => 
        file.type.startsWith('image/') || file.type.startsWith('video/') 
          ? URL.createObjectURL(file) 
          : ''
      );
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
      setPreviewUrls(prevUrls => [...prevUrls, ...newPreviewUrls]);
    }
  };

  const removeFile = (index: number) => {
    if (previewUrls[index]) {
      URL.revokeObjectURL(previewUrls[index]);
    }
    setFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
    setPreviewUrls(prevUrls => prevUrls.filter((_, i) => i !== index));
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser || (!content.trim() && files.length === 0)) return;

    setIsSubmitting(true);
    setContentError(null);
    setIsProcessingContent(true);
    
    // First layer: Local profanity check
    const profaneWords = detectProfanity(content);
    if (profaneWords.length > 0) {
      setDetectedProfaneWords(profaneWords);
      setProfanityModalOpen(true);
      setIsSubmitting(false);
      setIsProcessingContent(false);
      return;
    }
    
    // Second layer: AI moderation
    try {
      setContentError('Checking content with AI moderation...');
      const aiResult = await moderateWithOpenAI(content);
      
      // Check if AI moderation was skipped due to quota
      if (aiResult.reason && aiResult.reason.includes('quota')) {
        console.warn('AI moderation skipped due to quota limits');
        setContentError(null);
      } 
      // Check if content was flagged
      else if (aiResult.flagged) {
        setContentError('Your post was flagged by our AI moderation system. Reason: ' + 
          (aiResult.reason || 'Inappropriate content detected'));
        setIsSubmitting(false);
        setIsProcessingContent(false);
        return;
      }
      // Normal case - content passed moderation
      else {
        setContentError(null);
      }
    } catch (err) {
      console.error('AI moderation error:', err);
      // Don't block post creation if moderation service is unavailable
      setContentError(null);
      
      // Log the error for the developer
      if (process.env.NODE_ENV !== 'production') {
        console.warn('AI moderation service unavailable - proceeding without moderation');
      }
    }

    try {
      if (onPost) {
        await onPost(content, files);
      } else {
        await createGroupPost(content, currentUser.id, groupId, files);
      }

      // Reset form
      setContent('');
      setFiles([]);
      setPreviewUrls([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error creating group post:', error);
      setContentError('Failed to create post. Please try again.');
    } finally {
      setIsSubmitting(false);
      setIsProcessingContent(false);
    }
  };

  if (!currentUser) return null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <form onSubmit={handleSubmit}><div className="flex items-start space-x-3">
          <img
            src={currentUser.profile_pic || '/images/default-avatar.png'}
            alt={currentUser.name || 'User'}
            className="w-10 h-10 rounded-full"
          />
          <div className="flex-1">            <textarea
              value={content}
              onChange={(e) => {
                const newContent = e.target.value;
                setContent(newContent);
                
                // Clear existing timer
                if (debounceTimer.current) {
                  clearTimeout(debounceTimer.current);
                }
                
                // Clear error when user starts typing
                if (contentError) {
                  setContentError(null);
                }
                
                // Skip checking if content is empty
                if (!newContent.trim()) {
                  return;
                }
                
                // Debounced real-time profanity check
                debounceTimer.current = setTimeout(() => {
                  const profaneWords = detectProfanity(newContent);
                  if (profaneWords.length > 0) {
                    setContentError('This content contains inappropriate language');
                  }
                }, 1000);
              }}
              placeholder={placeholder}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              rows={3}
              maxLength={2000}
            />
              {contentError && (
              <p className="text-red-500 text-sm mt-1">{contentError}</p>
            )}

            {isProcessingContent && (
              <div className="flex items-center mt-2 text-blue-600 text-sm">
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-blue-600/30 border-t-blue-600 rounded-full"></div>
                Checking content...
              </div>
            )}

            {/* File Previews */}
            {previewUrls.length > 0 && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                {previewUrls.map((url, index) => (
                  <div key={index} className="relative">
                    {files[index]?.type.startsWith('image/') ? (
                      <img
                        src={url}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ) : files[index]?.type.startsWith('video/') ? (
                      <video
                        src={url}
                        className="w-full h-32 object-cover rounded-lg"
                        controls
                      />
                    ) : (
                      <div className="w-full h-32 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center">
                        <DocumentTextIcon className="h-8 w-8 text-gray-400" />
                        <span className="text-xs text-gray-500 ml-1">
                          {files[index]?.name}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <PhotoIcon className="h-5 w-5 mr-1" />
                  <span className="text-sm">Photo/Video</span>
                </button>
              </div>              <button
                type="submit"
                disabled={(!content.trim() && files.length === 0) || isSubmitting || isProcessingContent}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 active:scale-95"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-white/30 border-t-white rounded-full"></div>
                    Posting...
                  </>
                ) : isProcessingContent ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-white/30 border-t-white rounded-full"></div>
                    Checking...
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="h-4 w-4 mr-1" />
                    Post
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,application/pdf,.doc,.docx,.txt"
        onChange={handleFileChange}
        className="hidden"
      />
      
      {/* ProfanityModal */}
      <ProfanityModal
        open={profanityModalOpen}
        detectedWords={detectedProfaneWords}
        onClose={() => setProfanityModalOpen(false)}
      />
    </div>
  );
};

export default GroupCreatePost;

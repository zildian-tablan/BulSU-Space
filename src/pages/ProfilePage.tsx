import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User } from '../contexts/AuthContext';
import { TutorialOverlay } from '../components/tutorial/TutorialOverlay';
import Navbar from '../components/layout/Navbar';
import ProfileCover from '../components/profile/ProfileCover';
import DefaultProfilePicture from '../components/profile/DefaultProfilePicture';
import AvatarSelectionModal from '../components/profile/AvatarSelectionModal';
import ImagePreviewModal from '../components/common/ImagePreviewModal';
import { CameraIcon, ArrowLeftIcon, PlusIcon, DocumentTextIcon, EnvelopeIcon, IdentificationIcon, UserIcon, AcademicCapIcon, PhotoIcon, EyeIcon } from '@heroicons/react/24/outline';
import MainLayout from '../components/layout/MainLayout';
import { db, storage } from '../firebase/config';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import UserPosts from '../components/profile/UserPosts';

const getRoleDisplayName = (role: string) => {
  const roleMap: { [key: string]: string } = {
    'student': 'Student',
    'faculty': 'Faculty Member',
    'alumni': 'Alumni',
    'admin': 'Administrator'
  };
  return roleMap[role] || role;
};

// Helper function to determine user gender
const determineUserGender = (user: User | null): 'male' | 'female' | 'other' => {
  if (!user) return 'other';
  
  // If user has explicitly set a gender, use that
  if (user.gender === 'male' || user.gender === 'female') {
    return user.gender;
  }
  
  // If gender is any other value, return 'other'
  return 'other';
};

const ProfilePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  
  
  // Check if the profile belongs to the current user
  useEffect(() => {
    if (currentUser && (!userId || userId === currentUser.id)) {
      setProfileUser(currentUser);
      setIsOwnProfile(true);
      setLoading(false);
    } else {
      setIsOwnProfile(false);
      // Will fetch the other user's profile
    }
  }, [currentUser, userId]);

  // Fetch user profile data if not the current user
  useEffect(() => {
    if (!isOwnProfile && userId) {
      fetchUserProfile();
    }
  }, [isOwnProfile, userId]);

  // Fetch user profile from Firestore
  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const userDocRef = doc(db, 'users', userId || '');
      const userSnapshot = await getDoc(userDocRef);
      
      if (userSnapshot.exists()) {
        const userData = userSnapshot.data() as Omit<User, 'id'>;
        setProfileUser({
          id: userSnapshot.id,
          ...userData,
          office: userData.office || '' // Ensure office is always set
        } as User);
        setError(null);
      } else {
        setProfileUser(null);
        setError('User not found');
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError('Error loading profile');
    } finally {
      setLoading(false);
    }
  };

  // Open avatar modal
  const openAvatarModal = () => {
    setShowAvatarModal(true);
  };

  // Close avatar modal
  const closeAvatarModal = () => {
    setShowAvatarModal(false);
  };

  // Open image preview modal
  const openImagePreview = (url?: string | null) => {
    if (!url) return;
    setPreviewImageUrl(url);
    setShowImagePreview(true);
  };

  const closeImagePreview = () => {
    setShowImagePreview(false);
    // keep URL for quick reopen; optionally reset
  };

  // Handle profile picture upload
  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isOwnProfile || !currentUser || !e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    // Check if the file is an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPG, PNG, etc.)');
      return;
    }
    
    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB');
      return;
    }
    
    try {
      setUploadingImage(true);
      
      // Create a unique filename
      const fileId = uuidv4();
      const fileRef = ref(storage, `users/${currentUser.id}/${fileId}_${file.name}`);
      
      // Upload the file to Firebase Storage
      await uploadBytes(fileRef, file);
      
      // Get the download URL
      const downloadUrl = await getDownloadURL(fileRef);
      
      // Update the user's profile in Firestore
      const userRef = doc(db, 'users', currentUser.id);
      await updateDoc(userRef, {
        profile_pic: downloadUrl
      });
      
      // Update the local user state
      setProfileUser(prevUser => {
        if (prevUser) {
          return {
            ...prevUser,
            profile_pic: downloadUrl
          };
        }
        return prevUser;
      });
      
      // Close modal
      setShowAvatarModal(false);
      
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      alert('Failed to upload profile picture. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  // Handle selection of preset avatar
  const handleSelectAvatar = async (avatarUrl: string) => {
    if (!isOwnProfile || !currentUser) return;
    
    try {
      setUploadingImage(true);
      
      // Update the user's profile in Firestore
      const userRef = doc(db, 'users', currentUser.id);
      await updateDoc(userRef, {
        profile_pic: avatarUrl
      });
      
      // Update the local user state
      setProfileUser(prevUser => {
        if (prevUser) {
          return {
            ...prevUser,
            profile_pic: avatarUrl
          };
        }
        return prevUser;
      });
      
      // Close modal after a short delay to show the change
      setTimeout(() => {
        closeAvatarModal();
      }, 500);
      
    } catch (error) {
      console.error('Error setting avatar image:', error);
      alert('Failed to update profile picture. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  // Friend and block actions are not handled in this page

  // Loading state
  if (loading) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-8 max-w-screen-xl">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Error state
  if (error || !profileUser) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-8 max-w-screen-xl">
          <div className="flex flex-col justify-center items-center h-64">
            <div className="text-xl text-red-500 mb-4">
              {error || 'User not found'}
            </div>
            <p className="text-gray-400">
              The user you're looking for doesn't exist or you don't have permission to view their profile.
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-4 md:py-8">
        {/* View Mode Indicator - Shown when user is viewing their own profile in view mode */}
        {isOwnProfile && viewMode && (
          <div className="mb-4 bg-gradient-to-br from-blue-600/30 to-blue-900/30 rounded-xl border border-blue-500/40 p-3 shadow-md text-center">
            <p className="text-blue-200 text-sm flex items-center justify-center gap-2">
              <EyeIcon className="h-4 w-4" />
              <span>You are viewing your profile as others see it</span>
              <button 
                onClick={() => setViewMode(false)}
                className="ml-2 text-xs bg-blue-500/30 hover:bg-blue-500/50 text-white py-1 px-2 rounded transition-colors"
              >
                Exit View Mode
              </button>
            </p>
          </div>
        )}
        
        {/* Profile Header - Modern & Mobile-friendly */}
        <div className="mb-8" data-tutorial="profile-page">
          {/* Enhanced ProfileCover component with integrated profile picture */}
          <ProfileCover 
            coverPhoto={profileUser.coverPhoto} 
            user={profileUser}
            showUserInfo={true}
            profilePicture={profileUser.profile_pic}
            onProfilePictureClick={
              (isOwnProfile && !viewMode)
                ? openAvatarModal
                : (profileUser.profile_pic ? () => openImagePreview(profileUser.profile_pic) : undefined)
            }
            isOwnProfile={isOwnProfile} // Keep true for dropdown menu display, but apply view mode internally
            inViewMode={viewMode} // Pass view mode state to ProfileCover
            onViewProfile={() => {
              // Toggle view mode to show profile as others would see it
              setViewMode(!viewMode);
              // If turning off view mode, scroll to posts section
              if (viewMode) {
                const postsSection = document.querySelector('[data-posts-section]');
                postsSection?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            onViewProfilePicture={profileUser.profile_pic ? () => openImagePreview(profileUser.profile_pic) : undefined}
            // no block/friend handlers here
          />
        </div>

        
        
        {/* User Posts (original design, not visually modified) */}
        <div className="space-y-4" data-posts-section>
          <div className="flex items-center mb-4">
            <h2 className="text-lg font-semibold text-white">Posts</h2>
          </div>
          <UserPosts 
            user={profileUser} 
            isOwnProfile={isOwnProfile || viewMode}
          />
        </div>

        {/* Avatar Selection Modal */}
        <AvatarSelectionModal 
          isOpen={showAvatarModal}
          onClose={closeAvatarModal}
          onSelectAvatar={handleSelectAvatar}
          onFileUpload={handleProfilePictureUpload}
          userGender={determineUserGender(profileUser)}
          uploadingImage={uploadingImage}
        />

        {/* Image Preview Modal */}
        <ImagePreviewModal 
          isOpen={showImagePreview}
          imageUrl={previewImageUrl || undefined}
          onClose={closeImagePreview}
          title={isOwnProfile ? 'Your Profile Picture' : `${profileUser.name}'s Profile Picture`}
        />
      </div>
    </MainLayout>
  );
};

export default ProfilePage;

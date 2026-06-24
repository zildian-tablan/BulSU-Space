import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getGroupById, updateGroupAppearance, Group } from '../services/groupService';
import { usersAPI } from '../services/api';
import { 
  ArrowLeftIcon, 
  SwatchIcon as PaletteIcon, 
  DocumentCheckIcon as SaveIcon, 
  CheckIcon 
} from '@heroicons/react/24/outline';

interface ThemeOption {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  bgColor: string;
  preview: string;
}

const themeOptions: ThemeOption[] = [
  {
    id: 'default',
    name: 'Default Green',
    primaryColor: '#10b981',
    secondaryColor: '#059669',
    accentColor: '#34d399',
    textColor: '#ffffff',
    bgColor: '#1f2937',
    preview: 'bg-gradient-to-br from-emerald-500 to-emerald-600'
  },
  {
    id: 'blue',
    name: 'Ocean Blue',
    primaryColor: '#3b82f6',
    secondaryColor: '#2563eb',
    accentColor: '#60a5fa',
    textColor: '#ffffff',
    bgColor: '#1e293b',
    preview: 'bg-gradient-to-br from-blue-500 to-blue-600'
  },
  {
    id: 'purple',
    name: 'Royal Purple',
    primaryColor: '#8b5cf6',
    secondaryColor: '#7c3aed',
    accentColor: '#a78bfa',
    textColor: '#ffffff',
    bgColor: '#312e81',
    preview: 'bg-gradient-to-br from-purple-500 to-purple-600'
  },
  {
    id: 'orange',
    name: 'Sunset Orange',
    primaryColor: '#f59e0b',
    secondaryColor: '#d97706',
    accentColor: '#fbbf24',
    textColor: '#ffffff',
    bgColor: '#92400e',
    preview: 'bg-gradient-to-br from-amber-500 to-orange-600'
  },
  {
    id: 'rose',
    name: 'Rose Pink',
    primaryColor: '#f43f5e',
    secondaryColor: '#e11d48',
    accentColor: '#fb7185',
    textColor: '#ffffff',
    bgColor: '#881337',
    preview: 'bg-gradient-to-br from-rose-500 to-rose-600'
  },
  {
    id: 'teal',
    name: 'Teal Mint',
    primaryColor: '#14b8a6',
    secondaryColor: '#0d9488',
    accentColor: '#5eead4',
    textColor: '#ffffff',
    bgColor: '#134e4a',
    preview: 'bg-gradient-to-br from-teal-500 to-teal-600'
  }
];

const GroupAppearancePage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [creatorEmail, setCreatorEmail] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string>('default');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const fetchGroup = async () => {
      if (!groupId || !currentUser?.id) return;

      try {
        const groupData = await getGroupById(groupId);
        if (groupData) {
          setGroup(groupData);
          // Set current theme if it exists in group data
          if (groupData.theme && themeOptions.find(theme => theme.id === groupData.theme)) {
            setSelectedTheme(groupData.theme);
          }
          // Try to fetch creator profile to compare emails as a fallback
          try {
            const creator = await usersAPI.getUserById(groupData.creatorId);
            if (creator && creator.email) setCreatorEmail(creator.email.toLowerCase());
          } catch (e) {
            console.warn('[GroupAppearancePage] Could not fetch creator profile for email fallback', e);
          }
        }
      } catch (error) {
        console.error('Error fetching group:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroup();
  }, [groupId, currentUser]);

  const handleSaveAppearance = async () => {
    if (!group || !currentUser?.id) return;

    setIsSaving(true);
    try {
      const selectedThemeData = themeOptions.find(theme => theme.id === selectedTheme);
      
      await updateGroupAppearance(group.id, currentUser.id, {
        name: group.name,
        description: group.description || '',
        coverImage: group.coverImage || '',
        theme: selectedTheme,
        themeColors: selectedThemeData ? {
          primaryColor: selectedThemeData.primaryColor,
          secondaryColor: selectedThemeData.secondaryColor,
          accentColor: selectedThemeData.accentColor,
          textColor: selectedThemeData.textColor,
          bgColor: selectedThemeData.bgColor
        } : undefined
      });

      // Update local state
      setGroup(prev => prev ? { ...prev, theme: selectedTheme } : null);
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating appearance:', error);
      alert('Failed to save appearance settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoBack = () => {
    navigate(`/groups/${groupId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-4">Space not found</h2>
          <button
            onClick={() => navigate('/groups')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            Back to Spaces
          </button>
        </div>
      </div>
    );
  }

  // Check if user is admin or the group creator
  const isAdmin = group.adminId === currentUser?.id;
  // Creator check: uid match OR fallback to matching creator's email (useful if uid missing/discordance)
  const isCreatorByUid = group.creatorId === currentUser?.id;
  const isCreatorByEmail = Boolean(
    creatorEmail &&
    currentUser?.email &&
    creatorEmail === currentUser.email.toLowerCase()
  );
  const isCreator = isCreatorByUid || isCreatorByEmail;
  const isAdminOrCreator = Boolean(isAdmin || isCreator);

  // Debugging information to help diagnose permission issues
  // (remove or lower verbosity in production)
  // eslint-disable-next-line no-console
  console.debug('GroupAppearancePage:', { currentUserId: currentUser?.id, groupCreatorId: group.creatorId, isAdmin, isCreator, isCreatorByUid, isCreatorByEmail, creatorEmail });

  if (!isAdminOrCreator) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-4">Access Denied</h2>
          <p className="text-gray-400 mb-6">Only the space creator or administrators can change appearance settings.</p>
          <button
            onClick={handleGoBack}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            Back to Space
          </button>
        </div>
      </div>
    );
  }
  // Temporarily hide the full appearance editor. Show a disabled/coming-soon page.
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center px-6 py-8 bg-gray-800 rounded-xl max-w-lg">
        <h2 className="text-2xl font-semibold text-white mb-4">Appearance Editor Temporarily Disabled</h2>
        <p className="text-gray-400 mb-6">We're hiding the appearance change option for now. The feature will be back soon.</p>
        <div className="flex justify-center gap-3">
          <button
            onClick={handleGoBack}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            Back to Space
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupAppearancePage;

import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactDOM from 'react-dom';
import { useAuth, User } from '../contexts/AuthContext';
import MainLayout from '../components/layout/MainLayout';
import { doc, updateDoc, getDoc, collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider, 
  sendEmailVerification } from 'firebase/auth';
import { auth } from '../firebase/config';
import { ChevronRightIcon, ChevronLeftIcon, ShieldCheckIcon, UserCircleIcon, KeyIcon, QuestionMarkCircleIcon, InformationCircleIcon, ArrowRightOnRectangleIcon, EnvelopeIcon, DocumentTextIcon, IdentificationIcon, SpeakerWaveIcon, ClockIcon } from '@heroicons/react/24/outline';
import { ExclamationCircleIcon } from '@heroicons/react/24/solid';
import NotificationSoundSettings from '../components/common/NotificationSoundSettings';
import ActivityLogsDisplay from '../components/common/ActivityLogsDisplay';
import TermsAndConditionsModal from '../components/modals/TermsAndConditionsModal';
import PrivacyPolicyModal from '../components/modals/PrivacyPolicyModal';
import CommunicationGuidelinesModal from '../components/modals/CommunicationGuidelinesModal';
import { logProfileUpdate, logSettingsChange, activityLogger } from '../services/activityLogService';
import usePageVisitTracking from '../hooks/usePageVisitTracking';
import SignedInDevices from 'components/signedin_devices/SignedInDevices';

type SettingsSection = 'profile' | 'security' | 'notifications' | 'privacy' | 'activity' | 'help' | 'about' | 'logout';

const SettingsPage: React.FC = (): React.ReactElement => {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');

  // Privileged users (admins) don't need Profile Information â€” treat them specially
  const isPrivilegedUser = !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'super admin');
  // Centralized class for non-editable / read-only fields to give them a slightly different color
  const readOnlyFieldClass = "w-full bg-gray-800/40 border border-gray-700/50 rounded-md py-2 px-3 text-gray-400 text-sm cursor-not-allowed";
  const [formData, setFormData] = useState<Partial<User>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setError] = useState<string | null>(null);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [showContentOnMobile, setShowContentOnMobile] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);  
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);  const [lastPasswordChange, setLastPasswordChange] = useState<Date | null>(null);
  // Password strength indicator state
  const [passwordStrength, setPasswordStrength] = useState<'empty' | 'weak' | 'average' | 'strong'>('empty');
  const [showPasswordSuccessModal, setShowPasswordSuccessModal] = useState(false);
  const [canChangePassword, setCanChangePassword] = useState(true);
  const [daysUntilChange, setDaysUntilChange] = useState(0);
  // 14-day cooldown for name/profile (name-related) changes
  const [lastNameChange, setLastNameChange] = useState<Date | null>(null);
  const [canChangeName, setCanChangeName] = useState(true);
  const [daysUntilNameChange, setDaysUntilNameChange] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showNameChangeConfirmation, setShowNameChangeConfirmation] = useState(false);
  const [originalName, setOriginalName] = useState('');
  const [newName, setNewName] = useState('');  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [namePrefix, setNamePrefix] = useState('');
  const [nameSuffix, setNameSuffix] = useState('');
  const [yearValue, setYearValue] = useState('');
  const [sectionValue, setSectionValue] = useState('');
  
  // Recovery email states
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [tempRecoveryEmail, setTempRecoveryEmail] = useState('');
  const [isEditingRecoveryEmail, setIsEditingRecoveryEmail] = useState(false);
  const [recoveryEmailError, setRecoveryEmailError] = useState<string | null>(null);
  const [isSavingRecoveryEmail, setIsSavingRecoveryEmail] = useState(false);  const [recoveryEmailSuccess, setRecoveryEmailSuccess] = useState(false);

  // About tab: show Terms/Privacy/Guidelines expanded by default
  const [aboutTermsOpen, setAboutTermsOpen] = useState(true);
  const [aboutPrivacyOpen, setAboutPrivacyOpen] = useState(true);
  const [aboutGuidelinesOpen, setAboutGuidelinesOpen] = useState(true);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showGuidelinesModal, setShowGuidelinesModal] = useState(false);
  
  // Login history states
  const [loginHistory, setLoginHistory] = useState<Array<{
    timestamp: Date;
    device: string;
    browser: string;
    ipAddress: string;
    location?: string;
  }>>([]);
  const [isLoadingLoginHistory, setIsLoadingLoginHistory] = useState(false);
  const [loginHistoryError, setLoginHistoryError] = useState<string | null>(null);

  // Clear password fields when modal is opened
  useEffect(() => {
    if (showPasswordModal) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setPasswordChangeError(null);
    }
  }, [showPasswordModal]);
  useEffect(() => {
    // Check for `section` query parameter to allow deep-linking into a specific settings tab
    try {
      const params = new URLSearchParams(location.search);
      const sectionParam = params.get('section');
      if (sectionParam) {
        const validSections: SettingsSection[] = ['profile', 'security', 'notifications', 'privacy', 'activity', 'help', 'about', 'logout'];
        if (validSections.includes(sectionParam as SettingsSection)) {
          // If user is privileged, do not allow selecting 'profile' â€” default to 'security'
          if (isPrivilegedUser && sectionParam === 'profile') {
            setActiveSection('security');
          } else {
            setActiveSection(sectionParam as SettingsSection);
          }
        }
      }
    } catch (e) {
      // ignore
    }

    // If currentUser is privileged and we are still on the 'profile' default, switch to 'security'
    if (isPrivilegedUser && activeSection === 'profile') {
      setActiveSection('security');
    }
  if (currentUser) {
      // Build initial form data without undefined fields (Firestore disallows undefined)
      const initial: Partial<User> = {
        name: currentUser.name,
        email: currentUser.email,
        department: currentUser.department,
        gender: currentUser.gender || 'prefer_not_to_say',
        birthday: currentUser.birthday || '',
        namePrefix: currentUser.namePrefix || '',
        nameSuffix: currentUser.nameSuffix || ''
      };
      if (currentUser.yearSection) {
        initial.yearSection = currentUser.yearSection;
      }
      setFormData(initial);

      // Parse year and section from yearSection field (format: "1-A", "2-B", etc.)
      if (currentUser.yearSection) {
        const parts = currentUser.yearSection.split('-');
        if (parts.length === 2) {
          setYearValue(parts[0]);
          setSectionValue(parts[1]);
        }
      }
      
      // Get user data including the lastPasswordChange field
      const fetchUserData = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.id));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            
            // Handle lastPasswordChange
            if (userData.lastPasswordChange) {
              // Parse ISO string to Date object
              const lastChangeDate = new Date(userData.lastPasswordChange);
              setLastPasswordChange(lastChangeDate);
              
              // Check if 7 days have passed since the last password change
              const currentDate = new Date();
              const daysSinceChange = Math.floor((currentDate.getTime() - lastChangeDate.getTime()) / (1000 * 60 * 60 * 24));
              const daysRemaining = 7 - daysSinceChange;
              
              if (daysSinceChange < 7) {
                setCanChangePassword(false);
                setDaysUntilChange(daysRemaining);
              } else {
                setCanChangePassword(true);
                setDaysUntilChange(0);
              }
            }
          }
          // Name change cooldown (14 days)
          if (userDoc.exists() && userDoc.data().lastNameChange) {
            const lastNameChangeISO = userDoc.data().lastNameChange;
            try {
              const lastNameChangeDate = new Date(lastNameChangeISO);
              setLastNameChange(lastNameChangeDate);
              const now = new Date();
              const diffDays = Math.floor((now.getTime() - lastNameChangeDate.getTime()) / (1000 * 60 * 60 * 24));
              if (diffDays < 14) {
                setCanChangeName(false);
                setDaysUntilNameChange(14 - diffDays);
              } else {
                setCanChangeName(true);
                setDaysUntilNameChange(0);
              }
            } catch (e) {
              console.warn('Invalid lastNameChange date format', lastNameChangeISO);
            }
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      };
      
      fetchUserData();
    }
  }, [currentUser]);  // Split user's name when the currentUser loads
  // Robust name parsing to avoid jumbled first/last/suffix fields
  useEffect(() => {
    if (!currentUser) return;

    const rawName = currentUser.name || '';
    const storedPrefix = currentUser.namePrefix || '';
    const storedSuffix = currentUser.nameSuffix || '';

    // Helper to trim extra spaces & trailing commas
    const clean = (str: string) => str.replace(/\s+/g, ' ').replace(/\s+,/g, ',').replace(/,+/g, ',').replace(/,+$/,'').trim();

    let workingName = rawName.trim();
    let prefix = storedPrefix;
    let suffix = storedSuffix;

    // If no stored prefix but name starts with one of known prefixes, extract
    if (!prefix) {
      const prefixMatch = /^(Mr\.|Ms\.|Mrs\.|Dr\.|Prof\.|Engr\.|Atty\.|Dean|Dir\.)\s+/i.exec(workingName);
      if (prefixMatch) {
        prefix = prefixMatch[1];
        workingName = workingName.substring(prefixMatch[0].length).trim();
      }
    }

    // Extract suffix if not stored: look for comma separated segment at end
    if (!suffix) {
      const commaIdx = workingName.indexOf(',');
      if (commaIdx !== -1) {
        const before = workingName.substring(0, commaIdx).trim();
        const after = workingName.substring(commaIdx + 1).trim();
        // Limit suffix length to something reasonable and ensure not multiple words of typical last name
        if (after && after.length <= 10) {
          suffix = after;
          workingName = before;
        }
      }
    } else {
      // Remove existing suffix portion from rawName if duplicated
      const suffixPattern = new RegExp(`,?\\s*${suffix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`);
      workingName = workingName.replace(suffixPattern, '').trim();
    }

    // Remove stray commas
    workingName = workingName.replace(/,$/, '').trim();

    // At this point workingName should be '[First Names] LastName'
    const parts = workingName.split(/\s+/).filter(Boolean);
    let parsedFirst = '';
    let parsedLast = '';
    if (parts.length === 0) {
      parsedFirst = '';
      parsedLast = '';
    } else if (parts.length === 1) {
      parsedFirst = parts[0];
      parsedLast = '';
    } else {
      parsedLast = parts.pop() || '';
      parsedFirst = parts.join(' ');
    }

    setFirstName(clean(parsedFirst));
    setLastName(clean(parsedLast));
    setNamePrefix(prefix);
    setNameSuffix(suffix);

    // Ensure formData.name is synced without duplication
    const full = buildFullName(prefix, clean(parsedFirst), clean(parsedLast), suffix);
    setFormData(prev => ({ ...prev, name: full, namePrefix: prefix, nameSuffix: suffix }));
  }, [currentUser]);
  
  // Initialize recovery email when currentUser loads
  useEffect(() => {
    if (currentUser && currentUser.resetEmail) {
      setRecoveryEmail(currentUser.resetEmail);
      setTempRecoveryEmail(currentUser.resetEmail);
    }
  }, [currentUser]);
    // Fetch login history when the security tab is active
  useEffect(() => {
    if (activeSection === 'security' && currentUser) {
      fetchLoginHistory();
    }
  }, [activeSection, currentUser]);
  
  // Log when the settings page and sections are accessed 
  // usePageVisitTracking('Settings', `Visited ${activeSection} settings`, { section: activeSection });
  
  // Function to send email verification
  const sendVerificationEmail = async () => {
    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
        
        // Show success message
        setToastMessage("Verification email sent! Please check your inbox and follow the link to verify your email.");
        setShowToast(true);
      }
    } catch (error: any) {
  console.error("Error sending verification email:", error);
  setToastMessage("Failed to send verification email. Please try again later.");
  setShowToast(true);
    }  };
      
  // Function to fetch login history from Firestore
  const fetchLoginHistory = async () => {
    if (!currentUser) return;
    
    setIsLoadingLoginHistory(true);
    setLoginHistoryError(null);
    
    try {
      // Reference to the login_history subcollection for this user
      const loginHistoryRef = collection(db, 'users', currentUser.id, 'login_history');
      
      // Query the 10 most recent logins, ordered by timestamp
      const q = query(loginHistoryRef, orderBy('timestamp', 'desc'), limit(10));
      const loginSnapshot = await getDocs(q);
      
      const historyData = loginSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          timestamp: data.timestamp?.toDate() || new Date(), // Convert Firestore timestamp to Date
          device: data.device || 'Unknown device',
          browser: data.browser || 'Unknown browser',
          ipAddress: data.ipAddress || 'Unknown IP',
          location: data.location || 'Unknown location'
        };
      });
      
      setLoginHistory(historyData);
    } catch (error) {
      console.error('Error fetching login history:', error);
      setLoginHistoryError('Failed to load your login history. Please try again.');    } finally {
      setIsLoadingLoginHistory(false);
    }
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  // Helper to build full name with prefix & suffix
  const buildFullName = (prefix: string, fName: string, lName: string, suffix: string): string => {
  const segments = [prefix, fName, lName].filter(Boolean);
  let baseName = segments.join(' ').replace(/\s+/g, ' ').trim();
  // Remove accidental trailing commas
  baseName = baseName.replace(/,+$/, '');
  if (!suffix) return baseName;
  // Avoid duplicating suffix if already present
  const normalized = `${baseName}`.replace(/,?\s+${suffix}$/i, '');
  return `${normalized}, ${suffix}`.replace(/\s+,/g, ',').trim();
  };

  // Handle year and section changes, updating the yearSection field with the combined value
  const handleYearSectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'year') {
      setYearValue(value);
      // Update the combined yearSection in formData
      const combinedValue = `${value}-${sectionValue}`.trim();
      setFormData(prev => ({ ...prev, yearSection: combinedValue }));
    } else if (name === 'section') {
      setSectionValue(value);
      // Update the combined yearSection in formData
      const combinedValue = `${yearValue}-${value}`.trim();
      setFormData(prev => ({ ...prev, yearSection: combinedValue }));
    }
  };
  const saveProfileChanges = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    setError(null);

    try {
      // Validate birthday is not in the future and is within reasonable age range
      if (formData.birthday) {
        const birthdayDate = new Date(formData.birthday);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // Set to end of today to allow today's date
        
        if (birthdayDate > today) {
          setError('Birthday cannot be in the future. Please select a valid date.');
          setIsSaving(false);
          return;
        }
        
        // Calculate age
        const age = today.getFullYear() - birthdayDate.getFullYear();
        const monthDiff = today.getMonth() - birthdayDate.getMonth();
        const dayDiff = today.getDate() - birthdayDate.getDate();
        const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
        
        // Get user role to determine appropriate age limits
        const userRole = currentUser?.role || 'student';
        const isStudent = userRole === 'student';
        
        // Validate age based on role
        if (actualAge < 15) {
          setError('Invalid: Please enter a valid birth year.');
          setIsSaving(false);
          return;
        }
        // Students should typically be 15-30, but allow up to 35 for non-traditional students
        if (isStudent && actualAge > 35) {
          setError('Invalid: Please enter a valid birth year.');
          setIsSaving(false);
          return;
        }
        // Faculty and other roles can be older, but set a reasonable maximum of 80
        if (!isStudent && actualAge > 80) {
          setError('Invalid: Please enter a valid birth year.');
          setIsSaving(false);
          return;
        }
      }

      // Update Firebase user profile if name changed
      if (formData.name !== currentUser.name) {
        await updateProfile(auth.currentUser!, {
          displayName: formData.name || '',
        });
      }

      // Create update data without department field since it's not editable
      const { department, ...updateData } = formData;

      // Remove undefined values so Firestore doesn't receive them (it rejects undefined)
      const sanitizedUpdateData: Record<string, any> = {};
      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined) {
          sanitizedUpdateData[key] = value;
        }
      });

      // If yearSection ends with a dash due to partial selection, drop it instead of sending invalid value
      if (typeof sanitizedUpdateData.yearSection === 'string' && /-$/.test(sanitizedUpdateData.yearSection)) {
        // Incomplete year-section selection; remove the field to avoid storing partial data
        delete sanitizedUpdateData.yearSection;
      }

      // Update Firestore user document
      const userRef = doc(db, 'users', currentUser.id);
      const nowISO = new Date().toISOString();
      await updateDoc(userRef, {
        ...sanitizedUpdateData,
        updatedAt: nowISO,
        ...(formData.name !== currentUser.name ? { lastNameChange: nowISO } : {})
      });

      // Log the profile update activity
      const updatedFields = Object.keys(sanitizedUpdateData).filter(key => 
        sanitizedUpdateData[key] !== (currentUser as any)[key]
      );
      if (updatedFields.length > 0) {
        await logProfileUpdate(updatedFields);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setError('Failed to update your profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!currentUser) return;
    
    // Check if name is being changed
    if (formData.name !== currentUser.name) {
      if (!canChangeName) {
        setToastMessage(`You can change your name again in ${daysUntilNameChange} day${daysUntilNameChange !== 1 ? 's' : ''}.`);
        setShowToast(true);
        return;
      }
      // Store the original and new names for the confirmation modal
      setOriginalName(currentUser.name || '');
      setNewName(formData.name || '');
      setShowNameChangeConfirmation(true);
      return;
    }
    
    // No name change, proceed with save
    await saveProfileChanges();
  };

  
  // Check if the current device is a mobile device
  const isMobileDevice = (): boolean => {
    const userAgent = navigator.userAgent || navigator.vendor;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  };

const handleChangePassword = async () => {
    // Check if user can change password (7-day restriction)
    if (!canChangePassword) {
      setPasswordChangeError(`You need to wait ${daysUntilChange} more day${daysUntilChange !== 1 ? 's' : ''} before you can change your password again.`);
      return;
    }
    
    // Validation
    setPasswordChangeError(null);
    setIsChangingPassword(true);
    
    if (newPassword !== confirmPassword) {
      setPasswordChangeError("New passwords don't match");
      setIsChangingPassword(false);
      return;
    }
    
    // Strong password requirement: 16+ chars, includes letters, numbers, special char, no spaces
    const strongPasswordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])[^\s]{16,}$/;
    if (!strongPasswordRegex.test(newPassword)) {
      setPasswordChangeError("Password must be 16+ chars, include letters, numbers & special character, and contain no spaces");
      setIsChangingPassword(false);
      return;
    }
    
    try {
      // Make sure the user is logged in
      const user = auth.currentUser;
      if (!user) {
        setPasswordChangeError("You must be logged in to change your password");
        setIsChangingPassword(false);
        return;
      }

      // First, reauthenticate the user with their current password
      const credential = EmailAuthProvider.credential(user.email || '', currentPassword);
      await reauthenticateWithCredential(user, credential);
        // Then update the password
      await updatePassword(user, newPassword);
      
      // Update the last password change date in state and Firestore
      const currentDate = new Date();
      setLastPasswordChange(currentDate);
      
      // Update Firestore with last password change date if user has an ID
      if (currentUser && currentUser.id) {
        const userRef = doc(db, 'users', currentUser.id);
        await updateDoc(userRef, {
          lastPasswordChange: currentDate.toISOString(),
          updatedAt: currentDate.toISOString()
        });
      }
        // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
  setPasswordStrength('empty');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setShowPasswordModal(false);
      
      // Log the password change activity
      await activityLogger.logActivity(
        'password_change',
        'Password changed successfully',
        { timestamp: new Date().toISOString() },
        'medium'
      );

      // Show success modal instead of alert
      setShowPasswordSuccessModal(true);
      setToastMessage('Password changed successfully!');
      setShowToast(true);
    } catch (error: any) {
      console.error('Error changing password:', error);
      
      // Handle specific authentication errors
      if (error.code === 'auth/wrong-password') {
        setPasswordChangeError('Current password is incorrect');
      } else if (error.code === 'auth/weak-password') {
        setPasswordChangeError('New password is too weak. Choose a stronger password');
      } else if (error.code === 'auth/requires-recent-login') {
        setPasswordChangeError('For security reasons, please sign out and sign in again before changing your password');
      } else {
        setPasswordChangeError('Failed to change password. Please try again later');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout(true);
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };
    // Recovery email functions
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEditRecoveryEmail = () => {
    setIsEditingRecoveryEmail(true);
    setRecoveryEmailError(null);
    setRecoveryEmailSuccess(false);
  };

  const handleCancelRecoveryEmail = () => {
    setIsEditingRecoveryEmail(false);
    setTempRecoveryEmail(recoveryEmail);
    setRecoveryEmailError(null);
  };

  const handleSaveRecoveryEmail = async () => {
    if (!currentUser) return;

    // Validation
    if (tempRecoveryEmail && !validateEmail(tempRecoveryEmail)) {
      setRecoveryEmailError('Please enter a valid email address');
      return;
    }

    // Check if it's the same as current BulSU email
    if (tempRecoveryEmail === currentUser.email) {
      setRecoveryEmailError('Recovery email cannot be the same as your BulSU account email');
      return;
    }

    setIsSavingRecoveryEmail(true);
    setRecoveryEmailError(null);

    try {
      // Update Firestore user document
      const userRef = doc(db, 'users', currentUser.id);
      await updateDoc(userRef, {
        resetEmail: tempRecoveryEmail || null,
        updatedAt: new Date().toISOString()
      });

      // Log the recovery email change
      await logSettingsChange('recovery_email', recoveryEmail, tempRecoveryEmail);

      setRecoveryEmail(tempRecoveryEmail);
      setIsEditingRecoveryEmail(false);
      setRecoveryEmailSuccess(true);
      setTimeout(() => setRecoveryEmailSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating recovery email:', error);
      setRecoveryEmailError('Failed to update recovery email. Please try again.');
    } finally {
      setIsSavingRecoveryEmail(false);
    }
  };

  // Password Change Success Modal (portal, unrestricted)
  const renderPasswordSuccessModal = () => ReactDOM.createPortal(
    <div 
      className="fixed inset-0 z-[2147483647] flex items-start justify-center p-4 md:p-6 overflow-y-auto bg-black/70" 
      role="alertdialog" 
      aria-modal="true"
      aria-labelledby="password-success-title"
      onClick={() => setShowPasswordSuccessModal(false)}
    >
      <div 
        className="relative bg-gray-900 rounded-lg p-6 w-full max-w-md border border-green-700/30 shadow-2xl mt-24 animate-[fadeIn_.2s_ease-out]" 
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
            aria-label="Close success dialog"
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-200 transition-colors"
            onClick={() => setShowPasswordSuccessModal(false)}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-green-500/10 border border-green-500/40 mb-5">
            <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 id="password-success-title" className="text-xl font-semibold text-green-400 mb-2">Password Changed</h3>
          <p className="text-gray-300 mb-6">
            Your password has been successfully updated.
          </p>
          <button
            onClick={() => setShowPasswordSuccessModal(false)}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 px-4 rounded-md text-sm font-medium transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
  
  // Password Change Modal (now rendered at top-level via portal for unrestricted display)
  const renderPasswordModal = () => ReactDOM.createPortal(
    <div 
      className="fixed inset-0 z-[2147483647] flex items-start justify-center overflow-y-auto p-4 md:p-6 bg-black/70"
      role="dialog" 
      aria-modal="true"
      aria-labelledby="change-password-title"
      onClick={() => {
        // Click outside to close (only if not currently changing password)
        if (!isChangingPassword) setShowPasswordModal(false);
      }}
    >
      <div 
        className="relative bg-gray-900 rounded-lg p-6 w-full max-w-md border border-green-700/30 shadow-2xl mt-20" 
        onClick={(e) => e.stopPropagation()} // prevent backdrop close when clicking inside
      >
        {/* Close button */}
        <button
          type="button"
          aria-label="Close password change modal"
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-200 transition-colors"
          onClick={() => { if (!isChangingPassword) setShowPasswordModal(false); }}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h3 id="change-password-title" className="text-xl font-semibold text-green-400 mb-4">Change Password</h3>
        
        {/* Security note about password change frequency */}
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 mb-4">
          <div className="flex items-start text-sm">
            <svg className="h-5 w-5 text-blue-400 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-blue-300 text-xs">
              <p className="font-medium mb-1">Note:</p>
              <p>For security reasons, you can only change your password once every 7 days.</p>
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          {!canChangePassword && (
            <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-300 px-4 py-3 rounded-md text-sm flex items-center">
              <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L5.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              You need to wait {daysUntilChange} more day{daysUntilChange !== 1 ? 's' : ''} before you can change your password again.
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Current Password</label>            <div className="relative">
              <input 
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus={false}
                autoCorrect="off"
                spellCheck="false"
                className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 pr-10 text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-300 hover:text-green-400 focus:outline-none z-10 bg-transparent"
              >
                <div className="bg-transparent p-1 rounded-full">
                  {showCurrentPassword ? (
                    <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7A9.97 9.97 0 014.02 8.971m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </div>
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
            <div className="relative">
              <input 
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewPassword(val);
                  if (!val) {
                    setPasswordStrength('empty');
                    return;
                  }
                  // Basic characteristics
                  const hasLetter = /[A-Za-z]/.test(val);
                  const hasNumber = /\d/.test(val);
                  const hasSpecial = /[^A-Za-z0-9]/.test(val);
                  const hasSpace = /\s/.test(val);
                  // Assign strength heuristic
                  if (hasSpace || val.length < 8) {
                    setPasswordStrength('weak');
                    return;
                  }
                  const lengthScore = val.length >= 16 ? 2 : val.length >= 12 ? 1 : 0;
                  const varietyScore = [hasLetter, hasNumber, hasSpecial].filter(Boolean).length;
                  if (lengthScore === 2 && varietyScore === 3 && !hasSpace) {
                    setPasswordStrength('strong');
                  } else if ((lengthScore >= 1 && varietyScore >= 2) || (val.length >= 14 && varietyScore >= 2)) {
                    setPasswordStrength('average');
                  } else {
                    setPasswordStrength('weak');
                  }
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 pr-10 text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-300 hover:text-green-400 focus:outline-none z-10 bg-transparent"
              >
                <div className="bg-transparent p-1 rounded-full">
                  {showNewPassword ? (
                    <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7A9.97 9.97 0 014.02 8.971m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </div>
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs text-gray-400">16+ chars, letters, numbers & special, no spaces</p>
              {passwordStrength !== 'empty' && (
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] font-semibold tracking-wide uppercase ${
                    passwordStrength === 'strong' ? 'text-green-400' : passwordStrength === 'average' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {passwordStrength === 'strong' ? 'Strong' : passwordStrength === 'average' ? 'Average' : 'Weak'}
                  </span>
                  <div className="flex gap-0.5">
                    {[0,1,2].map(i => {
                      const fill = passwordStrength === 'strong' ? true : passwordStrength === 'average' ? i < 2 : i === 0;
                      const color = passwordStrength === 'strong' ? 'bg-green-500' : passwordStrength === 'average' ? 'bg-yellow-500' : 'bg-red-500';
                      return <span key={i} className={`h-1.5 w-4 rounded-sm ${fill ? color : 'bg-gray-600'}`}></span>;
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Confirm New Password</label>
            <div className="relative">
              <input 
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 pr-10 text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-300 hover:text-green-400 focus:outline-none z-10 bg-transparent"
              >
                <div className="bg-transparent p-1 rounded-full">
                  {showConfirmPassword ? (
                    <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7A9.97 9.97 0 014.02 8.971m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </div>
              </button>
            </div>
          </div>
          
          {passwordChangeError && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-2 rounded-md text-sm flex items-center">
              <ExclamationCircleIcon className="h-5 w-5 mr-2" />
              {passwordChangeError}
            </div>
          )}
          
          <div className="flex justify-end gap-2 mt-4">            <button
              onClick={() => {
                setShowPasswordModal(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setShowCurrentPassword(false);
                setShowNewPassword(false);
                setShowConfirmPassword(false);
                setPasswordChangeError(null);
                setPasswordStrength('empty');
              }}
              className="px-4 py-2 rounded-md font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            >
              Cancel
            </button>            <button
              onClick={handleChangePassword}
              disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword || !canChangePassword || passwordStrength !== 'strong'}
              className={`px-4 py-2 rounded-md font-medium ${
                isChangingPassword || !currentPassword || !newPassword || !confirmPassword || !canChangePassword || passwordStrength !== 'strong'
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              } transition-colors`}
            >
              {isChangingPassword ? 'Changing...' : passwordStrength === 'strong' ? 'Change Password' : 'Password Not Strong Enough'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  const renderProfileSettings = () => {
    // Calculate min and max dates for birthday input
    // Allow up to 80 years old to accommodate faculty members
    const today = new Date();
    const maxDate = today.toISOString().split('T')[0];
    const minDateObj = new Date();
    minDateObj.setFullYear(minDateObj.getFullYear() - 80);
    const minDate = minDateObj.toISOString().split('T')[0];

    return (
      <div className="bg-gray-900 rounded-lg p-4 shadow-lg border border-green-700/30">
      <h2 className="text-xl font-semibold mb-4 text-green-400">Profile Information</h2>
  <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">First Name</label>
            <div className={readOnlyFieldClass}>
              {firstName || 'â€”'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Last Name</label>
            <div className={readOnlyFieldClass}>
              {lastName || 'â€”'}
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">BulSU Space Email Address</label>
          <input 
            type="email"
            name="email"
            value={formData.email || ''}
            onChange={handleChange}
            className={readOnlyFieldClass}
            disabled
          />
          <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
        </div>        {/* Department: Hide for super admins and admins */}
        {(currentUser?.role !== 'super admin' && currentUser?.role !== 'admin') && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Department</label>
            <input 
              type="text"
              name="department"
              value={formData.department || ''}
              className={readOnlyFieldClass}
              disabled
            />
            <p className="text-xs text-gray-400 mt-1">Department cannot be changed</p>
          </div>
        )}
        {/* ID Number: show as non-editable field if available */}
        {((currentUser && (currentUser as any).idNumber) || formData.idNumber) && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">ID Number</label>
            <input
              type="text"
              name="idNumber"
              value={(formData.idNumber as string) || (currentUser && (currentUser as any).idNumber) || ''}
              readOnly
              disabled
              className={readOnlyFieldClass}
            />
            <p className="text-xs text-gray-400 mt-1">ID Number cannot be changed</p>
          </div>
        )}
        {/* Year & Section: Only for students */}
        {currentUser?.role === 'student' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Year & Section</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <select
                  name="year"
                  value={yearValue}
                  onChange={handleYearSectionChange}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="">Select Year</option>
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                </select>
              </div>
              <div>
                <select
                  name="section"
                  value={sectionValue}
                  onChange={handleYearSectionChange}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="">Select Section</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                  <option value="D">Section D</option>
                  <option value="E">Section E</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">Format: {yearValue && sectionValue ? `${yearValue}-${sectionValue}` : "Year-Section"}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Gender</label>
          <select 
            name="gender"
            value={formData.gender || 'prefer_not_to_say'}
            onChange={handleChange}
            className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Birthday</label>
          <input 
            type="date"
            name="birthday"
            value={formData.birthday || ''}
            onChange={handleChange}
            min={minDate}
            max={maxDate}
            className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>

        {saveError && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-2 rounded-md text-sm flex items-center">
            <ExclamationCircleIcon className="h-5 w-5 mr-2" />
            {saveError}
          </div>
        )}

        {saveSuccess && (
          <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-2 rounded-md text-sm">
            Profile updated successfully!
          </div>
        )}
        {(() => {
          // Determine if there are unsaved changes
          if (!currentUser) return null;
          const pendingYearSection = typeof formData.yearSection === 'string' && /-$/.test(formData.yearSection) ? null : formData.yearSection;
          const dirty = (
            (formData.name !== undefined && formData.name !== currentUser.name) ||
            (formData.gender !== undefined && (formData.gender || '') !== (currentUser.gender || '')) ||
            (formData.birthday !== undefined && (formData.birthday || '') !== (currentUser.birthday || '')) ||
            (pendingYearSection !== null && pendingYearSection !== currentUser.yearSection) ||
            (formData.namePrefix !== undefined && (formData.namePrefix || '') !== (currentUser.namePrefix || '')) ||
            (formData.nameSuffix !== undefined && (formData.nameSuffix || '') !== (currentUser.nameSuffix || ''))
          );
          if (!dirty) return null;
          return (
            <div className="flex justify-end">
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className={`px-4 py-2 rounded-md font-medium ${isSaving ? 'bg-gray-700 text-gray-400' : 'bg-green-600 hover:bg-green-700 text-white'} transition-colors`}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          );
        })()}
      </div>
    </div>
    );
  };
  const renderSecuritySettings = () => {
    return (
    <div className="bg-gray-900 rounded-lg p-4 shadow-lg border border-green-700/30">
      <h2 className="text-xl font-semibold mb-4 text-green-400">Account Security</h2>
      <div className="space-y-6">
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-md font-medium text-green-300 mb-3">Password Management</h3>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm text-gray-300">Password</p>
              <p className="text-xs text-gray-400">
                Last changed: {lastPasswordChange
                  ? new Intl.DateTimeFormat('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    }).format(lastPasswordChange)
                  : 'Never'}
              </p>
              {!canChangePassword && (
                <p className="text-xs text-yellow-400 mt-1">
                  Cannot change for {daysUntilChange} more day{daysUntilChange !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <button
              className={`text-sm py-1.5 px-3 rounded-md font-medium flex items-center ${
                canChangePassword
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
              onClick={() => {
                if (canChangePassword) {
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setShowCurrentPassword(false);
                  setShowNewPassword(false);
                  setShowConfirmPassword(false);
                  setPasswordChangeError(null);
                  setShowPasswordModal(true);
                }
              }}
              disabled={!canChangePassword}
              title={!canChangePassword ? `You can change your password in ${daysUntilChange} day${daysUntilChange !== 1 ? 's' : ''}` : ''}
            >
              <KeyIcon className="h-4 w-4 mr-1.5" />
              Change Password
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Strong passwords include a mix of uppercase and lowercase letters, numbers, and special characters.
          </p>
        </div>
        <SignedInDevices />
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-md font-medium text-green-300 mb-3 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Login History
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            Recent devices that have accessed your account. If you don't recognize a device, change your password immediately.
          </p>
          {isLoadingLoginHistory ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
            </div>
          ) : loginHistoryError ? (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-md text-sm flex items-center">
              <ExclamationCircleIcon className="h-5 w-5 mr-2" />
              {loginHistoryError}
              <button
                onClick={fetchLoginHistory}
                className="ml-auto text-green-400 hover:text-green-300 font-medium"
              >
                Retry
              </button>
            </div>
          ) : loginHistory.length === 0 ? (
            <div className="text-center py-6 text-gray-400">No login history available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead>
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date & Time</th>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Device</th>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Browser</th>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {loginHistory.map((login, index) => (
                    <tr key={index} className={index === 0 ? 'bg-green-900/10' : ''}>
                      <td className="px-3 py-2 whitespace-nowrap text-sm">
                        <div className="text-gray-300">
                          {new Intl.DateTimeFormat('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          }).format(login.timestamp)}
                        </div>
                        <div className="text-gray-400 text-xs">
                          {new Intl.DateTimeFormat('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          }).format(login.timestamp)}
                        </div>
                        {index === 0 && (
                          <div className="mt-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900 text-green-300">Current</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-300">{login.device}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-300">{login.browser}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-300">
                        <div className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {login.location || 'Unknown location'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex justify-between items-center">
            <p className="text-xs text-gray-400">Showing last {loginHistory.length} logins</p>
            <button
              onClick={fetchLoginHistory}
              className="text-sm py-1 px-3 rounded-md font-medium bg-green-600 hover:bg-green-700 text-white flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  };

  const renderDataPrivacySettings = () => (
    <div className="bg-gray-900 rounded-lg p-4 shadow-lg border border-green-700/30">
      <h2 className="text-xl font-semibold mb-4 text-green-400">Data Privacy</h2>
      
      <div className="space-y-4">
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-medium text-green-300 mb-2">Data Collection Policy</h3>
          <p className="text-gray-300 text-sm leading-relaxed">
            BulSU Space collects information that you provide when creating your account, including your name, email address, 
            and other profile information. We also collect data on how you use the platform to improve your experience.
          </p>
        </div>
        
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-medium text-green-300 mb-2">How We Use Your Data</h3>
          <ul className="list-disc pl-5 text-gray-300 text-sm space-y-1">
            <li>To provide, maintain, and improve the platform</li>
            <li>To personalize your experience</li>
            <li>To communicate with you about updates and events</li>
            <li>To ensure platform security and prevent abuse</li>
          </ul>
        </div>
        
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-medium text-green-300 mb-2">Privacy Assurance</h3>
          <p className="text-gray-300 text-sm leading-relaxed">
            We take your privacy seriously. We only collect and use the information necessary to provide and improve BulSU Space. We do not sell, trade, or use your personal data for malicious or harmful purposes. Access to your data is limited to authorized team members and protected by our security controls. For privacy requests, contact <a href="mailto:support@bulsuspace.edu" className="text-green-400 underline">support@bulsuspace.edu</a>.
          </p>
        </div>
      </div>
    </div>
  );

  const renderHelpContent = () => (
    <div className="bg-gray-900 rounded-lg p-4 shadow-lg border border-green-700/30">
      <h2 className="text-xl font-semibold mb-4 text-green-400">Help & Support</h2>
      
      <div className="space-y-4">
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-medium text-green-300 mb-2">Frequently Asked Questions</h3>
          <div className="space-y-3">
            <div>
              <h4 className="text-green-200 font-medium">How do I update my profile picture?</h4>
              <p className="text-gray-400 text-sm mt-1">Go to your profile page, click your profile picture, and select "Update Profile Picture". You can upload a new image or choose a default avatar. Changes are saved instantly and reflected across the platform.</p>
            </div>
            <div>
              <h4 className="text-green-200 font-medium">How do I change my password?</h4>
              <p className="text-gray-400 text-sm mt-1">Go to Settings &gt; Account Security, then select "Change Password". You must enter your current password and a new password. For forgotten passwords, use the "Forgot Password" link on the login page to receive a reset email.</p>
            </div>
            <div>
              <h4 className="text-green-200 font-medium">How do I join or create a group or space?</h4>
              <p className="text-gray-400 text-sm mt-1">Navigate to the Groups or Spaces section. To join, browse available groups and click "Join". For private groups, your request must be approved. To create a group, click "Create New Group", fill in the details, and set privacy options.</p>
            </div>
            <div>
              <h4 className="text-green-200 font-medium">How does content moderation work?</h4>
              <p className="text-gray-400 text-sm mt-1">All posts, comments, and messages are automatically checked for profanity and harmful content using AI and local filters. Inappropriate content is blocked or flagged for review. You can also report content manually using the three dots menu.</p>
            </div>
            <div>
              <h4 className="text-green-200 font-medium">How is my privacy protected?</h4>
              <p className="text-gray-400 text-sm mt-1">Your data is protected by strict security rules and encrypted in Firebase. You control your profile visibility and can download or delete your data anytime in Settings &gt; Data Privacy. The platform follows university and legal privacy standards.</p>
            </div>
            <div>
              <h4 className="text-green-200 font-medium">Who can access BulSU Space?</h4>
              <p className="text-gray-400 text-sm mt-1">All current students, faculty, and staff with a valid BulSU email can access the platform. Alumni have limited access. Each user role has specific permissions and access to features.</p>
            </div>
            <div>
              <h4 className="text-green-200 font-medium">How do I report a problem or get support?</h4>
              <p className="text-gray-400 text-sm mt-1">For technical issues, email <a href="mailto:support@bulsuspace.edu" className="text-green-400 underline">support@bulsuspace.edu</a> or visit the Help Center. For content or moderation concerns, use the report feature or email <a href="mailto:community@bulsu.edu.ph" className="text-green-400 underline">community@bulsu.edu.ph</a>.</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-medium text-green-300 mb-2">Contact Support</h3>
          <p className="text-gray-300 text-sm mb-3">
            If you're experiencing issues or have questions not covered in our FAQs, please reach out to our support team.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="bg-gray-800 p-3 rounded border border-gray-700 flex items-center">
              <EnvelopeIcon className="h-6 w-6 text-green-500 mr-2" />
              <div>
                <p className="text-xs text-gray-400">Email Support</p>
                <p className="text-sm text-gray-200">support@bulsuspace.edu</p>
              </div>
            </div>
            <div className="bg-gray-800 p-3 rounded border border-gray-700 flex items-center">
              <IdentificationIcon className="h-6 w-6 text-green-500 mr-2" />
              <div>
                <p className="text-xs text-gray-400">Help Center</p>
                <p className="text-sm text-gray-200">help.bulsuspace.edu</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAboutContent = () => (
    <div className="bg-gray-900 rounded-lg p-4 shadow-lg border border-green-700/30">
      <h2 className="text-xl font-semibold mb-4 text-green-400">About BulSU Space</h2>
      <div className="space-y-4">
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-medium text-green-300 mb-2">Our Mission</h3>
          <p className="text-gray-300 text-sm leading-relaxed">
            BulSU Space aims to provide a dedicated online platform for the Bulacan State University community, 
            fostering academic collaboration, professional networking, and social connection among students, 
            faculty, and alumni.
          </p>
        </div>
        
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-medium text-green-300 mb-2">Version Information</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-400">Platform Version:</div>
            <div className="text-gray-300">3.1.1</div>
            <div className="text-gray-400">Released:</div>
            <div className="text-gray-300">May 15, 2025</div>
            <div className="text-gray-400">Last Updated:</div>
            <div className="text-gray-300">May 29, 2025</div>
          </div>
        </div>
        
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 space-y-3">
          <h3 className="text-lg font-medium text-green-300 mb-2">Terms & Policies</h3>

          {/* Terms summary (expanded by default) */}
          <div className={`p-3 rounded border ${aboutTermsOpen ? 'border-green-600/30 bg-gray-800' : 'border-gray-700 bg-gray-800/30'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <DocumentTextIcon className="h-5 w-5 text-green-400" />
                <div>
                  <div className="text-sm font-medium text-green-200">Terms of Service</div>
                  <div className="text-xs text-gray-400">Short summary: rules for using BulSU Space, user responsibilities, and university policies.</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowTermsModal(true)} className="text-green-400 text-xs bg-transparent hover:text-green-300 hover:underline px-1">View full</button>
                <button onClick={() => setAboutTermsOpen((v) => !v)} className="text-gray-300 text-xs bg-transparent hover:text-gray-200 px-1">{aboutTermsOpen ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            {aboutTermsOpen && (
              <p className="text-gray-300 text-xs mt-3">These Terms govern acceptable use, content ownership, and limitations of liability; they are enforceable by the University and you must accept them to continue using the Service.</p>
            )}
          </div>

          {/* Privacy summary (expanded by default) */}
          <div className={`p-3 rounded border ${aboutPrivacyOpen ? 'border-green-600/30 bg-gray-800' : 'border-gray-700 bg-gray-800/30'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheckIcon className="h-5 w-5 text-green-400" />
                <div>
                  <div className="text-sm font-medium text-green-200">Privacy Policy</div>
                  <div className="text-xs text-gray-400">Short summary: what minimal data we collect, why, and your choices and rights.</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowPrivacyModal(true)} className="text-green-400 text-xs bg-transparent hover:text-green-300 hover:underline px-1">View full</button>
                <button onClick={() => setAboutPrivacyOpen((v) => !v)} className="text-gray-300 text-xs bg-transparent hover:text-gray-200 px-1">{aboutPrivacyOpen ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            {aboutPrivacyOpen && (
              <p className="text-gray-300 text-xs mt-3">We only require minimal registrarâ€‘verified fields for account creation (Name, ID, Department). You can control optional profile fields and request corrections or deletion per institutional policy.</p>
            )}
          </div>

          {/* Community guidelines summary (expanded by default) */}
          <div className={`p-3 rounded border ${aboutGuidelinesOpen ? 'border-green-600/30 bg-gray-800' : 'border-gray-700 bg-gray-800/30'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <UserCircleIcon className="h-5 w-5 text-green-400" />
                <div>
                  <div className="text-sm font-medium text-green-200">Community Guidelines</div>
                  <div className="text-xs text-gray-400">Short summary: respectful conduct, no harassment, and academic integrity expectations.</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowGuidelinesModal(true)} className="text-green-400 text-xs bg-transparent hover:text-green-300 hover:underline px-1">Learn more</button>
                <button onClick={() => setAboutGuidelinesOpen((v) => !v)} className="text-gray-300 text-xs bg-transparent hover:text-gray-200 px-1">{aboutGuidelinesOpen ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            {aboutGuidelinesOpen && (
              <p className="text-gray-300 text-xs mt-3">Be respectful, avoid abusive language or harassment, and follow university academic conduct rules when posting or messaging on the platform.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );  const renderNotificationSettings = () => (
    <div className="bg-gray-950/80 backdrop-blur-md rounded-xl p-6 shadow-xl border border-gray-800/30">
      <h2 className="text-xl font-semibold mb-6 text-green-400">Notifications and Sounds</h2>
      <NotificationSoundSettings />
    </div>
  );

  const renderActivityLogsSettings = () => {
    // Show a login prompt if user is not authenticated
    if (!currentUser) {
      return (
        <div className="bg-gray-900 rounded-lg p-5 shadow-lg border border-red-700/30 text-center">
          <ExclamationCircleIcon className="h-12 w-12 mx-auto text-red-500 mb-3" />
          <h2 className="text-xl font-semibold mb-4 text-red-400">Authentication Required</h2>
          <p className="text-gray-300 text-sm mb-6">
            You need to be logged in to view your activity logs. Please log in to access this feature.
          </p>
        </div>
      );
    }
    
    return (
      <div className="bg-gray-900 rounded-lg p-4 sm:p-5 shadow-lg border border-green-700/30">
        <h2 className="text-xl font-semibold mb-2 text-green-400 flex items-center">
          <ClockIcon className="h-6 w-6 mr-2 text-green-400" />
          Activity Logs
        </h2>
        <p className="text-gray-300 text-sm mb-6">
          Track all your activities, security events, and platform interactions. This helps you monitor your account security and understand how you use the platform.
        </p>
        
        {/* Enhanced description for better user understanding */}
        <div className="bg-gray-800/50 p-3 rounded-lg mb-6 border border-gray-700">
          <h3 className="text-sm font-medium text-gray-200 mb-2">Why Activity Logs Matter</h3>
          <ul className="text-xs text-gray-400 space-y-1 list-disc pl-4">
            <li>Monitor security events like logins from new devices</li>
            <li>Track your content activities like posts and comments</li>
            <li>See your file operations including uploads and downloads</li>
            <li>Review group and message interactions</li>
          </ul>
        </div>
        
        <ActivityLogsDisplay maxLogs={100} showFilters={true} showStats={true} />
      </div>
    );
  };
    
    // Name Change Confirmation Modal
  const renderNameChangeConfirmationModal = () => (
    (typeof document !== 'undefined') ? ReactDOM.createPortal(
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowNameChangeConfirmation(false)}>
        <div
          className="relative bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900 rounded-2xl shadow-2xl border border-yellow-600/40 p-6 max-w-md w-full mx-4"
          onClick={(e) => e.stopPropagation()}
          role="dialog" aria-modal="true" aria-labelledby="confirm-name-change-title"
        >
          <h3 id="confirm-name-change-title" className="text-xl font-bold text-yellow-400 mb-4">
            Confirm Name Change
          </h3>
          <p className="text-gray-300 mb-4">
            Change name from <span className="font-semibold text-white">{originalName || 'N/A'}</span> to{' '}
            <span className="font-semibold text-white">{newName || 'N/A'}</span>?
          </p>
          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 mb-5 text-xs text-yellow-200">
            <p className="font-semibold mb-1">Important</p>
            <p>This action is logged and cannot be undone. Make sure spelling and formatting are correct.</p>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowNameChangeConfirmation(false)}
              className="px-4 py-2 rounded-md font-medium bg-gray-700/70 hover:bg-gray-600 text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                setShowNameChangeConfirmation(false);
                await saveProfileChanges();
                // Start cooldown immediately
                const now = new Date();
                setLastNameChange(now);
                setCanChangeName(false);
                setDaysUntilNameChange(14);
              }}
              className="px-4 py-2 rounded-md font-medium bg-yellow-600 hover:bg-yellow-700 text-white shadow-lg shadow-yellow-600/20 transition-colors"
            >
              Confirm
            </button>
          </div>
          <span className="absolute -top-2 -right-2 h-3 w-3 rounded-full bg-yellow-400/70 blur-sm animate-pulse" />
          <span className="absolute bottom-3 left-3 h-2 w-2 rounded-full bg-yellow-500/40 animate-float" />
        </div>
      </div>,
      document.body
    ) : null
  );
  
  // Function to handle section changes with mobile navigation support
  const handleSectionChange = (section: SettingsSection) => {
    setActiveSection(section);
    
    // On mobile, show the content panel when a section is selected
    if (isMobileView) {
      setShowContentOnMobile(true);
    }
  };
  
  // Function to go back to the section list on mobile
  const handleBackToSections = () => {
    setShowContentOnMobile(false);
  };

  // Render Toast Notification
  const renderToast = () => {
    if (!showToast) return null;
    
    return (
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg bg-green-600 text-white">
        {toastMessage}
      </div>
    );
  };

  // Hide toast after 4 seconds
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false);
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  return (
    <MainLayout>
      {showPasswordModal && renderPasswordModal()}
      {showPasswordSuccessModal && renderPasswordSuccessModal()}
      {showNameChangeConfirmation && renderNameChangeConfirmationModal()}
      {renderToast()}
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-green-400 mb-6">Account Settings</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar Navigation - Fixed positioning */}
          {/* On mobile: If showContentOnMobile is false, show the sidebar navigation, otherwise hide it */}
          {/* On desktop: Always show the sidebar navigation */}          <div className={`md:col-span-1 ${isMobileView && showContentOnMobile ? 'hidden' : 'block'}`}>
            <div className="sticky top-4 bg-gray-950/80 backdrop-blur-md max-h-[calc(100vh-2rem)] overflow-y-auto scrollbar-thin mobile-scrollbar-hide p-4 rounded-xl border border-gray-800/30 shadow-xl">
              <div className="space-y-3">
                {/* Profile Button (hidden for admin / super admin) */}
                {!isPrivilegedUser && (
                <button 
                  onClick={() => handleSectionChange('profile')}
                  className={`group flex items-center justify-between w-full px-5 py-4 rounded-xl text-left transition-all duration-300 bg-transparent ${
                    !isMobileView && activeSection === 'profile' 
                      ? 'bg-gradient-to-r from-gray-800/80 to-gray-700/30 text-white shadow-md' 
                      : isMobileView 
                        ? 'text-gray-200' 
                        : 'hover:bg-gray-800/40 text-gray-300'
                  }`}
                >
                  <span className="flex items-center">
                    <UserCircleIcon className={`h-6 w-6 mr-4 transition-all duration-300 ${
                      !isMobileView && activeSection === 'profile' 
                        ? 'text-green-400' 
                        : 'text-gray-400 group-hover:text-gray-300'
                    }`} />
                    <span className="text-base font-medium">Profile Information</span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 text-gray-500 group-hover:text-gray-400 transition-all duration-300" />
                </button>
                )}
                
                {/* Security Button */}
                <button 
                  onClick={() => handleSectionChange('security')}
                  className={`group flex items-center justify-between w-full px-5 py-4 rounded-xl text-left transition-all duration-300 bg-transparent ${
                    !isMobileView && activeSection === 'security' 
                      ? 'bg-gradient-to-r from-gray-800/80 to-gray-700/30 text-white shadow-md' 
                      : isMobileView 
                        ? 'text-gray-200' 
                        : 'hover:bg-gray-800/40 text-gray-300'
                  }`}
                >
                  <span className="flex items-center">
                    <KeyIcon className={`h-6 w-6 mr-4 transition-all duration-300 ${
                      !isMobileView && activeSection === 'security' 
                        ? 'text-green-400' 
                        : 'text-gray-400 group-hover:text-gray-300'
                    }`} />
                    <span className="text-base font-medium">Account Security</span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 text-gray-500 group-hover:text-gray-400 transition-all duration-300" />
                </button>
                
                {/* Notifications Button */}
                <button 
                  onClick={() => handleSectionChange('notifications')}
                  className={`group flex items-center justify-between w-full px-5 py-4 rounded-xl text-left transition-all duration-300 bg-transparent ${
                    !isMobileView && activeSection === 'notifications' 
                      ? 'bg-gradient-to-r from-gray-800/80 to-gray-700/30 text-white shadow-md' 
                      : isMobileView 
                        ? 'text-gray-200' 
                        : 'hover:bg-gray-800/40 text-gray-300'
                  }`}
                >
                  <span className="flex items-center">                    <SpeakerWaveIcon className={`h-6 w-6 mr-4 transition-all duration-300 ${
                      !isMobileView && activeSection === 'notifications' 
                        ? 'text-green-400' 
                        : 'text-gray-400 group-hover:text-gray-300'
                    }`} />
                    <span className="text-base font-medium">Notifications and Sounds</span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 text-gray-500 group-hover:text-gray-400 transition-all duration-300" />
                </button>
                
                {/* Privacy Button */}
                <button 
                  onClick={() => handleSectionChange('privacy')}
                  className={`group flex items-center justify-between w-full px-5 py-4 rounded-xl text-left transition-all duration-300 bg-transparent ${
                    !isMobileView && activeSection === 'privacy' 
                      ? 'bg-gradient-to-r from-gray-800/80 to-gray-700/30 text-white shadow-md' 
                      : isMobileView 
                        ? 'text-gray-200' 
                        : 'hover:bg-gray-800/40 text-gray-300'
                  }`}
                >
                  <span className="flex items-center">
                    <ShieldCheckIcon className={`h-6 w-6 mr-4 transition-all duration-300 ${
                      !isMobileView && activeSection === 'privacy' 
                        ? 'text-green-400' 
                        : 'text-gray-400 group-hover:text-gray-300'
                    }`} />
                    <span className="text-base font-medium">Data Privacy</span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 text-gray-500 group-hover:text-gray-400 transition-all duration-300" />
                </button>
                
                {/* Activity Logs Button */}
                <button 
                  onClick={() => handleSectionChange('activity')}
                  className={`group flex items-center justify-between w-full px-5 py-4 rounded-xl text-left transition-all duration-300 bg-transparent ${
                    !isMobileView && activeSection === 'activity' 
                      ? 'bg-gradient-to-r from-gray-800/80 to-gray-700/30 text-white shadow-md' 
                      : isMobileView 
                        ? 'text-gray-200' 
                        : 'hover:bg-gray-800/40 text-gray-300'
                  }`}
                >
                  <span className="flex items-center">
                    <ClockIcon className={`h-6 w-6 mr-4 transition-all duration-300 ${
                      !isMobileView && activeSection === 'activity' 
                        ? 'text-green-400' 
                        : 'text-gray-400 group-hover:text-gray-300'
                    }`} />
                    <span className="text-base font-medium">Activity Logs</span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 text-gray-500 group-hover:text-gray-400 transition-all duration-300" />
                </button>
                
                {/* Help Button */}
                <button 
                  onClick={() => handleSectionChange('help')}
                  className={`group flex items-center justify-between w-full px-5 py-4 rounded-xl text-left transition-all duration-300 bg-transparent ${
                    !isMobileView && activeSection === 'help' 
                      ? 'bg-gradient-to-r from-gray-800/80 to-gray-700/30 text-white shadow-md' 
                      : isMobileView 
                        ? 'text-gray-200' 
                        : 'hover:bg-gray-800/40 text-gray-300'
                  }`}
                >
                  <span className="flex items-center">
                    <QuestionMarkCircleIcon className={`h-6 w-6 mr-4 transition-all duration-300 ${
                      !isMobileView && activeSection === 'help' 
                        ? 'text-green-400' 
                        : 'text-gray-400 group-hover:text-gray-300'
                    }`} />
                    <span className="text-base font-medium">Help & Support</span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 text-gray-500 group-hover:text-gray-400 transition-all duration-300" />
                </button>
                
                {/* About Button */}
                <button 
                  onClick={() => handleSectionChange('about')}
                  className={`group flex items-center justify-between w-full px-5 py-4 rounded-xl text-left transition-all duration-300 bg-transparent ${
                    !isMobileView && activeSection === 'about' 
                      ? 'bg-gradient-to-r from-gray-800/80 to-gray-700/30 text-white shadow-md' 
                      : isMobileView 
                        ? 'text-gray-200' 
                        : 'hover:bg-gray-800/40 text-gray-300'
                  }`}
                >
                  <span className="flex items-center">
                    <InformationCircleIcon className={`h-6 w-6 mr-4 transition-all duration-300 ${
                      !isMobileView && activeSection === 'about' 
                        ? 'text-green-400' 
                        : 'text-gray-400 group-hover:text-gray-300'
                    }`} />
                    <span className="text-base font-medium">About</span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 text-gray-500 group-hover:text-gray-400 transition-all duration-300" />
                </button>
              </div>
              
              {/* Divider */}
              <div className="my-4 border-t border-gray-800/50"></div>
              
              {/* Sign Out Button */}
              <button 
                onClick={handleLogout}
                className="group flex items-center w-full px-5 py-4 rounded-xl text-left transition-all duration-300 bg-transparent text-red-400 hover:text-red-300 hover:bg-gray-800/40"
              >
                <ArrowRightOnRectangleIcon className="h-6 w-6 mr-4 text-red-400 group-hover:text-red-300 transition-all duration-300" />
                <span className="text-base font-medium">Sign out</span>
              </button>
            </div>
          </div>
          
          {/* Content Area */}
          {/* On mobile: If showContentOnMobile is true, show the content, otherwise hide it */}
          {/* On desktop: Always show the content */}
          <div className={`md:col-span-3 ${isMobileView && !showContentOnMobile ? 'hidden' : 'block'}`}>            {/* Mobile Back Button */}
            {isMobileView && showContentOnMobile && (
              <button 
                onClick={handleBackToSections}
                className="mb-6 flex items-center px-4 py-2 rounded-lg bg-gray-900/50 text-gray-300 hover:text-white transition-all duration-300 border border-gray-800/30"
              >
                <ChevronLeftIcon className="h-5 w-5 mr-2" />
                <span className="font-medium">Back to Settings</span>
              </button>
            )}
            
            {/* Content Sections */}
            {activeSection === 'profile' && renderProfileSettings()}
            {activeSection === 'security' && renderSecuritySettings()}
            {activeSection === 'notifications' && renderNotificationSettings()}
            {activeSection === 'privacy' && renderDataPrivacySettings()}
            {activeSection === 'activity' && renderActivityLogsSettings()}
            {activeSection === 'help' && renderHelpContent()}
            {activeSection === 'about' && renderAboutContent()}
          </div>
        </div>
      </div>
      
      {/* Biometric Terms Modal */}
  {/* About modals (Terms & Privacy) */}
  <TermsAndConditionsModal isOpen={showTermsModal} onClose={() => setShowTermsModal(false)} viewOnly={true} />
  <PrivacyPolicyModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} viewOnly={true} />
  <CommunicationGuidelinesModal isOpen={showGuidelinesModal} onClose={() => setShowGuidelinesModal(false)} />
    </MainLayout>
  );
};

export default SettingsPage;

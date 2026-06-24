import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSidebar } from '../../contexts/SidebarContext';
import { sidebarSections } from '../../data/sidebarSections';
import { navItems } from '../../data/navItems';
import { AcademicTerm, Group, SidebarSection } from '../../types';
import { Event as EventServiceEvent } from '../../services/eventService';
import toast from 'react-hot-toast';
import { getUpcomingEvents, createEvent, EventCategory } from '../../services/eventService';
import { getGroups, getUserGroupsRealtime, getGroupMembers, joinGroup, Group as SpaceGroup } from '../../services/groupService';
import { 
  createAcademicEvent, 
  getUpcomingAcademicEvents, 
  AcademicEvent 
} from '../../services/academicCalendarService';
import UsersYouMayKnow from '../sidebar/UsersYouMayKnow';

import { Timestamp } from 'firebase/firestore';
import { activityLogger } from '../../services/activityLogService';
import ConfirmDialog from '../common/ConfirmDialog';

// Local interface for sidebar events (simplified from the full Event interface)
interface SidebarEvent {
  id: string;
  title: string;
  date: string;
  image: string;
  // description intentionally omitted for compact sidebar display
}

// FAQ data structure organized by categories
const faqData = [
  {
    id: 1,
    category: "Account",
    icon: "account_circle",
    questions: [
      {
        id: 101,
        question: "How do I reset my password?",
        answer: "Go to Settings > Account Security and select 'Change Password'. Enter your current and new password. If you forgot your password, use the 'Forgot Password' link on the login page to receive a reset email."
      },
      {
        id: 102,
        question: "How do I change my profile picture?",
        answer: "Go to your profile page, click your profile picture, and select 'Update Profile Picture'. You can upload a new image or choose a default avatar. Changes are saved instantly."
      },
      {
        id: 103,
        question: "How can I update my academic information?",
        answer: "Navigate to your profile, click 'Edit Profile', and update your department, major, and graduation year in the Academic Information section."
      }
    ]
  },
  {
    id: 2,
    category: "Spaces & Communities",
    icon: "group",
    questions: [
      {
        id: 201,
        question: "How do I join a space or group?",
        answer: "Go to the Spaces or Groups section, browse available options, and click 'Join'. For private groups, your request must be approved."
      },
      {
        id: 202,
        question: "How can I create a new space or group?",
        answer: "Navigate to the Spaces or Groups page and click 'Create New'. Fill in the details and set privacy options."
      },
      {
        id: 203,
        question: "How do I leave a space or group?",
        answer: "Visit the group or space page, click the menu (three dots), and select 'Leave'. You can rejoin most public spaces later."
      }
    ]
  },
  {
    id: 3,
    category: "Events & Calendar",
    icon: "event",
    questions: [
      {
        id: 301,
        question: "How can I add events to my calendar?",
        answer: "When viewing an event, click 'Add to Calendar'. All your saved events appear in the Calendar section of your profile."
      },
      {
        id: 302,
        question: "Can I create my own events?",
        answer: "Yes! Go to the Events page and click 'Create Event'. Fill in the details and choose public or private. Student organizations can create official events with approval."
      },
      {
        id: 303,
        question: "How do I set reminders for academic deadlines?",
        answer: "In the Academic Calendar, click the bell icon next to any deadline or event to set a reminder. You can customize notification times."
      }
    ]
  },
  {
    id: 4,
    category: "Platform Information",
    icon: "info",
    questions: [
      {
        id: 401,
        question: "What is BulSU Space?",
        answer: "BulSU Space is an academic social platform for the Bulacan State University community. It enables students, faculty, and staff to connect, collaborate, and stay informed about campus activities and resources."
      },
      {
        id: 402,
        question: "Who can access BulSU Space?",
        answer: "All current students, faculty, and staff with a valid BulSU email can access the platform. Alumni have limited access. Each user role has specific permissions."
      },
      {
        id: 403,
        question: "Is BulSU Space available on mobile devices?",
        answer: "Yes! BulSU Space is fully responsive and works on all devices. You can also download our mobile apps from the Apple App Store or Google Play Store."
      }
    ]
  },
  {
    id: 5,
    category: "Security & Moderation",
    icon: "security",
    questions: [
      {
        id: 501,
        question: "How does content moderation work?",
        answer: "All posts, comments, and messages are checked for profanity and harmful content using AI and local filters. Inappropriate content is blocked or flagged for review. You can also report content manually using the three dots menu."
      },
      {
        id: 502,
        question: "How is my privacy protected?",
        answer: "Your data is protected by strict security rules and encrypted in Firebase. You control your profile visibility and can download or delete your data anytime in Settings > Data Privacy. The platform follows university and legal privacy standards."
      }
    ]
  },
  {
    id: 6,
    category: "Support & Help",
    icon: "support",
    questions: [
      {
        id: 601,
        question: "Who can I contact for support?",
        answer: "For technical issues, email support@bulsuspace.edu or visit the Help Center. For content or moderation concerns, use the report feature or email community@bulsu.edu.ph."
      },
      {
        id: 602,
        question: "How do I report inappropriate content?",
        answer: "Click the three dots next to any post, comment, or message and select 'Report'. Fill in the required information and our moderation team will review it."
      },
      {
        id: 603,
        question: "Where can I submit feature suggestions?",
        answer: "We welcome your ideas! Use the Feedback form in the Help Center or email features@bulsu.edu.ph with your suggestions."
      }
    ]
  }
];

const DesktopSidebar: React.FC = () => {
  // FAQ data structure organized by categories
  const faqData = [
    {
      id: 1,
      category: "Account",
      icon: "account_circle",
      questions: [
        {
          id: 101,
          question: "How do I reset my password?",
          answer: "Go to Settings > Account Security and select 'Change Password'. Enter your current and new password. If you forgot your password, use the 'Forgot Password' link on the login page to receive a reset email."
        },
        {
          id: 102,
          question: "How do I change my profile picture?",
          answer: "Go to your profile page, click your profile picture, and select 'Update Profile Picture'. You can upload a new image or choose a default avatar. Changes are saved instantly."
        },
        {
          id: 103,
          question: "How can I update my academic information?",
          answer: "Navigate to your profile, click 'Edit Profile', and update your department, major, and graduation year in the Academic Information section."
        }
      ]
    },
    {
      id: 2,
      category: "Spaces & Communities",
      icon: "group",
      questions: [
        {
          id: 201,
          question: "How do I join a space or group?",
          answer: "Go to the Spaces or Groups section, browse available options, and click 'Join'. For private groups, your request must be approved."
        },
        {
          id: 202,
          question: "How can I create a new space or group?",
          answer: "Navigate to the Spaces or Groups page and click 'Create New'. Fill in the details and set privacy options."
        },
        {
          id: 203,
          question: "How do I leave a space or group?",
          answer: "Visit the group or space page, click the menu (three dots), and select 'Leave'. You can rejoin most public spaces later."
        }
      ]
    },
    {
      id: 3,
      category: "Events & Calendar",
      icon: "event",
      questions: [
        {
          id: 301,
          question: "How can I add events to my calendar?",
          answer: "When viewing an event, click 'Add to Calendar'. All your saved events appear in the Calendar section of your profile."
        },
        {
          id: 302,
          question: "Can I create my own events?",
          answer: "Yes! Go to the Events page and click 'Create Event'. Fill in the details and choose public or private. Student organizations can create official events with approval."
        },
        {
          id: 303,
          question: "How do I set reminders for academic deadlines?",
          answer: "In the Academic Calendar, click the bell icon next to any deadline or event to set a reminder. You can customize notification times."
        }
      ]
    },
    {
      id: 4,
      category: "Platform Information",
      icon: "info",
      questions: [
        {
          id: 401,
          question: "What is BulSU Space?",
          answer: "BulSU Space is an academic social platform for the Bulacan State University community. It enables students, faculty, and staff to connect, collaborate, and stay informed about campus activities and resources."
        },
        {
          id: 402,
          question: "Who can access BulSU Space?",
          answer: "All current students, faculty, and staff with a valid BulSU email can access the platform. Alumni have limited access. Each user role has specific permissions."
        },
        {
          id: 403,
          question: "Is BulSU Space available on mobile devices?",
          answer: "Yes! BulSU Space is fully responsive and works on all devices. You can also download our mobile apps from the Apple App Store or Google Play Store."
        }
      ]
    },
    {
      id: 5,
      category: "Security & Moderation",
      icon: "security",
      questions: [
        {
          id: 501,
          question: "How does content moderation work?",
          answer: "All posts, comments, and messages are checked for profanity and harmful content using AI and local filters. Inappropriate content is blocked or flagged for review. You can also report content manually using the three dots menu."
        },
        {
          id: 502,
          question: "How is my privacy protected?",
          answer: "Your data is protected by strict security rules and encrypted in Firebase. You control your profile visibility and can download or delete your data anytime in Settings > Data Privacy. The platform follows university and legal privacy standards."
        }
      ]
    },
    {
      id: 6,
      category: "Support & Help",
      icon: "support",
      questions: [
        {
          id: 601,
          question: "Who can I contact for support?",
          answer: "For technical issues, email support@bulsuspace.edu or visit the Help Center. For content or moderation concerns, use the report feature or email community@bulsu.edu.ph."
        },
        {
          id: 602,
          question: "How do I report inappropriate content?",
          answer: "Click the three dots next to any post, comment, or message and select 'Report'. Fill in the required information and our moderation team will review it."
        },
        {
          id: 603,
          question: "Where can I submit feature suggestions?",
          answer: "We welcome your ideas! Use the Feedback form in the Help Center or email features@bulsu.edu.ph with your suggestions."
        }
      ]
    }
  ];

  const { currentUser } = useAuth();
  const { isOpen, toggleSidebar, mobileOverlayOpen, closeMobileOverlay, toggleMobileOverlay } = useSidebar();

  // Local panel visibility for animation (so we can animate out before unmount)
  const [panelVisible, setPanelVisible] = useState(false);
  const navigate = useNavigate();
  // Determine if user is alumni or admin (loosen type check)
  const roleStr = ((currentUser?.role as string) || '').toLowerCase().trim();
  const isAlumni = roleStr === 'alumni';
  const isSuperAdmin = roleStr === 'super admin';
  const isAdmin = roleStr === 'admin';
  // More robust check: detect registrar by role string or by assigned office (some admin users store office='Registrar')
  const officeStr = ((currentUser?.office as string) || '').toLowerCase().trim();
  const isAdminRegistrar = roleStr.includes('registrar') || officeStr.includes('registrar');

  // Filter sidebar sections based on user role
  const filteredSidebarSections = sidebarSections.filter((section) => {
    if (isAdminRegistrar) {
      // Admin registrar should not see Recommended Spaces
      return section.title !== 'Recommended Spaces';
    }

    if (isAlumni) {
      // For alumni: show academic calendar and upcoming events
      return true;
    }

    if (isSuperAdmin || isAdmin) {
      // For super admin or admin: customize visible sections
      return section.title !== 'Recommended Groups' && section.title !== 'Recommended Spaces';
    }

    // For other roles: show all sections
    return true;
  });

  const [activeSection, setActiveSection] = useState<number | null>(null);
  const [showCreateAcademicEventModal, setShowCreateAcademicEventModal] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState<SidebarEvent[]>([]);
  
  // Recommended spaces (groups)
  const [recommendedSpaces, setRecommendedSpaces] = useState<SpaceGroup[]>([]);
  const [loadingSpaces, setLoadingSpaces] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [academicEvents, setAcademicEvents] = useState<AcademicEvent[]>([]);
  const [loadingAcademicEvents, setLoadingAcademicEvents] = useState(false);
  // Prevent duplicate submissions when creating academic events
  const [creatingAcademicEvent, setCreatingAcademicEvent] = useState(false);
  // Academic event details modal state
  const [selectedAcademicEvent, setSelectedAcademicEvent] = useState<AcademicEvent | null>(null);
  const [showAcademicEventDetails, setShowAcademicEventDetails] = useState(false);
  const [pendingSpaceVisit, setPendingSpaceVisit] = useState<SpaceGroup | null>(null);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [joiningSpaceId, setJoiningSpaceId] = useState<string | null>(null);

  // Focus and keyboard handling for mobile overlay
  useEffect(() => {
    let timer: number | undefined;
    const closeOnEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseMobileOverlay();
      }
    };

    if (mobileOverlayOpen) {
      // show panel (enter)
      setPanelVisible(true);
      document.addEventListener('keydown', closeOnEsc);

      // Focus close button for keyboard users after the panel is visible
      timer = window.setTimeout(() => {
        const closeBtn = document.getElementById('mobile-sidebar-close') as HTMLButtonElement | null;
        if (closeBtn) closeBtn.focus();
      }, 120);
    }

    return () => {
      document.removeEventListener('keydown', closeOnEsc);
      if (timer) clearTimeout(timer);
    };
  }, [mobileOverlayOpen, closeMobileOverlay]);

  // Close handler that plays slide-out animation then calls context close
  const handleCloseMobileOverlay = () => {
    // start slide-out
    setPanelVisible(false);
    // after animation completes, call context close
    window.setTimeout(() => {
      closeMobileOverlay();
    }, 300); // matches tailwind duration-300
  };

  // Academic event creation form state
  const [academicEventForm, setAcademicEventForm] = useState({
    title: '',
    startDate: '',
    endDate: '',
    isDateRange: false // true for date range, false for single date
  });

  // Ref for scrolling
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const sectionRefs = sidebarSections.map(() => React.createRef<HTMLDivElement>());

  // Quick link to Space News - small unobtrusive block near top
  const renderSpaceNewsQuickLink = () => (
    <div className="mb-4 px-3">
      <button
        onClick={() => navigate('/space-news')}
        className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-900/50 hover:bg-gray-900/60 border border-transparent hover:border-green-700/30 transition"
      >
        <span className="material-symbols-outlined text-green-400">newspaper</span>
        <div>
          <div className="text-sm text-white font-semibold">Space News</div>
          <div className="text-xs text-gray-400">Latest campus updates</div>
        </div>
      </button>
    </div>
  );

  // When sidebar closes, remove highlight
  useEffect(() => {
    if (!isOpen && activeSection !== null) {
      setActiveSection(null);
    }
  }, [isOpen, activeSection]);

  // Load friend suggestions when component mounts or user changes
  

  // Load recommended spaces (top public groups user is not a member of)
  useEffect(() => {
    const loadSpaces = async () => {
      if (!currentUser?.id) return;
      setLoadingSpaces(true);
      try {
        // Get all groups (could be optimized with a dedicated query or cloud function if large)
        const all = await getGroups();
        // We'll get user's groups via realtime util once to filter membership
        const userGroupIds = new Set<string>();
  const unsubscribe = getUserGroupsRealtime(currentUser.id, async (myGroups) => {
          myGroups.forEach(g => userGroupIds.add(g.id));
          // Filter out private groups and groups user already joined
          const candidates = all.filter(g => !g.isPrivate && !userGroupIds.has(g.id));

          // If user has a department, prioritize spaces that have members from the same department
          const dept = currentUser.department ? String(currentUser.department).toLowerCase() : null;

          const deptMatches: SpaceGroup[] = [];
          const others: SpaceGroup[] = [];

          // Fetch members for each candidate and check department match
          // Use Promise.allSettled so one failing group doesn't break the whole flow
          const memberPromises = candidates.map(async (g) => {
            try {
              const members = await getGroupMembers(g.id);
              const hasSameDept = dept && members.some(m => m.user?.department && String(m.user.department).toLowerCase() === dept);
              return { group: g, hasSameDept };
            } catch (err) {
              // If fetching members fails, treat as non-matching and continue
              return { group: g, hasSameDept: false };
            }
          });

          const results = await Promise.all(memberPromises);
          for (const r of results) {
            if (r.hasSameDept) deptMatches.push(r.group);
            else others.push(r.group);
          }

          // Sort both arrays by memberCount desc
          const sortByMembers = (a: SpaceGroup, b: SpaceGroup) => (b.memberCount || 0) - (a.memberCount || 0);
          deptMatches.sort(sortByMembers);
          others.sort(sortByMembers);

          // Build final list prioritizing dept matches but ensuring at most 5
          const finalList: SpaceGroup[] = [];
          for (const g of deptMatches) {
            if (finalList.length >= 5) break;
            finalList.push(g);
          }
          for (const g of others) {
            if (finalList.length >= 5) break;
            finalList.push(g);
          }

          setRecommendedSpaces(finalList);
          setLoadingSpaces(false);
          // We only need initial membership snapshot here; unsubscribe after first update
          unsubscribe();
        });
      } catch (e) {
        console.error('Error loading recommended spaces:', e);
        setRecommendedSpaces([]);
        setLoadingSpaces(false);
      }
    };
    loadSpaces();
  }, [currentUser?.id]);

  // Load upcoming events for sidebar
  useEffect(() => {
    const loadUpcomingEvents = async () => {
      setLoadingEvents(true);
      try {
        // Get all upcoming events from database
        const allUpcomingEvents = await getUpcomingEvents();
        
        // Current date for comparison
        const currentDate = new Date();

        // Separate events into those within 7 days and those later
        const within7Days: EventServiceEvent[] = [];
        const laterEvents: EventServiceEvent[] = [];
        for (const event of allUpcomingEvents) {
          const eventStartDate = event.start.toDate();
            const daysDifference = Math.ceil((eventStartDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysDifference >= 0 && daysDifference <= 7) {
              within7Days.push(event);
            } else if (daysDifference >= 0) {
              // Still an upcoming event but outside 7 day window
              laterEvents.push(event);
            }
        }

        // Sort both groups by start date ascending
        const sortByStart = (a: EventServiceEvent, b: EventServiceEvent) => a.start.toDate().getTime() - b.start.toDate().getTime();
        within7Days.sort(sortByStart);
        laterEvents.sort(sortByStart);

        // Build the list prioritizing events within 7 days, but ensure at least 3 total if available
        const selected: EventServiceEvent[] = [];
        for (const e of within7Days) {
          if (selected.length < 3) selected.push(e);
        }
        if (selected.length < 3) {
          for (const e of laterEvents) {
            if (selected.length >= 3) break;
            selected.push(e);
          }
        }

        // If still less than 3 (because total upcoming events < 3), just use whatever we have (already selected)

        const sidebarEvents = selected.map((event: EventServiceEvent) => ({
          id: event.id,
          title: event.title,
          date: event.start.toDate().toISOString().split('T')[0],
          image: event.coverImage,
          // description intentionally omitted for compact sidebar display
        }));

        setUpcomingEvents(sidebarEvents);
      } catch (error) {
        console.error('Error loading upcoming events:', error);
        setUpcomingEvents([]);
      } finally {
        setLoadingEvents(false);
      }
    };

    loadUpcomingEvents();
  }, []);

  // Load academic events for academic calendar
  useEffect(() => {
    const loadAcademicEvents = async () => {
      setLoadingAcademicEvents(true);
      try {
        console.log('Loading academic events...');
        // Get all upcoming academic events from the acadCalendar collection
        const academicEventsData = await getUpcomingAcademicEvents();
        console.log('Academic events loaded:', academicEventsData);
        setAcademicEvents(academicEventsData);
      } catch (error) {
        console.error('Error loading academic events:', error);
        // Show user-friendly error message
        toast.error('Failed to load academic calendar events', {
          position: 'bottom-center',
          duration: 4000
        });
        setAcademicEvents([]);
      } finally {
        setLoadingAcademicEvents(false);
      }
    };

    loadAcademicEvents();
  }, []);

  

  // Enhanced scroll to section logic - works for any section with proper calculations
  useEffect(() => {
    if (
      isOpen &&
      activeSection !== null &&
      sectionRefs[activeSection]?.current &&
      scrollContainerRef.current
    ) {
      // Wait a brief moment for sidebar animation to complete
      const scrollTimeout = setTimeout(() => {
        const section = sectionRefs[activeSection].current;
        const container = scrollContainerRef.current;
        
        if (section && container) {
          // Get actual header height dynamically
          const sidebarHeader = container.parentElement?.querySelector('.sticky') as HTMLElement;
          const headerHeight = sidebarHeader ? sidebarHeader.offsetHeight : 64;
          
          // Calculate container and section positions
          const containerRect = container.getBoundingClientRect();
          const sectionRect = section.getBoundingClientRect();
          
          // Calculate section position relative to container
          const sectionTop = section.offsetTop;
          const containerScrollTop = container.scrollTop;
          const viewportHeight = container.clientHeight;
          
          // Calculate optimal scroll position
          // Center the section in view, or show from top if section is tall
          const sectionHeight = section.offsetHeight;
          let targetScrollTop;
          
          if (sectionHeight > viewportHeight - headerHeight) {
            // If section is taller than viewport, scroll to top of section
            targetScrollTop = sectionTop - headerHeight - 10; // 10px padding
          } else {
            // If section fits in viewport, center it
            const centerOffset = (viewportHeight - headerHeight - sectionHeight) / 2;
            targetScrollTop = sectionTop - headerHeight - centerOffset;
          }
          
          // Ensure we don't scroll past the container bounds
          const maxScroll = container.scrollHeight - container.clientHeight;
          targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));
          
          // Only scroll if the section is not already fully visible
          const sectionTopInView = sectionTop - containerScrollTop;
          const sectionBottomInView = sectionTopInView + sectionHeight;
          const isFullyVisible = sectionTopInView >= headerHeight && 
                                sectionBottomInView <= viewportHeight;
          
          if (!isFullyVisible) {
            container.scrollTo({
              top: targetScrollTop,
              behavior: 'smooth',
            });
          }
        }
      }, 300); // Wait for sidebar animation
      
      return () => clearTimeout(scrollTimeout);
    }
  }, [isOpen, activeSection]);

  // Handle sending friend request
  
  

  const renderAcademicCalendar = (events: AcademicEvent[]) => {
    // Optional debug logging removed to keep console clean
    
    // Function to format date for display
    const formatEventDate = (event: AcademicEvent) => {
      try {
        const startDate = event.startDate.toDate();
        const endDate = event.endDate.toDate();
        
        if (event.isDateRange) {
          const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
          const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
          return `${startFormatted} - ${endFormatted}`;
        } else {
          return startDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        }
      } catch (error) {
        console.error('Error formatting event date:', error, event);
        return 'Invalid date';
      }
    };

    // Function to get the appropriate icon based on event title
    const getEventIcon = (title: string) => {
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes('exam') || lowerTitle.includes('test')) return 'quiz';
      if (lowerTitle.includes('enrollment') || lowerTitle.includes('registration')) return 'how_to_reg';
      if (lowerTitle.includes('graduation') || lowerTitle.includes('commencement')) return 'school';
      if (lowerTitle.includes('holiday') || lowerTitle.includes('break')) return 'beach_access';
      if (lowerTitle.includes('deadline') || lowerTitle.includes('submission')) return 'schedule';
      if (lowerTitle.includes('orientation') || lowerTitle.includes('meeting')) return 'groups';
      if (lowerTitle.includes('semester') || lowerTitle.includes('term')) return 'calendar_view_month';
      return 'event_note'; // Default icon
    };
    
    return (
      <div>
        {/* Create Academic Event button and refresh for admins */}
        {(isAdmin || isSuperAdmin) && (
          <div className="mb-4 space-y-2">
            <button 
              onClick={() => setShowCreateAcademicEventModal(true)}
              className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm"
            >
              <span className="material-icons text-sm bg-transparent">add_circle</span>
              <span>Create Academic Event</span>
            </button>
            <button 
              onClick={async () => {
                setLoadingAcademicEvents(true);
                try {
                  console.log('Manually refreshing academic events...');
                  const academicEventsData = await getUpcomingAcademicEvents();
                  console.log('Academic events refreshed:', academicEventsData);
                  setAcademicEvents(academicEventsData);
                  toast.success('Academic calendar refreshed', {
                    position: 'bottom-center',
                    duration: 2000
                  });
                } catch (error) {
                  console.error('Error refreshing academic events:', error);
                  toast.error('Failed to refresh academic calendar', {
                    position: 'bottom-center',
                    duration: 4000
                  });
                } finally {
                  setLoadingAcademicEvents(false);
                }
              }}
              disabled={loadingAcademicEvents}
              className="w-full py-1.5 px-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-gray-300 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-xs"
            >
              <span className={`material-icons text-xs bg-transparent ${loadingAcademicEvents ? 'animate-spin' : ''}`}>
                {loadingAcademicEvents ? 'refresh' : 'refresh'}
              </span>
              <span>{loadingAcademicEvents ? 'Refreshing...' : 'Refresh Calendar'}</span>
            </button>
          </div>
        )}
        
        {/* Refresh button for non-admin users */}
        {!(isAdmin || isSuperAdmin) && (
          <div className="mb-4">
            <button 
              onClick={async () => {
                setLoadingAcademicEvents(true);
                try {
                  console.log('Manually refreshing academic events...');
                  const academicEventsData = await getUpcomingAcademicEvents();
                  console.log('Academic events refreshed:', academicEventsData);
                  setAcademicEvents(academicEventsData);
                  toast.success('Academic calendar refreshed', {
                    position: 'bottom-center',
                    duration: 2000
                  });
                } catch (error) {
                  console.error('Error refreshing academic events:', error);
                  toast.error('Failed to refresh academic calendar', {
                    position: 'bottom-center',
                    duration: 4000
                  });
                } finally {
                  setLoadingAcademicEvents(false);
                }
              }}
              disabled={loadingAcademicEvents}
              className="w-full py-1.5 px-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-gray-300 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-xs"
            >
              <span className={`material-icons text-xs bg-transparent ${loadingAcademicEvents ? 'animate-spin' : ''}`}>
                {loadingAcademicEvents ? 'refresh' : 'refresh'}
              </span>
              <span>{loadingAcademicEvents ? 'Refreshing...' : 'Refresh Calendar'}</span>
            </button>
          </div>
        )}
        
        {/* Academic Events Content */}
        {loadingAcademicEvents ? (
          <div className="space-y-3">
            {[1, 2, 3].map((_, index) => (
              <div key={index} className="flex gap-3 p-3 bg-gray-800/30 rounded-lg animate-pulse">
                <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center">
                  <div className="w-5 h-5 bg-gray-600 rounded"></div>
                </div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-700 rounded mb-2"></div>
                  <div className="h-3 bg-gray-700 rounded w-3/4"></div>
                </div>
              </div>
            ))}
          </div>
        ) : academicEvents.length > 0 ? (
          <div className="space-y-3">
            {academicEvents.map((event, index) => (
              <div
                key={event.id}
                className="flex items-center gap-3 p-3 mb-2 bg-gray-800/40 rounded-lg hover:bg-gray-800/60 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedAcademicEvent(event);
                  setShowAcademicEventDetails(true);
                }}
              >
                <span className="material-icons text-blue-400 text-xl bg-transparent flex-shrink-0">calendar_today</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-100 truncate">{event.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {formatEventDate(event)}
                  </div>
                </div>
                {(isAdmin || isSuperAdmin) && (
                  <button
                    className="p-1 ml-2 rounded hover:bg-red-700/20 text-red-400 hover:text-red-200 transition-all duration-200"
                    title="Delete academic event"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (window.confirm(`Are you sure you want to delete the academic event '${event.title}'? This action cannot be undone.`)) {
                        try {
                          console.log('Deleting academic event:', event.id);
                          const { deleteAcademicEvent, getUpcomingAcademicEvents } = await import('../../services/academicCalendarService');
                          await deleteAcademicEvent(event.id);
                          setLoadingAcademicEvents(true);
                          const academicEventsData = await getUpcomingAcademicEvents();
                          console.log('Academic events after deletion:', academicEventsData);
                          setAcademicEvents(academicEventsData);
                          setLoadingAcademicEvents(false);
                          toast.success('Academic event deleted successfully', {
                            position: 'bottom-center',
                            duration: 4000
                          });
                        } catch (err: any) {
                          console.error('Error deleting academic event:', err);
                          const errorMessage = err.message || 'Failed to delete academic event. Please try again.';
                          toast.error(errorMessage, {
                            position: 'bottom-center',
                            duration: 5000
                          });
                        }
                      }
                    }}
                  >
                    <span className="material-icons" style={{ fontSize: '18px', lineHeight: 1 }}>delete</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-400">
            <span className="material-icons text-4xl bg-transparent mb-2">calendar_today</span>
            <p className="text-sm">No academic events scheduled</p>
            <p className="text-xs text-gray-500 mt-1">
              {isAdmin || isSuperAdmin 
                ? 'Create academic events using the button above' 
                : 'Academic events created by administrators will appear here'
              }
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderEvents = (events: SidebarEvent[]) => (
    <div className="space-y-4">
      {events.map((event, index) => (
        <div 
          key={index} 
          className="group p-3 bg-gray-800/30 hover:bg-gray-800/50 rounded-lg transition-all duration-300 cursor-pointer"
          onClick={() => navigate(`/events?eventId=${event.id}`)}
        >
          <div className="flex gap-3">
            <img
              src={event.image}
              alt={event.title}
              className="w-16 h-16 rounded-lg object-cover ring-2 ring-gray-700 group-hover:ring-green-500/30"
            />
            <div>
              <h4 className="text-sm font-medium text-gray-200 group-hover:text-green-400 transition-colors duration-300">{event.title}</h4>
              <div className="flex items-center gap-2 mt-2">
                <span className="material-icons text-green-400 text-xs bg-transparent">event</span>
                <span className="text-xs text-gray-400">
                  {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderGroups = (groups: Group[]) => (
    <div className="space-y-3">
      {groups.map((group, index) => (
        <div key={index} className="flex items-center gap-3 p-3 bg-gray-800/30 hover:bg-gray-800/50 rounded-lg transition-all duration-300 group">
          <img
            src={group.image}
            alt={group.name}
            className="w-12 h-12 rounded-lg object-cover ring-2 ring-gray-700 group-hover:ring-gray-600"
          />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-gray-200 group-hover:text-gray-100 transition-colors duration-300">{group.name}</h4>
            <p className="text-xs text-gray-400">{group.members} members</p>
          </div>
          <button className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 rounded-lg transition-all duration-300 focus:outline-none focus:ring-0 bg-transparent">
            <span className="material-icons bg-transparent">arrow_outward</span>
          </button>
        </div>
      ))}
    </div>
  );

  const renderFriendSuggestions = (_friends: any[]) => {
    return null; // Friend suggestions disabled in desktop sidebar
  };

  const handleSpaceVisit = (space: SpaceGroup) => {
    if (space.isPrivate) {
      toast('This space requires a join code. You can enter it from the space page.');
      navigate(`/groups/${space.id}`);
      return;
    }
    setPendingSpaceVisit(space);
    setJoinDialogOpen(true);
  };

  const handleCancelJoinSpace = () => {
    if (joiningSpaceId) return;
    setJoinDialogOpen(false);
    setPendingSpaceVisit(null);
  };

  const handleConfirmJoinSpace = async () => {
    if (!pendingSpaceVisit) return;
    const space = pendingSpaceVisit;

    if (!currentUser?.id) {
      toast.error('Please sign in to join spaces.');
      setJoinDialogOpen(false);
      setPendingSpaceVisit(null);
      navigate('/signin');
      return;
    }

    setJoiningSpaceId(space.id);

    try {
      await joinGroup(currentUser.id, space.id);
      try {
        await activityLogger.logActivity(
          'space_joined',
          `Joined space: ${space.name}`,
          { spaceId: space.id, spaceName: space.name },
          'low',
          space.id,
          'space'
        );
      } catch (logError) {
        console.warn('Failed to record space join activity from sidebar', logError);
      }
      toast.success(`Joined ${space.name}`);
      setRecommendedSpaces(prev => prev.filter(item => item.id !== space.id));
      setJoinDialogOpen(false);
      setPendingSpaceVisit(null);
      navigate(`/groups/${space.id}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to join space. Please try again.';
      if (message.toLowerCase().includes('already a member')) {
        toast.success(`Opening ${space.name}`);
        setJoinDialogOpen(false);
        setPendingSpaceVisit(null);
        navigate(`/groups/${space.id}`);
      } else if (message.toLowerCase().includes('code')) {
        toast.error('This space requires a join code. Visit the Spaces page to enter the code.');
        setJoinDialogOpen(false);
        setPendingSpaceVisit(null);
        navigate('/groups');
      } else {
        toast.error(message);
      }
    } finally {
      setJoiningSpaceId(null);
    }
  };

  const renderRecommendedSpaces = (spaces: SpaceGroup[]) => (
    <div className="space-y-3">
      {spaces.map((space) => (
        <div
          key={space.id}
          className="flex items-center gap-3 p-3 bg-gray-800/30 hover:bg-gray-800/50 rounded-lg transition-all duration-300 group"
        >
          <img
            src={space.coverImage || '/images/space-coverimg.png'}
            alt={space.name}
            className="w-12 h-12 rounded-lg object-cover ring-2 ring-gray-700 group-hover:ring-gray-600"
          />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-gray-200 group-hover:text-gray-100 transition-colors duration-300">{space.name}</h4>
            <p className="text-xs text-gray-400">{space.memberCount || 0} members</p>
          </div>
          <button
            className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 rounded-lg transition-all duration-300 focus:outline-none focus:ring-0 bg-transparent disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={() => handleSpaceVisit(space)}
            disabled={joiningSpaceId === space.id}
            aria-label={`Open ${space.name}`}
          >
            <span className="material-icons bg-transparent">{joiningSpaceId === space.id ? 'hourglass_top' : 'arrow_outward'}</span>
          </button>
        </div>
      ))}
    </div>
  );

  // Handle input change for academic event form fields
  const handleAcademicEventFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setAcademicEventForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle academic event form submission
  const handleAcademicEventFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Guard: prevent duplicate submits
    if (creatingAcademicEvent) return;
    
    if (!currentUser?.id) {
      toast.error("You need to be logged in to create academic events", {
        position: 'bottom-center',
        duration: 4000
      });
      return;
    }
    
    // Validate form data
    if (!academicEventForm.title.trim()) {
      toast.error("Event title is required", {
        position: 'bottom-center',
        duration: 4000
      });
      return;
    }
    
    if (!academicEventForm.startDate) {
      toast.error("Start date is required", {
        position: 'bottom-center',
        duration: 4000
      });
      return;
    }
    
    if (academicEventForm.isDateRange && !academicEventForm.endDate) {
      toast.error("End date is required for date range events", {
        position: 'bottom-center',
        duration: 4000
      });
      return;
    }
    
    try {
      // Lock and close modal immediately after validation to prevent multi-clicks
      setCreatingAcademicEvent(true);
      setShowCreateAcademicEventModal(false);

      // Create start and end timestamps
      const startDateTime = new Date(`${academicEventForm.startDate}T09:00:00`); // Default to 9 AM
      const endDateTime = academicEventForm.endDate 
        ? new Date(`${academicEventForm.endDate}T17:00:00`) // Default to 5 PM if end date provided
        : new Date(`${academicEventForm.startDate}T17:00:00`); // Same day if no end date
      
      // Validate dates
      if (endDateTime < startDateTime) {
        toast.error("End date cannot be before start date", {
          position: 'bottom-center',
          duration: 4000
        });
        return;
      }
      
      console.log('Creating academic event:', {
        title: academicEventForm.title,
        startDate: startDateTime,
        endDate: endDateTime,
        isDateRange: !!academicEventForm.endDate && academicEventForm.endDate !== academicEventForm.startDate
      });
      
      // Create the academic event using the academic calendar service
      await createAcademicEvent({
        title: academicEventForm.title,
        startDate: Timestamp.fromDate(startDateTime),
        endDate: Timestamp.fromDate(endDateTime),
        isDateRange: !!academicEventForm.endDate && academicEventForm.endDate !== academicEventForm.startDate,
        createdBy: currentUser.id
      });
      
      // Show success message
      toast.success("Academic event created successfully!", {
        position: 'bottom-center',
        duration: 4000
      });
      
      // Refresh academic events list
      const refreshAcademicEvents = async () => {
        setLoadingAcademicEvents(true);
        try {
          console.log('Refreshing academic events after creation...');
          const academicEventsData = await getUpcomingAcademicEvents();
          console.log('Academic events refreshed:', academicEventsData);
          setAcademicEvents(academicEventsData);
        } catch (error) {
          console.error('Error reloading academic events:', error);
          toast.error('Failed to refresh academic events', {
            position: 'bottom-center',
            duration: 4000
          });
        } finally {
          setLoadingAcademicEvents(false);
        }
      };
      
      await refreshAcademicEvents();
      
      // Reset form and close modal
      setAcademicEventForm({
        title: '',
        startDate: '',
        endDate: '',
        isDateRange: false
      });
    } catch (error: any) {
      console.error('Error creating academic event:', error);
      const errorMessage = error.message || "Failed to create academic event. Please try again.";
      toast.error(errorMessage, {
        position: 'bottom-center',
        duration: 5000
      });
    } finally {
      setCreatingAcademicEvent(false);
    }
  };

  const renderSectionContent = (section: SidebarSection): JSX.Element | null => {
    switch (section.title) {
      case 'Academic Calendar':
        return renderAcademicCalendar(academicEvents);
      case 'Upcoming Events':
        // Use dynamic events from database instead of static data
        if (loadingEvents) {
          return (
            <div className="space-y-3">
              {[1, 2, 3].map((_, index) => (
                <div key={index} className="flex gap-3 p-3 bg-gray-800/30 rounded-lg animate-pulse">
                  <div className="w-16 h-16 bg-gray-700 rounded-lg"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-700 rounded mb-2"></div>
                    <div className="h-3 bg-gray-700 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          );
        }
        
        if (upcomingEvents.length === 0) {
          return (
            <div className="text-center py-6 text-gray-400">
              <span className="material-icons text-4xl bg-transparent mb-2">event_note</span>
              <p className="text-sm">No upcoming events</p>
              <p className="text-xs text-gray-500 mt-1">Check back later for new events</p>
            </div>
          );
        }
        
        return renderEvents(upcomingEvents);
      case 'Recommended Groups':
        return renderGroups(section.content as Group[]);
      case 'Recommended Spaces':
        // Hide Recommended Spaces entirely for registrar accounts
        if (isAdminRegistrar) {
          return null;
        }

        if (loadingSpaces) {
          return (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-800/30 rounded-lg animate-pulse">
                  <div className="w-12 h-12 rounded-lg bg-gray-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-700 rounded w-1/2" />
                    <div className="h-3 bg-gray-700 rounded w-1/3" />
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-gray-700" />
                </div>
              ))}
            </div>
          );
        }
        if (recommendedSpaces.length === 0) {
          return (
            <div className="text-center py-4 text-gray-400 text-xs">
              No spaces to recommend right now.
            </div>
          );
        }
        return renderRecommendedSpaces(recommendedSpaces);
      case 'Users You May Know':
        return <UsersYouMayKnow />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Desktop sidebar (unchanged) */}
      <aside 
        className={`fixed hidden md:flex flex-col ${isOpen ? 'w-64' : 'w-14'} h-screen bg-[#0A0A0A]/95 border-r border-gray-800/10 transition-all duration-300 ease-in-out overflow-hidden z-30`}
        data-tutorial="sidebar"
      >
        {/* Sidebar Header - make sticky so logo and close icon always visible */}
        <div className="sticky top-0 z-10 bg-[#0A0A0A]/95 backdrop-blur-md flex items-center p-3 sm:p-4 border-b border-gray-800/10">
          {isOpen ? (
            <>
              <div className="flex items-center gap-1.5 flex-1">
                <div className="h-7 w-7 flex items-center justify-center">
                  <img src="/images/bulsu-space-logo.png" 
                       alt="BulSU Space Logo" 
                       className="h-full w-full object-contain drop-shadow-[0_0_12px_rgba(34,197,94,0.3)]" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-bold logo-text bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-green-500">
                    BulSU Space
                  </span>
                  <p className="text-[9px] text-gray-400 leading-tight">Academic Community Social Platform</p>
                </div>
              </div>
              <button 
                onClick={toggleSidebar} 
                className="p-0.5 h-7 w-7 flex items-center justify-center hover:bg-gradient-to-r hover:from-gray-800/60 hover:to-gray-700/40 rounded-lg transition-all duration-300 ease-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-600/50 focus:ring-offset-2 focus:ring-offset-gray-900 bg-transparent"
                aria-label="Close sidebar"
              >
                <span className="material-icons text-gray-400 text-base bg-transparent transition-transform transition-colors duration-300 ease-out hover:-translate-x-1 hover:scale-110 hover:text-gray-100 hover:drop-shadow-[0_8px_30px_rgba(34,197,94,0.18)]">close</span>
              </button>
            </>
          ) : (
            <button 
              onClick={toggleSidebar} 
              className="h-8 w-8 flex items-center justify-center mx-auto rounded-xl transition-all duration-300 ease-out transform hover:scale-110 hover:bg-gradient-to-br hover:from-green-500/20 hover:to-emerald-500/10 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:ring-offset-2 focus:ring-offset-gray-900 bg-transparent"
              aria-label="Open sidebar"
            >
              <span className="material-icons text-green-400 text-lg bg-transparent transition-all duration-300 hover:text-green-300 hover:drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]">view_sidebar</span>
            </button>
          )}
        </div>

        {/* Sidebar Section Icons when closed */}
        {!isOpen && (
          <div className="flex flex-col items-center gap-4 mt-2">
            {/* Standard Sections */}
            {filteredSidebarSections.map((section, idx) => (
              <button
                key={section.title}
                className={`flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-300 ease-out transform ${
                  activeSection === idx 
                    ? 'bg-gradient-to-br from-green-500/30 to-emerald-500/20 text-white shadow-2xl shadow-green-500/25 ring-2 ring-green-400/50 scale-110 backdrop-blur-sm' 
                    : 'hover:bg-gradient-to-br hover:from-gray-800/60 hover:to-gray-700/30 hover:scale-105 hover:shadow-lg hover:ring-2 hover:ring-gray-600/30 hover:backdrop-blur-sm'
                } focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:ring-offset-2 focus:ring-offset-gray-900 bg-transparent`}
                onClick={() => {
                  toggleSidebar();
                  setActiveSection(idx);
                }}
                aria-label={section.title}
              >
                <span className={`material-icons text-xl bg-transparent transition-all duration-300 ${
                  activeSection === idx 
                    ? 'text-green-300 drop-shadow-[0_0_12px_rgba(34,197,94,0.8)]' 
                    : 'text-gray-400 hover:text-gray-300'
                }`}>{section.icon}</span>
              </button>
            ))}
          </div>
        )}

        {/* Highlight selected section when sidebar is open */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 overflow-y-auto scrollbar-thin scrollbar-track-gray-900 scrollbar-thumb-gray-800 mobile-scrollbar-hide ${!isOpen ? 'md:hidden' : ''}`}
        >
          {filteredSidebarSections.map((section, idx) => (
            <div
              key={section.title}
              ref={sectionRefs[idx]}
              className={`p-4 border-b border-gray-800/10 last:border-b-0 transition-all duration-500 ${
                isOpen && activeSection === idx 
                  ? 'bg-gradient-to-r from-green-900/20 via-gray-900/40 to-blue-900/20 backdrop-blur-sm border-l-4 border-green-400/50 shadow-lg shadow-green-500/10 transform scale-[1.02]' 
                  : 'hover:bg-gray-900/20'
              }`}
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="material-icons text-gray-400 text-xl bg-transparent">{section.icon}</span>
                <h3 className="text-sm font-medium text-gray-300">{section.title}</h3>
              </div>
              {renderSectionContent(section)}
            </div>
          ))}
        </div>
      </aside>

      {/* Mobile overlay sidebar - appears only on small screens and should mirror the desktop open state content */}
      {mobileOverlayOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => closeMobileOverlay()}
            aria-hidden
          />

          {/* Panel: reuse desktop styles but make full-height fixed panel */}
          <div className={`relative w-80 max-w-full h-full bg-[#0A0A0A]/95 border-r border-gray-800/10 transition-transform duration-300 ease-in-out overflow-auto transform ${panelVisible ? 'translate-x-0' : '-translate-x-full'}`} role="dialog" aria-modal="true" aria-label="Mobile sidebar panel">
            {/* Close button in header */}
            <div className="sticky top-0 z-20 bg-[#0A0A0A]/95 backdrop-blur-md flex items-center p-3 sm:p-4 border-b border-gray-800/10">
              <div className="flex items-center gap-1.5 flex-1">
                <div className="h-7 w-7 flex items-center justify-center">
                  <img src="/images/bulsu-space-logo.png" alt="BulSU Space Logo" className="h-full w-full object-contain" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-bold logo-text bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-green-500">BulSU Space</span>
                  <p className="text-[9px] text-gray-400 leading-tight">Academic Community Social Platform</p>
                </div>
              </div>
              <button
                id="mobile-sidebar-close"
                onClick={() => closeMobileOverlay()}
                className="p-0.5 h-7 w-7 flex items-center justify-center hover:bg-gradient-to-r hover:from-gray-800/60 hover:to-gray-700/40 rounded-lg transition-all duration-300 ease-out transform hover:scale-105 focus:outline-none"
                aria-label="Close sidebar"
              >
                <span className="material-icons text-gray-400 text-base">close</span>
              </button>
            </div>

            {/* Render the same section container as desktop - reuse scrollContainerRef and section rendering */}
            <div className={`flex-1 overflow-y-auto scrollbar-thin scrollbar-track-gray-900 scrollbar-thumb-gray-800 mobile-scrollbar-hide`}>
              {filteredSidebarSections.map((section, idx) => (
                <div
                  key={section.title}
                  className={`p-4 border-b border-gray-800/10 last:border-b-0`}
                >
                  {/* Render title and content using same renderSectionContent helper */}
                  <div className="text-sm font-semibold text-gray-200 mb-2">{section.title}</div>
                  <div>{renderSectionContent(section)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={joinDialogOpen && !!pendingSpaceVisit}
        title="Join this space?"
        message={
          <div className="space-y-2">
            <p>
              Join <span className="font-semibold text-white">{pendingSpaceVisit?.name}</span> now? We will open the space as soon as you confirm.
            </p>
            <p className="text-xs text-gray-400">
              General spaces are open to everyone. You can leave anytime from the space menu.
            </p>
          </div>
        }
  confirmLabel={joiningSpaceId ? 'Joining...' : 'Join & Visit Space'}
        cancelLabel="Not now"
        confirmTone="primary"
        headerTone="success"
        isProcessing={!!joiningSpaceId}
        onConfirm={handleConfirmJoinSpace}
        onCancel={handleCancelJoinSpace}
      />

      {/* Academic Event Creation Modal */}
      {showCreateAcademicEventModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-gray-900 rounded-lg max-w-md w-full border-2 border-blue-500">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white">Create Academic Event</h3>
                <button
                  onClick={() => setShowCreateAcademicEventModal(false)}
                  className="text-gray-400 hover:text-white transition-colors duration-200"
                >
                  <span className="material-icons bg-transparent">close</span>
                </button>
              </div>
              
              <form onSubmit={handleAcademicEventFormSubmit} className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Event Title *
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={academicEventForm.title}
                    onChange={handleAcademicEventFormChange}
                    required
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter event title"
                  />
                </div>

                {/* Date Type Toggle */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Date Type
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="dateType"
                        checked={!academicEventForm.isDateRange}
                        onChange={() => setAcademicEventForm(prev => ({ ...prev, isDateRange: false, endDate: '' }))}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-300">Single Date</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="dateType"
                        checked={academicEventForm.isDateRange}
                        onChange={() => setAcademicEventForm(prev => ({ ...prev, isDateRange: true }))}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-300">Date Range</span>
                    </label>
                  </div>
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {academicEventForm.isDateRange ? 'Start Date *' : 'Event Date *'}
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    value={academicEventForm.startDate}
                    onChange={handleAcademicEventFormChange}
                    required
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* End Date (only for date range) */}
                {academicEventForm.isDateRange && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      End Date *
                    </label>
                    <input
                      type="date"
                      name="endDate"
                      value={academicEventForm.endDate}
                      onChange={handleAcademicEventFormChange}
                      min={academicEventForm.startDate}
                      required
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                {/* Notice about academic calendar */}
                <div className="bg-blue-800/20 p-3 rounded-lg border border-blue-700/30">
                  <p className="text-sm text-gray-200">
                    <span className="material-icons align-top text-blue-500 text-sm mr-1 bg-transparent">info</span>
                    This event will be added to the academic calendar and will be visible to all users.
                  </p>
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button 
                    type="submit"
                    disabled={creatingAcademicEvent}
                    className={`w-full py-2.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 text-white ${creatingAcademicEvent ? 'bg-blue-800 cursor-not-allowed opacity-80' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    <span className={`material-icons text-sm bg-transparent ${creatingAcademicEvent ? 'animate-spin' : ''}`}>{creatingAcademicEvent ? 'autorenew' : 'event'}</span>
                    {creatingAcademicEvent ? 'Creating…' : 'Create Academic Event'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Academic Event Details Modal */}
      {showAcademicEventDetails && selectedAcademicEvent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" role="dialog" aria-modal="true">
          <div className="bg-gray-900 rounded-xl max-w-md w-full border border-gray-700 shadow-2xl">
            <div className="p-5 border-b border-gray-800 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="material-icons text-green-400 bg-transparent">event</span>
                <h3 className="text-base sm:text-lg font-semibold text-white">Academic Event Details</h3>
              </div>
              <button
                onClick={() => setShowAcademicEventDetails(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition"
                aria-label="Close details"
              >
                <span className="material-icons text-base bg-transparent">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="text-sm text-gray-400 mb-1">Title</div>
                <div className="text-white font-medium">{selectedAcademicEvent.title}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-400">Start</div>
                  <div className="text-sm text-gray-200">
                    {selectedAcademicEvent.startDate?.toDate?.().toLocaleString?.('en-US', { year: 'numeric', month: 'short', day: '2-digit' })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">End</div>
                  <div className="text-sm text-gray-200">
                    {selectedAcademicEvent.endDate?.toDate?.().toLocaleString?.('en-US', { year: 'numeric', month: 'short', day: '2-digit' })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="material-icons text-sm bg-transparent">swap_horiz</span>
                <span>{selectedAcademicEvent.isDateRange ? 'Date Range' : 'Single Date'}</span>
              </div>
              {selectedAcademicEvent.createdAt && (
                <div className="text-xs text-gray-500">
                  Created: {selectedAcademicEvent.createdAt?.toDate?.().toLocaleString?.()}
                </div>
              )}
            </div>
            <div className="p-5 border-t border-gray-800 flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 transition"
                onClick={() => setShowAcademicEventDetails(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DesktopSidebar;

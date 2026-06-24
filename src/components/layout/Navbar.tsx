import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useSidebar } from '../../contexts/SidebarContext';
import { useAuth, User } from '../../contexts/AuthContext';
import { navItems } from '../../data/navItems';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import LogoModal from '../common/LogoModal';
import { listenToUnreadNotificationCount } from '../../services/notificationService';
import { getUserUnreadCount } from '../../services/messageService';
import { listenIncomingRingingCall } from '../../services/audioCallService';
import { searchUsers, searchAlumniByBatch } from '../../services/userService';
import { getJobOpenings, getActiveJobOpenings, deleteJobOpening } from '../../services/jobService';
import { JobOpening } from '../../types';
import { debounce } from 'lodash';
import { isAdminRegistrarOrProgramChair } from '../../utils/messagingPermissions';

// Mobile side drawer component for user profile
interface MobileProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  isLoggingOut: boolean;
  setIsLoggingOut: (value: boolean) => void;
  logout: () => Promise<void>;
  loading: boolean;
}

const MobileProfileDrawer: React.FC<MobileProfileDrawerProps> = ({ 
  isOpen, 
  onClose, 
  user, 
  isLoggingOut, 
  setIsLoggingOut, 
  logout, 
  loading 
}) => {
  // Ref for the drawer to handle outside clicks and animations
  const drawerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  
  // State for job openings sidebar
  const [showJobOpeningsSidebar, setShowJobOpeningsSidebar] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]); // Replace with proper job type
  const [jobSearchTerm, setJobSearchTerm] = useState('');
  const [selectedJobType, setSelectedJobType] = useState<string | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  
  // State for post job opening modal
  const [showPostJobModal, setShowPostJobModal] = useState(false);
  const [newJob, setNewJob] = useState({
    title: '',
    company: '',
    location: '',
    type: 'Full-time',
    salaryRange: '',
    description: '',
    applicationUrl: '',
    logo: '',
    expiresAt: ''
  });
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [jobPostSuccess, setJobPostSuccess] = useState(false);
  
  // Simple close handler to ensure it works
  const handleClose = React.useCallback(() => {
    console.log('Closing drawer');
    if (typeof onClose === 'function') {
      onClose();
    }
  }, [onClose]);
  
  // Handle clicks outside the drawer to close it - simplified approach
  useEffect(() => {
    // Handle body scrolling
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);
  
  // Simplified swipe handling - removing complex touch interactions for now
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer || !isOpen) return;
    
    const handleSwipeRight = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchStartX = e.changedTouches[0].screenX - e.changedTouches[0].clientX;
      const swipeDistance = touchEndX - touchStartX;
      
      // If swiped right more than 100px
      if (swipeDistance > 100) {
        handleClose();
      }
    };
    
    drawer.addEventListener('touchend', handleSwipeRight);
    
    return () => {
      if (drawer) {
        drawer.removeEventListener('touchend', handleSwipeRight);
      }
    };
  }, [isOpen, handleClose]);
  
  // Load job openings for alumni users
  useEffect(() => {
    const loadJobOpenings = async () => {
      if (!isOpen || !user || user.role !== 'alumni') return;
      
      setLoadingJobs(true);
      try {
        const jobsData = await getActiveJobOpenings();
        setJobs(jobsData);
      } catch (error) {
        console.error('Error loading job openings:', error);
      } finally {
        setLoadingJobs(false);
      }
    };
    
    loadJobOpenings();
  }, [isOpen, user]);
  

  
  // Handle input changes for new job form
  const handleJobInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewJob(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle job form submission with proper Firebase integration
  const handleJobFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!user) return;
    
    // Validation
    if (!newJob.title || !newJob.company || !newJob.location || !newJob.applicationUrl) {
      alert('Please fill in all required fields');
      return;
    }
    
    setIsSubmittingJob(true);
    
    try {
      // Import the createJobOpening function
      const { createJobOpening } = await import('../../services/jobService');
      
      // Create job with proper data structure
      const jobData = {
        title: newJob.title,
        company: newJob.company,
        location: newJob.location,
        type: newJob.type as 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | 'Remote',
        description: newJob.description,
        requirements: newJob.description.split('\n').filter(req => req.trim() !== ''),
        applicationUrl: newJob.applicationUrl,
        logo: newJob.logo || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        salary_range: newJob.salaryRange || undefined,
        expiresAt: newJob.expiresAt || undefined,
      };
      
      // Submit to Firebase
      await createJobOpening(jobData, user.id);
      
      // Show success message
      setJobPostSuccess(true);
      
      // Reset form after 2 seconds
      setTimeout(async () => {
        setNewJob({
          title: '',
          company: '',
          location: '',
          type: 'Full-time',
          salaryRange: '',
          description: '',
          applicationUrl: '',
          logo: '',
          expiresAt: ''
        });
        setShowPostJobModal(false);
        setJobPostSuccess(false);
        
        // Refresh jobs list
        const jobsData = await getActiveJobOpenings();
        setJobs(jobsData);
      }, 2000);
    } catch (error) {
      console.error('Error submitting job opening:', error);
      alert('Failed to submit job. Please try again.');
    } finally {
      setIsSubmittingJob(false);
    }
  };

  // Handle job deletion with role-based permissions
  const handleDeleteJob = async (jobId: string, jobCreatedBy?: string) => {
    if (!user) return;
    
    // Check permissions
    const isAuthor = jobCreatedBy === user.id;
    const isAdmin = user.role === 'admin';
    const isSuperAdmin = user.role === 'super admin';
    
    if (!isAuthor && !isAdmin && !isSuperAdmin) {
      alert('You do not have permission to delete this job posting.');
      return;
    }
    
    // Confirmation dialog
    const confirmMessage = isAuthor 
      ? 'Are you sure you want to delete your job posting? This action cannot be undone.'
      : 'Are you sure you want to delete this job posting? This action cannot be undone.';
    
    const userConfirmed = window.confirm(confirmMessage);
    if (!userConfirmed) {
      return;
    }
    
    try {
      // Delete the job
      await deleteJobOpening(jobId);
      
      // Show success message
      alert('Job posting deleted successfully.');
      
      // Refresh jobs list
      const jobsData = await getActiveJobOpenings();
      setJobs(jobsData);
    } catch (error) {
      console.error('Error deleting job opening:', error);
      alert('Failed to delete job posting. Please try again.');
    }
  };

  // Check if user can delete a specific job
  const canDeleteJob = (jobCreatedBy?: string) => {
    if (!user) return false;
    
    const isAuthor = jobCreatedBy === user.id;
    const isAdmin = user.role === 'admin';
    const isSuperAdmin = user.role === 'super admin';
    
    return isAuthor || isAdmin || isSuperAdmin;
  };
  
  return (
    <>
      {/* Backdrop overlay - simplified for reliability */}
      <button 
        className={`backdrop-overlay fixed inset-0 bg-black/60 z-[10001] backdrop-blur-md transition-opacity duration-300 md:hidden border-0 outline-none
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={handleClose}
        aria-label="Close menu"
        type="button"
      />
      
      {/* Job Openings Full Screen Sidebar - Enhanced with better UI */}
      {showJobOpeningsSidebar && (
        <div className="fixed inset-0 bg-gray-900 z-[10003] flex flex-col overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gradient-to-r from-gray-900 to-gray-800 shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-900/40 border border-blue-800/50">
                <span className="material-icons text-blue-400 text-2xl">work</span>
              </div>
              <div>
                <span className="font-semibold text-gray-200 text-lg">Alumni Job Openings</span>
                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                  <span className="material-icons text-blue-500 text-xs">verified</span>
                  Opportunities exclusively for BulSU alumni
                </p>
              </div>
            </div>
            <button 
              onClick={() => {
                setShowJobOpeningsSidebar(false);
                setSelectedJobType(null);
                setJobSearchTerm('');
              }}
              className="p-2 hover:bg-red-900/20 rounded-full transition-all duration-300 group"
              aria-label="Close job openings"
            >
              <span className="material-icons text-gray-400 group-hover:text-red-400 text-lg">close</span>
            </button>
          </div>
          
          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto bg-gray-900">
            {/* Enhanced search bar with modern styling */}
            <div className="p-4 border-b border-gray-700 bg-gradient-to-b from-gray-900 to-gray-800/80">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Search job title, company, location..." 
                  value={jobSearchTerm}
                  onChange={(e) => setJobSearchTerm(e.target.value)}
                  className="w-full bg-gray-800/90 text-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-gray-700/90 transition-all duration-300 placeholder-gray-500 border border-gray-700/80"
                />
                {jobSearchTerm ? (
                  <button
                    onClick={() => setJobSearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200 p-1.5 transition-colors duration-200"
                  >
                    <span className="material-icons text-sm">close</span>
                  </button>
                ) : (
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-xs">Type to search</span>
                )}
              </div>
              
              {/* Job type filters - Premium enhanced styling and interactive elements */}
              <div className="mt-4 bg-gray-800/60 p-4 rounded-xl border border-gray-700/50 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <span className="material-icons text-blue-400 text-sm mr-1.5">filter_alt</span>
                    <span className="text-xs font-medium text-blue-300">Filter by Job Type</span>
                  </div>
                  {selectedJobType && (
                    <button
                      onClick={() => setSelectedJobType(null)}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded-md bg-red-900/30 hover:bg-red-900/40 transition-all duration-200 border border-red-800/50"
                    >
                      <span className="material-icons text-[12px]">close</span>
                      Clear filter
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button 
                    className={`relative group flex items-center justify-start px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                      selectedJobType === null 
                        ? "bg-gradient-to-r from-blue-800/90 to-blue-600/80 text-blue-100 shadow-md shadow-blue-900/50 border border-blue-500/40 transform scale-[1.02]" 
                        : "bg-gray-800/90 text-gray-400 hover:bg-gray-700/90 hover:text-blue-300 border border-gray-700/80 hover:border-blue-700/30"
                    }`}
                    onClick={() => setSelectedJobType(null)}
                  >
                    <span className={`material-icons text-sm mr-2 ${selectedJobType === null ? "text-blue-300" : "text-gray-400 group-hover:text-blue-400"}`}>
                      all_inclusive
                    </span>
                    <span className="flex-1">All Types</span>
                    {selectedJobType === null && (
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                    )}
                  </button>
                  <button 
                    className={`relative group flex items-center justify-start px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                      selectedJobType === 'Full-time' 
                        ? "bg-gradient-to-r from-blue-800/90 to-blue-600/80 text-blue-100 shadow-md shadow-blue-900/50 border border-blue-500/40 transform scale-[1.02]" 
                        : "bg-gray-800/90 text-gray-400 hover:bg-gray-700/90 hover:text-blue-300 border border-gray-700/80 hover:border-blue-700/30"
                    }`}
                    onClick={() => setSelectedJobType('Full-time')}
                  >
                    <span className={`material-icons text-sm mr-2 ${selectedJobType === 'Full-time' ? "text-blue-300" : "text-gray-400 group-hover:text-blue-400"}`}>
                      work
                    </span>
                    <span className="flex-1">Full-time</span>
                    {selectedJobType === 'Full-time' && (
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                    )}
                  </button>
                  <button 
                    className={`relative group flex items-center justify-start px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                      selectedJobType === 'Part-time' 
                        ? "bg-gradient-to-r from-blue-800/90 to-blue-600/80 text-blue-100 shadow-md shadow-blue-900/50 border border-blue-500/40 transform scale-[1.02]" 
                        : "bg-gray-800/90 text-gray-400 hover:bg-gray-700/90 hover:text-blue-300 border border-gray-700/80 hover:border-blue-700/30"
                    }`}
                    onClick={() => setSelectedJobType('Part-time')}
                  >
                    <span className={`material-icons text-sm mr-2 ${selectedJobType === 'Part-time' ? "text-blue-300" : "text-gray-400 group-hover:text-blue-400"}`}>
                      schedule
                    </span>
                    <span className="flex-1">Part-time</span>
                    {selectedJobType === 'Part-time' && (
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                    )}
                  </button>
                  <button 
                    className={`relative group flex items-center justify-start px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                      selectedJobType === 'Remote' 
                        ? "bg-gradient-to-r from-blue-800/90 to-blue-600/80 text-blue-100 shadow-md shadow-blue-900/50 border border-blue-500/40 transform scale-[1.02]" 
                        : "bg-gray-800/90 text-gray-400 hover:bg-gray-700/90 hover:text-blue-300 border border-gray-700/80 hover:border-blue-700/30"
                    }`}
                    onClick={() => setSelectedJobType('Remote')}
                  >
                    <span className={`material-icons text-sm mr-2 ${selectedJobType === 'Remote' ? "text-blue-300" : "text-gray-400 group-hover:text-blue-400"}`}>
                      laptop
                    </span>
                    <span className="flex-1">Remote</span>
                    {selectedJobType === 'Remote' && (
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                    )}
                  </button>
                  <button 
                    className={`relative group flex items-center justify-start px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                      selectedJobType === 'Internship' 
                        ? "bg-gradient-to-r from-blue-800/90 to-blue-600/80 text-blue-100 shadow-md shadow-blue-900/50 border border-blue-500/40 transform scale-[1.02]" 
                        : "bg-gray-800/90 text-gray-400 hover:bg-gray-700/90 hover:text-blue-300 border border-gray-700/80 hover:border-blue-700/30"
                    }`}
                    onClick={() => setSelectedJobType('Internship')}
                  >
                    <span className={`material-icons text-sm mr-2 ${selectedJobType === 'Internship' ? "text-blue-300" : "text-gray-400 group-hover:text-blue-400"}`}>
                      school
                    </span>
                    <span className="flex-1">Internship</span>
                    {selectedJobType === 'Internship' && (
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                    )}
                  </button>
                  <button 
                    className={`relative group flex items-center justify-start px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                      selectedJobType === 'Contract' 
                        ? "bg-gradient-to-r from-blue-800/90 to-blue-600/80 text-blue-100 shadow-md shadow-blue-900/50 border border-blue-500/40 transform scale-[1.02]" 
                        : "bg-gray-800/90 text-gray-400 hover:bg-gray-700/90 hover:text-blue-300 border border-gray-700/80 hover:border-blue-700/30"
                    }`}
                    onClick={() => setSelectedJobType('Contract')}
                  >
                    <span className={`material-icons text-sm mr-2 ${selectedJobType === 'Contract' ? "text-blue-300" : "text-gray-400 group-hover:text-blue-400"}`}>
                      description
                    </span>
                    <span className="flex-1">Contract</span>
                    {selectedJobType === 'Contract' && (
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                    )}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Post Job CTA - Only for alumni users */}
            {user?.role === 'alumni' && (
              <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-blue-900/20 to-blue-800/10">
                <button 
                  onClick={() => setShowPostJobModal(true)}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 hover:shadow-xl hover:shadow-blue-900/40 transform hover:scale-[1.02]"
                >
                  <span className="material-icons text-lg">add</span>
                  <span className="font-medium">Post a Job Opening</span>
                </button>
                <p className="text-xs text-blue-300/80 text-center mt-2">
                  Share job opportunities with fellow BulSU alumni
                </p>
              </div>
            )}
            
            {/* Job listings with enhanced visuals */}
            <div className="p-4 bg-gray-900">
            {loadingJobs ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4 shadow-lg shadow-blue-900/30"></div>
                <p className="text-gray-300 text-sm font-medium">Loading job opportunities...</p>
                <p className="text-gray-500 text-xs mt-2">Please wait while we fetch the latest openings</p>
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12 text-gray-400 bg-gray-800/40 rounded-xl border border-gray-700/50 backdrop-blur-sm my-4">
                <div className="bg-gray-800/80 w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-5 border border-gray-700">
                  <span className="material-icons text-5xl text-gray-500">work_off</span>
                </div>
                <p className="text-gray-300 text-lg mb-2 font-medium">No job openings available</p>
                <p className="text-gray-500 text-sm max-w-xs mx-auto">Check back later for new opportunities or contact your alumni association for more information.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {jobs
                  .filter(job => 
                    (selectedJobType === null || job.type === selectedJobType) &&
                    (jobSearchTerm === '' || 
                      job.title.toLowerCase().includes(jobSearchTerm.toLowerCase()) ||
                      job.company.toLowerCase().includes(jobSearchTerm.toLowerCase()) ||
                      job.location.toLowerCase().includes(jobSearchTerm.toLowerCase())
                    )
                  )
                  .map(job => (
                    <div 
                      key={job.id} 
                      className="group relative p-4 bg-gray-800/90 hover:bg-gray-700/90 rounded-lg transition-all duration-300 cursor-pointer border border-gray-700/80 hover:border-blue-700/40 hover:shadow-md hover:shadow-blue-900/10"
                      onClick={() => job.applicationUrl ? window.open(job.applicationUrl, '_blank') : null}
                    >
                      {/* Delete button - Only visible for authorized users */}
                      {canDeleteJob(job.createdBy) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent card click
                            handleDeleteJob(job.id, job.createdBy);
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-red-900/80 hover:bg-red-800/90 text-red-300 hover:text-red-200 rounded-full transition-all duration-200 opacity-0 group-hover:opacity-100 z-10 shadow-lg shadow-red-900/30 hover:shadow-red-900/50"
                          aria-label="Delete job posting"
                        >
                          <span className="material-icons text-sm">delete</span>
                        </button>
                      )}
                      
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-700 group-hover:border-blue-700/40 flex-shrink-0 bg-gray-800 flex items-center justify-center shadow-md">
                          <img
                            src={job.logo}
                            alt={job.company}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                            onError={(e) => {
                              e.currentTarget.src = 'https://via.placeholder.com/80x80?text=' + job.company.charAt(0);
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-medium text-blue-300 group-hover:text-blue-200 transition-colors duration-300 mb-1">{job.title}</h4>
                          <div className="flex flex-wrap items-center gap-x-2 text-xs mb-2">
                            <span className="font-medium text-gray-300">{job.company}</span>
                            <div className="flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-gray-600 flex-shrink-0"></span>
                              <span className="text-gray-400 flex items-center gap-1">
                                <span className="material-icons text-xs">location_on</span>
                                {job.location}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center flex-wrap gap-2 mt-2.5">
                            <span className="inline-block px-2.5 py-1 bg-gray-700/80 text-blue-300 text-[10px] rounded-md border border-blue-800/30 font-medium flex items-center gap-1">
                              <span className="material-icons text-[10px]">
                                {job.type === 'Full-time' ? 'work' : 
                                 job.type === 'Part-time' ? 'schedule' :
                                 job.type === 'Remote' ? 'laptop' :
                                 job.type === 'Internship' ? 'school' : 'description'}
                              </span>
                              {job.type}
                            </span>
                            {job.salaryRange && (
                              <span className="inline-block px-2.5 py-1 bg-gray-700/80 text-green-300 text-[10px] rounded-md border border-green-800/30 font-medium flex items-center gap-1">
                                <span className="material-icons text-[10px]">payments</span>
                                {job.salaryRange}
                              </span>
                            )}
                            {job.expiresAt && (
                              <span className="inline-block px-2.5 py-1 bg-orange-900/30 text-orange-300 text-[10px] rounded-md border border-orange-800/30 font-medium flex items-center gap-1">
                                <span className="material-icons text-[10px]">schedule</span>
                                Expires: {new Date(job.expiresAt).toLocaleDateString()}
                              </span>
                            )}
                            <span className="inline-block ml-auto px-2.5 py-1 bg-blue-900/30 text-blue-300 text-[10px] rounded-md border border-blue-800/30 font-medium group-hover:bg-blue-900/50 transition-colors duration-300">
                              Apply Now
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
          </div>
          
          <div className="px-4 py-3.5 bg-gray-800 border-t border-gray-700 flex justify-center shadow-md">
            <p className="text-xs text-gray-400 flex items-center gap-2">
              <span className="material-icons text-blue-500 text-sm">school</span>
              Looking for more opportunities? Visit the 
              <a href="https://bulsu.edu.ph/careers" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 font-medium transition-colors duration-200 underline decoration-blue-800 hover:decoration-blue-500 underline-offset-2">
                BulSU Careers
              </a> 
              page
            </p>
          </div>
        </div>
      )}

      {/* Post Job Opening Modal - Mobile Version */}
      {showPostJobModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10004] animate-fade-in">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 max-w-md w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-icons text-blue-400 text-xl bg-transparent">work</span>
                <h3 className="text-lg font-semibold text-white">Post a Job Opening</h3>
              </div>
              <button 
                onClick={() => setShowPostJobModal(false)}
                className="p-2 hover:bg-gradient-to-r hover:from-red-500/20 hover:to-pink-500/10 rounded-xl transition-all duration-300"
                aria-label="Close job form"
              >
                <span className="material-icons text-gray-400 text-lg bg-transparent transition-all duration-300 hover:text-red-400">close</span>
              </button>
            </div>
            
            {jobPostSuccess ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="material-icons text-green-400 text-3xl">check_circle</span>
                </div>
                <h3 className="text-lg font-semibold text-green-400 mb-2">Job Posted Successfully!</h3>
                <p className="text-gray-400 text-sm">Your job opening has been posted and is now visible to alumni.</p>
              </div>
            ) : (
              <form onSubmit={handleJobFormSubmit} className="space-y-4">
                {/* Job Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Job Title *</label>
                  <input 
                    type="text"
                    name="title"
                    value={newJob.title}
                    onChange={handleJobInputChange}
                    className="w-full bg-gray-800 text-gray-300 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g., Software Engineer"
                    required
                  />
                </div>
                
                {/* Company Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Company Name *</label>
                  <input 
                    type="text"
                    name="company"
                    value={newJob.company}
                    onChange={handleJobInputChange}
                    className="w-full bg-gray-800 text-gray-300 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g., TechCorp Inc."
                    required
                  />
                </div>
                
                {/* Location */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Location *</label>
                  <input 
                    type="text"
                    name="location"
                    value={newJob.location}
                    onChange={handleJobInputChange}
                    className="w-full bg-gray-800 text-gray-300 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g., Manila, Philippines or Remote"
                    required
                  />
                </div>
                
                {/* Job Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Job Type *</label>
                  <select 
                    name="type"
                    value={newJob.type}
                    onChange={handleJobInputChange}
                    className="w-full bg-gray-800 text-gray-300 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Remote">Remote</option>
                    <option value="Internship">Internship</option>
                    <option value="Contract">Contract</option>
                  </select>
                </div>
                
                {/* Salary Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Salary Range (Optional)</label>
                  <input 
                    type="text"
                    name="salaryRange"
                    value={newJob.salaryRange}
                    onChange={handleJobInputChange}
                    className="w-full bg-gray-800 text-gray-300 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g., ₱30,000 - ₱45,000 per month"
                  />
                </div>
                
                {/* Application URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Application URL *</label>
                  <input 
                    type="url"
                    name="applicationUrl"
                    value={newJob.applicationUrl}
                    onChange={handleJobInputChange}
                    className="w-full bg-gray-800 text-gray-300 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="https://company.com/careers/job-123"
                    required
                  />
                </div>
                
                {/* Expiration Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Expiration Date (Optional)</label>
                  <input 
                    type="date"
                    name="expiresAt"
                    value={newJob.expiresAt}
                    onChange={handleJobInputChange}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-gray-800 text-gray-300 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Select expiration date"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave empty if the job posting should not expire automatically.</p>
                </div>
                
                {/* Job Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Job Description *</label>
                  <textarea 
                    name="description"
                    value={newJob.description}
                    onChange={handleJobInputChange}
                    className="w-full bg-gray-800 text-gray-300 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[80px]"
                    placeholder="Describe the job role, responsibilities, and benefits..."
                    required
                  ></textarea>
                </div>
                
                {/* Company Logo URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Company Logo URL (Optional)</label>
                  <input
                    type="url"
                    name="logo"
                    value={newJob.logo}
                    onChange={handleJobInputChange}
                    className="w-full bg-gray-800 text-gray-300 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="https://company.com/logo.png"
                  />
                  <p className="text-xs text-gray-500 mt-1">Default logo will be used if not provided.</p>
                </div>
                
                {/* Notice about immediate posting */}
                <div className="bg-green-800/20 p-3 rounded-lg border border-green-700/30">
                  <p className="text-sm text-gray-200">
                    <span className="material-icons align-top text-green-500 text-sm mr-1 bg-transparent">check_circle</span>
                    Job postings will appear immediately in the job openings section.
                  </p>
                </div>
                
                {/* Submit Button */}
                <div className="pt-2">
                  <button 
                    type="submit"
                    disabled={isSubmittingJob}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/50 text-white py-3 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                  >
                    {isSubmittingJob ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Posting Job...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-icons text-sm bg-transparent">post_add</span>
                        <span>Submit Job Opening</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      
      {/* Side drawer */}
      <div 
        ref={drawerRef}
        className={`fixed top-0 bottom-0 right-0 w-[85%] max-w-[320px] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-900/95 
          shadow-2xl shadow-green-500/30 z-[10002] border-l border-green-700/20 transform transition-all duration-300 ease-in-out 
          md:hidden backdrop-blur-lg ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-95'}`}
      >
        {/* Decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-green-500/5 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 -left-32 w-64 h-64 bg-green-500/5 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-green-800/10 rounded-full blur-3xl"></div>
        </div>
        
        {/* Minimalist close button */}
        <button 
          className="absolute top-4 right-4 text-gray-400 hover:text-green-400 p-2 rounded-full
            transition-colors duration-200 z-20 flex items-center justify-center focus:outline-none" 
          onClick={handleClose}
          type="button"
          aria-label="Close menu"
        >
          <span className="material-icons text-lg">close</span>
        </button>
        
        {/* User info section */}
        <div className="p-8 pt-16 border-b border-green-800/20 relative">
          <div className="flex flex-col items-center text-center">
            <div className="relative group">
              {user?.profile_pic ? (
                <img 
                  src={user.profile_pic} 
                  alt={user.name} 
                  className="h-24 w-24 rounded-full object-cover shadow-xl shadow-green-500/20 mb-4 ring-2 ring-green-500/30 
                    group-hover:ring-green-500/50 transition-all duration-300"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.onerror = null;
                    target.src = '/images/default-avatar.png';
                  }}
                />
              ) : (
                <div className="h-24 w-24 rounded-full bg-gradient-to-br from-green-900/50 to-gray-900/90 flex items-center justify-center 
                  shadow-lg shadow-green-500/20 mb-4 ring-2 ring-green-500/30 group-hover:ring-green-500/50 transition-all duration-300">
                  <span className="material-icons text-green-400 text-4xl drop-shadow-md">account_circle</span>
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-green-400/5 to-green-600/0 opacity-0 
                group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
            </div>
            <div className="text-xl font-bold text-green-200 mb-1">{user?.name}</div>
            <div className="text-sm text-gray-400 mb-2">{user?.email}</div>
            <div className="text-xs text-green-400/90 bg-gradient-to-r from-green-900/40 to-green-800/20 px-4 py-1.5 rounded-full 
              capitalize font-medium shadow-inner shadow-green-900/20 ring-1 ring-green-700/20">
              {user?.role || 'Student'}
            </div>
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="p-6 space-y-2">
          <Link 
            to="/profile" 
            className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/20 hover:bg-green-900/30 text-gray-300 
              hover:text-green-300 transition-all duration-200 group ring-1 ring-green-700/10 hover:ring-green-500/30 
              shadow-sm hover:shadow-md hover:shadow-green-500/20"
            onClick={handleClose}
          >
            <span className="material-icons text-green-500/80 group-hover:text-green-400">person</span>
            <span className="font-medium">My Profile</span>
          </Link>

          {/* Job Openings Link - Only visible for alumni users and hidden for registrar accounts */}
          {(() => {
            const roleStr = (user?.role || '').toLowerCase().trim();
            const officeStr = (user?.office || '').toLowerCase().trim();
            const isRegistrar = roleStr.includes('registrar') || officeStr.includes('registrar');
            return !isRegistrar && user?.role === 'alumni';
          })() && (
            <button 
              onClick={() => { handleClose(); navigate('/jobs'); }}
              className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/20 hover:bg-blue-900/30 text-gray-300 
                hover:text-blue-300 transition-all duration-200 group ring-1 ring-green-700/10 hover:ring-blue-500/30 
                shadow-sm hover:shadow-md hover:shadow-blue-500/20 w-full text-left"
            >
              <span className="material-icons text-blue-500/80 group-hover:text-blue-400">work</span>
              <span className="font-medium">Job Openings</span>
            </button>
          )}

          <Link 
            to="/settings" 
            className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/20 hover:bg-green-900/30 text-gray-300 
              hover:text-green-300 transition-all duration-200 group ring-1 ring-green-700/10 hover:ring-green-500/30 
              shadow-sm hover:shadow-md hover:shadow-green-500/20"
            onClick={handleClose}
          >
            <span className="material-icons text-green-500/80 group-hover:text-green-400">settings</span>
            <span className="font-medium">Settings</span>
          </Link>

          {/* Expression Board removed per request */}

{/* 
          {user && user.role === 'super admin' && (
            <Link 
              to="/monitor" 
              className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/20 hover:bg-emerald-900/30 text-gray-300 
                hover:text-emerald-300 transition-all duration-200 group ring-1 ring-green-700/10 hover:ring-emerald-500/30 
                shadow-sm hover:shadow-md hover:shadow-emerald-500/20"
              onClick={handleClose}
            >
              <span className="material-icons text-emerald-500/80 group-hover:text-emerald-400">dashboard</span>
              <span className="font-medium">Monitor</span>
            </Link>
          )} */}

          <button 
            onClick={() => logout()}
            disabled={loading}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800/20 hover:bg-red-900/20 text-gray-300
              hover:text-red-300 transition-all duration-200 group ring-1 ring-green-700/10 hover:ring-red-500/30
              disabled:text-gray-500 disabled:bg-gray-800/10 disabled:cursor-not-allowed shadow-sm hover:shadow-md hover:shadow-red-500/20"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="font-medium">Signing out...</span>
              </>
            ) : (
              <>
                <span className="material-icons text-red-500/80 group-hover:text-red-400">logout</span>
                <span className="font-medium">Sign out</span>
              </>
            )}
          </button>
        </div>
        {/* BulSU Space Logo and Tagline at the center bottom */}
        <div className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-8 pointer-events-none select-none">
          <img
            src="/images/bulsu-space-logo.png"
            alt="BulSU Space Logo"
            className="h-12 w-12 mb-2 drop-shadow-[0_0_12px_rgba(34,197,94,0.5)]"
            draggable="false"
          />
          <div className="text-center">
            <span className="block text-green-300 font-bold text-base tracking-wide">BulSU Space</span>
            <span className="block text-xs text-gray-400 font-medium">Academic Community Social Platform</span>
          </div>
        </div>
      </div>
    </>
  );
};

const Navbar = () => {
  const { setActiveTab } = useSidebar();
  const { currentUser, logout, loading } = useAuth();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [logoModalOpen, setLogoModalOpen] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [hasIncomingCall, setHasIncomingCall] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  
  // Handle clicks outside search results
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (searchResultsRef.current && !searchResultsRef.current.contains(event.target as Node)) {
      setShowSearchResults(false);
    }
  }, []);
  
  // Set up click outside listener for search results
  useEffect(() => {
    if (showSearchResults) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSearchResults, handleClickOutside]);
  
  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (query: string) => {
      if (!query.trim() || !currentUser) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      
      try {
        // Check if query is in graduation batch format
        const isBatchFormat = /^\d{4}-\d{4}$/.test(query);
        
        let results;
        if (isBatchFormat) {
          // If it's in batch format, first try the specialized alumni search
          // console.log('Searching for alumni with batch:', query);
          const alumniResults = await searchAlumniByBatch(query, currentUser.id);
          
          // If we get alumni results, use those
          if (alumniResults.length > 0) {
            results = alumniResults;
          } else {
            // Fall back to regular search if no alumni found
            results = await searchUsers(query, currentUser.id);
          }
        } else {
          // Regular search for non-batch queries
          results = await searchUsers(query, currentUser.id);
        }
        
        setSearchResults(results);
        setShowSearchResults(results.length > 0);
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setIsSearching(false);
      }
    }, 500),
    [currentUser]
  );
  
  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    if (value.trim()) {
      setIsSearching(true);
      debouncedSearch(value);
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  };
  
  // Handle user selection from search results
  const handleUserSelect = (userId: string) => {
    navigate(`/profile/${userId}`);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  // Format role label for dropdown: append office for admins (e.g., admin-registrar)
  const formatRoleWithOffice = useCallback((user: User | null | undefined) => {
    if (!user) return '';
    const role = (user.role || '').toLowerCase();
    if (role !== 'admin') return role || 'student';

    const officeStr = (user as any)?.office;
    const officesArr: string[] = Array.isArray((user as any)?.offices)
      ? ((user as any).offices as string[])
      : [];

    let office = '';
    if (typeof officeStr === 'string' && officeStr.trim().length) {
      office = officeStr.trim().toLowerCase();
    } else if (officesArr.length) {
      const registrar = officesArr.find(o => typeof o === 'string' && o.toLowerCase() === 'registrar');
      office = (registrar || officesArr[0] || '').toLowerCase();
    }

    return office ? `${role}-${office}` : role;
  }, []);

  // Detect if we're on mobile view
  useEffect(() => {
    const checkMobileView = () => {
      setIsMobileView(window.innerWidth < 768); // md breakpoint in Tailwind
    };
    
    // Check on mount
    checkMobileView();
    
    // Check on resize
    window.addEventListener('resize', checkMobileView);
    return () => window.removeEventListener('resize', checkMobileView);
  }, []);
  
  // Improved active tab determination with consistent logic
  const getActiveTab = useCallback(() => {
    const pathname = location.pathname;
    
    // Define route mappings with priority (more specific routes first)
    const routeMap = [
  { path: '/freedom-wall', tab: 'freedom-wall' },
  { path: '/space-news', tab: 'space-news' },
  { path: '/idea-chain', tab: 'idea-chain' },
  { path: '/jobs', tab: 'jobs' },
  { path: '/community-access', tab: 'community-access' },
  { path: '/account-creator', tab: 'account-creator' },
  { path: '/manage-users', tab: 'manage-users' },
      { path: '/calendar', tab: 'academic-calendar' },
      { path: '/events', tab: 'events' },
      { path: '/groups', tab: 'popular-groups' },
      { path: '/notifications', tab: 'notifications' },
      { path: '/messages', tab: 'messages' },
      { path: '/profile', tab: 'profile' },
      { path: '/settings', tab: 'settings' },
    ];
    
    // Find matching route (exact match first, then startsWith)
    for (const route of routeMap) {
      if (pathname === route.path || pathname.startsWith(route.path + '/')) {
        // console.log(`[Navbar] Route matched: ${pathname} -> ${route.tab}`);
        return route.tab;
      }
    }
    
    // Default to home
    // console.log(`[Navbar] No route matched for: ${pathname}, defaulting to home`);
    return 'home';
  }, [location.pathname]);

  const activeTab = getActiveTab();

  // Check if we're on the homepage
  const isHomePage = location.pathname === '/' || location.pathname === '/home';
  
  // Check if we're on the profile page
  const isProfilePage = location.pathname.startsWith('/profile');

  // Handle logo click
  const handleLogoClick = useCallback(() => {
    const isHomePage = location.pathname === '/' || location.pathname === '/home';
    if (isHomePage) {
      setLogoModalOpen(true);
    } else {
      navigate('/home');
    }
  }, [location.pathname, navigate]);
  
  // Get visible nav items based on user role
  const getVisibleNavItems = useCallback(() => {
    if (!currentUser) return [];

  // Always remove community page from the navbar for all users; keep 'community-access' for role-based logic
  let items = navItems.filter(item => item.tab !== 'community');

  // Remove community-access for students, faculties, alumni, dean, guest, librarian, and infirmary
  // Librarian and infirmary are intentionally restricted from Community Access
  const rolesWithoutCommunityAccess = ['student', 'faculty', 'alumni', 'dean', 'guest', 'librarian', 'infirmary'];
    if (rolesWithoutCommunityAccess.includes(currentUser.role)) {
      items = items.filter(item => item.tab !== 'community-access');
    }

    // Check if admin has registrar office
    const isSuperAdmin = currentUser.role === 'super admin';
    // Support both `office` (string) and `offices` (array); compare case-insensitively
    const officesArray: string[] = Array.isArray((currentUser as any)?.offices)
      ? ((currentUser as any).offices as string[])
      : [];
    const officeString: string | undefined = (currentUser as any)?.office;
    const normalizedOffices = officesArray.map(o => (typeof o === 'string' ? o.toLowerCase() : ''));
    const isRegistrarInArray = normalizedOffices.includes('registrar');
    const isRegistrarInString = typeof officeString === 'string' && officeString.toLowerCase() === 'registrar';
    const isAdminWithRegistrarOffice = currentUser.role === 'admin' && (isRegistrarInArray || isRegistrarInString);

  // Allow account creator access for super admin, admin+registrar, or dean
  const isDean = currentUser.role === 'dean';
  const canAccessAccountCreator = isSuperAdmin || isAdminWithRegistrarOffice || isDean;

    if (currentUser.role === 'admin' || currentUser.role === 'super admin') {
      // For admins (including super admin) - remove profile and messages in addition to community
      let baseFilteredItems = items.filter(item => !['profile', 'messages'].includes(item.tab));

      // Remove Community Access for regular admins who do NOT have registrar office
      if (currentUser.role === 'admin' && !isAdminWithRegistrarOffice) {
        baseFilteredItems = baseFilteredItems.filter(item => item.tab !== 'community-access');
      }

      // Now apply account-creator vs popular-groups visibility rules
      if (canAccessAccountCreator) {
        // Show account-creator, hide popular-groups (Spaces)
        return baseFilteredItems.filter(item => item.tab !== 'popular-groups');
      } else {
        // Show popular-groups (Spaces), hide account-creator
        return baseFilteredItems.filter(item => item.tab !== 'account-creator');
      }
    } else if (currentUser.role === 'dean') {
      // Dean should be able to access account-creator but not the profile tab in this mobile/side nav
      return items.filter(item => !['profile'].includes(item.tab));
    } else {
      // For other non-admin users: remove profile and account-creator in addition to community pages
      return items.filter(item => !['profile', 'account-creator'].includes(item.tab));
    }
  }, [currentUser]);

  // Debug logging
  useEffect(() => {
    // console.log(`[Navbar] Current pathname: ${location.pathname}`);
    // console.log(`[Navbar] Active tab: ${activeTab}`);
    // console.log(`[Navbar] Current user role: ${currentUser?.role}`);
    // const visibleItems = getVisibleNavItems();
    // console.log(`[Navbar] Visible nav items:`, visibleItems.map(item => item.tab));
  }, [location.pathname, currentUser]);

  // Real-time unread notifications & messages counters
  useEffect(() => {
    if (!currentUser?.id) return;
    const unsubscribeNotif = listenToUnreadNotificationCount(currentUser.id, (count) => setUnreadNotifCount(count));
    const unsubscribeMsg = getUserUnreadCount(currentUser.id, (count) => setUnreadMessageCount(count));
    return () => {
      try { unsubscribeNotif && unsubscribeNotif(); } catch {}
      try { unsubscribeMsg && unsubscribeMsg(); } catch {}
    };
  }, [currentUser?.id]);

  useEffect(() => {
    const normalizedUid = typeof currentUser?.id === 'string' ? currentUser.id.trim() : '';
    if (!normalizedUid) {
      setHasIncomingCall(false);
      return;
    }

    const unsubscribeIncoming = listenIncomingRingingCall(normalizedUid, (call) => {
      setHasIncomingCall(
        !!call &&
          call.status === 'ringing' &&
          call.calleeUid === normalizedUid &&
          typeof call.callerUid === 'string' &&
          call.callerUid.trim().length > 0
      );
    });

    return () => {
      try { unsubscribeIncoming && unsubscribeIncoming(); } catch {}
    };
  }, [currentUser?.id]);

  const isAdminUser = currentUser && (currentUser.role === 'admin' || currentUser.role === 'super admin');
  const handleMessagesIconClick = (_e: React.MouseEvent, _isMessagesTab: boolean) => {};

  // Determine if current user can manage users (super admin or admin with registrar office)
  const canManageUsers = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === 'super admin') return true;
    if (currentUser.role === 'admin') {
      const officesArray: string[] = Array.isArray((currentUser as any)?.offices)
        ? ((currentUser as any).offices as string[])
        : [];
      const officeString: string | undefined = (currentUser as any)?.office;
      const normalizedOffices = officesArray.map(o => (typeof o === 'string' ? o.toLowerCase() : ''));
      const isRegistrarInArray = normalizedOffices.includes('registrar');
      const isRegistrarInString = typeof officeString === 'string' && officeString.toLowerCase() === 'registrar';
      return isRegistrarInArray || isRegistrarInString;
    }
    return false;
  }, [currentUser]);

  const canShowOfficeMessagingIcon = useMemo(() => {
    if (!currentUser) return false;
    return isAdminRegistrarOrProgramChair(currentUser as any);
  }, [currentUser]);

  return (
    <>
      <header 
        className="bg-[#0A0A0A]/95 border-b-2 border-green-500/20 shadow-2xl shadow-green-500/10 sticky top-0 z-[9999] transition-all duration-500 ease-in-out backdrop-blur-xl ring-1 ring-green-400/10 w-full max-w-full"
        data-tutorial="navbar"
      >
        <div className="container mx-auto px-2 sm:px-3 md:px-4 w-full max-w-full">
          <div className="flex items-center justify-between py-1.5 sm:py-2 md:py-3 w-full min-w-0">
            {/* Logo */}
            <div 
              className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 flex items-center justify-center transform hover:scale-110 transition-transform duration-300 cursor-pointer relative"
              onClick={handleLogoClick}
              title={isHomePage ? "About BulSU Space" : "Go to Homepage"}
            >
              <img
                src="/images/bulsu-space-logo.png"
                alt="BulSU Space Logo"
                className="h-full w-full object-contain drop-shadow-[0_0_16px_rgba(34,197,94,0.6)] hover:drop-shadow-[0_0_20px_rgba(34,197,94,0.8)] transition-all duration-300"
              />
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-green-400/10 to-green-600/5 opacity-0 hover:opacity-100 transition-opacity duration-300"></div>
            </div>

            {/* Search Bar */}
            <div className="flex-1 min-w-0 max-w-xs sm:max-w-sm md:max-w-md mx-2 sm:mx-3 md:mx-4">
              <div className="relative group" ref={searchResultsRef}>
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="w-full bg-gradient-to-r from-green-900/40 via-gray-900/70 to-green-800/30 border-2 border-green-700/40 text-green-200 placeholder-green-400/70 rounded-full py-2 px-4 text-sm font-medium shadow-lg shadow-green-500/10 focus:outline-none focus:ring-2 focus:ring-green-500/60 focus:border-green-600/60 focus:shadow-xl focus:shadow-green-500/20 transition-all duration-300 backdrop-blur-sm"
                />
                {isSearching ? (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center">
                    <div className="h-4 w-4 border-2 border-t-transparent border-green-500 rounded-full animate-spin"></div>
                  </div>
                ) : (
                  <span className="material-icons absolute right-3.5 top-1/2 -translate-y-1/2 text-[21px] leading-none align-middle text-green-400">search</span>
                )}
                
                {/* Search Results Dropdown */}
                {showSearchResults && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-gray-950 rounded-xl border-2 border-green-700/30 shadow-2xl shadow-green-500/20 z-[10001] max-h-80 overflow-y-auto ring-1 ring-green-400/20 mobile-scrollbar-hide">
                    <div className="p-2">
                      <div className="text-xs text-green-400 font-semibold mb-1 px-2">Search Results</div>
                      {searchResults.some(user => user.role === 'alumni') && (
                        <div className="text-[9px] text-green-300/70 mb-2 px-2">
                          {searchResults.some(user => user.role === 'alumni' && user.graduationBatch === searchQuery) ? 
                            `Showing alumni from batch ${searchQuery}` : 
                            `Tip: For searching for Alumni, search for exact batches like "2013-2014" to find all alumni of that year`}
                        </div>
                      )}
                      {searchResults.length > 0 ? (
                        <div className="space-y-1">
                          {searchResults.map((user) => (
                            <div 
                              key={user.id}
                              onClick={() => handleUserSelect(user.id)}
                              className="flex items-center gap-2 p-2 hover:bg-green-800/20 rounded-lg cursor-pointer transition-colors"
                            >
                              {user.profile_pic ? (
                                <img 
                                  src={user.profile_pic} 
                                  alt={user.name} 
                                  className="w-8 h-8 rounded-full object-cover border border-green-700/30"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.onerror = null;
                                    target.src = '/images/default-avatar.png';
                                  }}
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-700 border border-green-700/30 flex items-center justify-center text-green-400 font-bold text-sm">
                                  {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-green-200 truncate">{user.name}</div>
                                <div className="text-[10px] text-green-400 truncate capitalize">
                                  {user.role || 'Student'}
                                  {user.role === 'alumni' ? ` • ${user.graduationBatch ? `Batch ${user.graduationBatch}` : 'Alumni'}` : ''}
                                  {user.department && user.role !== 'alumni' ? ` • ${user.department}` : ''}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 py-2 px-2">No users found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Navigation Icons - Hide on mobile entirely */}
            <div className="hidden md:flex items-center gap-5">
              {getVisibleNavItems().map((item) => {
                const isActive = activeTab === item.tab;
                const routeMap: Record<string, string> = {
                  'home': '/home',
                  'events': '/events',
                  'popular-groups': '/groups',
                  'community-access': '/community-access',
                  'account-creator': '/account-creator',
                  'notifications': '/notifications',
                  'messages': '/messages'
                };
                
                return (
                  <Link
                    key={item.tab}
                    to={routeMap[item.tab] || '/'}
                    className={`top-nav-icon nav-icon relative group p-2.5 rounded-xl transition-all duration-300 flex items-center
                      ${isActive 
                        ? 'bg-green-900/40 ring-2 ring-green-500/80 shadow-xl shadow-green-500/30 scale-110 text-green-400 border border-green-400/20' 
                        : 'hover:bg-gray-800/60 hover:shadow-lg hover:shadow-green-500/10 text-gray-400 border border-transparent'
                      }`}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    tabIndex={0}
                    onMouseEnter={() => {}}
                    onMouseLeave={() => {}}
                    onClick={(e) => handleMessagesIconClick(e, item.tab === 'messages')}
                  >
                    <span className={`${(item.tab === 'popular-groups') ? 'material-symbols-outlined' : 'material-icons'} text-xl transform group-hover:scale-110 transition-all duration-300 
                      ${isActive ? 'text-green-400 drop-shadow-[0_0_8px_rgba(34,197,94,0.7)]' : 'text-gray-400'} 
                      group-hover:text-gray-200 !border-none`}>
                      {item.icon}
                    </span>
                  {item.tab === 'notifications' && unreadNotifCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center bg-gradient-to-br from-green-500 to-green-600 
                      text-xs font-semibold text-white rounded-full shadow-lg shadow-green-500/50 border-2 border-green-400/30 transform scale-90 group-hover:scale-100 transition-all duration-300 animate-pulse">
                      {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                    </span>
                  )}
                  {item.tab === 'messages' && unreadMessageCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center bg-gradient-to-br from-green-500 to-green-600 
                      text-xs font-semibold text-white rounded-full shadow-lg shadow-green-500/50 border-2 border-green-400/30 transform scale-90 group-hover:scale-100 transition-all duration-300 animate-pulse">
                      {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                    </span>
                  )}
                  {item.tab === 'messages' && hasIncomingCall && (
                    <span
                      className="absolute -bottom-1 -right-1 h-4 w-4 flex items-center justify-center rounded-full bg-red-500 text-white border border-red-300/60 shadow-md shadow-red-500/40 animate-pulse"
                      title="Incoming call"
                      aria-label="Incoming call"
                    >
                      <span className="material-icons text-[10px] leading-none">call</span>
                    </span>
                  )}
                  <span className="absolute -bottom-5 left-1/2 transform -translate-x-1/2 scale-0 group-hover:scale-100 
                    transition-all duration-300 text-xs font-medium text-gray-200 whitespace-nowrap 
                    bg-gray-900/95 backdrop-blur-xl px-3 py-1.5 rounded-lg shadow-xl shadow-green-500/20 border border-green-700/30 ring-1 ring-green-400/10">
                    {item.label}
                  </span>
                </Link>
                );
              })}

              {canShowOfficeMessagingIcon && (
                <Link
                  to="/messages"
                  className={`top-nav-icon nav-icon relative group p-2.5 rounded-xl transition-all duration-300 flex items-center
                    ${activeTab === 'messages'
                      ? 'bg-green-900/40 ring-2 ring-green-500/80 shadow-xl shadow-green-500/30 scale-110 text-green-400 border border-green-400/20'
                      : 'hover:bg-gray-800/60 hover:shadow-lg hover:shadow-green-500/10 text-gray-400 border border-transparent'
                    }`}
                  aria-label="Messages"
                  aria-current={activeTab === 'messages' ? 'page' : undefined}
                >
                  <span className={`material-icons text-xl transform group-hover:scale-110 transition-all duration-300 !border-none ${activeTab === 'messages' ? 'text-green-400 drop-shadow-[0_0_8px_rgba(34,197,94,0.7)]' : 'text-gray-400 group-hover:text-gray-200'}`}>
                    mail
                  </span>
                  {unreadMessageCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center bg-gradient-to-br from-green-500 to-green-600 text-xs font-semibold text-white rounded-full shadow-lg shadow-green-500/50 border-2 border-green-400/30 transform scale-90 group-hover:scale-100 transition-all duration-300 animate-pulse">
                      {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                    </span>
                  )}
                  {hasIncomingCall && (
                    <span
                      className="absolute -bottom-1 -right-1 h-4 w-4 flex items-center justify-center rounded-full bg-red-500 text-white border border-red-300/60 shadow-md shadow-red-500/40 animate-pulse"
                      title="Incoming call"
                      aria-label="Incoming call"
                    >
                      <span className="material-icons text-[10px] leading-none">call</span>
                    </span>
                  )}
                  <span className="absolute -bottom-5 left-1/2 transform -translate-x-1/2 scale-0 group-hover:scale-100 transition-all duration-300 text-xs font-medium text-gray-200 whitespace-nowrap bg-gray-900/95 backdrop-blur-xl px-3 py-1.5 rounded-lg shadow-xl shadow-green-500/20 border border-green-700/30 ring-1 ring-green-400/10">
                    Messages
                  </span>
                </Link>
              )}
            </div>

            {/* User Dropdown - Desktop version uses dropdown, Mobile version uses drawer */}
            <div className="relative" ref={userDropdownRef}>
              <button
                onClick={() => {
                  // Use drawer for mobile, dropdown for desktop
                  if (isMobileView) {
                    setMobileDrawerOpen(true);
                  } else {
                    setUserDropdownOpen((open) => !open);
                  }
                }}
                className={`flex items-center gap-1 sm:gap-2 focus:outline-none p-2.5 rounded-xl 
                  transition-all duration-300 group relative ${isMobileView 
                    ? 'bg-transparent text-green-200 hover:text-green-400 focus:ring-1 focus:ring-green-500/50' 
                    : 'bg-transparent text-green-200 hover:bg-gray-800/60 hover:shadow-lg hover:shadow-green-500/10 border border-transparent'}`}
                aria-label={isMobileView ? "Open menu" : "User menu"}
              >
                {isMobileView ? (
                  <div className="flex items-center justify-center">
                    <span className="material-icons text-gray-300 text-xl sm:text-2xl group-hover:text-green-400 transition-colors">
                      menu
                    </span>
                  </div>
                ) : (
                  <div className="relative">
                    {currentUser?.profile_pic ? (
                      <img 
                        src={currentUser.profile_pic} 
                        alt={currentUser.name} 
                        className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 rounded-full object-cover border border-gray-700/30"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.onerror = null;
                          target.src = '/images/default-avatar.png';
                        }}
                      />
                    ) : (
                      <span className="material-icons text-green-200 text-xl sm:text-2xl group-hover:text-green-100">
                        account_circle
                      </span>
                    )}
                  </div>
                )}
                <span className="hidden md:inline text-sm text-green-200 font-medium group-hover:text-white transition-colors">
                  {currentUser?.name?.split(' ')[0]}
                </span>
                <span className="material-icons text-green-200 text-base sm:text-lg hidden sm:inline-block group-hover:text-white transition-colors">
                  expand_more
                </span>
                {/* Removing top indicator since we're going for a cleaner look */}
              </button>
              {/* Standard dropdown for desktop/tablet */}
              {userDropdownOpen && !isMobileView && (
                <div className="absolute right-0 mt-2 w-56 sm:w-64 rounded-xl shadow-2xl shadow-green-500/20 bg-gray-900 backdrop-blur-xl ring-2 ring-green-800/40 border border-green-700/30 z-[10000] overflow-hidden">
                  <div className="p-2.5 sm:p-3 border-b border-green-800/30">
                    <div className="flex items-center space-x-2 sm:space-x-3">
                      {currentUser?.profile_pic ? (
                        <img 
                          src={currentUser.profile_pic} 
                          alt={currentUser.name} 
                          className="h-9 w-9 sm:h-10 sm:w-10 rounded-full object-cover border-2 border-green-600/40"
                        />
                      ) : (
                        <span className="material-icons text-green-500 text-2xl sm:text-3xl">account_circle</span>
                      )}
                      <div>
                        <div className="text-xs sm:text-sm font-medium text-gray-200">{currentUser?.name}</div>
                        <div className="text-[10px] sm:text-xs text-gray-400">{currentUser?.email}</div>
                        <div className="text-[10px] sm:text-xs text-green-400 capitalize">{formatRoleWithOffice(currentUser)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="py-1">
                    <Link to="/profile" className="block w-full px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-300 hover:bg-gray-800 hover:text-green-400">
                      <span className="flex items-center gap-1.5 sm:gap-2">
                        <span className="material-icons text-green-500 text-xs sm:text-sm">person</span>
                        <span>Your Profile</span>
                      </span>
                    </Link>
                    {/* Expression Board removed per request */}
                    <Link to="/settings" className="block w-full px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-300 hover:bg-gray-800 hover:text-green-400">
                      <span className="flex items-center gap-1.5 sm:gap-2">
                        <span className="material-icons text-green-500 text-xs sm:text-sm">settings</span>
                        <span>Settings</span>
                      </span>
                    </Link>
                    {/* {currentUser && currentUser.role === 'super admin' && (
                      <Link to="/monitor" className="block w-full px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-300 hover:bg-gray-800 hover:text-emerald-400">
                        <span className="flex items-center gap-1.5 sm:gap-2">
                          <span className="material-icons text-emerald-500 text-xs sm:text-sm">dashboard</span>
                          <span>Monitor</span>
                        </span>
                      </Link>
                    )} */}
                    <button 
                      onClick={() => logout()}
                      disabled={loading}
                      className="block w-full px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-300 bg-transparent hover:bg-gray-800 hover:text-red-300 disabled:text-gray-500 disabled:bg-gray-800/50 disabled:cursor-not-allowed"
                    >
                      <span className="flex items-center gap-1.5 sm:gap-2">
                        {loading ? (
                          <>
                            <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                            <span>Signing out...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-icons text-green-500 text-xs sm:text-sm">logout</span>
                            <span>Sign out</span>
                          </>
                        )}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Logo Modal */}
      {logoModalOpen && (
        <LogoModal onClose={() => setLogoModalOpen(false)} />
      )}

      {/* Mobile Menu Drawer - triggered by hamburger icon */}
      {currentUser && (
        <MobileProfileDrawer 
          isOpen={mobileDrawerOpen} 
          onClose={() => {
            console.log('Closing drawer from parent');
            setMobileDrawerOpen(false);
          }} 
          user={currentUser} 
          isLoggingOut={isLoggingOut} 
          setIsLoggingOut={setIsLoggingOut} 
          logout={() => logout()} 
          loading={loading}
        />
      )}
    </>
  );
};

export default Navbar;

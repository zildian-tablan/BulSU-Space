import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/layout/Navbar';
import {
  getActiveJobOpenings,
  createJobOpening,
  deleteJobOpening,
  getJobOpenings,
} from '../services/jobService';
import { JobOpening } from '../types';

const JobsPage: React.FC = () => {
  const { currentUser: user } = useAuth();

  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobSearchTerm, setJobSearchTerm] = useState('');
  const [selectedJobType, setSelectedJobType] = useState<string | null>(null);

  // Post job form state
  const [showPostJobModal, setShowPostJobModal] = useState(false);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [jobPostSuccess, setJobPostSuccess] = useState(false);
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

  useEffect(() => {
    const loadJobs = async () => {
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

    loadJobs();
  }, []);

  const refreshJobs = async () => {
    setLoadingJobs(true);
    try {
      const jobsData = await getActiveJobOpenings();
      setJobs(jobsData);
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleJobInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target as HTMLInputElement;
    setNewJob(prev => ({ ...prev, [name]: value }));
  };

  const handleJobFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    if (!newJob.title || !newJob.company || !newJob.location || !newJob.applicationUrl) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmittingJob(true);
    try {
      await createJobOpening({
        title: newJob.title,
        company: newJob.company,
        location: newJob.location,
        type: newJob.type as any,
        description: newJob.description,
        requirements: newJob.description.split('\n').filter(r => r.trim() !== ''),
        applicationUrl: newJob.applicationUrl,
        logo: newJob.logo || undefined,
        salary_range: newJob.salaryRange || undefined,
        expiresAt: newJob.expiresAt || undefined
      } as any, user.id);

      setJobPostSuccess(true);
      setTimeout(async () => {
        setShowPostJobModal(false);
        setJobPostSuccess(false);
        setNewJob({ title: '', company: '', location: '', type: 'Full-time', salaryRange: '', description: '', applicationUrl: '', logo: '', expiresAt: '' });
        await refreshJobs();
      }, 1200);
    } catch (error) {
      console.error('Error posting job:', error);
      alert('Failed to post job');
    } finally {
      setIsSubmittingJob(false);
    }
  };

  const canDeleteJob = (jobCreatedBy?: string) => {
    if (!user) return false;
    const isAuthor = jobCreatedBy === user.id;
    const isAdmin = user.role === 'admin';
    const isSuperAdmin = user.role === 'super admin';
    return isAuthor || isAdmin || isSuperAdmin;
  };

  const handleDeleteJob = async (jobId: string, jobCreatedBy?: string) => {
    if (!user) return;
    if (!canDeleteJob(jobCreatedBy)) {
      alert('You do not have permission to delete this job posting.');
      return;
    }

    const confirmed = window.confirm('Are you sure you want to delete this job posting? This action cannot be undone.');
    if (!confirmed) return;

    try {
      await deleteJobOpening(jobId);
      await refreshJobs();
      alert('Job posting deleted successfully.');
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Failed to delete job posting.');
    }
  };

  const filteredJobs = jobs.filter(job => (
    (selectedJobType === null || job.type === selectedJobType) &&
    (jobSearchTerm === '' ||
      job.title.toLowerCase().includes(jobSearchTerm.toLowerCase()) ||
      job.company.toLowerCase().includes(jobSearchTerm.toLowerCase()) ||
      job.location.toLowerCase().includes(jobSearchTerm.toLowerCase())
    )
  ));

  const modalPortal = showPostJobModal ? createPortal(
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[9999]">
      <div className="bg-gradient-to-br from-gray-950 to-black p-0 rounded-2xl w-[90vw] sm:w-[80vw] md:w-[70vw] lg:w-[60vw] xl:w-[50vw] max-w-4xl shadow-2xl border border-gray-800/50 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-950/60 via-gray-950/80 to-indigo-950/40 border-b border-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor"><path d="M6 2a1 1 0 00-.894.553L2 9v7a2 2 0 002 2h12a2 2 0 002-2V9l-3.106-6.447A1 1 0 0014 2H6z" /></svg>
            </div>
            <h2 className="text-white text-xl font-bold tracking-tight">Post a Job Opening</h2>
          </div>
          <button onClick={() => setShowPostJobModal(false)} className="text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg p-2 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>
  <div className="p-6 bg-gradient-to-b from-gray-950/95 to-black/95 max-h-[75vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          {jobPostSuccess ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-400 text-lg font-medium">Job posted successfully!</p>
            </div>
          ) : (
      <form onSubmit={handleJobFormSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-300 font-medium">Job Title<span className="text-red-400">*</span></span>
        <input name="title" value={newJob.title} onChange={handleJobInputChange} placeholder="e.g. Software Engineer" className="w-full px-4 py-2.5 bg-gray-900/60 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-500 transition-all" required />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-300 font-medium">Company<span className="text-red-400">*</span></span>
                <input name="company" value={newJob.company} onChange={handleJobInputChange} placeholder="e.g. Tech Corp" className="w-full px-4 py-2.5 bg-gray-900/60 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-500 transition-all" required />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-300 font-medium">Location<span className="text-red-400">*</span></span>
                <input name="location" value={newJob.location} onChange={handleJobInputChange} placeholder="e.g. Manila, Philippines" className="w-full px-4 py-2.5 bg-gray-900/60 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-500 transition-all" required />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-300 font-medium">Job Type</span>
                <select name="type" value={newJob.type} onChange={handleJobInputChange} className="w-full px-4 py-2.5 bg-gray-900/60 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white transition-all">
                  <option>Full-time</option>
                  <option>Part-time</option>
                  <option>Remote</option>
                  <option>Internship</option>
                  <option>Contract</option>
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-300 font-medium">Salary Range</span>
                <input name="salaryRange" value={newJob.salaryRange} onChange={handleJobInputChange} placeholder="e.g. PHP 20,000 - 30,000" className="w-full px-4 py-2.5 bg-gray-900/60 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-500 transition-all" />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-300 font-medium">Application URL<span className="text-red-400">*</span></span>
                <input name="applicationUrl" value={newJob.applicationUrl} onChange={handleJobInputChange} placeholder="https://example.com/apply" className="w-full px-4 py-2.5 bg-gray-900/60 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-500 transition-all" required />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-300 font-medium">Expires At</span>
                <input type="date" name="expiresAt" value={newJob.expiresAt} onChange={handleJobInputChange} className="w-full px-4 py-2.5 bg-gray-900/60 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white transition-all" />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-300 font-medium">Logo URL</span>
                <input name="logo" value={newJob.logo} onChange={handleJobInputChange} placeholder="https://.../logo.png" className="w-full px-4 py-2.5 bg-gray-900/60 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-500 transition-all" />
              </label>

              <label className="flex flex-col gap-2 md:col-span-2">
                <span className="text-sm text-gray-300 font-medium">Job Description<span className="text-red-400">*</span></span>
                <textarea name="description" value={newJob.description} onChange={handleJobInputChange} placeholder="Responsibilities, requirements, benefits..." className="w-full px-4 py-2.5 bg-gray-900/60 rounded-lg min-h-[140px] border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-500 transition-all resize-none" required />
              </label>

              <div className="flex items-center gap-3 mt-2 md:col-span-2 justify-end">
                <button type="button" onClick={() => setShowPostJobModal(false)} className="px-5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium transition-all">Cancel</button>
                <button type="submit" disabled={isSubmittingJob} className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium shadow-lg hover:shadow-xl disabled:opacity-60 transition-all">{isSubmittingJob ? 'Posting...' : 'Submit Job'}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>, document.body) : null;
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#08080a] to-[#0b0b0d] text-gray-100">
      <Navbar />
      <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-7xl">
        <div className="grid grid-cols-1 gap-6 py-8">
          <div className="col-span-1 w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-2">Alumni Job Openings</h1>
                <p className="text-sm text-gray-400">Opportunities from the BulSU community and partners. Posting available to alumni.</p>
              </div>
              <div className="flex items-center gap-3">
                {user?.role === 'alumni' && (
                  <button onClick={() => setShowPostJobModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2.5 rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 font-medium flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Post a Job
                  </button>
                )}
                <button onClick={() => refreshJobs()} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2.5 rounded-lg font-medium hover:border-gray-600 transition-all flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  Refresh
                </button>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex flex-col sm:flex-row gap-3">
                <input value={jobSearchTerm} onChange={e => setJobSearchTerm(e.target.value)} placeholder="Search job title, company, location..." className="flex-1 bg-gray-900/60 px-4 py-3 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-500 text-white transition-all" />
                <select value={selectedJobType ?? ''} onChange={e => setSelectedJobType(e.target.value === '' ? null : e.target.value)} className="bg-gray-900/60 px-4 py-3 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white sm:w-48 transition-all">
                  <option value="">All Types</option>
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Remote">Remote</option>
                  <option value="Internship">Internship</option>
                  <option value="Contract">Contract</option>
                </select>
              </div>
            </div>

            <div>
              {loadingJobs ? (
                <div className="p-12 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
                  <p className="text-gray-400">Loading job opportunities...</p>
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="p-12 text-center bg-gray-900/40 rounded-2xl border border-gray-800/50">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto mb-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-400">No job openings found.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredJobs.map(job => (
                    <div key={job.id} className="p-5 bg-gradient-to-br from-gray-900/80 to-gray-950/80 rounded-xl border border-gray-800/60 shadow-lg hover:shadow-2xl hover:border-blue-500/40 transform hover:-translate-y-1 transition-all duration-200 flex flex-col gap-3 backdrop-blur-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-gray-700 to-gray-900 flex-shrink-0 ring-2 ring-gray-800/50 shadow-md">
                          <img src={job.logo} alt={job.company} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'https://via.placeholder.com/48x48?text=' + (job.company?.charAt(0) || '') }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-bold text-white truncate">{job.title}</h3>
                          <div className="text-xs text-gray-400 truncate flex items-center gap-1">
                            <span className="font-medium">{job.company}</span>
                            <span>•</span>
                            <span>{job.location}</span>
                          </div>
                        </div>
                      </div>

                      <p className="text-sm text-gray-300 line-clamp-3 leading-relaxed">{job.description}</p>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-800/50">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs uppercase tracking-wider font-semibold text-blue-300 bg-blue-600/20 px-2.5 py-1 rounded-md">{job.type}</span>
                          {(((job as any).salary_range) || ((job as any).salaryRange)) && (
                            <span className="text-xs font-medium text-green-300 bg-green-900/30 px-2.5 py-1 rounded-md">{(job as any).salary_range ?? (job as any).salaryRange}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button onClick={() => job.applicationUrl && window.open(job.applicationUrl, '_blank')} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-md hover:shadow-lg transition-all">Apply</button>
                          {canDeleteJob(job.createdBy) && (
                            <button onClick={() => handleDeleteJob(job.id, job.createdBy)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-md transition-all">Delete</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {modalPortal}
    </div>
  );
};

export default JobsPage;

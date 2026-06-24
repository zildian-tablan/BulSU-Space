import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import { useAuth, User } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { MagnifyingGlassIcon, ArrowPathIcon, CheckIcon, XMarkIcon, NoSymbolIcon, ShieldExclamationIcon, UserPlusIcon, ArrowPathRoundedSquareIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { doc, updateDoc, collection, onSnapshot } from 'firebase/firestore';
import RevokeConfirmModal from '../components/modals/RevokeConfirmModal';
import ArchiveConfirmModal from '../components/modals/ArchiveConfirmModal';
import SimpleArchiveConfirmModal from '../components/modals/SimpleArchiveConfirmModal';
import SuccessDialog from '../components/common/SuccessDialog';
import ConfirmModal from '../components/common/ConfirmModal';
import { usersAPI } from '../services/api';
import { db } from '../firebase/config';
import { ActivityLogger } from '../services/activityLogService';

// Extend User type locally to include 'restricted' and 'revoked' for access management
interface UserWithRestricted extends User {
  restricted?: boolean;
  revoked?: boolean;
  restrictedAt?: string; // ISO timestamp when restriction applied
  restrictionExpiresAt?: string; // ISO timestamp when restriction will auto-lift
}

const BLOCKED_COMMUNITY_ACCESS_ROLES: User['role'][] = ['guest', 'librarian', 'infirmary'];

const CommunityAccessPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { setActiveTab } = useSidebar();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserWithRestricted[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);  
  const [revoking, setRevoking] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);  const [restoring, setRestoring] = useState<string | null>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showSimpleArchiveModal, setShowSimpleArchiveModal] = useState(false);
  const [archiveTargetUser, setArchiveTargetUser] = useState<UserWithRestricted | null>(null);
  
  const [showArchives, setShowArchives] = useState(false);
  const [statsCollapsed, setStatsCollapsed] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [modalTargetUser, setModalTargetUser] = useState<UserWithRestricted | null>(null);
  const [modalLoading, setModalLoading] = useState<null | 'soft' | 'force'>(null);
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successTitle, setSuccessTitle] = useState<string | undefined>(undefined);
  const [successMessage, setSuccessMessage] = useState<React.ReactNode>('');
  const usersPerPage = 10;

  // Set active tab immediately when component mounts
  useEffect(() => {
    setActiveTab('community-access');
  }, [setActiveTab]);

  useEffect(() => {
    if (!currentUser) return;
    if (BLOCKED_COMMUNITY_ACCESS_ROLES.includes(currentUser.role)) {
      // Restricted roles are redirected before Community Access data flows run
      navigate('/home', { replace: true });
    }
  }, [currentUser, navigate]);

  // Realtime users subscription (replaces one-time getAllUsers fetch)
  useEffect(() => {
    if (!currentUser) return;
    if (BLOCKED_COMMUNITY_ACCESS_ROLES.includes(currentUser.role)) {
      setLoading(false);
      return;
    }

    const usersCol = collection(db, 'users');
    const unsub = onSnapshot(usersCol, async snap => {
      const now = Date.now();
      const list: UserWithRestricted[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      // Auto-clear any expired restrictions (best-effort, non-blocking)
      for (const u of list) {
        if (u.restricted && u.restrictionExpiresAt) {
          const expires = Date.parse(u.restrictionExpiresAt);
            if (!isNaN(expires) && expires <= now) {
              // Fire-and-forget update to clear restriction
              updateDoc(doc(db, 'users', u.id), {
                restricted: false,
                restrictedAt: null,
                restrictionExpiresAt: null
              }).catch(e => console.warn('[CommunityAccess] Failed to auto-clear expired restriction for', u.id, e));
              // Reflect immediately in local list
              u.restricted = false;
              u.restrictedAt = undefined;
              u.restrictionExpiresAt = undefined;
            }
        }
      }
      setUsers(list);
      setLoading(false);
    }, err => {
      console.error('[CommunityAccess] Realtime users subscription error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  // Revoke (flag) user - deletion will occur only after user acknowledges modal
  const openRevokeModal = (user: UserWithRestricted) => {
    setModalTargetUser(user);
    setShowRevokeModal(true);
  };

  const handleSoftRevoke = async () => {
    if (!modalTargetUser) return;
    const userId = modalTargetUser.id;
    setModalLoading('soft');
    try {
      await updateDoc(doc(db, 'users', userId), { revoked: true, revokedAt: new Date().toISOString() });
      setUsers(users => users.map(u => u.id === userId ? { ...u, revoked: true } : u));
      if (currentUser?.role === 'admin' || currentUser?.role === 'super admin') {
        const logger = ActivityLogger.getInstance();
        await logger.logActivity(
          'user_access_revoked',
          `Revoked access for user ${userId}`,
          { targetUserId: userId, action: 'revoke' },
          'medium',
          userId,
          'user'
        );
      }
      setShowRevokeModal(false);
      setModalTargetUser(null);
    } catch (e) {
      console.error('[CommunityAccess] Soft revoke failed:', e);
      alert('Failed to revoke user');
    } finally {
      setModalLoading(null);
    }
  };

  // Request to open a confirm dialog for force delete (avoids window.confirm and reuses ConfirmModal styles)
  const requestForceDelete = () => {
    if (!modalTargetUser) return;
    setShowForceConfirm(true);
  };

  // Perform the actual force delete once user confirms in ConfirmModal
  const performForceDelete = async () => {
    if (!modalTargetUser) return;
    const userId = modalTargetUser.id;
    setModalLoading('force');
    // close the small confirm dialog while the action proceeds
    setShowForceConfirm(false);
    try {
      const success = await usersAPI.deleteUser(userId);
      if (success) {
        setUsers(users => users.filter(u => u.id !== userId));
        if (currentUser?.role === 'admin' || currentUser?.role === 'super admin') {
          const logger = ActivityLogger.getInstance();
          await logger.logActivity(
            'user_access_revoked',
            `Force deleted user ${userId}`,
            { targetUserId: userId, action: 'force_delete' },
            'high',
            userId,
            'user'
          );
        }
      } else {
        alert('Force delete failed');
      }
      setShowRevokeModal(false);
      setModalTargetUser(null);
    } catch (e) {
      console.error('[CommunityAccess] Force delete failed:', e);
      alert('Force delete failed');
    } finally {
      setModalLoading(null);
    }
  };
  const handleRestore = async (userId: string) => {
    console.log('[CommunityAccess] Restoring access for user (optimistic):', userId);
    setRestoring(userId);
    // Optimistic UI update BEFORE network
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, restricted: false, revoked: false } : u));
    let reverted = false;
    try {
      // Firestore write
      // End spinner immediately for instant feel
      setRestoring(null);
      const writePromise = updateDoc(doc(db, 'users', userId), { restricted: false, revoked: false })
        .then(() => console.log('[CommunityAccess] Firestore updated for restore:', userId))
        .catch(err => { throw err; });
      // Fire-and-forget activity log so UI isn't blocked; start concurrently
      if (currentUser?.role === 'admin' || currentUser?.role === 'super admin') {
        const logger = ActivityLogger.getInstance();
        void logger.logActivity(
          'user_access_restored',
          `Restored access for user ${userId}`,
          { targetUserId: userId, action: 'restore' },
          'medium',
          userId,
          'user'
        ).catch(err => console.warn('[CommunityAccess] Restore activity log failed (non-blocking):', err));
      }
      await writePromise;
  // Show success dialog for restore
  setSuccessTitle('User restored');
  setSuccessMessage(`User has been restored.`);
  setSuccessOpen(true);
    } catch (e) {
      console.error('[CommunityAccess] Restore failed, reverting optimistic change:', e);
      // Revert optimistic change if server write failed
      reverted = true;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, restricted: true, revoked: true } : u));
      alert('Failed to restore user access. Please retry.');
      // Show brief spinner again to indicate rollback
      setRestoring(null);
    } finally {
      if (!reverted) console.log('[CommunityAccess] Restore completed (UI already updated):', userId);
    }
  };

  const openArchiveModal = (user: UserWithRestricted) => {
    setArchiveTargetUser(user);
    // If user is not a student, show simple confirmation modal
    if (user.role !== 'student') {
      setShowSimpleArchiveModal(true);
    } else {
      // For students, show the remarks modal
      setShowArchiveModal(true);
    }
  };

  const handleArchive = async (userId: string, remark: string) => {
    console.log('[CommunityAccess] Archiving user (provisionally):', userId, 'remark:', remark);
    setArchiving(userId);
    // Get user info for success message
    const userToArchive = users.find(u => u.id === userId);
    // Compute expiration (3 days) - preserved from previous restrict behavior
    const now = new Date();
    const expires = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    // Optimistic UI: reflect archived state immediately (include expiry metadata and remark)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, restricted: true, restrictedAt: now.toISOString(), restrictionExpiresAt: expires.toISOString(), archiveRemark: remark } as any : u));
    setShowArchiveModal(false);
    setShowSimpleArchiveModal(false);
    setArchiveTargetUser(null);
    setArchiving(null); // clear spinner instantly for instant feel
    let reverted = false;
    const writePromise = updateDoc(doc(db, 'users', userId), { 
      restricted: true,
      restrictedAt: now.toISOString(),
      restrictionExpiresAt: expires.toISOString(),
      archiveRemark: remark
    })
      .then(() => console.log('[CommunityAccess] Firestore updated for archive:', userId))
      .catch(err => { throw err; });
    // Fire-and-forget activity log
    if (currentUser?.role === 'admin' || currentUser?.role === 'super admin') {
      const logger = ActivityLogger.getInstance();
      void logger.logActivity(
        'user_access_restricted',
        `Archived user ${userId} (${remark})`,
        { targetUserId: userId, action: 'archive', remark },
        'medium',
        userId,
        'user'
      ).catch(err => console.warn('[CommunityAccess] Archive activity log failed (non-blocking):', err));
    }
    try {
      await writePromise;
    // Show success dialog for archive
    setSuccessTitle('User archived');
    setSuccessMessage(`${userToArchive?.name || 'User'} has been archived.`);
    setSuccessOpen(true);
    } catch (e) {
      console.error('[CommunityAccess] Archive failed, reverting optimistic change:', e);
      reverted = true;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, restricted: false, restrictedAt: undefined, restrictionExpiresAt: undefined, archiveRemark: undefined } as any : u));
      alert('Failed to archive user. Please retry.');
    } finally {
      if (!reverted) console.log('[CommunityAccess] Archive completed (UI already updated):', userId);
    }
  };

  

  // Registrar helper: determine if current user is admin with Registrar office ONLY (exclude super admin)
  const officeField = (currentUser as any)?.office;
  const hasRegistrarOffice = Array.isArray(officeField)
    ? officeField.some((o: any) => typeof o === 'string' && o.toLowerCase() === 'registrar')
    : typeof officeField === 'string' && officeField.toLowerCase() === 'registrar';
  const isRegistrarAdmin = currentUser?.role === 'admin' && hasRegistrarOffice;
  const canViewStats = isRegistrarAdmin || currentUser?.role === 'super admin';

  // Filter then sort users alphabetically (case-insensitive) by name (fallback to email)
  const filteredUsers = users
    .filter(u =>
      // If current user is registrar admin, only show students regardless of roleFilter
      (isRegistrarAdmin ? u.role === 'student' : (roleFilter === 'all' ? true : u.role === roleFilter)) &&
      (showArchives ? (u.restricted || u.revoked) : (!u.restricted && !u.revoked)) &&
      (u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      const aKey = (a.name || a.email || '').toLowerCase();
      const bKey = (b.name || b.email || '').toLowerCase();
      return aKey.localeCompare(bKey);
    });

  // Pagination calculations
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  // Reset to first page when search or archive view changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, showArchives]);

  // Define all possible archive remark types (must match ArchiveConfirmModal options)
  const ALL_REMARK_TYPES = [
    'Leave of Absence',
    'Transferee',
    'Shifter',
    'Unofficially Dropped',
    'Officially Dropped'
  ];

  // Compute archived student statistics (group by archiveRemark)
  const archivedStudentStats = React.useMemo(() => {
    // Only consider users that are students and currently restricted/archived (not revoked)
    const archivedStudents = users.filter(u => u.role === 'student' && u.restricted && !u.revoked);
    const totals = { archived: archivedStudents.length };
    
    // Initialize all remark types with 0
    const byRemark: Record<string, number> = {};
    ALL_REMARK_TYPES.forEach(remarkType => {
      byRemark[remarkType] = 0;
    });
    
    // Count actual remarks - only count if remark matches a predefined type
    for (const s of archivedStudents) {
      const remark = ((s as any).archiveRemark || '').toString();
      if (remark && byRemark.hasOwnProperty(remark)) {
        byRemark[remark] = byRemark[remark] + 1;
      }
      // Silently skip remarks that don't match predefined types (N/A, Unspecified, etc.)
    }
    
    return { totals, byRemark };
  }, [users]);

  // Compute enrolled student statistics (students that are NOT archived/revoked), grouped by department
  const enrolledStudentStats = React.useMemo(() => {
    const enrolledStudents = users.filter(u => u.role === 'student' && !u.restricted && !u.revoked);
    const totals = { enrolled: enrolledStudents.length };
    const byDepartment: Record<string, number> = {};
    for (const s of enrolledStudents) {
      const dept = ((s as any).department || '').toString();
      // Only count if department is not empty
      if (dept && dept.trim()) {
        byDepartment[dept] = (byDepartment[dept] || 0) + 1;
      }
    }
    return { totals, byDepartment };
  }, [users]);

  return (
    <>
      <MainLayout>
      <div className="container mx-auto max-w-5xl py-10 px-4">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-green-400 tracking-tight">
              {showArchives ? 'Archived & Revoked Users' : 'Community Access'}
          </h1>
          {/* Registrar-only statistics summary (visible to admin-registrar). Numbers are computed from archived students only. */}
          {canViewStats && (
            <div className="mt-4 mb-4">
              <div className="bg-gradient-to-b from-gray-900/85 to-gray-800/85 border border-green-700/20 rounded-xl p-3 shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-green-100">Student Statistics</h2>
                    <div className="text-[11px] text-green-400">Updated {new Date().toLocaleDateString()}</div>
                  </div>
                  <button
                    onClick={() => setStatsCollapsed(s => !s)}
                    className="px-2 py-1 rounded-md bg-gray-800/50 border border-green-700/10 text-green-200 text-sm hover:bg-gray-800/70 transition"
                    aria-expanded={!statsCollapsed}
                  >
                    {statsCollapsed ? 'Show' : 'Hide'}
                  </button>
                </div>

                {!statsCollapsed && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Archived card */}
                    <div className="h-full flex flex-col justify-between bg-gray-900/60 p-4 rounded-lg border border-green-700/10">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-orange-200">Archived Students</div>
                          <div className="text-3xl font-extrabold text-orange-300">{archivedStudentStats.totals.archived}</div>
                        </div>
                        <div className="text-xs font-semibold text-green-300 mb-2">Archive Reasons</div>
                        <div className="space-y-1.5 max-h-48 overflow-auto pr-1">
                          {ALL_REMARK_TYPES.map(remarkType => {
                            const count = archivedStudentStats.byRemark[remarkType] || 0;
                            const hasCount = count > 0;
                            return (
                              <div 
                                key={remarkType} 
                                className={`flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors ${
                                  hasCount 
                                    ? 'bg-orange-900/30 border border-orange-700/30' 
                                    : 'bg-gray-800/40 border border-gray-700/20'
                                }`}
                              >
                                <span className={`text-xs truncate max-w-[12rem] ${
                                  hasCount ? 'text-green-100 font-medium' : 'text-gray-400'
                                }`}>
                                  {remarkType}
                                </span>
                                <span className={`text-sm font-bold min-w-[2rem] text-right ${
                                  hasCount ? 'text-orange-300' : 'text-gray-500'
                                }`}>
                                  {count}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Enrolled card */}
                    <div className="h-full flex flex-col justify-between bg-gray-900/60 p-4 rounded-lg border border-green-700/10">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-green-100">Enrolled Students</div>
                          <div className="text-3xl font-extrabold text-green-200">{enrolledStudentStats.totals.enrolled}</div>
                        </div>
                        <div className="text-xs font-semibold text-green-300 mb-2">By Department</div>
                        <div className="space-y-1.5 max-h-48 overflow-auto pr-1">
                          {Object.keys(enrolledStudentStats.byDepartment).length === 0 ? (
                            <div className="text-green-400 text-sm px-2.5 py-1.5">No departments</div>
                          ) : (
                            Object.entries(enrolledStudentStats.byDepartment)
                              .sort(([, a], [, b]) => b - a) // Sort by count descending
                              .map(([dept, count]) => {
                                const hasCount = count > 0;
                                return (
                                  <div 
                                    key={dept} 
                                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors ${
                                      hasCount 
                                        ? 'bg-green-900/30 border border-green-700/30' 
                                        : 'bg-gray-800/40 border border-gray-700/20'
                                    }`}
                                  >
                                    <span className={`text-xs truncate max-w-[12rem] ${
                                      hasCount ? 'text-green-100 font-medium' : 'text-gray-400'
                                    }`}>
                                      {dept}
                                    </span>
                                    <span className={`text-sm font-bold min-w-[2rem] text-right ${
                                      hasCount ? 'text-green-300' : 'text-gray-500'
                                    }`}>
                                      {count}
                                    </span>
                                  </div>
                                );
                              })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-row items-end gap-3">
            {/* Dropdown (hidden for registrar admins) */}
            {!isRegistrarAdmin && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold uppercase tracking-wide text-green-400/80 mb-1 ml-1">
                  Role Filter
                </label>
                <div className="relative group">
                  <select
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
            className="w-full h-11 appearance-none bg-gray-900/90 border border-green-700/40 group-hover:border-green-500/50 focus:border-green-500/60 focus:ring-2 focus:ring-green-600/30 rounded-xl px-4 pr-10 text-sm text-green-100 font-medium transition-colors duration-200 shadow-sm focus:outline-none flex items-center"
                  >
                    {['all', 'student', 'faculty', 'alumni', 'admin', 'super admin', 'infirmary', 'librarian'].map(role => (
                      <option key={role} value={role} className="bg-gray-900 text-green-100">
                        {role === 'all' ? 'All Roles' : role.charAt(0).toUpperCase() + role.slice(1)}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-green-400 group-hover:text-green-300">
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 8l4 4 4-4" />
                    </svg>
                  </div>
                </div>
              </div>
            )}
            {/* Button lowered to align horizontally with dropdown (hidden for registrar admins - they get it next to search) */}
            {!isRegistrarAdmin && (
              <div className="flex items-end shrink-0 sm:w-56">
                <button
          className="relative h-11 px-3 rounded-xl bg-gradient-to-r from-green-700 via-green-600 to-green-700 text-white hover:from-green-600 hover:via-green-500 hover:to-green-600 font-semibold transition-all duration-300 ease-in-out shadow-sm hover:shadow-lg hover:shadow-green-500/30 border border-green-500/40 hover:border-green-400/60 flex items-center justify-center group backdrop-blur-sm"
                  onClick={() => setShowArchives(a => !a)}
                  title={showArchives ? 'Back to Active Users' : 'View Archived & Revoked Users'}
                >
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-400/10 via-green-300/5 to-green-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative flex items-center justify-center">
                    <span className={`material-icons text-lg leading-none transition-transform duration-300 flex-shrink-0 ${showArchives ? 'rotate-180' : ''}`} aria-hidden>
                      archive
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="relative mb-6">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                className="w-full bg-gray-900/90 border border-green-700/30 rounded-xl px-4 py-3 text-green-100 placeholder-green-500/50 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition duration-200 shadow-sm"
                placeholder="Search users by name or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button 
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-green-500 hover:text-green-400 bg-transparent hover:bg-transparent"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  type="button"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              )}
            </div>
            {/* For registrar admins, show the archive toggle inline with search */}
            {isRegistrarAdmin && (
              <div className="flex-shrink-0">
                <button
                  className="relative h-11 px-3 rounded-xl bg-gradient-to-r from-green-700 via-green-600 to-green-700 text-white hover:from-green-600 hover:via-green-500 hover:to-green-600 font-semibold transition-all duration-300 ease-in-out shadow-sm hover:shadow-lg hover:shadow-green-500/30 border border-green-500/40 hover:border-green-400/60 flex items-center justify-center group backdrop-blur-sm"
                  onClick={() => setShowArchives(a => !a)}
                  title={showArchives ? 'Back to Active Users' : 'View Archived & Revoked Users'}
                >
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-400/10 via-green-300/5 to-green-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative flex items-center justify-center">
                    <span className={`material-icons text-lg leading-none transition-transform duration-300 flex-shrink-0 ${showArchives ? 'rotate-180' : ''}`} aria-hidden>
                      archive
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <ArrowPathIcon className="h-12 w-12 animate-spin text-green-400" />
            <p className="text-green-300 font-medium">Loading users...</p>
          </div>
        ) : (
          <>
            {filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center bg-gray-900/60 border border-green-700/20 rounded-xl py-16 space-y-4">
                <div className="text-green-300 text-lg font-medium">No users found</div>
                <p className="text-green-400/60 text-sm">Try adjusting your search criteria</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {paginatedUsers.map(user => (
                    <div 
                      key={user.id} 
                      className="group bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/90 border border-green-700/30 rounded-lg shadow-md hover:shadow-lg hover:shadow-green-500/10 transition-all duration-300 p-3 flex items-center gap-3 hover:border-green-500/50 hover:scale-[1.01] backdrop-blur-sm"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500/20 to-green-600/30 border border-green-400/30 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <span className="text-green-300 font-bold text-base">
                          {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                        </span>
                      </div>
                        <div className="min-w-0 flex-1">
                        <Link 
                          to={`/profile/${user.id}`}
                          className="font-bold text-green-100 text-sm truncate group-hover:text-green-200 transition-colors hover:underline block"
                        >
                          {user.name}
                        </Link>
                        <div className="text-green-400/90 text-xs truncate">{user.email}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 bg-gradient-to-r from-green-900/40 to-green-800/40 rounded-md border border-green-600/30 shadow-sm">
                            {user.role}
                          </span>
                          {showArchives && (
                            <>
                              <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-md border shadow-sm ${
                                user.revoked 
                                  ? 'text-red-300 bg-gradient-to-r from-red-900/50 to-red-800/50 border-red-600/40'
                                  : 'text-orange-300 bg-gradient-to-r from-orange-900/50 to-orange-800/50 border-orange-600/40'
                              }`}>
                                {user.revoked ? 'Revoked' : 'Archived'}
                              </span>
                              {(!user.revoked && (user as any).archiveRemark && (user as any).archiveRemark !== 'N/A') && (
                                <span
                                  className="inline-block max-w-[10rem] text-[10px] truncate text-green-200 bg-green-900/30 border border-green-700/40 px-1.5 py-0.5 rounded-md shadow-sm"
                                  title={`Reason: ${(user as any).archiveRemark}`}
                                >
                                  {(user as any).archiveRemark}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-1.5 flex-shrink-0">
                        {showArchives ? (
                          <button
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gradient-to-r from-green-700/80 to-green-600/80 hover:from-green-600 hover:to-green-500 text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed shadow-sm hover:shadow-md transition-all duration-200 ease-in-out min-w-[80px] justify-center group"
                            onClick={() => handleRestore(user.id)}
                            disabled={restoring === user.id}
                            title="Restore user access"
                          >
                            {restoring === user.id ? (
                              <>
                                <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                                <span className="text-xs">Restoring...</span>
                              </>
                            ) : (
                              <>
                                <ArrowPathRoundedSquareIcon className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
                                <span className="text-xs">Restore</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <>
                            <div className="w-0" />
                            {/* Revoke / Force Delete option hidden by request.
                                Keeping original button code here inside a non-rendering
                                conditional for easy restoration later. */}
                            {/* Revoke / Force Delete button (restored) */}
                            {/* Revoke / Force Delete button intentionally commented out for now.
                                Keeping original button markup here so it can be restored easily.

                            {
                              // {!isRegistrarAdmin && (
                              //   <button
                              //     className="flex items-center gap-0.5 px-1.5 py-1.5 rounded-md bg-gradient-to-r from-red-700/80 to-red-600/80 hover:from-red-600 hover:to-red-500 text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed shadow-sm hover:shadow-md transition-all duration-200 ease-in-out justify-center group"
                              //     onClick={() => openRevokeModal(user)}
                              //     disabled={
                              //       revoking === user.id ||
                              //       user.id === currentUser?.id ||
                              //       // Only disallow non-super-admins from acting on super admins
                              //       (user.role === 'super admin' && currentUser?.role !== 'super admin') ||
                              //       // Admins cannot revoke other admins unless they're super admin (preserve existing rule)
                              //       (user.role === 'admin' && currentUser?.role !== 'super admin' && currentUser?.role !== 'admin' ? true : false)
                              //     }
                              //     title="Revoke / Force Delete"
                              //   >
                              //     {revoking === user.id ? (
                              //       <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                              //     ) : (
                              //       <ShieldExclamationIcon className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
                              //     )}
                              //   </button>
                              // )}
                            }
                            */}
                            <button
                              className="flex items-center gap-0.5 px-1.5 py-1.5 rounded-md bg-gradient-to-r from-orange-700/80 to-orange-600/80 hover:from-orange-600 hover:to-orange-500 text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed shadow-sm hover:shadow-md transition-all duration-200 ease-in-out justify-center group"
                              onClick={() => openArchiveModal(user)}
                              disabled={
                                archiving === user.id ||
                                revoking === user.id ||
                                user.id === currentUser?.id ||
                                // Only disallow non-super-admins from archiving super admins
                                (user.role === 'super admin' && currentUser?.role !== 'super admin') ||
                                (user.role === 'admin' && currentUser?.role !== 'super admin')
                              }
                              title="Archive account"
                            >
                              {archiving === user.id ? (
                                <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <NoSymbolIcon className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                    {/* Show archive remark on user cards when in archive view */}
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center mt-6 gap-4">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-2 rounded-lg bg-gradient-to-r from-gray-700/80 to-gray-600/80 hover:from-gray-600 hover:to-gray-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md transition-all duration-200 ease-in-out"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-green-400 font-semibold">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 rounded-lg bg-gradient-to-r from-gray-700/80 to-gray-600/80 hover:from-gray-600 hover:to-gray-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md transition-all duration-200 ease-in-out"
                    >
                      Next
                    </button>
                  </div>
                )}
                  <div className="mt-6 text-center text-green-500/60 text-sm">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredUsers.length)} of {filteredUsers.length} {showArchives ? 'archived/revoked' : 'active'} user{filteredUsers.length !== 1 ? 's' : ''}
                </div>
              </>
            )}
          </>
        )}
      </div>
      </MainLayout>
      <RevokeConfirmModal
        isOpen={showRevokeModal}
        onClose={() => { if(!modalLoading) { setShowRevokeModal(false); setModalTargetUser(null);} }}
        onSoftRevoke={handleSoftRevoke}
        onForceDelete={requestForceDelete}
        targetUser={modalTargetUser ? { id: modalTargetUser.id, name: modalTargetUser.name, email: modalTargetUser.email, role: modalTargetUser.role } : null}
        loadingAction={modalLoading}
        // Disable force delete when targeting self, or when the current user is not allowed to act on a super admin
        disableForce={
          modalTargetUser?.id === currentUser?.id ||
          (modalTargetUser?.role === 'super admin' && currentUser?.role !== 'super admin') ||
          (modalTargetUser?.role === 'admin' && currentUser?.role !== 'super admin')
        }
      />
      <ArchiveConfirmModal
        isOpen={showArchiveModal}
        onClose={() => { if (!(archiving)) { setShowArchiveModal(false); setArchiveTargetUser(null); } }}
        onConfirm={(remark) => { if (archiveTargetUser) void handleArchive(archiveTargetUser.id, remark); }}
        targetUser={archiveTargetUser ? { id: archiveTargetUser.id, name: archiveTargetUser.name, email: archiveTargetUser.email, role: archiveTargetUser.role } : null}
        loading={!!archiving}
      />
      <SimpleArchiveConfirmModal
        isOpen={showSimpleArchiveModal}
        onClose={() => { if (!(archiving)) { setShowSimpleArchiveModal(false); setArchiveTargetUser(null); } }}
        onConfirm={() => { if (archiveTargetUser) void handleArchive(archiveTargetUser.id, 'N/A'); }}
        targetUser={archiveTargetUser ? { id: archiveTargetUser.id, name: archiveTargetUser.name, email: archiveTargetUser.email, role: archiveTargetUser.role } : null}
        loading={!!archiving}
      />
      <SuccessDialog
        open={successOpen}
        title={successTitle}
        message={successMessage}
        onOk={() => setSuccessOpen(false)}
      />
      <ConfirmModal
        open={showForceConfirm}
        title="Force delete user"
        description={modalTargetUser ? `Permanently delete ${modalTargetUser.name || modalTargetUser.email}? This cannot be undone.` : 'Permanently delete this user? This cannot be undone.'}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={performForceDelete}
        onCancel={() => setShowForceConfirm(false)}
        isLoading={modalLoading === 'force'}
      />
    </>
  );
};

export default CommunityAccessPage;

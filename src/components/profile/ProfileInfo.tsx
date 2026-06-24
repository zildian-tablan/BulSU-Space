import React, { useState } from 'react';
import { User, Department } from '../../contexts/AuthContext';
import { updateUserProfile, getDepartmentName, getRoleDisplayName } from '../../services/userService';
import { PencilIcon, CheckIcon, XMarkIcon, UserIcon, IdentificationIcon, EnvelopeIcon, AcademicCapIcon, BuildingOfficeIcon, UserGroupIcon, CalendarIcon, BookmarkIcon } from '@heroicons/react/24/outline';

interface ProfileInfoProps {
  user: User;
  onProfileUpdate: (updatedUser: User) => void;
  isOwnProfile?: boolean;
}

const ProfileInfo: React.FC<ProfileInfoProps> = ({ user, onProfileUpdate, isOwnProfile = true }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user.name || '',
    gender: user.gender || 'prefer_not_to_say',
    birthday: user.birthday || '',
    yearSection: user.yearSection || '',
    graduationBatch: user.graduationBatch || '',
    office: user.office || '', // Add office for admin editing
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Make sure user.id is defined
      if (!user.id) {
        throw new Error('User ID is undefined');
      }

      // Validate birthday is not in the future and is within reasonable age range
      if (formData.birthday) {
        const birthdayDate = new Date(formData.birthday);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // Set to end of today to allow today's date
        
        if (birthdayDate > today) {
          alert('Birthday cannot be in the future. Please select a valid date.');
          setIsSubmitting(false);
          return;
        }
        
        // Calculate age
        const age = today.getFullYear() - birthdayDate.getFullYear();
        const monthDiff = today.getMonth() - birthdayDate.getMonth();
        const dayDiff = today.getDate() - birthdayDate.getDate();
        const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
        
        // Get user role to determine appropriate age limits
        const userRole = user?.role || 'student';
        const isStudent = userRole === 'student';
        
        // Validate age based on role
        if (actualAge < 15) {
          alert('Invalid: Please enter a valid birth year.');
          setIsSubmitting(false);
          return;
        }
        // Students should typically be 15-30, but allow up to 35 for non-traditional students
        if (isStudent && actualAge > 35) {
          alert('Invalid: Please enter a valid birth year.');
          setIsSubmitting(false);
          return;
        }
        // Faculty and other roles can be older, but set a reasonable maximum of 80
        if (!isStudent && actualAge > 80) {
          alert('Invalid: Please enter a valid birth year.');
          setIsSubmitting(false);
          return;
        }
      }

      const updatedUser = await updateUserProfile(user.id, {
        name: formData.name,
        gender: formData.gender as User['gender'],
        birthday: formData.birthday,
        yearSection: formData.yearSection,
        graduationBatch: formData.graduationBatch
      });

      onProfileUpdate(updatedUser);
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate min and max dates for birthday input
  // Allow up to 80 years old to accommodate faculty members
  const today = new Date();
  const maxDate = today.toISOString().split('T')[0];
  const minDateObj = new Date();
  minDateObj.setFullYear(minDateObj.getFullYear() - 80);
  const minDate = minDateObj.toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Header with minimal design */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
            <UserIcon className="h-3.5 w-3.5 text-green-400" />
          </div>
          <h2 className="text-base font-medium text-white">Personal Information</h2>
        </div>
        {isOwnProfile && (
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-all duration-200"
                title="Edit information"
              >
                <PencilIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200"
                  title="Cancel"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Cancel</span>
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200 ${
                    isSubmitting 
                      ? 'text-gray-500 cursor-not-allowed' 
                      : 'text-green-400 hover:text-green-300 hover:bg-green-500/10'
                  }`}
                  title="Save changes"
                >
                  {isSubmitting ? (
                    <div className="h-3.5 w-3.5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <CheckIcon className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{isSubmitting ? 'Saving...' : 'Save'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-6">
        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                {/* Full Name */}
                <div className="space-y-2">
                  <label htmlFor="name" className="flex items-center gap-2 text-sm font-medium text-gray-300">
                    <UserIcon className="h-4 w-4 text-green-400" />
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Enter your full name"
                    className="w-full px-4 py-3 bg-gray-800/30 border border-gray-700/50 rounded-lg text-white placeholder-gray-500 focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition-colors duration-200"
                  />
                </div>
                
                {/* Department: Hide for super admins and admins */}
                {(user.role !== 'super admin' && user.role !== 'admin') && (
                  <div className="space-y-2">
                    <label htmlFor="department" className="flex items-center gap-2 text-sm font-medium text-gray-300">
                      <BuildingOfficeIcon className="h-4 w-4 text-green-400" />
                      Department
                    </label>
                    <div className="w-full px-4 py-3 bg-gray-700/50 border border-gray-700/50 rounded-lg text-gray-300 cursor-not-allowed">
                      {getDepartmentName(user.department)}
                    </div>
                  </div>
                )}
                {/* Office: Only for admins */}
                {user.role === 'admin' && user.office && (
                  <div className="space-y-2">
                    <label htmlFor="office" className="flex items-center gap-2 text-sm font-medium text-gray-300">
                      <BuildingOfficeIcon className="h-4 w-4 text-green-400" />
                      Assigned Office
                    </label>
                    <input
                      type="text"
                      id="office"
                      name="office"
                      value={formData.office}
                      onChange={handleChange}
                      placeholder="e.g., Room 101, Building A"
                      className="w-full px-4 py-3 bg-gray-800/30 border border-gray-700/50 rounded-lg text-white placeholder-gray-500 focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition-colors duration-200"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="gender" className="flex items-center gap-2 text-sm font-medium text-gray-300">
                    <UserGroupIcon className="h-4 w-4 text-green-400" />
                    Gender
                  </label>
                  <select
                    id="gender"
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-gray-800/30 border border-gray-700/50 rounded-lg text-white focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition-colors duration-200"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="birthday" className="flex items-center gap-2 text-sm font-medium text-gray-300">
                    <CalendarIcon className="h-4 w-4 text-green-400" />
                    Birthday
                  </label>
                  <input
                    type="date"
                    id="birthday"
                    name="birthday"
                    value={formData.birthday}
                    onChange={handleChange}
                    min={minDate}
                    max={maxDate}
                    className="w-full px-4 py-3 bg-gray-800/30 border border-gray-700/50 rounded-lg text-white focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition-colors duration-200"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="idNumber" className="flex items-center gap-2 text-sm font-medium text-gray-300">
                    <IdentificationIcon className="h-4 w-4 text-green-400" />
                    ID Number
                  </label>
                  <div className="w-full px-4 py-3 bg-gray-700/50 border border-gray-700/50 rounded-lg text-gray-300 cursor-not-allowed">
                    {user.idNumber || 'Not specified'}
                  </div>
                </div>

                {/* Year & Section: Only for students (not for alumni, admins, or super admins) */}
                {user.role === 'student' && (
                  <div className="space-y-2">
                    <label htmlFor="yearSection" className="flex items-center gap-2 text-sm font-medium text-gray-300">
                      <BookmarkIcon className="h-4 w-4 text-green-400" />
                      Year & Section
                    </label>
                    <input
                      type="text"
                      id="yearSection"
                      name="yearSection"
                      value={formData.yearSection}
                      onChange={handleChange}
                      placeholder="e.g. 3rd Year - Section A"
                      className="w-full px-4 py-3 bg-gray-800/30 border border-gray-700/50 rounded-lg text-white placeholder-gray-500 focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition-colors duration-200"
                    />
                  </div>
                )}
                
                {/* Graduation Batch: Only for alumni */}
                {user.role === 'alumni' && (
                  <div className="space-y-2">
                    <label htmlFor="graduationBatch" className="flex items-center gap-2 text-sm font-medium text-gray-300">
                      <AcademicCapIcon className="h-4 w-4 text-green-400" />
                      Graduation Batch
                    </label>
                    <select
                      id="graduationBatch"
                      name="graduationBatch"
                      value={formData.graduationBatch}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-gray-800/30 border border-gray-700/50 rounded-lg text-white focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition-colors duration-200"
                    >
                      <option value="">Select Graduation Year</option>
                      {/* Generate options from 2012-2013 to current year plus next year */}
                      {Array.from({ length: new Date().getFullYear() - 2012 + 2 }).map((_, index) => {
                        const startYear = 2012 + index;
                        const endYear = startYear + 1;
                        const batchLabel = `${startYear}-${endYear}`;
                        return (
                          <option key={batchLabel} value={batchLabel}>
                            {batchLabel}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Essential Information Row */}
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/10 border border-green-500/20">
                  <UserIcon className="h-4 w-4 text-green-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">Name</p>
                  <p className="text-sm text-white font-medium truncate">{user.name}</p>
                </div>
              </div>

              {/* Show ID number only to owner */}
              {isOwnProfile && (
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20">
                    <IdentificationIcon className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">ID Number</p>
                    <p className="text-sm text-white font-medium">{user.idNumber || 'Not specified'}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/20">
                  <AcademicCapIcon className="h-4 w-4 text-purple-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">Role</p>
                  <p className="text-sm text-white font-medium">{getRoleDisplayName(user.role)}</p>
                </div>
              </div>

              {/* Department: Hide for super admins and admins */}
              {(user.role !== 'super admin' && user.role !== 'admin') && (
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-500/10 border border-orange-500/20">
                    <BuildingOfficeIcon className="h-4 w-4 text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">Department</p>
                    <p className="text-sm text-white font-medium">{getDepartmentName(user.department)}</p>
                  </div>
                </div>
              )}
              {/* Office: Only for admins */}
              {user.role === 'admin' && user.office && (
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-500/10 border border-orange-500/20">
                    <BuildingOfficeIcon className="h-4 w-4 text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">Assigned Office</p>
                    <p className="text-sm text-white font-medium">{user.office}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Additional Information Row - Only for own profile */}
            {isOwnProfile && (
              <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-700/30">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-pink-500/10 border border-pink-500/20">
                    <UserGroupIcon className="h-4 w-4 text-pink-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">Gender</p>
                    <p className="text-sm text-white">
                      {formData.gender === 'male' ? 'Male' :
                       formData.gender === 'female' ? 'Female' :
                       formData.gender === 'other' ? 'Other' : 'Prefer not to say'}
                    </p>
                  </div>
                </div>

                {formData.birthday && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20">
                      <CalendarIcon className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">Birthday</p>
                      <p className="text-sm text-white">{new Date(formData.birthday).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}

                {/* Year & Section: Only for students (not for alumni, admins, or super admins) */}
                {user.role === 'student' && formData.yearSection && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-500/10 border border-teal-500/20">
                      <BookmarkIcon className="h-4 w-4 text-teal-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">Year & Section</p>
                      <p className="text-sm text-white">{formData.yearSection}</p>
                    </div>
                  </div>
                )}
                
                {user.role === 'alumni' && user.graduationBatch && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                      <AcademicCapIcon className="h-4 w-4 text-yellow-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">Graduation Batch</p>
                      <p className="text-sm text-white">{user.graduationBatch}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileInfo;

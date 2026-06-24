import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Poll as PollType, PollOption, voteOnPoll, subscribeToPollOptions, getCachedPollOptions } from '../../services/pollService';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { ChartBarIcon, UserGroupIcon } from '@heroicons/react/24/outline';

interface PollCardProps {
  poll: PollType;
  onMinimize?: () => void;
  isMinimized?: boolean;
  className?: string;
}

const PollCard: React.FC<PollCardProps> = ({ poll, onMinimize, isMinimized: externalMinimized, className = '' }) => {
  const { currentUser } = useAuth();
  const [options, setOptions] = useState<PollOption[]>([]);
  const [userVote, setUserVote] = useState<string | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [internalMinimized, setInternalMinimized] = useState(false);
  const isMinimized = externalMinimized !== undefined ? externalMinimized : internalMinimized;

  // Get user role for theming
  const userRole = currentUser?.role as string | undefined;
  const isFaculty = userRole === "faculty";
  const isStudent = userRole === "student";
  const isAlumni = userRole === "alumni";
  const isAdminOrSuperAdmin = userRole === "admin" || userRole === "super admin";

  // No guest fallback: voting requires authentication per security rules

  // Real-time subscription to poll options (with cache warm start)
  useEffect(() => {
    if (!poll.id) return;
    // If cached options exist, render immediately without spinner
    const cached = getCachedPollOptions(poll.id);
    if (cached && cached.length > 0) {
      setOptions(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    const unsubscribe = subscribeToPollOptions(poll.id, (liveOptions) => {
      setOptions(liveOptions);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [poll.id]);

  // Voting requires authentication; no guest fallback

  // Derive user's current vote from live options
  useEffect(() => {
    if (!currentUser?.id) {
      setUserVote(null);
      return;
    }
    const found = options.find(o => o.voters?.includes(currentUser.id));
    setUserVote(found ? found.id : null);
  }, [options, currentUser?.id]);

  const handleVote = async (optionId: string) => {
    if (!currentUser?.id || isVoting) return;
    try {
      setIsVoting(true);
      await voteOnPoll(poll.id, optionId, currentUser.id, userVote);
      // No manual state mutation; real-time snapshot will reflect changes
    } catch (error) {
      console.error('[PollCard] Error voting:', error);
    } finally {
      setIsVoting(false);
    }
  };

  const getTotalVotes = () => {
    return options.reduce((total, option) => total + option.count, 0);
  };

  const getVotePercentage = (optionCount: number) => {
    const total = getTotalVotes();
    return total > 0 ? Math.round((optionCount / total) * 100) : 0;
  };

  const handleMinimizeToggle = () => {
    if (externalMinimized !== undefined) {
      // External control - just call the callback
      if (onMinimize) {
        onMinimize();
      }
    } else {
      // Internal control
      setInternalMinimized(!internalMinimized);
    }
  };

  const getThemeColors = () => {
    // Modern dark theme with green accents for all users
    return {
      primary: 'bg-green-600',
      primaryHover: 'hover:bg-green-500',
      primaryBorder: 'border-green-500',
      primaryText: 'text-green-600',
      secondary: 'bg-green-100',
      secondaryText: 'text-green-800',
      bg: 'bg-gradient-to-br from-gray-900/90 to-gray-800/95',
      border: 'border-green-500/30',
      header: 'bg-gradient-to-r from-gray-800/80 to-gray-700/90',
      accent: 'bg-green-500/20',
      accentBorder: 'border-green-500/40',
      accentText: 'text-green-400'
    };
  };

  const colors = getThemeColors();

  if (isLoading) {
    return (
      <div className={`${colors.bg} ${colors.border} rounded-xl p-4 ${className} backdrop-blur-sm`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700/50 rounded mb-3"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-gray-700/50 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${colors.bg} ${colors.border} rounded-xl shadow-xl ${className} backdrop-blur-sm overflow-hidden border border-gray-700/50`}>
      {/* Poll Header */}
      <div className={`${colors.header} px-4 py-3 border-b border-gray-700/50`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center border border-green-500/40 shadow-lg">
              <ChartBarIcon className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-100">Live Poll</h3>
              <p className="text-xs text-gray-400">Created by {poll.authorName}</p>
            </div>
          </div>
          {onMinimize && (
            <button
              onClick={handleMinimizeToggle}
              className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-500/20 rounded-lg transition-all duration-200"
              title={isMinimized ? "Expand poll" : "Minimize poll"}
            >
              {isMinimized ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Poll Content */}
      {isMinimized ? (
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center border border-green-500/40 shadow-lg">
                <ChartBarIcon className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-200">"{poll.question}"</h4>
                <p className="text-xs text-gray-400">{getTotalVotes()} total votes</p>
              </div>
            </div>
            <button
              onClick={handleMinimizeToggle}
              className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-500/20 rounded-lg transition-all duration-200"
              title="Expand poll"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4">
          {/* Poll Question */}
          {poll.question && (
            <div className="mb-4">
              <h4 className="text-base font-medium text-gray-200 mb-2">"{poll.question}"</h4>
            </div>
          )}

          {/* Poll Options */}
          <div className="space-y-3">
            {options.map((option) => {
              const percentage = getVotePercentage(option.count);
              const isVoted = userVote === option.id;
              const hasVotes = option.count > 0;

              return (
                <button
                  key={option.id}
                  onClick={() => handleVote(option.id)}
                  disabled={isVoting}
                  className={`w-full relative p-3 rounded-lg border transition-all duration-300 text-left group ${
                    isVoted
                      ? `${colors.primaryBorder} ${colors.secondary}`
                      : 'border-gray-600 hover:border-green-500/50 bg-gray-800/60 hover:bg-gray-700/80'
                  } ${isVoting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {/* Progress bar */}
                  {hasVotes && (
                    <div 
                      className={`absolute inset-0 rounded-lg transition-all duration-500 ${
                        isVoted ? colors.secondary : 'bg-green-500/10'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  )}

                  {/* Content */}
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {/* Vote indicator */}
                      {isVoted && (
                        <div className={`w-5 h-5 ${colors.primary} rounded-full flex items-center justify-center`}>
                          <CheckIcon className="h-3 w-3 text-white" />
                        </div>
                      )}
                      
                      {/* Option text */}
                      <span className={`text-sm font-medium ${
                        isVoted ? colors.secondaryText : 'text-gray-200'
                      }`}>
                        {option.text}
                      </span>
                    </div>

                    {/* Vote count and percentage */}
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${
                        isVoted ? colors.secondaryText : 'text-gray-400'
                      }`}>
                        {option.count} vote{option.count !== 1 ? 's' : ''}
                      </span>
                      {hasVotes && (
                        <span className={`text-xs font-medium ${
                          isVoted ? colors.secondaryText : 'text-gray-300'
                        }`}>
                          {percentage}%
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Poll Actions */}
          <div className="mt-4 pt-3 border-t border-gray-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <UserGroupIcon className="w-3 h-3" />
                  {getTotalVotes()} total vote{getTotalVotes() !== 1 ? 's' : ''}
                </span>
                <span>{poll.optionCount} option{poll.optionCount !== 1 ? 's' : ''}</span>
              </div>
              
              <button
                onClick={() => setShowResults(!showResults)}
                className={`text-xs px-2 py-1 rounded-md transition-colors ${
                  showResults 
                    ? 'bg-gray-600 text-gray-200' 
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                }`}
              >
                {showResults ? 'Hide' : 'Show'} Results
              </button>
            </div>
          </div>

          {/* Detailed Results (when expanded) */}
          {showResults && (
            <div className="mt-3 p-3 bg-gray-800/60 rounded-lg border border-gray-700/50">
              <h5 className="text-xs font-medium text-gray-300 mb-2">Detailed Results</h5>
              <div className="space-y-2">
                {options.map((option) => {
                  const percentage = getVotePercentage(option.count);
                  const isVoted = userVote === option.id;
                  
                  return (
                    <div key={option.id} className="flex items-center justify-between text-xs">
                      <span className={`${isVoted ? colors.primaryText : 'text-gray-400'}`}>
                        {option.text}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-700 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all duration-300 ${
                              isVoted ? colors.primary : 'bg-green-500'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className={`w-8 text-right ${isVoted ? colors.primaryText : 'text-gray-400'}`}>
                          {percentage}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PollCard;

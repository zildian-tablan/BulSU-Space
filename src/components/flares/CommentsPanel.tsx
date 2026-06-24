import React from 'react';
import { ChatBubbleOvalLeftIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { FlareComment } from '../../services/flareCommentService';
import { User } from '../../contexts/AuthContext';

interface CommentsPanelProps {
	comments: FlareComment[];
	loading: boolean;
	currentUser: User | null;
	newComment: string;
	setNewComment: (v: string) => void;
	onSubmit: () => void;
	onSignIn: () => void;
	getRelativeTime: (timestamp: any) => string;
	scrollRef?: React.RefObject<HTMLDivElement>;
}

const CommentsPanel: React.FC<CommentsPanelProps> = ({
	comments,
	loading,
	currentUser,
	newComment,
	setNewComment,
	onSubmit,
	onSignIn,
	getRelativeTime,
	scrollRef
}) => {
	return (
		<aside
			className="sidebar-scroll-area hidden lg:flex w-[380px] flex-col bg-gradient-to-b from-black/60 via-black/50 to-black/60 backdrop-blur-md border-l border-white/20"
			onWheel={(e) => e.stopPropagation()}
		>
			<div className="p-5 border-b border-white/20 flex-shrink-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20">
				<div className="flex items-center justify-between mb-2">
					<div className="flex items-center gap-2">
						<ChatBubbleOvalLeftIcon className="w-6 h-6 text-blue-400" />
						<h3 className="text-white font-bold text-lg">Comments</h3>
					</div>
				</div>
				<p className="text-gray-300 text-sm font-medium">
					{comments.length} {comments.length === 1 ? 'comment' : 'comments'}
				</p>
			</div>

			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-blue-500/50 scrollbar-track-transparent hover:scrollbar-thumb-blue-400/70"
			>
				{loading ? (
					<div className="flex items-center justify-center py-8">
						<span className="material-icons animate-spin text-blue-400">refresh</span>
					</div>
				) : comments.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full text-gray-400">
						<div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 p-6 rounded-full mb-4">
							<ChatBubbleOvalLeftIcon className="w-12 h-12 text-blue-400" />
						</div>
						<p className="text-white font-semibold text-lg">No comments yet</p>
						<p className="text-sm text-gray-400">Be the first to comment!</p>
					</div>
				) : (
					comments.map((comment) => (
						<div
							key={comment.id}
							className="flex gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300 border border-white/10 hover:border-blue-400/30 backdrop-blur-sm group"
						>
							{comment.userProfilePic ? (
								<img
									src={comment.userProfilePic}
									alt={comment.userName}
									className="w-10 h-10 rounded-full flex-shrink-0 object-cover border-2 border-blue-400/30 group-hover:border-blue-400/60 transition-colors"
								/>
							) : (
								<div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center flex-shrink-0 border-2 border-blue-400/30 group-hover:border-blue-400/60 transition-colors">
									<span className="material-icons text-white text-sm">person</span>
								</div>
							)}
							<div className="flex-1 min-w-0">
								<p className="text-white font-bold text-sm group-hover:text-blue-300 transition-colors">{comment.userName}</p>
								<p className="text-gray-200 text-sm mt-1 leading-relaxed break-words">{comment.text}</p>
								<div className="flex items-center gap-1.5 mt-2">
									<span className="material-icons text-blue-400" style={{ fontSize: '10px' }}>
										schedule
									</span>
									<p className="text-blue-300 font-medium" style={{ fontSize: '10px' }}>
										{getRelativeTime(comment.createdAt)}
									</p>
								</div>
							</div>
						</div>
					))
				)}
			</div>

			{currentUser ? (
				<div className="p-4 border-t border-white/20 flex-shrink-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10">
					<div className="flex gap-3">
						{currentUser.profile_pic ? (
							<img
								src={currentUser.profile_pic}
								alt={currentUser.name}
								className="w-10 h-10 rounded-full flex-shrink-0 object-cover border-2 border-blue-400/50"
							/>
						) : (
							<div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center flex-shrink-0 border-2 border-blue-400/50">
								<span className="material-icons text-white text-sm">person</span>
							</div>
						)}
						<div className="flex-1 flex gap-2">
							<input
								type="text"
								value={newComment}
								onChange={(e) => setNewComment(e.target.value)}
								onKeyPress={(e) => e.key === 'Enter' && onSubmit()}
								placeholder="Add a comment..."
								className="flex-1 bg-white/10 text-white px-4 py-2.5 rounded-full border border-blue-400/30 focus:outline-none focus:border-blue-400/60 focus:bg-white/15 placeholder-gray-400 transition-all duration-300 shadow-lg shadow-blue-500/10"
							/>
							<button
								onClick={onSubmit}
								disabled={!newComment.trim()}
								className="p-2.5 text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-full transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-blue-500/50 disabled:shadow-none"
							>
								<PaperAirplaneIcon className="w-5 h-5" />
							</button>
						</div>
					</div>
				</div>
			) : (
				<div className="p-4 border-t border-white/10 text-center">
					<p className="text-gray-400 text-sm mb-2">Sign in to comment</p>
					<button
						onClick={onSignIn}
						className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
					>
						Sign In
					</button>
				</div>
			)}
		</aside>
	);
};

export default CommentsPanel;


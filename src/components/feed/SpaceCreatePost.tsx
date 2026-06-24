import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { CreateSpacePostData } from '../../models/SpacePost';
import { createSpacePost } from '../../services/spacePostService';
import { getGroupById } from '../../services/groupService';
import { detectProfanity } from '../../utils/profanityFilter';
import { moderateWithOpenAI } from '../../services/aiModerationService';
import { isMobileDevice } from '../../utils/mobileUtils';
import ProfanityModal from '../modals/ProfanityModal';
import {
	PhotoIcon,
	XMarkIcon,
	PaperAirplaneIcon,
	GlobeAltIcon,
	UserIcon
} from '@heroicons/react/24/outline';

interface SpaceCreatePostProps {
	groupId: string;
	placeholder?: string;
	onPost?: (data: CreateSpacePostData) => void | Promise<void>; // If provided, parent handles persistence (prevents duplicate writes)
}

const BLOCKED_EXTENSIONS = [
	'exe','msi','com','scr','dll','sys','drv','ps1','vbs','wsf','hta','jar','iso','img','reg','bat','sh'
];

const SpaceCreatePost: React.FC<SpaceCreatePostProps> = ({ groupId, placeholder, onPost }) => {
	const { currentUser } = useAuth();
	const [content, setContent] = useState('');
	const [files, setFiles] = useState<File[]>([]);
	const [previewUrls, setPreviewUrls] = useState<string[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isProcessingContent, setIsProcessingContent] = useState(false);
	const [contentError, setContentError] = useState<string | null>(null);
	const [isMobile, setIsMobile] = useState(false);
	const [showFullScreenModal, setShowFullScreenModal] = useState(false);
	const [profanityModalOpen, setProfanityModalOpen] = useState(false);
	const [detectedProfaneWords, setDetectedProfaneWords] = useState<string[]>([]);
	const [themeColors, setThemeColors] = useState<{
		primaryColor: string;
		secondaryColor: string;
		accentColor: string;
		textColor: string;
		bgColor: string;
	} | null>(null);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const modalTextareaRef = useRef<HTMLTextAreaElement>(null);

	const userRole = currentUser?.role as string | undefined;
	const isFaculty = userRole === 'faculty';
	const isStudent = userRole === 'student';
	const isAlumni = userRole === 'alumni';
	const isAdminOrSuperAdmin = userRole === 'admin' || userRole === 'super admin';

	useEffect(() => {
		const checkMobile = () => setIsMobile(isMobileDevice());
		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	}, []);

	// Fetch group theme colors
	useEffect(() => {
		let active = true;
		(async () => {
			try {
				if (!groupId) return;
				const group = await getGroupById(groupId);
				if (active && group?.themeColors) {
					setThemeColors(group.themeColors);
				}
			} catch (e) {
				// Silent fail; fallback colors will be used
			}
		})();
		return () => { active = false; };
	}, [groupId]);

	useEffect(() => {
		if (isMobile) return;
		if (showFullScreenModal && modalTextareaRef.current) {
			const id = requestAnimationFrame(() => modalTextareaRef.current?.focus());
			return () => cancelAnimationFrame(id);
		}
	}, [showFullScreenModal, isMobile]);

	// Auto-resize textarea (mobile & desktop) for better responsiveness
	useEffect(() => {
		const el = modalTextareaRef.current;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = Math.min(el.scrollHeight, 380) + 'px'; // cap height to avoid runaway growth
	}, [content]);

	const openModal = () => setShowFullScreenModal(true);
	const closeModal = () => setShowFullScreenModal(false);

	const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setContent(e.target.value);
		if (contentError) setContentError(null);
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!e.target.files) return;
		const newFiles = Array.from(e.target.files);
		const blocked = newFiles.filter(f => {
			const ext = f.name.split('.').pop()?.toLowerCase();
			return ext && BLOCKED_EXTENSIONS.includes(ext);
		});
		if (blocked.length > 0) {
			setContentError('One or more selected files have a blocked extension and cannot be attached.');
			if (fileInputRef.current) fileInputRef.current.value = '';
			return;
		}
		const newPreviews = newFiles.map(f => f.type.startsWith('image/') || f.type.startsWith('video/') ? URL.createObjectURL(f) : '');
		setFiles(prev => [...prev, ...newFiles]);
		setPreviewUrls(prev => [...prev, ...newPreviews]);
	};

	const removeFile = (index: number) => {
		if (previewUrls[index]) URL.revokeObjectURL(previewUrls[index]);
		setFiles(prev => prev.filter((_, i) => i !== index));
		setPreviewUrls(prev => prev.filter((_, i) => i !== index));
	};

	useEffect(() => () => { previewUrls.forEach(u => u && URL.revokeObjectURL(u)); }, [previewUrls]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!currentUser) return;
		if (!content.trim() && files.length === 0) return;
		setIsSubmitting(true);
		setIsProcessingContent(true);
		setContentError(null);

		const profaneWords = detectProfanity(content);
		if (profaneWords.length > 0) {
			setDetectedProfaneWords(profaneWords);
			setProfanityModalOpen(true);
			setIsSubmitting(false);
			setIsProcessingContent(false);
			return;
		}

		try {
			setContentError('Checking content with AI moderation...');
			const aiResult = await moderateWithOpenAI(content);
			if (aiResult.flagged) {
				setContentError('Your post was flagged. ' + (aiResult.reason || 'Inappropriate content detected.'));
				setIsSubmitting(false);
				setIsProcessingContent(false);
				return;
			}
			setContentError(null);
		} catch {
			setContentError(null);
		}

		try {
			const data: CreateSpacePostData = { content: content.trim(), groupId, media: files.length ? files : undefined };
			if (onPost) {
				// Delegate creation to parent (avoids duplicate createSpacePost call)
				await onPost(data);
			} else {
				await createSpacePost(data, currentUser.id);
			}
			setContent('');
			previewUrls.forEach(u => u && URL.revokeObjectURL(u));
			setFiles([]); setPreviewUrls([]);
			if (fileInputRef.current) fileInputRef.current.value = '';
			closeModal(); // Always close modal after successful post
		} catch (err) {
			console.error('Failed to create space post:', err);
			setContentError('Failed to create post. Please try again.');
		} finally {
			setIsSubmitting(false);
			setIsProcessingContent(false);
		}
	};

	if (!currentUser) return null;

	const fallbackColors = {
		primaryColor: '#10b981',
		secondaryColor: '#059669',
		accentColor: '#34d399',
		textColor: '#ffffff',
		bgColor: '#1f2937'
	};

	const activeTheme = themeColors || fallbackColors;

	// Utility to add alpha to hex (expects #RRGGBB)
	const withAlpha = (hex: string, alpha: number) => {
		if (!/^#([0-9a-fA-F]{6})$/.test(hex)) return hex;
		const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
		return `${hex}${a}`;
	};

	const teaserContainerStyle: React.CSSProperties = {
		background: `linear-gradient(to bottom right, ${withAlpha(activeTheme.primaryColor,0.12)}, ${withAlpha(activeTheme.secondaryColor,0.12)}, ${withAlpha(activeTheme.bgColor,0.9)})`,
		borderColor: withAlpha(activeTheme.primaryColor, 0.35)
	};

	const teaserHeaderStyle: React.CSSProperties = {
		borderColor: withAlpha(activeTheme.primaryColor, 0.5),
		background: `linear-gradient(to right, ${withAlpha(activeTheme.primaryColor,0.12)}, ${withAlpha(activeTheme.secondaryColor,0.08)})`
	};

	const avatarBorderStyle: React.CSSProperties = { borderColor: withAlpha(activeTheme.primaryColor, 0.55) };
	const placeholderTextStyle: React.CSSProperties = { color: withAlpha(activeTheme.accentColor, 0.85) };
	const modalHeaderStyle: React.CSSProperties = {
		borderColor: withAlpha(activeTheme.primaryColor, 0.25),
		background: `linear-gradient(to right, ${withAlpha(activeTheme.primaryColor,0.12)}, ${withAlpha(activeTheme.secondaryColor,0.08)})`
	};
	const modalTitleStyle: React.CSSProperties = { color: activeTheme.textColor };
	const closeBtnStyle: React.CSSProperties = { color: withAlpha(activeTheme.accentColor,0.8) };
	const textareaStyle: React.CSSProperties = {
		background: `linear-gradient(to bottom right, ${withAlpha(activeTheme.primaryColor,0.12)}, ${withAlpha(activeTheme.secondaryColor,0.08)}, ${withAlpha(activeTheme.bgColor,0.4)})`,
		borderColor: withAlpha(activeTheme.primaryColor, 0.35),
		color: activeTheme.textColor
	};
	const submitBtnBase: React.CSSProperties = {
		backgroundColor: activeTheme.primaryColor,
		color: activeTheme.textColor,
		borderColor: withAlpha(activeTheme.accentColor,0.5)
	};

	const teaserPlaceholder = placeholder || (
		isAdminOrSuperAdmin ? `Share something with the space, ${currentUser?.name?.split(' ')[0] || 'Admin'}...` :
		isFaculty ? `Share your academic insight, ${currentUser?.name?.split(' ')[0] || 'Professor'}...` :
		isStudent ? `What's on your mind, ${currentUser?.name?.split(' ')[0] || 'Student'}?` :
		isAlumni ? `Share something with the space, ${currentUser?.name?.split(' ')[0] || 'Alumni'}...` :
		'Share something with the space...'
	);

	return (
		<>
			<div className="w-full mb-1">
				<div
					onClick={openModal}
					className="rounded-xl shadow-lg border sm:border overflow-hidden backdrop-blur-sm transition-all duration-300 mb-1 hover:shadow-2xl animate-fadeIn w-full cursor-pointer"
					style={teaserContainerStyle}
				>
					<div className="py-3 px-4 border-b flex items-center" style={teaserHeaderStyle}>
						<div className="relative">
							{currentUser?.profile_pic ? (
								<img
									src={currentUser.profile_pic}
									alt={currentUser?.name || 'User'}
									className="w-8 h-8 rounded-full mr-2.5 border-2 object-cover shadow-lg"
									style={avatarBorderStyle}
									onError={(e) => { (e.target as HTMLImageElement).src = '/images/default-avatar.png'; }}
								/>
							) : (
								<div className="w-8 h-8 rounded-full mr-2.5 border-2 bg-gray-800 flex items-center justify-center font-bold text-base text-white/80" style={avatarBorderStyle}>{currentUser?.name?.charAt(0).toUpperCase() || 'U'}</div>
							)}
						</div>
						<span className="flex-1 text-[13px] truncate" style={placeholderTextStyle}>
							{teaserPlaceholder}
						</span>
					</div>
				</div>
			</div>

			{showFullScreenModal && createPortal(
				<div className={`fixed inset-0 z-50 ${isMobile ? 'bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800' : 'bg-black/60 flex items-center justify-center p-4'}`} dir="ltr" lang="en" style={isMobile ? { height: '100dvh', WebkitTapHighlightColor: 'transparent' } : {}}>
					<div className={`${isMobile ? 'relative flex flex-col h-full w-full backdrop-blur-sm' : 'relative w-full max-w-2xl h-[80vh] rounded-2xl overflow-hidden border border-gray-700/40 shadow-2xl bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 backdrop-blur-md'}`} style={isMobile ? { height: '100dvh' } : {}}>
						<div className="flex items-center justify-between p-4 border-b backdrop-blur-md" style={modalHeaderStyle}>
							<h2 className="text-lg font-semibold tracking-tight" style={modalTitleStyle}>Create Space Post</h2>
							<button onClick={closeModal} aria-label="Close" className="p-2 rounded-md transition-all duration-200 backdrop-blur-sm hover:opacity-80" style={closeBtnStyle}>
								<XMarkIcon className="h-5 w-5" />
							</button>
						</div>
						<div className={`${isMobile ? 'flex-1 overflow-y-auto p-4 pb-36' : 'flex-1 overflow-y-auto p-4 pb-28'} bg-gradient-to-b from-transparent to-gray-900/20`} style={isMobile ? { WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))', overscrollBehavior: 'contain' as any } : {}}>
							<form onSubmit={handleSubmit}>
								<div className="flex items-start space-x-3 mb-4">
									{currentUser?.profile_pic ? (
										<img
											src={currentUser.profile_pic}
											alt={currentUser?.name || 'User'}
											className="w-10 h-10 rounded-xl border-2 object-cover shadow"
											style={{ borderColor: withAlpha(activeTheme.primaryColor,0.5), boxShadow: `0 0 0 1px ${withAlpha(activeTheme.accentColor,0.3)}` }}
											onError={(e) => { (e.target as HTMLImageElement).src = '/images/default-avatar.png'; }}
										/>
									) : (
										<div className="w-12 h-12 rounded-xl border-2 bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center font-bold shadow-lg" style={{ borderColor: withAlpha(activeTheme.primaryColor,0.5), color: withAlpha(activeTheme.accentColor,0.9), boxShadow: `0 0 0 1px ${withAlpha(activeTheme.accentColor,0.25)}` }}>{currentUser?.name?.charAt(0).toUpperCase() || 'U'}</div>
									)}
									<div className="flex-1">
										<h3 className="text-lg font-semibold tracking-tight" style={{ color: activeTheme.textColor }}>{currentUser?.name || 'User'}</h3>
										<div className="mt-1 inline-flex items-center px-2 py-1 bg-gray-800/70 text-gray-100 rounded-full text-xs font-medium shadow-sm border border-gray-700/50" title="Visible to space members">
											<GlobeAltIcon className="w-4 h-4 mr-1" /> Space Members
										</div>
									</div>
								</div>
								<textarea
									ref={modalTextareaRef}
									value={content}
									onChange={handleContentChange}
									placeholder={teaserPlaceholder}
									maxLength={2000}
									className="w-full p-3 border rounded-2xl text-sm resize-none min-h-[140px] placeholder-gray-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:border-transparent backdrop-blur-sm shadow-sm"
									style={textareaStyle}
									rows={5}
								/>
								<div className="mt-3 text-right text-sm font-medium text-gray-400">{content.length}/2000</div>
								{files.length > 0 && (
									<div className="mt-4 grid grid-cols-2 gap-3">
										{files.map((file, index) => (
											<div key={index} className="relative group">
												{file.type.startsWith('image/') ? (
													<div className="relative rounded-xl overflow-hidden shadow-lg border border-gray-600/50 backdrop-blur-sm">
														<img src={previewUrls[index] || '/placeholder.svg'} alt={file.name} className="w-full h-28 object-cover" />
														<button type="button" onClick={() => removeFile(index)} className="absolute top-2 right-2 bg-gray-900/90 text-white rounded-full p-1.5 hover:bg-red-600 transition-all duration-200 shadow-lg backdrop-blur-sm"><XMarkIcon className="h-4 w-4"/></button>
													</div>
												) : file.type.startsWith('video/') ? (
													<div className="relative rounded-xl overflow-hidden shadow-lg border border-gray-600/50 backdrop-blur-sm">
														<video src={previewUrls[index]} className="w-full h-28 object-cover" />
														<button type="button" onClick={() => removeFile(index)} className="absolute top-2 right-2 bg-gray-900/90 text-white rounded-full p-1.5 hover:bg-red-600 transition-all duration-200 shadow-lg backdrop-blur-sm"><XMarkIcon className="h-4 w-4"/></button>
													</div>
												) : (
													<div className="relative flex items-center justify-center bg-gradient-to-br from-gray-800/80 to-gray-700/60 rounded-xl p-3 h-28 border border-gray-600/50 shadow-lg backdrop-blur-sm" title={file.name}>
														<button type="button" onClick={() => removeFile(index)} className="absolute right-2 top-2 p-0.5 bg-red-500 text-white rounded-full"><XMarkIcon className="h-3 w-3"/></button>
														<UserIcon className="h-7 w-7 text-gray-300" />
														<span className="text-xs text-gray-200 ml-2 truncate max-w-[80px] font-medium">{file.name}</span>
													</div>
												)}
											</div>
										))}
									</div>
								)}
								{contentError && (
									<div className={`flex items-center gap-3 mt-4 p-4 rounded-xl border backdrop-blur-sm shadow-sm ${contentError.includes('Checking') ? 'bg-gradient-to-r from-blue-900/20 to-blue-800/10 border-blue-400/30 text-blue-200' : 'bg-gradient-to-r from-red-900/20 to-red-800/10 border-red-400/30 text-red-200'}`}>
										<p className="text-sm font-medium">{contentError}</p>
									</div>
								)}
								{isMobile ? (
									<div className="fixed left-0 right-0 bottom-0 z-50 bg-gradient-to-t from-gray-900/90 to-transparent p-4 border-t border-gray-700/30" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-3">
												<button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-800/60 text-gray-100 hover:bg-gray-700/60 transition-all duration-150" title="Attach media">
													<PhotoIcon className="h-4 w-4" />
												</button>
												<input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
											</div>
											<button type="submit" disabled={isSubmitting || isProcessingContent || (!content.trim() && files.length === 0)} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-150 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed" style={ (isSubmitting || isProcessingContent || (!content.trim() && files.length === 0)) ? {} : submitBtnBase }>
												{isSubmitting || isProcessingContent ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"/> : <PaperAirplaneIcon className="h-4 w-4" />}
												<span className="text-sm">{isSubmitting || isProcessingContent ? 'Posting...' : 'Post'}</span>
											</button>
										</div>
									</div>
								) : (
									<div className="absolute left-0 right-0 bottom-0 z-10 bg-gradient-to-t from-gray-900/95 to-gray-900/60 p-4 border-t border-gray-700/30">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-3">
												<button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-800/60 text-gray-100 hover:bg-gray-700/60 transition-all duration-150" title="Attach media">
													<PhotoIcon className="h-4 w-4" />
												</button>
												<input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
											</div>
											<button type="submit" disabled={isSubmitting || isProcessingContent || (!content.trim() && files.length === 0)} className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-150 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed" style={ (isSubmitting || isProcessingContent || (!content.trim() && files.length === 0)) ? {} : submitBtnBase }>
												{isSubmitting || isProcessingContent ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"/> : <PaperAirplaneIcon className="h-4 w-4" />}
												<span className="text-sm">{isSubmitting || isProcessingContent ? 'Posting...' : 'Post'}</span>
											</button>
										</div>
									</div>
								)}
							</form>
						</div>
					</div>
					<ProfanityModal open={profanityModalOpen} detectedWords={detectedProfaneWords} onClose={() => setProfanityModalOpen(false)} />
				</div>,
				document.body
			)}
			{(!isMobile || !showFullScreenModal) && (
				<ProfanityModal open={profanityModalOpen} detectedWords={detectedProfaneWords} onClose={() => setProfanityModalOpen(false)} />
			)}
		</>
	);
};

export default SpaceCreatePost;

import type {
  Dispatch,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from 'react';
import type { Timestamp } from 'firebase/firestore';
import type { User } from '../../contexts/AuthContext';
import type {
  ChatWithDetails,
  Message as ServiceMessage,
} from '../../services/messageService';

export type ThemeKey =
  | 'green'
  | 'blue'
  | 'purple'
  | 'orange'
  | 'red'
  | 'pink'
  | 'indigo'
  | 'teal';

export type ThemeStyle = {
  from: string;
  to: string;
  border: string;
  forwardedFrom: string;
  forwardedTo: string;
  tint: string;
};

export type MessageAction =
  | 'reply'
  | 'edit'
  | 'delete'
  | 'delete-for-everyone'
  | 'delete-for-me'
  | 'pin'
  | 'unpin'
  | 'copy'
  | 'forward';

export interface PinnedMessage {
  messageId: string;
  pinnedAt: Timestamp;
  pinnedBy: string;
}

export type ReactionType = 'heart' | 'like' | 'sad' | 'anger';

export interface MessageReaction {
  userId: string;
  type: ReactionType;
  timestamp: Timestamp;
}

export type Message = ServiceMessage & {
  isPinned?: boolean;
  pinnedDetails?: PinnedMessage;
  localStatus?: 'sending' | 'failed';
  deletedForEveryone?: boolean;
  deletedForMe?: string[];
  reactions?: Record<string, MessageReaction>;
};

export type IMessage = Message;
export type LocalMessage = IMessage & { localStatus?: 'sending' | 'failed' };

export type MessageInputProps = {
  messageText: string;
  setMessageText: Dispatch<SetStateAction<string>>;
  messageInputRef: RefObject<HTMLTextAreaElement>;
  handleSendMessageWithReply: (e: FormEvent) => void;
  replyToMessage: IMessage | null;
  setReplyToMessage: Dispatch<SetStateAction<IMessage | null>>;
  currentUser: User | null;
  selectedChat: ChatWithDetails | null;
  editingMessage: IMessage | null;
  setEditingMessage: Dispatch<SetStateAction<IMessage | null>>;
  isSendingMessage: boolean;
  setIsSendingMessage: Dispatch<SetStateAction<boolean>>;
  isMobileView: boolean;
  setProfanityModalOpen: Dispatch<SetStateAction<boolean>>;
  setDetectedProfaneWords: Dispatch<SetStateAction<string[]>>;
};

export type ChatHeaderProps = {
  selectedChat: ChatWithDetails | null;
  setShowChatList: Dispatch<SetStateAction<boolean>>;
  setShowGroupModal: Dispatch<SetStateAction<boolean>>;
  setShowAddMemberModal: Dispatch<SetStateAction<boolean>>;
  currentUser: User | null;
  setSelectedChat: Dispatch<SetStateAction<ChatWithDetails | null>>;
  setShowDeleteChatDialog: Dispatch<SetStateAction<boolean>>;
  blockingStatus: {
    isBlocked: boolean;
    isBlockedBy: boolean;
    isLoading: boolean;
  };
  handleBlockUser: (chat: ChatWithDetails) => Promise<void>;
  onVisitProfile: (userId: string) => void;
  openThemeModal: () => void;
  openMediaFiles: () => void;
  onStartAudioCall: () => void;
  canStartAudioCall: boolean;
  isCallingBusy: boolean;
};

export type MessageProps = {
  message: IMessage;
  messages: IMessage[];
  isLast?: boolean;
  onAction: (action: MessageAction, message: IMessage) => void;
  isPinned?: boolean;
  currentUser: User | null;
  selectedChat: ChatWithDetails | null;
  isMobileView: boolean;
  touchStartXRef: MutableRefObject<number | null>;
  showMobileActionSheet: (message: IMessage) => void;
  setContextMenu: (
    contextMenu: { x: number; y: number; message: IMessage } | null
  ) => void;
  setSelectedReactions: Dispatch<
    SetStateAction<
      {
        user: User | null;
        timestamp: Timestamp;
        displayName?: string;
        type?: string;
      }[]
    >
  >;
  setShowReactionDetails: Dispatch<SetStateAction<boolean>>;
  showSenderName?: boolean;
  openImagePreview?: (images: string[], startIndex: number) => void;
  openVideoPreview?: (url: string) => void;
};

export type MessageDropdownProps = {
  message: IMessage;
  isSentByCurrentUser: boolean;
  currentUser: User | null;
  onAction: (action: MessageAction) => void;
  showDropdown: boolean;
  onCloseDropdown: () => void;
};

export type ChatListItemProps = {
  chat: ChatWithDetails;
  currentUser: User | null;
  incomingCallCallerUid?: string | null;
  selectedChat: ChatWithDetails | null;
  setSelectedChat: Dispatch<SetStateAction<ChatWithDetails | null>>;
  formatMessageTime: (timestamp: any) => string;
  onRightClick: (
    e: ReactMouseEvent,
    chat: ChatWithDetails,
    customPosition?: { x: number; y: number }
  ) => void;
  showChatActionSheet?: (chat: ChatWithDetails) => void;
  onAcceptRequest?: (chat: ChatWithDetails) => void;
  onDeclineRequest?: (chat: ChatWithDetails) => void;
  isMobileView?: boolean;
  setShowChatList?: Dispatch<SetStateAction<boolean>>;
};

export type MobileActionSheetProps = {
  message: IMessage;
  onAction: (action: MessageAction) => void;
  onClose: () => void;
  isSender: boolean;
};

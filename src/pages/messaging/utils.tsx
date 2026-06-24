import React from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase/config';
import type { ChatWithDetails } from '../../services/messageService';

export function getUserUID() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        if (user) {
          resolve(user.uid);
        } else {
          resolve(null);
        }
      },
      reject
    );
  });
}

export const getFirstName = (name: string) => name.split(' ')[0] || 'User';

export const scrollToBottom = (behavior: ScrollBehavior = 'auto'): void => {
  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    const messagesEndRef = document.getElementById('messages-end');
    if (messagesEndRef) {
      messagesEndRef.scrollIntoView({ behavior });
    }
  } else {
    const chatContainer = document.querySelector('.messages-container');
    if (chatContainer) {
      const extraPadding = 40;
      chatContainer.scrollTop = chatContainer.scrollHeight + extraPadding;

      const inputContainer = document.querySelector(
        '.bg-\\[\\#121212\\].border-t.border-gray-800\\/10.px-2.sm\\:px-4.py-2'
      );
      if (inputContainer && (inputContainer as HTMLElement).style.transform === '') {
        (inputContainer as HTMLElement).style.transform = 'translateY(-2px)';
      }
    }
  }
};

export const instantScrollToBottom = (): void => {
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    const chatContainer = document.querySelector('.messages-container');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  } else {
    const chatContainer = document.querySelector('.messages-container');
    if (chatContainer) {
      const extraPadding = 40;
      chatContainer.scrollTop = chatContainer.scrollHeight + extraPadding;
    }
  }
};

export const getGroupIcon = (iconUrl?: string) => {
  return (
    <div className="relative mr-3">
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-green-500/20 to-emerald-500/20 animate-pulse blur-sm -m-0.5"></div>
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center text-white border-2 border-green-500/30 shadow-lg shadow-green-800/10">
        <span className="material-icons text-2xl">groups</span>
      </div>
    </div>
  );
};

export const normalizeChatId = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export const resolveChatPeerId = (
  chat: ChatWithDetails,
  currentUserId: string
): string => {
  const candidates: string[] = [];

  const addCandidate = (value: unknown) => {
    const id = normalizeChatId(value);
    if (id) candidates.push(id);
  };

  addCandidate(chat?.otherUser?.id);
  addCandidate((chat as any)?.otherUserId);

  if (Array.isArray((chat as any)?.participants)) {
    (chat as any).participants.forEach((entry: any) => {
      if (typeof entry === 'string') {
        addCandidate(entry);
        return;
      }
      if (entry && typeof entry === 'object') {
        addCandidate(entry.id);
        addCandidate(entry.uid);
        addCandidate(entry.userId);
      }
    });
  }

  if (Array.isArray((chat as any)?.users)) {
    (chat as any).users.forEach((entry: any) => {
      if (!entry || typeof entry !== 'object') return;
      addCandidate(entry.id);
      addCandidate(entry.uid);
      addCandidate(entry.userId);
    });
  }

  return candidates.find((id) => id !== currentUserId) || '';
};

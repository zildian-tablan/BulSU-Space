import type { ThemeKey, ThemeStyle } from './types';

export class FriendUID {
  static friendUID = '';
  static friendName = '';
}

export const MESSAGES_COLLECTION = 'messages';
export const CHATS_COLLECTION = 'chats';

export const THEME_STYLES: Record<ThemeKey, ThemeStyle> = {
  green: {
    from: 'from-green-600',
    to: 'to-emerald-500',
    border: 'border-green-400',
    forwardedFrom: 'from-green-600/90',
    forwardedTo: 'to-emerald-500/90',
    tint: 'bg-green-600/20',
  },
  blue: {
    from: 'from-blue-600',
    to: 'to-indigo-500',
    border: 'border-blue-400',
    forwardedFrom: 'from-blue-600/90',
    forwardedTo: 'to-indigo-500/90',
    tint: 'bg-blue-600/20',
  },
  purple: {
    from: 'from-purple-600',
    to: 'to-fuchsia-500',
    border: 'border-purple-400',
    forwardedFrom: 'from-purple-600/90',
    forwardedTo: 'to-fuchsia-500/90',
    tint: 'bg-purple-600/20',
  },
  orange: {
    from: 'from-orange-600',
    to: 'to-amber-500',
    border: 'border-orange-400',
    forwardedFrom: 'from-orange-600/90',
    forwardedTo: 'to-amber-500/90',
    tint: 'bg-orange-600/20',
  },
  red: {
    from: 'from-red-600',
    to: 'to-rose-500',
    border: 'border-red-400',
    forwardedFrom: 'from-red-600/90',
    forwardedTo: 'to-rose-500/90',
    tint: 'bg-red-600/20',
  },
  pink: {
    from: 'from-pink-600',
    to: 'to-rose-500',
    border: 'border-pink-400',
    forwardedFrom: 'from-pink-600/90',
    forwardedTo: 'to-rose-500/90',
    tint: 'bg-pink-600/20',
  },
  indigo: {
    from: 'from-indigo-600',
    to: 'to-blue-500',
    border: 'border-indigo-400',
    forwardedFrom: 'from-indigo-600/90',
    forwardedTo: 'to-blue-500/90',
    tint: 'bg-indigo-600/20',
  },
  teal: {
    from: 'from-teal-600',
    to: 'to-emerald-500',
    border: 'border-teal-400',
    forwardedFrom: 'from-teal-600/90',
    forwardedTo: 'to-emerald-500/90',
    tint: 'bg-teal-600/20',
  },
};

export const DEFAULT_THEME: ThemeKey = 'green';

export const isThemeKey = (k: any): k is ThemeKey =>
  k === 'green' ||
  k === 'blue' ||
  k === 'purple' ||
  k === 'orange' ||
  k === 'red' ||
  k === 'pink' ||
  k === 'indigo' ||
  k === 'teal';

export const toThemeKey = (key?: string | null): ThemeKey =>
  isThemeKey(key) ? (key as ThemeKey) : DEFAULT_THEME;

export const getThemeStylesByKey = (key?: string | null): ThemeStyle =>
  THEME_STYLES[toThemeKey(key)];

export const reactionEmojiMap: Record<string, string> = {
  heart: '/images/emoji/heart.png',
  haha: '/images/emoji/haha.png',
  love: '/images/emoji/love.png',
  sob: '/images/emoji/sob.png',
  sad: '/images/emoji/sad.png',
  angry: '/images/emoji/angry.png',
};

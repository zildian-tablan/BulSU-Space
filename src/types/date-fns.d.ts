declare module 'date-fns' {
  export function format(date: Date | number, format: string): string;
  export function formatDistanceToNow(date: Date | number, options?: { addSuffix?: boolean }): string;
}

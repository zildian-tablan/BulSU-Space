import React, { useEffect, useRef, useState } from 'react';
import { processStorageUrl, refreshDownloadUrl, isUrlFresh } from '../../firebase/storage-proxy';

interface SmartMediaProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  type?: 'image' | 'video';
  videoProps?: React.VideoHTMLAttributes<HTMLVideoElement>;
  maxRetries?: number;
  onReady?: () => void;
  // If you have the original storage path separate from downloadURL for refresh
  storagePathHint?: string;
  className?: string;
  skeletonClassName?: string;
}

/**
 * SmartMedia handles:
 *  - Lazy load via IntersectionObserver
 *  - Stable URL processing (avoids regenerating timestamp each render)
 *  - Retry with exponential backoff and token refresh
 *  - Fallback placeholder + manual retry button
 *  - Connection detection and automatic recovery
 */
export const SmartMedia: React.FC<SmartMediaProps> = (props) => {
  const {
    src,
    type = 'image',
    videoProps,
    maxRetries = 3,
    onError,
    onReady,
    storagePathHint,
    className = '',
    skeletonClassName = '',
    ...imgRest
  } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string>('');
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      console.log('[SmartMedia] Connection restored, retrying failed media');
      setIsOnline(true);
      if (status === 'error') {
        retryManually();
      }
    };
    const handleOffline = () => {
      console.log('[SmartMedia] Connection lost');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [status]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Observe visibility
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Resolve URL once in view
  useEffect(() => {
    if (!inView || status === 'ready' || status === 'loading') return;
    let active = true;
    const load = async () => {
      try {
        setStatus('loading');
        setErrorMsg('');
        
        // Check if we're offline
        if (!isOnline) {
          throw new Error('No internet connection');
        }
        
        let finalUrl = processStorageUrl(src);
        
        // Check if URL might be expired and needs refresh
        if (attempt > 0 || !isUrlFresh(finalUrl)) {
          console.log(`[SmartMedia] URL appears stale or retry needed, refreshing...`);
          finalUrl = await refreshDownloadUrl(storagePathHint || src);
        }
        
        if (!active) return;
        setResolvedSrc(finalUrl);
      } catch (e: any) {
        console.warn('[SmartMedia] URL resolve failed', e);
        if (!active) return;
        setErrorMsg(e?.message || 'Failed to resolve URL');
        setStatus('error');
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [inView, attempt, src, storagePathHint, status, isOnline]);

  // Retry logic with exponential backoff for image load failure
  const handleResourceError = async (ev: React.SyntheticEvent<any, Event>) => {
    console.error(`[SmartMedia] Resource load error, attempt ${attempt + 1}/${maxRetries}`);
    
    if (!isOnline) {
      setStatus('error');
      setErrorMsg('No internet connection');
      if (onError) onError(ev as any);
      return;
    }
    
    if (attempt < maxRetries) {
      const next = attempt + 1;
      setAttempt(next);
      const delay = Math.min(4000, 300 * Math.pow(2, next));
      console.log(`[SmartMedia] Retrying in ${delay}ms...`);
      
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      
      retryTimeoutRef.current = setTimeout(() => {
        setStatus('idle');
      }, delay);
    } else {
      console.error('[SmartMedia] Max retries reached, giving up');
      setStatus('error');
      setErrorMsg('Failed to load after multiple attempts');
      if (onError) onError(ev as any);
    }
  };

  const handleResourceReady = () => {
    console.log('[SmartMedia] Resource loaded successfully');
    setStatus('ready');
    setAttempt(0); // Reset attempts on success
    if (onReady) onReady();
  };

  const retryManually = () => {
    console.log('[SmartMedia] Manual retry triggered');
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    setAttempt(0);
    setStatus('idle');
    setErrorMsg('');
  };

  const skeleton = (
    <div className={`animate-pulse bg-gray-800/50 border border-gray-700/40 rounded-xl w-full h-full flex items-center justify-center ${skeletonClassName}`}>
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
        <div className="w-full bg-gray-700/70 rounded-md" style={{ height: 0, paddingBottom: '56.25%' }} />
      </div>
    </div>
  );

  const errorFallback = (
    <div className="flex flex-col items-center justify-center gap-2 bg-gray-900/60 border border-gray-700/50 rounded-xl p-4 text-center text-xs text-gray-400 w-full h-full">
      {!isOnline ? (
        <>
          <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
          <span>No connection</span>
          <span className="opacity-70 text-[10px]">Will retry when online</span>
        </>
      ) : (
        <>
          <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Failed to load media</span>
          {errorMsg && <span className="opacity-70 max-w-[140px] truncate text-[10px]">{errorMsg}</span>}
          <button onClick={retryManually} className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs transition-colors">Retry</button>
        </>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {status !== 'ready' && status !== 'error' && skeleton}
      {status === 'error' && errorFallback}
      {resolvedSrc && status !== 'error' && (
        type === 'video' ? (
          <video
            {...videoProps}
            src={resolvedSrc}
            onError={handleResourceError}
            onLoadedData={handleResourceReady}
            className={`w-full h-full object-cover ${videoProps?.className || ''}`}
          />
        ) : (
          <img
            {...imgRest}
            src={resolvedSrc}
            onError={handleResourceError}
            onLoad={handleResourceReady}
            className={`w-full h-full object-cover ${(imgRest as any).className || ''}`}
            alt={(imgRest as any).alt || 'media'}
          />
        )
      )}
    </div>
  );
};

export default SmartMedia;

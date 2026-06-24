import React, { useState, useEffect, ReactNode } from 'react';
import { processStorageUrl } from '../../firebase/storage-proxy';

interface FirebaseImageProps {
  src: string;
  alt?: string;
  className?: string;
  fallbackSrc?: string;
  loadingFallback?: ReactNode;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * FirebaseImage component
 * 
 * A component that handles loading images from Firebase Storage with proper CORS handling
 * This component will automatically apply CORS fixes for Firebase Storage URLs
 */
const FirebaseImage: React.FC<FirebaseImageProps> = ({
  src,
  alt = '',
  className = '',
  fallbackSrc = '/images/placeholder.png',
  loadingFallback,
  onLoad,
  onError
}) => {
  const [imgSrc, setImgSrc] = useState<string>(processStorageUrl(src));
  const [error, setError] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!src) {
      setError(true);
      setLoading(false);
      return;
    }
    // Only set loading to true if imgSrc is empty (first load)
    setImgSrc(processStorageUrl(src));
    setError(false);
    // Only set loading to true if not already loaded
    setLoading(prev => imgSrc === '' ? true : prev);
  }, [src]);

  const handleError = () => {
    console.warn(`Failed to load image: ${imgSrc}`);
    setError(true);
    setLoading(false);
    if (onError) onError();
  };

  const handleLoad = () => {
    setLoading(false);
    if (onLoad) onLoad();
  };

  if (loading && loadingFallback) {
    return <>{loadingFallback}</>;
  }

  return (
    <img
      src={error ? fallbackSrc : imgSrc}
      alt={alt}
      className={className}
      onError={handleError}
      onLoad={handleLoad}
      loading="lazy"
      crossOrigin="anonymous"
    />
  );
};

export default FirebaseImage;

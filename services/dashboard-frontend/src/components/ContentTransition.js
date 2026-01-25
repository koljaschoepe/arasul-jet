import React, { useState, useEffect, useRef, memo } from 'react';
import './ContentTransition.css';

/**
 * ContentTransition - Apple iOS-style smooth loading transition
 *
 * Wraps content with skeleton→content transition:
 * 1. Shows skeleton immediately when isLoading=true
 * 2. Keeps skeleton visible for minimum time (prevents flash of loading)
 * 3. Smoothly fades skeleton out and content in
 *
 * @param {boolean} isLoading - Whether content is loading
 * @param {React.ReactNode} skeleton - Skeleton placeholder to show while loading
 * @param {React.ReactNode} children - Actual content to display when loaded
 * @param {number} minLoadingTime - Minimum time to show skeleton (default: 300ms)
 * @param {string} className - Additional class name for container
 */
const ContentTransition = memo(function ContentTransition({
  isLoading,
  skeleton,
  children,
  minLoadingTime = 300,
  className = ''
}) {
  // Track whether we've met the minimum loading time
  const [showSkeleton, setShowSkeleton] = useState(isLoading);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const loadStartTimeRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (isLoading) {
      // Loading started - record start time and show skeleton
      loadStartTimeRef.current = Date.now();
      setShowSkeleton(true);
      setIsTransitioning(false);
    } else if (loadStartTimeRef.current !== null) {
      // Loading finished - check if minimum time has passed
      const elapsed = Date.now() - loadStartTimeRef.current;
      const remaining = Math.max(0, minLoadingTime - elapsed);

      if (remaining > 0) {
        // Need to wait before hiding skeleton
        timeoutRef.current = setTimeout(() => {
          setIsTransitioning(true);
          // Allow transition to complete before hiding skeleton entirely
          setTimeout(() => {
            setShowSkeleton(false);
            setIsTransitioning(false);
          }, 300); // matches CSS transition duration
        }, remaining);
      } else {
        // Minimum time passed, start transition immediately
        setIsTransitioning(true);
        setTimeout(() => {
          setShowSkeleton(false);
          setIsTransitioning(false);
        }, 300);
      }

      loadStartTimeRef.current = null;
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isLoading, minLoadingTime]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const showContent = !isLoading && (!showSkeleton || isTransitioning);

  return (
    <div
      className={`content-transition-wrapper ${className}`}
      aria-busy={isLoading}
    >
      {/* Skeleton Layer */}
      <div
        className={`content-transition-skeleton-layer ${!showSkeleton ? 'hidden' : ''} ${isTransitioning ? 'fading' : ''}`}
        aria-hidden={!showSkeleton}
      >
        {skeleton}
      </div>

      {/* Content Layer */}
      <div
        className={`content-transition-content-layer ${showContent ? 'visible' : ''}`}
        aria-hidden={!showContent}
      >
        {children}
      </div>
    </div>
  );
});

export default ContentTransition;

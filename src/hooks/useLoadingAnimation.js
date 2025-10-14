import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Custom hook to standardize loading animation logic across all pages
 * @param {Object} options - Configuration options
 * @param {boolean} options.loading - Whether data is currently loading
 * @param {boolean} options.skipAnimation - Whether to skip the loading animation (e.g., for fast loads)
 * @param {number} options.fastLoadThreshold - Time in ms below which to skip animation (default: 500)
 * @param {boolean} options.forceVideoPlay - Whether to force video play even for fast loads
 * @returns {Object} Loading state and handlers
 */
export const useLoadingAnimation = ({
  loading,
  skipAnimation = false,
  fastLoadThreshold = 500,
  forceVideoPlay = false,
}) => {
  const [showLoadingAnimation, setShowLoadingAnimation] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const loadStartTime = useRef(null);

  // Track when loading starts
  useEffect(() => {
    if (loading) {
      loadStartTime.current = Date.now();
      setShowContent(false);

      // Only show loading animation if not explicitly skipped
      if (!skipAnimation) {
        setShowLoadingAnimation(true);
      }
    } else {
      setShowLoadingAnimation(false);

      // Check if loading was fast and mark data as loaded
      if (loadStartTime.current) {
        const loadTime = Date.now() - loadStartTime.current;
        if (loadTime < fastLoadThreshold) {
          setDataLoaded(true);
        }
      }

      // Add a small delay before showing content for smooth transition
      setTimeout(() => {
        setShowContent(true);
      }, 100);
    }
  }, [loading, skipAnimation, fastLoadThreshold]);

  const handleLoadingComplete = useCallback(() => {
    setShowLoadingAnimation(false);
    // Add a small delay before showing content for smooth transition
    setTimeout(() => {
      setShowContent(true);
    }, 100);
  }, []);

  return {
    showLoadingAnimation,
    showContent,
    dataLoaded,
    handleLoadingComplete,
    forceVideoPlay,
  };
};

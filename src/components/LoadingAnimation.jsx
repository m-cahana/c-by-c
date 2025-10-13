import React, { useState, useRef, useEffect } from "react";
import "./LoadingAnimation.css";

const LoadingAnimation = ({ onComplete, dataLoaded = false }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const videoRef = useRef(null);
  const fallbackTimeoutRef = useRef(null);

  // Detect Safari mobile
  const isSafariMobile = () => {
    const ua = navigator.userAgent;
    return (
      /iPad|iPhone|iPod/.test(ua) &&
      /Safari/.test(ua) &&
      !/CriOS|FxiOS|OPiOS|mercury/.test(ua)
    );
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVideoEnd = () => {
      setIsFading(true);
      // Start fade out animation
      setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, 500); // 500ms fade duration
    };

    const handleVideoError = () => {
      // If video fails to load, still complete the loading
      console.warn("Loading video failed, completing loading animation");
      handleVideoEnd();
    };

    const handleVideoCanPlay = () => {
      // Clear any fallback timeout when video is ready
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
        fallbackTimeoutRef.current = null;
      }
    };

    // If data is already loaded, skip the animation
    if (dataLoaded) {
      handleVideoEnd();
      return;
    }

    // For Safari mobile, use a shorter timeout and fallback
    const isSafari = isSafariMobile();
    const timeoutDuration = isSafari ? 2000 : 5000; // Shorter timeout for Safari

    video.addEventListener("ended", handleVideoEnd);
    video.addEventListener("error", handleVideoError);
    video.addEventListener("canplay", handleVideoCanPlay);

    // Set up fallback timeout for Safari mobile
    if (isSafari) {
      fallbackTimeoutRef.current = setTimeout(() => {
        console.warn("Video loading timeout on Safari mobile, using fallback");
        setUseFallback(true);
        handleVideoEnd();
      }, timeoutDuration);
    }

    // Start playing the video
    const playPromise = video.play();

    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.warn("Video autoplay failed:", error);
        // For Safari mobile, try to use fallback animation
        if (isSafari) {
          setUseFallback(true);
        }
        // Still complete the loading
        handleVideoEnd();
      });
    }

    return () => {
      video.removeEventListener("ended", handleVideoEnd);
      video.removeEventListener("error", handleVideoError);
      video.removeEventListener("canplay", handleVideoCanPlay);
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
      }
    };
  }, [onComplete, dataLoaded]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className={`loading-overlay ${isFading ? "fading" : ""}`}>
      {useFallback ? (
        <div className="loading-fallback">
          <div className="loading-spinner">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
          </div>
          <div className="loading-text">Loading...</div>
        </div>
      ) : (
        <video
          ref={videoRef}
          className="loading-video"
          muted
          playsInline
          preload="auto"
          webkit-playsinline="true"
          x-webkit-airplay="allow"
          controls={false}
        >
          <source src="/logos/faster_crossword.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      )}
    </div>
  );
};

export default LoadingAnimation;

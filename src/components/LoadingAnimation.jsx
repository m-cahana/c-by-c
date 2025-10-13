import React, { useState, useRef, useEffect } from "react";
import "./LoadingAnimation.css";

const LoadingAnimation = ({ onComplete, dataLoaded = false }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const videoRef = useRef(null);

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

    // If data is already loaded, skip the animation
    if (dataLoaded) {
      handleVideoEnd();
      return;
    }

    video.addEventListener("ended", handleVideoEnd);
    video.addEventListener("error", handleVideoError);

    // Start playing the video
    video.play().catch((error) => {
      console.warn("Video autoplay failed:", error);
      // If autoplay fails, still complete the loading
      handleVideoEnd();
    });

    return () => {
      video.removeEventListener("ended", handleVideoEnd);
      video.removeEventListener("error", handleVideoError);
    };
  }, [onComplete, dataLoaded]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className={`loading-overlay ${isFading ? "fading" : ""}`}>
      <video
        ref={videoRef}
        className="loading-video"
        muted
        playsInline
        preload="auto"
      >
        <source src="/logos/faster_crossword.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default LoadingAnimation;

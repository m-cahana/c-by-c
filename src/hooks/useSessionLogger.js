import { useEffect, useRef } from "react";
import { supabase, isSupabaseConfigured } from "../supabase";

const BROWSER_ID_KEY = "cbc_browser_id";
const SESSION_ID_KEY = "cbc_session_id";
const SESSION_STARTED_KEY = "cbc_session_started";
let inMemorySessionId = null;
let inMemorySessionStarted = false;
let currentPuzzleTitle = null;
let pendingPageVisit = null;
let pendingPageVisitTimeout = null;
let cachedLocation = null;
let locationFetchPromise = null;

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4-ish generator
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getBrowserId() {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(BROWSER_ID_KEY);
    if (existing) return existing;
    const next = generateId();
    window.localStorage.setItem(BROWSER_ID_KEY, next);
    return next;
  } catch (err) {
    console.warn("Unable to access localStorage for browser id", err);
    return null;
  }
}

function getSessionId() {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) {
      inMemorySessionId = existing;
      return existing;
    }
    const next = generateId();
    window.sessionStorage.setItem(SESSION_ID_KEY, next);
    window.sessionStorage.removeItem(SESSION_STARTED_KEY);
    inMemorySessionId = next;
    inMemorySessionStarted = false;
    return next;
  } catch (err) {
    if (!inMemorySessionId) {
      inMemorySessionId = generateId();
    }
    inMemorySessionStarted = false;
    return inMemorySessionId;
  }
}

function hasLoggedSessionStart() {
  if (typeof window === "undefined") return inMemorySessionStarted;
  try {
    return window.sessionStorage.getItem(SESSION_STARTED_KEY) === "true";
  } catch (err) {
    return inMemorySessionStarted;
  }
}

function markSessionStartLogged() {
  if (typeof window === "undefined") {
    inMemorySessionStarted = true;
    return;
  }
  try {
    window.sessionStorage.setItem(SESSION_STARTED_KEY, "true");
  } catch (err) {
    inMemorySessionStarted = true;
  }
}

async function fetchLocationFromIP() {
  // Return cached location if available
  if (cachedLocation) {
    return cachedLocation;
  }

  // If a fetch is already in progress, return that promise
  if (locationFetchPromise) {
    return locationFetchPromise;
  }

  // Start fetching location
  locationFetchPromise = (async () => {
    try {
      // Use ipapi.co which is free and doesn't require an API key
      const response = await fetch("https://ipapi.co/json/");
      if (!response.ok) throw new Error("Failed to fetch location");

      const data = await response.json();

      // Extract relevant location information
      const location = {
        country: data.country_name || null,
        country_code: data.country_code || null,
        region: data.region || null,
        city: data.city || null,
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        timezone: data.timezone || null,
      };

      // Cache the result
      cachedLocation = location;
      return location;
    } catch (error) {
      console.warn("Failed to fetch location from IP", error);
      // Cache null to avoid repeated failed requests
      cachedLocation = { error: "Unable to determine location" };
      return cachedLocation;
    } finally {
      locationFetchPromise = null;
    }
  })();

  return locationFetchPromise;
}

function getDeviceInfo() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return null;
  }

  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";

  // Detect device type
  let deviceType = "desktop";
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent
    );
  const isTablet =
    /iPad|Android/i.test(userAgent) && !/Mobile/i.test(userAgent);

  if (isMobile) {
    deviceType = "mobile";
  } else if (isTablet) {
    deviceType = "tablet";
  }

  // Detect OS
  let os = "unknown";
  if (/Windows/i.test(userAgent)) {
    os = "Windows";
  } else if (/Mac/i.test(userAgent) || /Macintosh/i.test(userAgent)) {
    os = "macOS";
  } else if (/Linux/i.test(userAgent)) {
    os = "Linux";
  } else if (/Android/i.test(userAgent)) {
    os = "Android";
  } else if (/iOS|iPhone|iPad|iPod/i.test(userAgent)) {
    os = "iOS";
  }

  // Detect browser
  let browser = "unknown";
  if (/Chrome/i.test(userAgent) && !/Edg|OPR/i.test(userAgent)) {
    browser = "Chrome";
  } else if (/Firefox/i.test(userAgent)) {
    browser = "Firefox";
  } else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) {
    browser = "Safari";
  } else if (/Edg/i.test(userAgent)) {
    browser = "Edge";
  } else if (/OPR/i.test(userAgent)) {
    browser = "Opera";
  }

  // Get screen dimensions
  const screenWidth = window.screen?.width || null;
  const screenHeight = window.screen?.height || null;
  const windowWidth = window.innerWidth || null;
  const windowHeight = window.innerHeight || null;

  return {
    device_type: deviceType,
    os,
    browser,
    platform: platform || null,
    screen_width: screenWidth,
    screen_height: screenHeight,
    window_width: windowWidth,
    window_height: windowHeight,
    user_agent: userAgent,
  };
}

async function enrichMetadataWithLocation(metadata) {
  try {
    const location = await fetchLocationFromIP();
    const device = getDeviceInfo();
    return {
      ...metadata,
      location,
      device,
    };
  } catch (error) {
    console.warn("Failed to enrich metadata with location", error);
    // Still try to add device info even if location fails
    const device = getDeviceInfo();
    return {
      ...metadata,
      device,
    };
  }
}

export function setActivePuzzleTitle(title) {
  currentPuzzleTitle = title || null;
  flushPendingPageVisit(false);
}

export async function logEvent(
  event,
  { path = null, metadata = null, puzzle = undefined } = {}
) {
  if (!isSupabaseConfigured() || !supabase) return null;

  const browserId = getBrowserId();
  const sessionId = getSessionId();

  if (!browserId || !sessionId) return null;

  try {
    const payload = {
      browser_id: browserId,
      session_id: sessionId,
      event,
      path,
      metadata,
      puzzle:
        puzzle !== undefined
          ? puzzle
          : currentPuzzleTitle != null
          ? currentPuzzleTitle
          : null,
    };

    const { error } = await supabase.from("session_events").insert(payload);
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn("Failed to log event", event, error);
    return false;
  }
}

export function useSessionLogger(location) {
  const endedRef = useRef(false);
  const lastPathRef = useRef(null);
  const startLoggedRef = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return undefined;

    endedRef.current = false;

    const initialPath =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/";

    if (!startLoggedRef.current && !hasLoggedSessionStart()) {
      startLoggedRef.current = true;
      markSessionStartLogged();
      (async () => {
        const baseMetadata =
          typeof window !== "undefined"
            ? { href: window.location.href }
            : undefined;
        const enrichedMetadata = baseMetadata
          ? await enrichMetadataWithLocation(baseMetadata)
          : undefined;
        logEvent("session_start", {
          path: initialPath,
          metadata: enrichedMetadata,
        });
      })();
    }

    const endSession = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      const path =
        lastPathRef.current ||
        (typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : initialPath);
      (async () => {
        const baseMetadata =
          typeof window !== "undefined"
            ? { href: window.location.href }
            : undefined;
        const enrichedMetadata = baseMetadata
          ? await enrichMetadataWithLocation(baseMetadata)
          : undefined;
        logEvent("session_end", {
          path,
          metadata: enrichedMetadata,
        });
      })();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        endSession();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", endSession);
    window.addEventListener("beforeunload", endSession, { capture: true });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", endSession);
      window.removeEventListener("beforeunload", endSession, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;
    if (typeof window === "undefined") return;

    const currentPath = `${location.pathname}${
      location.search ? location.search : ""
    }`;
    if (lastPathRef.current === currentPath) return;
    lastPathRef.current = currentPath;

    schedulePageVisit(currentPath);
  }, [location.pathname, location.search]);
}

function flushPendingPageVisit(force) {
  if (!pendingPageVisit) return;
  const puzzleValue = currentPuzzleTitle != null ? currentPuzzleTitle : null;
  if (!force && puzzleValue == null) return;

  const payload = {
    path: pendingPageVisit.path,
    metadata: pendingPageVisit.metadata,
    puzzle: puzzleValue,
  };

  pendingPageVisit = null;
  if (pendingPageVisitTimeout != null) {
    clearTimeout(pendingPageVisitTimeout);
    pendingPageVisitTimeout = null;
  }

  logEvent("page_visit", payload);
}

async function schedulePageVisit(path) {
  if (pendingPageVisit) {
    flushPendingPageVisit(true);
  }

  const baseMetadata =
    typeof window !== "undefined" ? { href: window.location.href } : undefined;
  const metadata = baseMetadata
    ? await enrichMetadataWithLocation(baseMetadata)
    : undefined;

  pendingPageVisit = { path, metadata };

  if (pendingPageVisitTimeout != null) {
    clearTimeout(pendingPageVisitTimeout);
  }

  if (typeof window !== "undefined") {
    pendingPageVisitTimeout = window.setTimeout(() => {
      flushPendingPageVisit(true);
    }, 1500);
  }

  flushPendingPageVisit(false);
}

function getCurrentPath() {
  if (typeof window === "undefined") return "/";
  const { pathname, search } = window.location;
  return `${pathname}${search || ""}`;
}

function buildEventOptions(options = {}) {
  const { path, metadata, puzzle } = options;
  return {
    path: path || getCurrentPath(),
    metadata: metadata ?? null,
    puzzle,
  };
}

export function logReveal(options) {
  return logEvent("reveal", buildEventOptions(options));
}

export function logCheck(options) {
  return logEvent("check", buildEventOptions(options));
}

export function logCompletion(options) {
  return logEvent("completion", buildEventOptions(options));
}

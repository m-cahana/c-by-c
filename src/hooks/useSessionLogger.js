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
      logEvent("session_start", {
        path: initialPath,
        metadata:
          typeof window !== "undefined"
            ? { href: window.location.href }
            : undefined,
      });
    }

    const endSession = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      const path =
        lastPathRef.current ||
        (typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : initialPath);
      logEvent("session_end", {
        path,
        metadata:
          typeof window !== "undefined"
            ? { href: window.location.href }
            : undefined,
      });
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

function schedulePageVisit(path) {
  if (pendingPageVisit) {
    flushPendingPageVisit(true);
  }

  const metadata =
    typeof window !== "undefined" ? { href: window.location.href } : undefined;

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

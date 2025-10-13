import React from "react";
import MobileKeyboard from "./components/MobileKeyboard";
import LoadingAnimation from "./components/LoadingAnimation";
import { supabase, isSupabaseConfigured } from "./supabase";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useParams,
} from "react-router-dom";
import AdminUpload from "./components/AdminUpload";
import { Analytics } from "@vercel/analytics/react";
import "./App.css";

async function fetchLatestSupabasePuz() {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.storage
    .from("puzzles")
    .list("", { limit: 100 });
  if (error) throw error;
  if (!data || data.length === 0) return null;
  const candidates = data
    .filter((f) => f.name && f.name.toLowerCase().endsWith(".puz"))
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  const latest = candidates[0] || data[0];
  const { data: file, error: dlError } = await supabase.storage
    .from("puzzles")
    .download(latest.name);
  if (dlError) throw dlError;
  const arrayBuffer = await file.arrayBuffer();
  return { arrayBuffer, name: latest.name };
}

async function fetchAllSupabasePuzzles() {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.storage
    .from("puzzles")
    .list("", { limit: 100 });
  if (error) throw error;
  if (!data || data.length === 0) return [];
  return data
    .filter((f) => f.name && f.name.toLowerCase().endsWith(".puz"))
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

async function fetchSpecificSupabasePuzzle(puzzleName) {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data: file, error } = await supabase.storage
    .from("puzzles")
    .download(puzzleName);
  if (error) throw error;
  const arrayBuffer = await file.arrayBuffer();
  return { arrayBuffer, name: puzzleName };
}

function useLatestPuzzle(fallbackUrl) {
  const [puzzle, setPuzzle] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const { decode } = require("puzjs");
        let decoded = null;

        // Check if we're loading a specific puzzle from URL
        const isSpecificPuzzle = fallbackUrl.startsWith("/puzzles/");
        if (isSpecificPuzzle) {
          const puzzleName = fallbackUrl.replace("/puzzles/", "");
          try {
            const specific = await fetchSpecificSupabasePuzzle(puzzleName);
            if (specific) {
              decoded = decode(specific.arrayBuffer);
            }
          } catch (supaErr) {
            console.error("Failed to load specific puzzle:", supaErr);
          }
        } else {
          // Load latest puzzle
          try {
            const latest = await fetchLatestSupabasePuz();
            if (latest) {
              decoded = decode(latest.arrayBuffer);
            }
          } catch (supaErr) {}
        }

        if (!decoded) {
          const res = await fetch(fallbackUrl);
          if (!res.ok) throw new Error(`Failed to load puzzle: ${res.status}`);
          const arrayBuffer = await res.arrayBuffer();
          decoded = decode(arrayBuffer);
        }
        if (!cancelled) setPuzzle(decoded);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [fallbackUrl, reloadKey]);

  function reload() {
    setReloadKey((k) => k + 1);
  }

  return { puzzle, error, loading, reload };
}

function computeNumbering(puzzle) {
  const rows = puzzle.grid.length;
  const cols = puzzle.grid[0].length;
  const numbersGrid = Array.from({ length: rows }, () =>
    Array(cols).fill(null)
  );
  const across = [];
  const down = [];
  const acrossNumAt = Array.from({ length: rows }, () =>
    Array(cols).fill(null)
  );
  const downNumAt = Array.from({ length: rows }, () => Array(cols).fill(null));

  function isBlock(r, c) {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return true;
    const cell = puzzle.grid[r][c];
    return typeof cell === "string" ? cell === "." : false;
  }

  let num = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (isBlock(r, c)) continue;
      const startsAcross = isBlock(r, c - 1) && !isBlock(r, c + 1);
      const startsDown = isBlock(r - 1, c) && !isBlock(r + 1, c);
      if (startsAcross || startsDown) {
        num += 1;
        numbersGrid[r][c] = num;
        if (startsAcross) {
          const positions = [];
          let cc = c;
          while (!isBlock(r, cc)) {
            positions.push({ r, c: cc });
            acrossNumAt[r][cc] = num;
            cc += 1;
          }
          across.push({
            number: num,
            positions,
            clue: puzzle.clues.across[num] || "",
          });
        }
        if (startsDown) {
          const positions = [];
          let rr = r;
          while (!isBlock(rr, c)) {
            positions.push({ r: rr, c });
            downNumAt[rr][c] = num;
            rr += 1;
          }
          down.push({
            number: num,
            positions,
            clue: puzzle.clues.down[num] || "",
          });
        }
      }
    }
  }

  return { numbersGrid, across, down, acrossNumAt, downNumAt };
}

function ClueList({ title, entries, currentNumber, onSelect }) {
  return (
    <div className="clue-section">
      <h2 className="clue-title">{title}</h2>
      <ul className="clue-list">
        {entries.map((e) => (
          <li
            key={`${title}-${e.number}`}
            className={e.number === currentNumber ? "clue selected" : "clue"}
            onClick={() => onSelect(e.number)}
          >
            <span className="clue-number">{e.number}.</span> {e.clue}
          </li>
        ))}
      </ul>
    </div>
  );
}

// AdminUpload moved to ./components/AdminUpload.jsx

function CrosswordGrid({ puzzle }) {
  const rows = puzzle.grid.length;
  const cols = puzzle.grid[0].length;
  const numbering = React.useMemo(() => computeNumbering(puzzle), [puzzle]);
  const storageKey = React.useMemo(
    () => `cbc-progress-${puzzle.meta?.title || "puzzle"}`,
    [puzzle]
  );
  const [cells, setCells] = React.useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.cells?.length === puzzle.grid.length) return saved.cells;
      }
    } catch {}
    return puzzle.grid.map((row) => row.map((ch) => (ch === "." ? null : "")));
  });
  const inputsRef = React.useRef([]);
  const [incorrect, setIncorrect] = React.useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.incorrect?.length === puzzle.grid.length)
          return saved.incorrect;
      }
    } catch {}
    return puzzle.grid.map((row) => row.map((ch) => false));
  });

  // Timer persistence per puzzle
  const timerKey = React.useMemo(
    () => `${storageKey}-timerStart`,
    [storageKey]
  );
  const lastActivityKey = React.useMemo(
    () => `${storageKey}-lastActivity`,
    [storageKey]
  );
  const [startTs, setStartTs] = React.useState(() => {
    try {
      const raw = localStorage.getItem(timerKey);
      const lastActivityRaw = localStorage.getItem(lastActivityKey);

      if (raw && lastActivityRaw) {
        const parsed = parseInt(raw, 10);
        const lastActivity = parseInt(lastActivityRaw, 10);

        if (!Number.isNaN(parsed) && !Number.isNaN(lastActivity)) {
          const now = Date.now();
          const timeSinceLastActivity = now - lastActivity;

          // If more than 2 seconds since last activity, assume tab was closed
          // and adjust start time to account for the gap (shorter for mobile Safari)
          if (timeSinceLastActivity > 2 * 1000) {
            const adjustedStart = parsed + timeSinceLastActivity;
            localStorage.setItem(timerKey, String(adjustedStart));
            localStorage.setItem(lastActivityKey, String(now));
            return adjustedStart;
          }

          return parsed;
        }
      }

      const t = Date.now();
      localStorage.setItem(timerKey, String(t));
      localStorage.setItem(lastActivityKey, String(t));
      return t;
    } catch {
      return Date.now();
    }
  });
  const [nowTs, setNowTs] = React.useState(Date.now());
  const [timerRunning, setTimerRunning] = React.useState(true);
  React.useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setNowTs(Date.now());
      // Update last activity time while timer is running
      try {
        localStorage.setItem(lastActivityKey, String(Date.now()));
      } catch {}
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning, lastActivityKey]);
  const elapsedMs = nowTs - startTs;
  function formatElapsed(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  // Completion state
  const [completed, setCompleted] = React.useState(false);
  const [showCongrats, setShowCongrats] = React.useState(false);
  const [showInfo, setShowInfo] = React.useState(false);

  function isSolved() {
    for (let rr = 0; rr < rows; rr += 1) {
      for (let cc = 0; cc < cols; cc += 1) {
        if (puzzle.grid[rr][cc] === ".") continue;
        const sol =
          typeof puzzle.grid[rr][cc] === "string"
            ? puzzle.grid[rr][cc]
            : puzzle.grid[rr][cc]?.solution || "";
        const val = (cells[rr][cc] || "").toUpperCase();
        if (val !== sol.toUpperCase()) return false;
      }
    }
    return true;
  }

  React.useEffect(() => {
    if (!completed && isSolved()) {
      setCompleted(true);
      setTimerRunning(false);
      setShowCongrats(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells]);

  // Pause timer when page is hidden; exclude hidden time from elapsed
  const hiddenStartRef = React.useRef(null);
  React.useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        if (timerRunning && !completed) {
          setTimerRunning(false);
          hiddenStartRef.current = Date.now();
        }
      } else {
        if (hiddenStartRef.current != null) {
          const delta = Date.now() - hiddenStartRef.current;
          hiddenStartRef.current = null;
          setStartTs((prev) => {
            const next = prev + delta;
            try {
              localStorage.setItem(timerKey, String(next));
              localStorage.setItem(lastActivityKey, String(Date.now()));
            } catch {}
            return next;
          });
          setNowTs(Date.now());
          if (!completed) setTimerRunning(true);
        }
      }
    }

    function onPageHide() {
      // More reliable for mobile Safari - fires when page is being unloaded
      if (timerRunning && !completed) {
        setTimerRunning(false);
        hiddenStartRef.current = Date.now();
        // Immediately save the pause time to localStorage
        try {
          localStorage.setItem(lastActivityKey, String(Date.now()));
        } catch {}
      }
    }

    function onPageShow() {
      // Resume timer when page becomes visible again
      if (hiddenStartRef.current != null) {
        const delta = Date.now() - hiddenStartRef.current;
        hiddenStartRef.current = null;
        setStartTs((prev) => {
          const next = prev + delta;
          try {
            localStorage.setItem(timerKey, String(next));
            localStorage.setItem(lastActivityKey, String(Date.now()));
          } catch {}
          return next;
        });
        setNowTs(Date.now());
        if (!completed) setTimerRunning(true);
      }
    }

    function onBeforeUnload() {
      // Additional safety net for mobile Safari - save current state immediately
      if (timerRunning && !completed) {
        try {
          localStorage.setItem(lastActivityKey, String(Date.now()));
        } catch {}
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [timerKey, lastActivityKey, completed, timerRunning]);

  // Pause timer when info modal is open; exclude modal time from elapsed
  const infoModalStartRef = React.useRef(null);
  React.useEffect(() => {
    if (showInfo) {
      if (timerRunning && !completed) {
        setTimerRunning(false);
        infoModalStartRef.current = Date.now();
      }
    } else {
      if (infoModalStartRef.current != null) {
        const delta = Date.now() - infoModalStartRef.current;
        infoModalStartRef.current = null;
        setStartTs((prev) => {
          const next = prev + delta;
          try {
            localStorage.setItem(timerKey, String(next));
            localStorage.setItem(lastActivityKey, String(Date.now()));
          } catch {}
          return next;
        });
        setNowTs(Date.now());
        if (!completed) setTimerRunning(true);
      }
    }
  }, [showInfo, timerKey, lastActivityKey, completed, timerRunning]);

  // Dot menu state
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [menuView, setMenuView] = React.useState("root"); // root | check | reveal
  const menuRef = React.useRef(null);
  function toggleMenu() {
    setMenuOpen((v) => !v);
    setMenuView("root");
  }
  React.useEffect(() => {
    if (!menuOpen) return;
    function onDocDown(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("touchstart", onDocDown);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("touchstart", onDocDown);
    };
  }, [menuOpen]);

  const initialAcross = numbering.across[0];
  const [dir, setDir] = React.useState("across");
  const [clueNumber, setClueNumber] = React.useState(
    initialAcross ? initialAcross.number : numbering.down[0]?.number || null
  );
  const initialPos = initialAcross?.positions[0] ||
    numbering.down[0]?.positions[0] || { r: 0, c: 0 };
  const [pos, setPos] = React.useState(initialPos);

  const [isSmallScreen, setIsSmallScreen] = React.useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia && window.matchMedia("(max-width: 800px)").matches
      : false
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 800px)");
    const onChange = () => setIsSmallScreen(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener && mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener && mq.removeListener(onChange);
    };
  }, []);

  React.useEffect(() => {
    if (isSmallScreen) return; // avoid focusing inputs on mobile
    const el = inputsRef.current[pos.r]?.[pos.c];
    if (el) el.focus();
  }, [pos, isSmallScreen]);

  React.useEffect(() => {
    try {
      const data = JSON.stringify({ cells, incorrect });
      localStorage.setItem(storageKey, data);
    } catch {}
  }, [cells, incorrect, storageKey]);

  function focusCell(next) {
    setPos(next);
  }

  const setSelectionByNumber = React.useCallback(
    (nextDir, number) => {
      setDir(nextDir);
      setClueNumber(number);
      const list = nextDir === "across" ? numbering.across : numbering.down;
      const entry = list.find((e) => e.number === number);
      if (entry) {
        focusCell(entry.positions[0]);
      }
    },
    [numbering]
  );

  const handleChange = React.useCallback((r, c, value) => {
    setCells((prev) => {
      const next = prev.map((row) => row.slice());
      next[r][c] = value.slice(-1).toUpperCase();
      return next;
    });
    setIncorrect((prev) => {
      const next = prev.map((row) => row.slice());
      next[r][c] = false;
      return next;
    });
  }, []);

  const move = React.useCallback(
    (pos, direction, delta) => {
      let { r, c } = pos;
      function isBlockAt(rr, cc) {
        const cell = puzzle.grid[rr]?.[cc];
        return typeof cell === "string" ? cell === "." : false;
      }
      for (let step = 0; step < rows * cols; step += 1) {
        if (direction === "across") {
          c += delta;
        } else {
          r += delta;
        }
        if (r < 0 || c < 0 || r >= rows || c >= cols) break;
        if (!isBlockAt(r, c)) return { r, c };
      }
      return pos;
    },
    [rows, cols, puzzle]
  );

  function handleKeyDown(e, r, c) {
    const key = e.key;
    if (key.startsWith("Arrow")) {
      e.preventDefault();
      if (key === "ArrowLeft") {
        setDir("across");
        const next = move({ r, c }, "across", -1);
        setPos(next);
        const num = numbering.acrossNumAt[next.r][next.c];
        if (num) setClueNumber(num);
      } else if (key === "ArrowRight") {
        setDir("across");
        const next = move({ r, c }, "across", 1);
        setPos(next);
        const num = numbering.acrossNumAt[next.r][next.c];
        if (num) setClueNumber(num);
      } else if (key === "ArrowUp") {
        setDir("down");
        const next = move({ r, c }, "down", -1);
        setPos(next);
        const num = numbering.downNumAt[next.r][next.c];
        if (num) setClueNumber(num);
      } else if (key === "ArrowDown") {
        setDir("down");
        const next = move({ r, c }, "down", 1);
        setPos(next);
        const num = numbering.downNumAt[next.r][next.c];
        if (num) setClueNumber(num);
      }
      return;
    }
    if (key === "Tab") {
      e.preventDefault();
      const newDir = dir === "across" ? "down" : "across";
      const num =
        newDir === "across"
          ? numbering.acrossNumAt[r][c]
          : numbering.downNumAt[r][c];
      if (num) setSelectionByNumber(newDir, num);
      else setDir(newDir);
      return;
    }
    if (key === "Enter") {
      e.preventDefault();
      const currentList = dir === "across" ? numbering.across : numbering.down;
      const currentIndex = currentList.findIndex(
        (e) => e.number === clueNumber
      );

      if (currentIndex !== -1 && currentIndex < currentList.length - 1) {
        // Move to next clue in current direction
        const nextClue = currentList[currentIndex + 1];
        setSelectionByNumber(dir, nextClue.number);
      } else {
        // No more clues in current direction, switch to other direction
        const otherDir = dir === "across" ? "down" : "across";
        const otherList =
          otherDir === "across" ? numbering.across : numbering.down;
        if (otherList.length > 0) {
          const firstClue = otherList[0];
          setSelectionByNumber(otherDir, firstClue.number);
        }
      }
      return;
    }
    if (key === "Backspace") {
      e.preventDefault();
      setCells((prev) => {
        const next = prev.map((row) => row.slice());
        if (next[r][c]) {
          next[r][c] = "";
          return next;
        }
        const prevPos = move({ r, c }, dir, -1);
        next[prevPos.r][prevPos.c] = "";
        setPos(prevPos);
        const num =
          dir === "across"
            ? numbering.acrossNumAt[prevPos.r][prevPos.c]
            : numbering.downNumAt[prevPos.r][prevPos.c];
        if (num) setClueNumber(num);
        return next;
      });
      return;
    }
    if (key.length === 1 && /[A-Za-z]/.test(key)) {
      e.preventDefault();
      const letter = key.toUpperCase();
      handleChange(r, c, letter);
      const next = move({ r, c }, dir, 1);
      setPos(next);
      const num =
        dir === "across"
          ? numbering.acrossNumAt[next.r][next.c]
          : numbering.downNumAt[next.r][next.c];
      if (num) setClueNumber(num);
      return;
    }
  }

  // Mobile keyboard helpers (used on small screens)
  const typeLetter = React.useCallback(
    (letter) => {
      const r = pos.r;
      const c = pos.c;
      const ch = letter.slice(-1).toUpperCase();
      handleChange(r, c, ch);
      const next = move({ r, c }, dir, 1);
      setPos(next);
      const num =
        dir === "across"
          ? numbering.acrossNumAt[next.r][next.c]
          : numbering.downNumAt[next.r][next.c];
      if (num) setClueNumber(num);
    },
    [pos, dir, numbering, move, handleChange]
  );

  const pressBackspace = React.useCallback(() => {
    const r = pos.r;
    const c = pos.c;
    setCells((prev) => {
      const next = prev.map((row) => row.slice());
      if (next[r][c]) {
        next[r][c] = "";
        return next;
      }
      const prevPos = move({ r, c }, dir, -1);
      next[prevPos.r][prevPos.c] = "";
      setPos(prevPos);
      const num =
        dir === "across"
          ? numbering.acrossNumAt[prevPos.r][prevPos.c]
          : numbering.downNumAt[prevPos.r][prevPos.c];
      if (num) setClueNumber(num);
      return next;
    });
  }, [pos, dir, numbering, move]);

  const pressArrow = React.useCallback(
    (key) => {
      const r = pos.r;
      const c = pos.c;
      if (key === "ArrowLeft") {
        setDir("across");
        const next = move({ r, c }, "across", -1);
        setPos(next);
        const num = numbering.acrossNumAt[next.r][next.c];
        if (num) setClueNumber(num);
      } else if (key === "ArrowRight") {
        setDir("across");
        const next = move({ r, c }, "across", 1);
        setPos(next);
        const num = numbering.acrossNumAt[next.r][next.c];
        if (num) setClueNumber(num);
      } else if (key === "ArrowUp") {
        setDir("down");
        const next = move({ r, c }, "down", -1);
        setPos(next);
        const num = numbering.downNumAt[next.r][next.c];
        if (num) setClueNumber(num);
      } else if (key === "ArrowDown") {
        setDir("down");
        const next = move({ r, c }, "down", 1);
        setPos(next);
        const num = numbering.downNumAt[next.r][next.c];
        if (num) setClueNumber(num);
      }
    },
    [pos, numbering, move]
  );

  const toggleDir = React.useCallback(() => {
    const newDir = dir === "across" ? "down" : "across";
    const r = pos.r;
    const c = pos.c;
    const num =
      newDir === "across"
        ? numbering.acrossNumAt[r][c]
        : numbering.downNumAt[r][c];
    if (num) setSelectionByNumber(newDir, num);
    else setDir(newDir);
  }, [dir, pos, numbering, setSelectionByNumber]);

  const pressEnter = React.useCallback(() => {
    const currentList = dir === "across" ? numbering.across : numbering.down;
    const currentIndex = currentList.findIndex((e) => e.number === clueNumber);

    if (currentIndex !== -1 && currentIndex < currentList.length - 1) {
      // Move to next clue in current direction
      const nextClue = currentList[currentIndex + 1];
      setSelectionByNumber(dir, nextClue.number);
    } else {
      // No more clues in current direction, switch to other direction
      const otherDir = dir === "across" ? "down" : "across";
      const otherList =
        otherDir === "across" ? numbering.across : numbering.down;
      if (otherList.length > 0) {
        const firstClue = otherList[0];
        setSelectionByNumber(otherDir, firstClue.number);
      }
    }
  }, [dir, clueNumber, numbering, setSelectionByNumber]);

  React.useEffect(() => {
    if (!isSmallScreen) return; // only for mobile to support hardware keyboards
    function onDocKey(e) {
      if (
        e.key.startsWith("Arrow") ||
        e.key === "Backspace" ||
        e.key === "Enter" ||
        (e.key.length === 1 && /[A-Za-z]/.test(e.key))
      ) {
        e.preventDefault();
        if (e.key === "Backspace") return pressBackspace();
        if (e.key.startsWith("Arrow")) return pressArrow(e.key);
        if (e.key === "Enter") return pressEnter();
        typeLetter(e.key);
      }
    }
    document.addEventListener("keydown", onDocKey);
    return () => document.removeEventListener("keydown", onDocKey);
  }, [
    isSmallScreen,
    pos,
    dir,
    numbering,
    pressBackspace,
    pressArrow,
    pressEnter,
    typeLetter,
  ]);

  function handleCellClick(r, c) {
    const numAcross = numbering.acrossNumAt[r][c];
    const numDown = numbering.downNumAt[r][c];

    // Always set the position first
    setPos({ r, c });

    if (pos.r === r && pos.c === c) {
      // If clicking the same cell, toggle direction if possible
      if (dir === "across") {
        if (numDown) {
          setDir("down");
          setClueNumber(numDown);
        } else if (numAcross) {
          setDir("across");
          setClueNumber(numAcross);
        }
        // If no clue numbers, keep current direction
      } else {
        if (numAcross) {
          setDir("across");
          setClueNumber(numAcross);
        } else if (numDown) {
          setDir("down");
          setClueNumber(numDown);
        }
        // If no clue numbers, keep current direction
      }
    } else {
      // When clicking a different cell, try to maintain direction preference
      const preferNum = dir === "across" ? numAcross : numDown;
      if (preferNum) {
        setDir(dir);
        setClueNumber(preferNum);
      } else if (numAcross) {
        setDir("across");
        setClueNumber(numAcross);
      } else if (numDown) {
        setDir("down");
        setClueNumber(numDown);
      }
      // If no clue numbers, just set position (direction and clue number remain unchanged)
    }
  }

  function handleCellDoubleClick(r, c) {
    const numAcross = numbering.acrossNumAt[r][c];
    const numDown = numbering.downNumAt[r][c];
    const newDir = dir === "across" ? "down" : "across";
    const num = newDir === "across" ? numAcross : numDown;
    if (num) {
      setPos({ r, c });
      setDir(newDir);
      setClueNumber(num);
    }
  }

  const activePositions = React.useMemo(() => {
    const list = dir === "across" ? numbering.across : numbering.down;
    const entry = list.find((e) => e.number === clueNumber);
    return entry ? entry.positions : [];
  }, [dir, clueNumber, numbering]);

  const currentEntry = React.useMemo(() => {
    const list = dir === "across" ? numbering.across : numbering.down;
    return list.find((e) => e.number === clueNumber) || null;
  }, [dir, clueNumber, numbering]);

  function checkCells(positions) {
    const nextIncorrect = incorrect.map((row) => row.slice());
    positions.forEach(({ r, c }) => {
      const sol =
        typeof puzzle.grid[r][c] === "string"
          ? puzzle.grid[r][c]
          : puzzle.grid[r][c]?.solution || "";
      const val = cells[r][c] || "";
      nextIncorrect[r][c] = val !== "" && val !== sol.toUpperCase();
    });
    setIncorrect(nextIncorrect);
  }

  function revealCells(positions) {
    setCells((prev) => {
      const next = prev.map((row) => row.slice());
      positions.forEach(({ r, c }) => {
        const sol =
          typeof puzzle.grid[r][c] === "string"
            ? puzzle.grid[r][c]
            : puzzle.grid[r][c]?.solution || "";
        next[r][c] = sol.toUpperCase();
      });
      return next;
    });
    setIncorrect((prev) => {
      const next = prev.map((row) => row.slice());
      positions.forEach(({ r, c }) => (next[r][c] = false));
      return next;
    });
  }

  function checkSquare() {
    checkCells([{ r: pos.r, c: pos.c }]);
  }

  function checkWord() {
    checkCells(activePositions);
  }

  function checkPuzzle() {
    const all = [];
    for (let rr = 0; rr < rows; rr += 1) {
      for (let cc = 0; cc < cols; cc += 1) {
        if (puzzle.grid[rr][cc] !== ".") all.push({ r: rr, c: cc });
      }
    }
    checkCells(all);
  }

  function revealSquare() {
    revealCells([{ r: pos.r, c: pos.c }]);
  }

  function revealWord() {
    revealCells(activePositions);
  }

  function revealPuzzle() {
    const all = [];
    for (let rr = 0; rr < rows; rr += 1) {
      for (let cc = 0; cc < cols; cc += 1) {
        if (puzzle.grid[rr][cc] !== ".") all.push({ r: rr, c: cc });
      }
    }
    revealCells(all);
    // After reveal-all, consider puzzle complete
    setTimeout(() => {
      setCompleted(true);
      setTimerRunning(false);
      setShowCongrats(true);
    }, 0);
  }

  function clearPuzzle() {
    setCells(
      puzzle.grid.map((row) => row.map((ch) => (ch === "." ? null : "")))
    );
    setIncorrect(puzzle.grid.map((row) => row.map(() => false)));
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    const t = Date.now();
    try {
      localStorage.setItem(timerKey, String(t));
      localStorage.setItem(lastActivityKey, String(t));
    } catch {}
    setStartTs(t);
    setTimerRunning(true);
    setCompleted(false);
    setShowCongrats(false);
  }

  return (
    <div className="layout">
      <div className="crossword">
        <div className="topbar">
          <button
            className="home-btn"
            aria-label="Home"
            onClick={() => (window.location.href = "/directory")}
          />
          <div className="puzzle-title" title="Crossword">
            <img src="/logos/crossword_logo.png" alt="Crossword Logo" />
          </div>
          <div className="topbar-right">
            <div className="timer" aria-label="elapsed time">
              {formatElapsed(elapsedMs)}
            </div>
            <div className="dotmenu" ref={menuRef}>
              <button
                className="dot-btn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Menu"
                onClick={toggleMenu}
              />
              {menuOpen && (
                <div className="dotmenu-dropdown" role="menu">
                  {menuView === "root" && (
                    <div className="dotmenu-view">
                      <button
                        className="dotmenu-item"
                        onClick={() => setMenuView("check")}
                      >
                        <span>Check</span>
                        <span className="dotmenu-caret">›</span>
                      </button>
                      <button
                        className="dotmenu-item"
                        onClick={() => setMenuView("reveal")}
                      >
                        <span>Reveal</span>
                        <span className="dotmenu-caret">›</span>
                      </button>
                      <button
                        className="dotmenu-item dotmenu-danger"
                        onClick={() => {
                          clearPuzzle();
                          setMenuOpen(false);
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  )}
                  {menuView === "check" && (
                    <div className="dotmenu-view">
                      <button
                        className="dotmenu-back"
                        onClick={() => setMenuView("root")}
                      >
                        ◀ Back
                      </button>
                      <button
                        className="dotmenu-item"
                        onClick={() => {
                          checkSquare();
                          setMenuOpen(false);
                        }}
                      >
                        Square
                      </button>
                      <button
                        className="dotmenu-item"
                        onClick={() => {
                          checkWord();
                          setMenuOpen(false);
                        }}
                      >
                        Word
                      </button>
                      <button
                        className="dotmenu-item"
                        onClick={() => {
                          checkPuzzle();
                          setMenuOpen(false);
                        }}
                      >
                        Puzzle
                      </button>
                    </div>
                  )}
                  {menuView === "reveal" && (
                    <div className="dotmenu-view">
                      <button
                        className="dotmenu-back"
                        onClick={() => setMenuView("root")}
                      >
                        ◀ Back
                      </button>
                      <button
                        className="dotmenu-item"
                        onClick={() => {
                          revealSquare();
                          setMenuOpen(false);
                        }}
                      >
                        Letter
                      </button>
                      <button
                        className="dotmenu-item"
                        onClick={() => {
                          revealWord();
                          setMenuOpen(false);
                        }}
                      >
                        Word
                      </button>
                      <button
                        className="dotmenu-item"
                        onClick={() => {
                          revealPuzzle();
                          setMenuOpen(false);
                        }}
                      >
                        Puzzle
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              className="info-btn"
              aria-label="Info"
              title="Information"
              onClick={() => setShowInfo(true)}
            >
              i
            </button>
          </div>
        </div>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {puzzle.grid.map((row, r) =>
            row.map((ch, c) => {
              const isBlock = ch === ".";
              const number = numbering.numbersGrid[r][c];
              const isActive = activePositions.some(
                (p) => p.r === r && p.c === c
              );
              const isIncorrect = incorrect[r][c];
              const isCurrent = !isBlock && pos.r === r && pos.c === c;

              let cellClass = "cell";
              if (isBlock) cellClass += " block";
              else {
                if (isActive) cellClass += " active";
                if (isIncorrect) cellClass += " incorrect";
                if (isCurrent) cellClass += " current";
              }

              return (
                <div
                  key={`${r}-${c}`}
                  className={cellClass}
                  onClick={() => !isBlock && handleCellClick(r, c)}
                  onDoubleClick={() => !isBlock && handleCellDoubleClick(r, c)}
                >
                  {number && <div className="cell-number">{number}</div>}
                  {!isBlock && (
                    <input
                      aria-label={`r${r + 1}c${c + 1}`}
                      id={`cell-${r}-${c}`}
                      ref={(el) => {
                        if (!inputsRef.current[r]) inputsRef.current[r] = [];
                        inputsRef.current[r][c] = el;
                      }}
                      className="cell-input"
                      type="text"
                      inputMode={isSmallScreen ? "none" : "latin"}
                      maxLength={1}
                      value={cells[r][c] || ""}
                      onChange={(e) => handleChange(r, c, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, r, c)}
                      readOnly={isSmallScreen}
                      tabIndex={isSmallScreen ? -1 : 0}
                      style={
                        isSmallScreen ? { pointerEvents: "none" } : undefined
                      }
                      onDoubleClick={() => handleCellDoubleClick(r, c)}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
        {clueNumber && (
          <div className="mobile-clue-banner">{currentEntry?.clue || ""}</div>
        )}
        {showCongrats && (
          <div
            className="modal-backdrop"
            onClick={() => setShowCongrats(false)}
          >
            <div className="modal" role="dialog" aria-modal="true">
              <button
                className="close-btn modal-close"
                aria-label="Close"
                onClick={() => setShowCongrats(false)}
              />
              <h3 style={{ marginTop: 0 }}>Good work!</h3>
              <p>You've completed the puzzle in {formatElapsed(elapsedMs)}.</p>
            </div>
          </div>
        )}
        {showInfo && (
          <div className="modal-backdrop" onClick={() => setShowInfo(false)}>
            <div className="modal" role="dialog" aria-modal="true">
              <button
                className="close-btn modal-close"
                aria-label="Close"
                onClick={() => setShowInfo(false)}
              />
              <h3 style={{ marginTop: 0 }}>Crosswords by Charlie</h3>
              <p>
                <strong>Puzzle Title:</strong>{" "}
                {puzzle.meta?.title || "Crossword"}
              </p>
              <p>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer
                nec odio. Praesent libero. Sed cursus ante dapibus diam. Sed
                nisi. Nulla quis sem at nibh elementum imperdiet. Duis sagittis
                ipsum. Praesent mauris. Fusce nec tellus sed augue semper porta.
                Mauris massa. Vestibulum lacinia arcu eget nulla. Class aptent
                taciti sociosqu ad litora torquent per conubia nostra, per
                inceptos himenaeos.
              </p>
            </div>
          </div>
        )}
        {isSmallScreen && (
          <MobileKeyboard
            dir={dir}
            onChar={(ch) => typeLetter(ch)}
            onBackspace={() => pressBackspace()}
            onToggleDir={() => toggleDir()}
          />
        )}
      </div>
      <div className="clues">
        <ClueList
          title="ACROSS"
          entries={numbering.across}
          currentNumber={dir === "across" ? clueNumber : null}
          onSelect={(n) => setSelectionByNumber("across", n)}
        />
        <ClueList
          title="DOWN"
          entries={numbering.down}
          currentNumber={dir === "down" ? clueNumber : null}
          onSelect={(n) => setSelectionByNumber("down", n)}
        />
      </div>
    </div>
  );
}

function MainPage() {
  const { puzzleName } = useParams();
  const fallbackUrl = puzzleName
    ? `/puzzles/${decodeURIComponent(puzzleName)}`
    : "/C by C 1.puz";
  const { puzzle, error, loading } = useLatestPuzzle(fallbackUrl);
  const [showLoadingAnimation, setShowLoadingAnimation] = React.useState(false);
  const [showContent, setShowContent] = React.useState(false);
  const [dataLoaded, setDataLoaded] = React.useState(false);
  const loadStartTime = React.useRef(null);

  React.useEffect(() => {
    if (loading) {
      loadStartTime.current = Date.now();
      setShowLoadingAnimation(true);
      setShowContent(false);
    } else {
      setShowLoadingAnimation(false);

      // Check if loading was fast (less than 500ms) and mark data as loaded
      if (loadStartTime.current) {
        const loadTime = Date.now() - loadStartTime.current;
        if (loadTime < 500) {
          setDataLoaded(true);
        }
      }

      // Add a small delay before showing content for smooth transition
      setTimeout(() => {
        setShowContent(true);
      }, 100);
    }
  }, [loading]);

  const handleLoadingComplete = () => {
    setShowLoadingAnimation(false);
    // Add a small delay before showing content for smooth transition
    setTimeout(() => {
      setShowContent(true);
    }, 100);
  };

  if (loading) {
    return (
      <>
        {showLoadingAnimation && (
          <LoadingAnimation
            onComplete={handleLoadingComplete}
            dataLoaded={dataLoaded}
          />
        )}
        <div className={`app-content ${showContent ? "fade-in" : "fade-out"}`}>
          <div className="status centered">Loading puzzle…</div>
        </div>
      </>
    );
  }
  if (error) return <div className="status error">{String(error)}</div>;
  if (!puzzle) return null;
  return (
    <div className={`app-content ${showContent ? "fade-in" : "fade-out"}`}>
      <div className="App">
        <div className="content-top">
          <CrosswordGrid puzzle={puzzle} />
        </div>
      </div>
    </div>
  );
}

function AdminPage() {
  return (
    <div className="App">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 className="title">Admin</h1>
        <Link to="/">Back to puzzle</Link>
      </div>
      <AdminUpload onUploaded={undefined} />
    </div>
  );
}

function Directory() {
  const [puzzles, setPuzzles] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [showLoadingAnimation, setShowLoadingAnimation] = React.useState(false);
  const [showContent, setShowContent] = React.useState(false);
  const [dataLoaded, setDataLoaded] = React.useState(false);
  const loadStartTime = React.useRef(null);

  React.useEffect(() => {
    async function loadPuzzles() {
      try {
        loadStartTime.current = Date.now();
        setLoading(true);
        const puzzleList = await fetchAllSupabasePuzzles();
        setPuzzles(puzzleList);

        // Check if loading was fast (less than 500ms) and mark data as loaded
        const loadTime = Date.now() - loadStartTime.current;
        if (loadTime < 500) {
          setDataLoaded(true);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    loadPuzzles();
  }, []);

  React.useEffect(() => {
    if (loading) {
      setShowLoadingAnimation(true);
      setShowContent(false);
    } else {
      setShowLoadingAnimation(false);
      // Add a small delay before showing content for smooth transition
      setTimeout(() => {
        setShowContent(true);
      }, 100);
    }
  }, [loading]);

  const handleLoadingComplete = () => {
    setShowLoadingAnimation(false);
    // Add a small delay before showing content for smooth transition
    setTimeout(() => {
      setShowContent(true);
    }, 100);
  };

  if (loading) {
    return (
      <>
        {showLoadingAnimation && (
          <LoadingAnimation
            onComplete={handleLoadingComplete}
            dataLoaded={dataLoaded}
          />
        )}
        <div className={`app-content ${showContent ? "fade-in" : "fade-out"}`}>
          <div className="App">
            <div className="status centered">Loading puzzles...</div>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="App">
        <div className="status centered error">
          Error loading puzzles: {error}
        </div>
      </div>
    );
  }

  return (
    <div className={`app-content ${showContent ? "fade-in" : "fade-out"}`}>
      <div className="App">
        <h1 className="title">Crosswords by Charlie</h1>
        <div className="directory">
          <h2 className="subtitle">All puzzles:</h2>
          {puzzles.length === 0 ? (
            <p>No puzzles found.</p>
          ) : (
            <ul className="puzzle-list">
              {puzzles.map((puzzle, index) => (
                <li key={puzzle.name} className="puzzle-item">
                  <Link
                    to={
                      index === 0
                        ? "/"
                        : `/puzzle/${encodeURIComponent(puzzle.name)}`
                    }
                    className="puzzle-link"
                  >
                    {puzzle.name.replace(".puz", "")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [showContent, setShowContent] = React.useState(false);

  const handleLoadingComplete = () => {
    setIsLoading(false);
    // Add a small delay before showing content for smooth transition
    setTimeout(() => {
      setShowContent(true);
    }, 100);
  };

  return (
    <BrowserRouter>
      {isLoading && <LoadingAnimation onComplete={handleLoadingComplete} />}
      <div className={`app-content ${showContent ? "fade-in" : "fade-out"}`}>
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/directory" element={<Directory />} />
          <Route path="/puzzle/:puzzleName" element={<MainPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
        <Analytics />
      </div>
    </BrowserRouter>
  );
}

export default App;

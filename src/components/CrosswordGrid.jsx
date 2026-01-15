import React from "react";
import { supabase, isSupabaseConfigured } from "../supabase";
import MobileKeyboard from "../components/MobileKeyboard";

// Helper function to decode HTML entities in clue text
function decodeHtmlEntities(text) {
  if (!text) return text;
  // Use the browser's built-in decoder via a temporary element
  // This handles all HTML entities like &amp;, &lt;, &gt;, etc.
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

export default function CrosswordGrid({ puzzle }) {
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

  // Track whether any check or reveal action has been used for this puzzle
  const [usedCheckOrReveal, setUsedCheckOrReveal] = React.useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        return Boolean(saved?.usedCheckOrReveal);
      }
    } catch {}
    return false;
  });

  const [submitLoading, setSubmitLoading] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");
  const [submitSuccess, setSubmitSuccess] = React.useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        return Boolean(saved?.submittedToLeaderboard);
      }
    } catch {}
    return false;
  });

  // Confirmation modal state
  const [showConfirmation, setShowConfirmation] = React.useState(false);
  const [confirmationAction, setConfirmationAction] = React.useState(null);
  const [confirmationActionType, setConfirmationActionType] =
    React.useState("check"); // "check" or "reveal"

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
  const [showLeaderboard, setShowLeaderboard] = React.useState(false);
  const [showSoClose, setShowSoClose] = React.useState(false);
  const soCloseShownRef = React.useRef(false);

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

  function isFullyFilled() {
    for (let rr = 0; rr < rows; rr += 1) {
      for (let cc = 0; cc < cols; cc += 1) {
        if (puzzle.grid[rr][cc] === ".") continue;
        const val = cells[rr][cc] || "";
        if (val.trim() === "") return false;
      }
    }
    return true;
  }

  React.useEffect(() => {
    if (!completed && isSolved()) {
      setCompleted(true);
      setTimerRunning(false);
      setShowCongrats(true);
      soCloseShownRef.current = false; // Reset for next puzzle
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells]);

  // Check if puzzle is fully filled but incorrect
  React.useEffect(() => {
    if (!completed && !showCongrats && isFullyFilled() && !isSolved()) {
      if (!soCloseShownRef.current) {
        setShowSoClose(true);
        soCloseShownRef.current = true;
      }
    }
    // Reset the ref when cells become incomplete again
    if (!isFullyFilled()) {
      soCloseShownRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, completed, showCongrats]);

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
      const data = JSON.stringify({
        cells,
        incorrect,
        usedCheckOrReveal,
        submittedToLeaderboard: submitSuccess,
      });
      localStorage.setItem(storageKey, data);
    } catch {}
  }, [cells, incorrect, usedCheckOrReveal, submitSuccess, storageKey]);

  function focusCell(next) {
    setPos(next);
  }

  // Helper function to check if a clue is completely filled
  const isClueComplete = React.useCallback(
    (positions) => {
      return positions.every(({ r, c }) => {
        const cell = cells[r]?.[c];
        return cell && cell.trim() !== "";
      });
    },
    [cells]
  );

  // Helper function to find the first empty cell in a clue
  const findFirstEmptyCell = React.useCallback(
    (positions) => {
      for (const { r, c } of positions) {
        const cell = cells[r]?.[c];
        if (!cell || cell.trim() === "") {
          return { r, c };
        }
      }
      return null; // All cells are filled
    },
    [cells]
  );

  // Smart navigation function that finds the next clue with empty cells
  const findNextIncompleteClue = React.useCallback(
    (currentList, currentIndex, direction = 1) => {
      const startIndex = currentIndex + direction;
      const endIndex = direction > 0 ? currentList.length : -1;

      for (let i = startIndex; i !== endIndex; i += direction) {
        const clue = currentList[i];
        if (clue && !isClueComplete(clue.positions)) {
          return clue;
        }
      }
      return null; // No incomplete clues found in this direction
    },
    [isClueComplete]
  );

  const setSelectionByNumber = React.useCallback(
    (nextDir, number) => {
      setDir(nextDir);
      setClueNumber(number);
      const list = nextDir === "across" ? numbering.across : numbering.down;
      const entry = list.find((e) => e.number === number);
      if (entry) {
        // Find the first empty cell in this clue
        const firstEmpty = findFirstEmptyCell(entry.positions);
        if (firstEmpty) {
          focusCell(firstEmpty);
        } else {
          // If clue is complete, go to first position anyway
          focusCell(entry.positions[0]);
        }
      }
    },
    [numbering, findFirstEmptyCell]
  );

  // Helper function to shift to next incomplete clue
  const shiftToNextIncompleteClue = React.useCallback(
    (checkDir, checkClueNumber) => {
      const currentList =
        checkDir === "across" ? numbering.across : numbering.down;
      const currentIndex = currentList.findIndex(
        (e) => e.number === checkClueNumber
      );

      // Try to find next incomplete clue in current direction
      const nextIncompleteClue = findNextIncompleteClue(
        currentList,
        currentIndex,
        1
      );
      if (nextIncompleteClue) {
        setSelectionByNumber(checkDir, nextIncompleteClue.number);
        return true;
      } else {
        // No more incomplete clues in current direction, switch to other direction
        const otherDir = checkDir === "across" ? "down" : "across";
        const otherList =
          otherDir === "across" ? numbering.across : numbering.down;
        if (otherList.length > 0) {
          // Find first incomplete clue in other direction
          const firstIncompleteClue = findNextIncompleteClue(otherList, -1, 1);
          if (firstIncompleteClue) {
            setSelectionByNumber(otherDir, firstIncompleteClue.number);
            return true;
          }
        }
      }
      return false;
    },
    [numbering, setSelectionByNumber, findNextIncompleteClue]
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
      function hasLetterAt(rr, cc) {
        return cells[rr]?.[cc] && cells[rr][cc].trim() !== "";
      }
      for (let step = 0; step < rows * cols; step += 1) {
        if (direction === "across") {
          c += delta;
        } else {
          r += delta;
        }
        if (r < 0 || c < 0 || r >= rows || c >= cols) break;
        if (!isBlockAt(r, c) && !hasLetterAt(r, c)) return { r, c };
      }
      return pos;
    },
    [rows, cols, puzzle, cells]
  );

  // Move function for backspace - doesn't skip over filled cells
  const moveForBackspace = React.useCallback(
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
        if (!isBlockAt(r, c)) return { r, c }; // Only skip blocks, not filled cells
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
      const shifted = shiftToNextIncompleteClue(dir, clueNumber);
      // If no shift happened (all clues complete), stay where we are
      if (!shifted) {
        const currentList =
          dir === "across" ? numbering.across : numbering.down;
        const currentIndex = currentList.findIndex(
          (e) => e.number === clueNumber
        );
        const currentEntry = currentList[currentIndex];
        if (currentEntry) {
          setSelectionByNumber(dir, currentEntry.number);
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
        const prevPos = moveForBackspace({ r, c }, dir, -1);
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

      // Check if the current clue is now complete after typing this letter
      const currentList = dir === "across" ? numbering.across : numbering.down;
      const currentEntry = currentList.find((e) => e.number === clueNumber);
      if (currentEntry) {
        // Check if clue is complete (all cells filled, including the one we just filled)
        const isComplete = currentEntry.positions.every(({ r: pr, c: pc }) => {
          // If this is the cell we just typed in, it's now filled
          if (pr === r && pc === c) return true;
          const cell = cells[pr]?.[pc];
          return cell && cell.trim() !== "";
        });

        if (isComplete) {
          // Clue is complete, shift to next incomplete clue
          shiftToNextIncompleteClue(dir, clueNumber);
          return;
        }
      }

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

      // Check if the current clue is now complete after typing this letter
      const currentList = dir === "across" ? numbering.across : numbering.down;
      const currentEntry = currentList.find((e) => e.number === clueNumber);
      if (currentEntry) {
        // Check if clue is complete (all cells filled, including the one we just filled)
        const isComplete = currentEntry.positions.every(({ r: pr, c: pc }) => {
          // If this is the cell we just typed in, it's now filled
          if (pr === r && pc === c) return true;
          const cell = cells[pr]?.[pc];
          return cell && cell.trim() !== "";
        });

        if (isComplete) {
          // Clue is complete, shift to next incomplete clue
          shiftToNextIncompleteClue(dir, clueNumber);
          return;
        }
      }

      const next = move({ r, c }, dir, 1);
      setPos(next);
      const num =
        dir === "across"
          ? numbering.acrossNumAt[next.r][next.c]
          : numbering.downNumAt[next.r][next.c];
      if (num) setClueNumber(num);
    },
    [
      pos,
      dir,
      clueNumber,
      numbering,
      cells,
      move,
      handleChange,
      shiftToNextIncompleteClue,
    ]
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
      const prevPos = moveForBackspace({ r, c }, dir, -1);
      next[prevPos.r][prevPos.c] = "";
      setPos(prevPos);
      const num =
        dir === "across"
          ? numbering.acrossNumAt[prevPos.r][prevPos.c]
          : numbering.downNumAt[prevPos.r][prevPos.c];
      if (num) setClueNumber(num);
      return next;
    });
  }, [pos, dir, numbering, moveForBackspace]);

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
    const shifted = shiftToNextIncompleteClue(dir, clueNumber);
    // If no shift happened (all clues complete), stay where we are
    if (!shifted) {
      const currentList = dir === "across" ? numbering.across : numbering.down;
      const currentIndex = currentList.findIndex(
        (e) => e.number === clueNumber
      );
      const currentEntry = currentList[currentIndex];
      if (currentEntry) {
        setSelectionByNumber(dir, currentEntry.number);
      }
    }
  }, [
    dir,
    clueNumber,
    numbering,
    setSelectionByNumber,
    shiftToNextIncompleteClue,
  ]);

  // Navigation functions for mobile clue banner arrows
  const goToPreviousClue = React.useCallback(() => {
    const currentList = dir === "across" ? numbering.across : numbering.down;
    const currentIndex = currentList.findIndex((e) => e.number === clueNumber);

    // Try to find previous incomplete clue in current direction
    const prevIncompleteClue = findNextIncompleteClue(
      currentList,
      currentIndex,
      -1
    );
    if (prevIncompleteClue) {
      setSelectionByNumber(dir, prevIncompleteClue.number);
    } else {
      // No more incomplete clues in current direction, switch to other direction
      const otherDir = dir === "across" ? "down" : "across";
      const otherList =
        otherDir === "across" ? numbering.across : numbering.down;
      if (otherList.length > 0) {
        // Find last incomplete clue in other direction
        const lastIncompleteClue = findNextIncompleteClue(
          otherList,
          otherList.length,
          -1
        );
        if (lastIncompleteClue) {
          setSelectionByNumber(otherDir, lastIncompleteClue.number);
        } else {
          // All clues are complete, stay where we are
          const currentEntry = currentList[currentIndex];
          if (currentEntry) {
            setSelectionByNumber(dir, currentEntry.number);
          }
        }
      }
    }
  }, [
    dir,
    clueNumber,
    numbering,
    setSelectionByNumber,
    findNextIncompleteClue,
  ]);

  const goToNextClue = React.useCallback(() => {
    const shifted = shiftToNextIncompleteClue(dir, clueNumber);
    // If no shift happened (all clues complete), stay where we are
    if (!shifted) {
      const currentList = dir === "across" ? numbering.across : numbering.down;
      const currentIndex = currentList.findIndex(
        (e) => e.number === clueNumber
      );
      const currentEntry = currentList[currentIndex];
      if (currentEntry) {
        setSelectionByNumber(dir, currentEntry.number);
      }
    }
  }, [
    dir,
    clueNumber,
    numbering,
    setSelectionByNumber,
    shiftToNextIncompleteClue,
  ]);

  React.useEffect(() => {
    if (!isSmallScreen) return; // only for mobile to support hardware keyboards
    function onDocKey(e) {
      // Ignore key handling when typing in any editable field or inside modals
      const target = e.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : "";
      const insideModal =
        (target &&
          typeof target.closest === "function" &&
          target.closest(".modal")) ||
        false;
      const isEditable =
        insideModal ||
        (target &&
          (target.isContentEditable || tag === "input" || tag === "textarea"));
      if (
        isEditable ||
        showCongrats ||
        showLeaderboard ||
        showInfo ||
        showSoClose
      )
        return;
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
    showCongrats,
    showLeaderboard,
    showInfo,
    showSoClose,
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
    setUsedCheckOrReveal(true);
  }

  function checkWord() {
    checkCells(activePositions);
    setUsedCheckOrReveal(true);
  }

  function checkPuzzle() {
    const all = [];
    for (let rr = 0; rr < rows; rr += 1) {
      for (let cc = 0; cc < cols; cc += 1) {
        if (puzzle.grid[rr][cc] !== ".") all.push({ r: rr, c: cc });
      }
    }
    checkCells(all);
    setUsedCheckOrReveal(true);
  }

  function revealSquare() {
    revealCells([{ r: pos.r, c: pos.c }]);
    setUsedCheckOrReveal(true);
  }

  function revealWord() {
    revealCells(activePositions);
    setUsedCheckOrReveal(true);
  }

  function revealPuzzle() {
    const all = [];
    for (let rr = 0; rr < rows; rr += 1) {
      for (let cc = 0; cc < cols; cc += 1) {
        if (puzzle.grid[rr][cc] !== ".") all.push({ r: rr, c: cc });
      }
    }
    revealCells(all);
    setUsedCheckOrReveal(true);
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
    setUsedCheckOrReveal(false);
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
    setShowSoClose(false);
    soCloseShownRef.current = false;
    setSubmitSuccess(false);
  }

  // Confirmation modal functions
  function showConfirmationModal(action, actionType = "check") {
    if (usedCheckOrReveal) {
      action();
      return;
    }
    setConfirmationAction(() => action);
    setConfirmationActionType(actionType);
    setShowConfirmation(true);
  }

  function handleConfirmationYes() {
    if (confirmationAction) {
      confirmationAction();
    }
    setShowConfirmation(false);
    setConfirmationAction(null);
    setConfirmationActionType("check");
  }

  function handleConfirmationNo() {
    setShowConfirmation(false);
    setConfirmationAction(null);
    setConfirmationActionType("check");
  }

  // Identify puzzle for leaderboard (best available key: title)
  const puzzleKey = React.useMemo(
    () => String(puzzle.meta?.title || "puzzle"),
    [puzzle]
  );

  const puzzleTitle = puzzle.meta?.title || "";

  // Player identity (per-device) and name persistence
  const getOrCreateClientId = React.useCallback(() => {
    try {
      const k = "cbc-client-id";
      let id = localStorage.getItem(k);
      if (!id) {
        // RFC4122-ish simple generator using crypto if available
        const g = (n) =>
          Array.from(crypto.getRandomValues(new Uint8Array(n)))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        id = `${g(4)}-${g(2)}-${g(2)}-${g(2)}-${g(6)}`;
        localStorage.setItem(k, id);
      }
      return id;
    } catch {
      // Fallback
      return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
    }
  }, []);

  const [playerName, setPlayerName] = React.useState(() => {
    try {
      return localStorage.getItem("cbc-player-name") || "";
    } catch {
      return "";
    }
  });

  async function submitLeaderboard() {
    if (submitSuccess) return;
    if (!isSupabaseConfigured() || !supabase) return;
    if (usedCheckOrReveal) return;
    const name = (playerName || "").trim().slice(0, 24);
    if (!name) return setSubmitError("Enter a name");
    setSubmitLoading(true);
    setSubmitError("");
    try {
      const clientId = getOrCreateClientId();
      try {
        localStorage.setItem("cbc-player-name", name);
      } catch {}
      const { error } = await supabase.from("leaderboard_entries").insert({
        puzzle_key: puzzleKey,
        puzzle_title: puzzleTitle,
        name,
        elapsed_ms: elapsedMs,
        client_id: clientId,
        used_reveal: usedCheckOrReveal,
      });
      if (error) throw error;
      setSubmitSuccess(true);
    } catch (e) {
      setSubmitError(String(e.message || e));
    } finally {
      setSubmitLoading(false);
    }
  }

  // Leaderboard fetching for current puzzle
  const [lbLoading, setLbLoading] = React.useState(false);
  const [lbError, setLbError] = React.useState("");
  const [leaderboard, setLeaderboard] = React.useState([]);

  React.useEffect(() => {
    async function fetchLB() {
      if (!showLeaderboard) return;
      if (!isSupabaseConfigured() || !supabase) return;
      setLbLoading(true);
      setLbError("");
      try {
        const { data, error } = await supabase
          .from("leaderboard_entries")
          .select("name, elapsed_ms, created_at")
          .eq("puzzle_key", puzzleKey)
          .eq("used_reveal", false)
          .order("elapsed_ms", { ascending: true })
          .limit(100);
        if (error) throw error;

        // Remove duplicates by name + elapsed_ms combination
        const uniqueEntries = [];
        const seen = new Set();
        for (const entry of data || []) {
          const key = `${entry.name}:${entry.elapsed_ms}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueEntries.push(entry);
          }
        }

        setLeaderboard(uniqueEntries.slice(0, 10));
      } catch (e) {
        setLbError(String(e.message || e));
      } finally {
        setLbLoading(false);
      }
    }
    fetchLB();
  }, [showLeaderboard, puzzleKey]);

  // Sync clue section heights with grid height on large screens
  const layoutRef = React.useRef(null);
  const crosswordRef = React.useRef(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const isLargeScreen = window.matchMedia("(min-width: 1200px)").matches;
    if (!isLargeScreen || !layoutRef.current || !crosswordRef.current) return;

    const updateHeight = () => {
      const crosswordHeight = crosswordRef.current.offsetHeight;
      layoutRef.current.style.setProperty(
        "--grid-height",
        `${crosswordHeight}px`
      );
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [puzzle, cells]); // Recalculate when puzzle or cells change (affects grid size)

  return (
    <div className="layout" ref={layoutRef}>
      <div className="crossword" ref={crosswordRef}>
        <div className="header">
          <div className="header-left">
            <button
              className="home-btn"
              aria-label="Home"
              onClick={() => (window.location.href = "/archive")}
            ></button>
            <button
              className="leaderboard-btn"
              aria-label="Leaderboard"
              onClick={() => setShowLeaderboard(true)}
            ></button>
          </div>
          <div className="header-right">
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
                          showConfirmationModal(() => {
                            checkSquare();
                            setMenuOpen(false);
                          }, "check");
                        }}
                      >
                        Square
                      </button>
                      <button
                        className="dotmenu-item"
                        onClick={() => {
                          showConfirmationModal(() => {
                            checkWord();
                            setMenuOpen(false);
                          }, "check");
                        }}
                      >
                        Word
                      </button>
                      <button
                        className="dotmenu-item"
                        onClick={() => {
                          showConfirmationModal(() => {
                            checkPuzzle();
                            setMenuOpen(false);
                          }, "check");
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
                          showConfirmationModal(() => {
                            revealSquare();
                            setMenuOpen(false);
                          }, "reveal");
                        }}
                      >
                        Letter
                      </button>
                      <button
                        className="dotmenu-item"
                        onClick={() => {
                          showConfirmationModal(() => {
                            revealWord();
                            setMenuOpen(false);
                          }, "reveal");
                        }}
                      >
                        Word
                      </button>
                      <button
                        className="dotmenu-item"
                        onClick={() => {
                          showConfirmationModal(() => {
                            revealPuzzle();
                            setMenuOpen(false);
                          }, "reveal");
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
          className={`grid ${rows > 10 || cols > 10 ? "large-grid" : ""} ${
            rows >= 15 || cols >= 15 ? "extra-large-grid" : ""
          }`}
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
          <div className="mobile-clue-banner">
            <button
              className="clue-nav-arrow clue-nav-arrow-left"
              onClick={goToPreviousClue}
              aria-label="Previous clue"
            >
              ‹
            </button>
            <span className="clue-text" onClick={toggleDir}>
              {decodeHtmlEntities(currentEntry?.clue || "")}
            </span>
            <button
              className="clue-nav-arrow clue-nav-arrow-right"
              onClick={goToNextClue}
              aria-label="Next clue"
            >
              ›
            </button>
          </div>
        )}
        {showCongrats && (
          <div
            className="modal-backdrop"
            onClick={() => setShowCongrats(false)}
          >
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="close-btn modal-close"
                aria-label="Close"
                onClick={() => setShowCongrats(false)}
              />
              <h3 className="modal-title">Good work!</h3>
              <p className="modal-text">
                You've completed the puzzle in {formatElapsed(elapsedMs)}.
              </p>
              {!usedCheckOrReveal ? (
                <div>
                  <div
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <input
                      className="admin-input"
                      placeholder="Your name"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      maxLength={24}
                      aria-label="Name"
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    <button
                      className="admin-button"
                      onClick={submitLeaderboard}
                      disabled={submitLoading || submitSuccess}
                    >
                      {submitLoading
                        ? "Submitting…"
                        : submitSuccess
                        ? "Submitted"
                        : "Submit to leaderboard"}
                    </button>
                  </div>
                  {submitError && (
                    <div className="status error" style={{ padding: 8 }}>
                      {submitError}
                    </div>
                  )}
                  {submitSuccess && (
                    <div style={{ marginTop: 8 }}>
                      <span
                        className="view-leaderboard"
                        onClick={() => setShowLeaderboard(true)}
                      >
                        View leaderboard
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <></>
              )}
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
              <h3 className="modal-title">Crosswords by Charlie</h3>
              <p className="modal-subtitle">{puzzle.meta?.title}</p>
              <p className="modal-text-long">
                CxC aims to infuse the stuffy world of crossword solving with
                topical clues from contemporary fashion, pop culture, and art.
                Check out the{" "}
                <a
                  href="https://crosswordsbycharlie.substack.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  weekly newsletter
                </a>{" "}
                to get each puzzle (and solving tips), explore the archive{" "}
                <a href="/archive">here</a>, and chat about the latest puzzles
                with me on{" "}
                <a
                  href="https://www.instagram.com/charqkol?igsh=N2g2MWU2eWljdTVu&utm_source=qr"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  IG
                </a>
                .
              </p>
            </div>
          </div>
        )}

        {showLeaderboard && (
          <div
            className="modal-backdrop"
            onClick={() => setShowLeaderboard(false)}
          >
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="close-btn modal-close"
                aria-label="Close"
                onClick={() => setShowLeaderboard(false)}
              />
              <h3 className="modal-title">Leaderboard</h3>
              {lbError && <div className="status error">{lbError}</div>}
              {lbLoading ? (
                <p className="modal-text">Loading…</p>
              ) : leaderboard.length === 0 ? (
                <p className="modal-text">No entries yet.</p>
              ) : (
                <ul className="leaderboard-list">
                  <li className="leaderboard-header-row">
                    <span className="leaderboard-header-left">Name</span>
                    <span className="leaderboard-header-right">Time</span>
                  </li>
                  {leaderboard.map((row, idx) => (
                    <li
                      key={`${row.name}-${row.created_at}-${idx}`}
                      className="leaderboard-item"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span className="leaderboard-number">{idx + 1}.</span>
                      <span className="leaderboard-name">{row.name}</span>
                      <span className="leaderboard-time">
                        {formatElapsed(row.elapsed_ms)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {showConfirmation && (
          <div className="modal-backdrop" onClick={handleConfirmationNo}>
            <div className="modal" role="dialog" aria-modal="true">
              <h3 className="modal-title">Are you sure?</h3>
              <p className="modal-text">
                While{" "}
                {confirmationActionType === "reveal" ? "revealing" : "checking"}{" "}
                may be tempting, it will prevent you from submitting to the
                leaderboard.
              </p>
              <div className="modal-buttons">
                <button
                  className="modal-btn modal-btn-primary"
                  onClick={handleConfirmationYes}
                >
                  Yes
                </button>
                <button
                  className="modal-btn modal-btn-secondary"
                  onClick={handleConfirmationNo}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        )}
        {showSoClose && (
          <div className="modal-backdrop" onClick={() => setShowSoClose(false)}>
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="close-btn modal-close"
                aria-label="Close"
                onClick={() => setShowSoClose(false)}
              />
              <h3 className="modal-title">Almost!</h3>
              <p className="modal-text">
                You've got at least one letter wrong in your puzzle.
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
  const clueRefs = React.useRef({});

  // Scroll selected clue into view when currentNumber changes
  React.useEffect(() => {
    if (currentNumber !== null && clueRefs.current[currentNumber]) {
      const clueElement = clueRefs.current[currentNumber];
      clueElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }
  }, [currentNumber]);

  return (
    <div className="clue-section">
      <h2 className="clue-title">{title}</h2>
      <ul className="clue-list">
        {entries.map((e) => (
          <li
            key={`${title}-${e.number}`}
            ref={(el) => {
              clueRefs.current[e.number] = el;
            }}
            className={e.number === currentNumber ? "clue selected" : "clue"}
            onClick={() => onSelect(e.number)}
          >
            <span className="clue-number">{e.number}.</span>{" "}
            {decodeHtmlEntities(e.clue)}
          </li>
        ))}
      </ul>
    </div>
  );
}

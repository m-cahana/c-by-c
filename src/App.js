import React from "react";
import { supabase, isSupabaseConfigured } from "./supabase";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import AdminUpload from "./components/AdminUpload";
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
        try {
          const latest = await fetchLatestSupabasePuz();
          if (latest) {
            decoded = decode(latest.arrayBuffer);
          }
        } catch (supaErr) {}
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

  const initialAcross = numbering.across[0];
  const [dir, setDir] = React.useState("across");
  const [clueNumber, setClueNumber] = React.useState(
    initialAcross ? initialAcross.number : numbering.down[0]?.number || null
  );
  const initialPos = initialAcross?.positions[0] ||
    numbering.down[0]?.positions[0] || { r: 0, c: 0 };
  const [pos, setPos] = React.useState(initialPos);

  React.useEffect(() => {
    const el = inputsRef.current[pos.r]?.[pos.c];
    if (el) el.focus();
  }, [pos]);

  React.useEffect(() => {
    try {
      const data = JSON.stringify({ cells, incorrect });
      localStorage.setItem(storageKey, data);
    } catch {}
  }, [cells, incorrect, storageKey]);

  function focusCell(next) {
    setPos(next);
  }

  function setSelectionByNumber(nextDir, number) {
    setDir(nextDir);
    setClueNumber(number);
    const list = nextDir === "across" ? numbering.across : numbering.down;
    const entry = list.find((e) => e.number === number);
    if (entry) focusCell(entry.positions[0]);
  }

  function handleChange(r, c, value) {
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
  }

  function move(pos, direction, delta) {
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
  }

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

  function handleCellClick(r, c) {
    const numAcross = numbering.acrossNumAt[r][c];
    const numDown = numbering.downNumAt[r][c];
    if (pos.r === r && pos.c === c) {
      if (dir === "across") {
        if (numAcross) setSelectionByNumber("across", numAcross);
        else if (numDown) setSelectionByNumber("down", numDown);
        else setPos({ r, c });
      } else {
        if (numDown) setSelectionByNumber("down", numDown);
        else if (numAcross) setSelectionByNumber("across", numAcross);
        else setPos({ r, c });
      }
    } else {
      const preferNum = dir === "across" ? numAcross : numDown;
      if (preferNum) setSelectionByNumber(dir, preferNum);
      else if (numAcross) setSelectionByNumber("across", numAcross);
      else if (numDown) setSelectionByNumber("down", numDown);
      else setPos({ r, c });
    }
  }

  function handleCellDoubleClick(r, c) {
    const numAcross = numbering.acrossNumAt[r][c];
    const numDown = numbering.downNumAt[r][c];
    const newDir = dir === "across" ? "down" : "across";
    const num = newDir === "across" ? numAcross : numDown;
    if (num) setSelectionByNumber(newDir, num);
  }

  const activePositions = React.useMemo(() => {
    const list = dir === "across" ? numbering.across : numbering.down;
    const entry = list.find((e) => e.number === clueNumber);
    return entry ? entry.positions : [];
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
  }

  function clearPuzzle() {
    setCells(
      puzzle.grid.map((row) => row.map((ch) => (ch === "." ? null : "")))
    );
    setIncorrect(puzzle.grid.map((row) => row.map(() => false)));
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }

  return (
    <div className="layout">
      <div className="crossword">
        <div className="toolbar">
          <div className="button-group">
            <span className="group-label">Check:</span>
            <button onClick={checkSquare}>Square</button>
            <button onClick={checkWord}>Word</button>
            <button onClick={checkPuzzle}>Puzzle</button>
          </div>
          <div className="button-group">
            <span className="group-label">Reveal:</span>
            <button onClick={revealSquare}>Letter</button>
            <button onClick={revealWord}>Word</button>
            <button onClick={revealPuzzle}>Puzzle</button>
          </div>
          <div className="button-group">
            <button onClick={clearPuzzle}>Clear</button>
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
                      inputMode="latin"
                      maxLength={1}
                      value={cells[r][c] || ""}
                      onChange={(e) => handleChange(r, c, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, r, c)}
                      onDoubleClick={() => handleCellDoubleClick(r, c)}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="clues">
        <ClueList
          title="Across"
          entries={numbering.across}
          currentNumber={dir === "across" ? clueNumber : null}
          onSelect={(n) => setSelectionByNumber("across", n)}
        />
        <ClueList
          title="Down"
          entries={numbering.down}
          currentNumber={dir === "down" ? clueNumber : null}
          onSelect={(n) => setSelectionByNumber("down", n)}
        />
      </div>
    </div>
  );
}

function MainPage() {
  const { puzzle, error, loading } = useLatestPuzzle("/C by C 1.puz");
  if (loading) return <div className="status centered">Loading puzzle…</div>;
  if (error) return <div className="status error">{String(error)}</div>;
  if (!puzzle) return null;
  return (
    <div className="App">
      <h1 className="title">{puzzle.meta?.title || "Crossword"}</h1>
      <CrosswordGrid puzzle={puzzle} />
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

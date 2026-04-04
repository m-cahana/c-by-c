import React from "react";
import { supabase, isSupabaseConfigured } from "../supabase";

function parseCluesFromFile(file) {
  return new Promise((resolve, reject) => {
    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    if (fileName.endsWith(".ipuz")) {
      reader.onload = () => {
        try {
          const ipuzData = JSON.parse(reader.result);
          const clues = [];
          if (ipuzData.clues?.Across) {
            ipuzData.clues.Across.forEach(([number, text]) => {
              clues.push({ direction: "across", number, text });
            });
          }
          if (ipuzData.clues?.Down) {
            ipuzData.clues.Down.forEach(([number, text]) => {
              clues.push({ direction: "down", number, text });
            });
          }
          resolve(clues);
        } catch (e) {
          reject(e);
        }
      };
      reader.readAsText(file);
    } else if (fileName.endsWith(".puz")) {
      reader.onload = () => {
        try {
          const { decode } = require("puzjs");
          const puzzle = decode(reader.result);
          const clues = [];
          // puzjs returns sparse arrays — iterate by index
          if (puzzle.clues?.across) {
            for (let i = 0; i < puzzle.clues.across.length; i++) {
              if (puzzle.clues.across[i]) {
                clues.push({ direction: "across", number: i, text: puzzle.clues.across[i] });
              }
            }
          }
          if (puzzle.clues?.down) {
            for (let i = 0; i < puzzle.clues.down.length; i++) {
              if (puzzle.clues.down[i]) {
                clues.push({ direction: "down", number: i, text: puzzle.clues.down[i] });
              }
            }
          }
          resolve(clues);
        } catch (e) {
          reject(e);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reject(new Error("Unsupported file type"));
    }
  });
}

function ThemeMarker({ clues, themedClues, setThemedClues, onSubmit, onCancel, status, dryRun }) {
  const [search, setSearch] = React.useState("");
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const containerRef = React.useRef(null);

  const available = clues.filter(
    (c) => !themedClues.some((t) => t.direction === c.direction && t.number === c.number)
  );
  const filtered = search.trim()
    ? available.filter(
        (c) =>
          `${c.number}`.includes(search) ||
          c.text.toLowerCase().includes(search.toLowerCase()) ||
          c.direction.toLowerCase().includes(search.toLowerCase())
      )
    : available;

  React.useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function addClue(clue) {
    setThemedClues((prev) => [...prev, { direction: clue.direction, number: clue.number, text: clue.text }]);
    setSearch("");
    setDropdownOpen(false);
  }

  function removeClue(clue) {
    setThemedClues((prev) => prev.filter((t) => !(t.direction === clue.direction && t.number === clue.number)));
  }

  return (
    <div className="theme-marker">
      <div className="theme-search-container" ref={containerRef}>
        <input
          type="text"
          className="admin-input theme-search-input"
          placeholder="Search clues to mark as themed…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setDropdownOpen(true);
          }}
          onFocus={() => setDropdownOpen(true)}
        />
        {dropdownOpen && filtered.length > 0 && (
          <ul className="theme-search-dropdown">
            {filtered.map((c) => (
              <li
                key={`${c.direction}-${c.number}`}
                className="theme-search-item"
                onClick={() => addClue(c)}
              >
                <span className="theme-search-dir">{c.number}{c.direction[0].toUpperCase()}</span>
                <span className="theme-search-text">{c.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {themedClues.length > 0 && (
        <div className="themed-clues-section">
          <div className="themed-clues-label">Themed Clues</div>
          <div className="themed-clues-list">
            {themedClues.map((c) => (
              <div key={`${c.direction}-${c.number}`} className="themed-clue-chip">
                <span className="themed-clue-chip-text">
                  {c.number}{c.direction[0].toUpperCase()} — {c.text}
                </span>
                <button className="themed-clue-remove" onClick={() => removeClue(c)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="theme-actions">
        <button className="admin-button admin-button--primary" onClick={onSubmit}>
          {dryRun ? "Preview Upload (Dry Run)" : "Upload Puzzle"}
        </button>
        <button className="admin-button admin-button--secondary" onClick={onCancel}>
          Cancel
        </button>
        {status && <span className="admin-status">{status}</span>}
      </div>
    </div>
  );
}

export default function AdminUpload({ onUploaded }) {
  const [dragOver, setDragOver] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [session, setSession] = React.useState(null);
  const [authMsg, setAuthMsg] = React.useState("");

  // Theme marking state
  const [pendingFile, setPendingFile] = React.useState(null);
  const [parsedClues, setParsedClues] = React.useState(null);
  const [themedClues, setThemedClues] = React.useState([]);
  const [dryRun, setDryRun] = React.useState(false);

  React.useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;
    let mounted = true;
    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted) setSession(data?.session || null);
      } catch {}
    }
    init();
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, sess) => {
        setSession(sess);
      }
    );
    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setAuthMsg("");
    if (!isSupabaseConfigured() || !supabase) {
      setAuthMsg("Supabase is not configured.");
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setAuthMsg("Login failed: " + error.message);
    else {
      setSession(data.session);
      setAuthMsg("Login successful!");
      setTimeout(() => setAuthMsg(""), 1500);
    }
  }

  async function handleLogout() {
    if (!isSupabaseConfigured() || !supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  }

  async function handleFileSelect(file) {
    const fileName = file.name.toLowerCase();
    const isPuz = fileName.endsWith(".puz");
    const isIpuz = fileName.endsWith(".ipuz");

    if (!isPuz && !isIpuz) {
      setStatus("Error: Only .puz and .ipuz files are supported");
      return;
    }

    try {
      setStatus("Parsing clues…");
      const clues = await parseCluesFromFile(file);
      setPendingFile(file);
      setParsedClues(clues);
      setThemedClues([]);
      setStatus("");
    } catch (e) {
      setStatus(`Error parsing file: ${e.message || e}`);
    }
  }

  async function handleUploadSubmit() {
    if (!pendingFile) return;

    const meta = {
      themedClues: themedClues.map((c) => ({
        direction: c.direction,
        number: c.number,
      })),
    };

    if (dryRun) {
      console.log("DRY RUN — would upload:", pendingFile.name);
      console.log("DRY RUN — meta.json:", JSON.stringify(meta, null, 2));
      setStatus(`Dry run complete. ${themedClues.length} themed clue(s) selected. Check console for details.`);
      return;
    }

    if (!isSupabaseConfigured() || !supabase) return;

    try {
      setStatus("Uploading…");
      const fileName = pendingFile.name;
      const isIpuz = fileName.toLowerCase().endsWith(".ipuz");
      const contentType = isIpuz ? "application/json" : "application/octet-stream";

      // Upload the puzzle file
      const { error } = await supabase.storage
        .from("puzzles")
        .upload(fileName, pendingFile, { upsert: true, contentType });
      if (error) throw error;

      // Upload companion meta.json with themed clues
      const metaBlob = new Blob([JSON.stringify(meta, null, 2)], {
        type: "application/json",
      });
      const { error: metaError } = await supabase.storage
        .from("puzzles")
        .upload(`${fileName}.meta.json`, metaBlob, {
          upsert: true,
          contentType: "application/json",
        });
      if (metaError) throw metaError;

      setStatus("Uploaded.");
      setPendingFile(null);
      setParsedClues(null);
      setThemedClues([]);
      onUploaded && onUploaded();
      setTimeout(() => setStatus(""), 1500);
    } catch (e) {
      setStatus(`Error: ${e.message || e}`);
    }
  }

  function handleCancel() {
    setPendingFile(null);
    setParsedClues(null);
    setThemedClues([]);
    setStatus("");
  }

  function onInputChange(e) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  if (!isSupabaseConfigured()) {
    return <div className="admin-upload">Supabase not configured.</div>;
  }

  return (
    <div
      className={dragOver ? "admin-upload drag" : "admin-upload"}
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
    >
      {!session ? (
        <form onSubmit={handleLogin} className="admin-login">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="admin-input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="admin-input"
          />
          <button type="submit" className="admin-button">
            Login
          </button>
          {authMsg && <span className="admin-status">{authMsg}</span>}
        </form>
      ) : parsedClues ? (
        <>
          <label className="dry-run-toggle">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
            />
            Dry run (no upload)
          </label>
          <ThemeMarker
            clues={parsedClues}
            themedClues={themedClues}
            setThemedClues={setThemedClues}
            onSubmit={handleUploadSubmit}
            onCancel={handleCancel}
            status={status}
            dryRun={dryRun}
          />
        </>
      ) : (
        <div className="admin-actions">
          <label className="admin-label">
            <span className="admin-button admin-button--primary">
              Upload .puz or .ipuz
            </span>
            <input
              type="file"
              accept=".puz,.ipuz"
              onChange={onInputChange}
              hidden
            />
          </label>
          <button
            className="admin-button admin-button--secondary"
            onClick={handleLogout}
          >
            Logout
          </button>
          {status && <span className="admin-status">{status}</span>}
        </div>
      )}
    </div>
  );
}

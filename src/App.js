import React from "react";
import LoadingAnimation from "./components/LoadingAnimation";
import { useLoadingAnimation } from "./hooks/useLoadingAnimation";
import { supabase, isSupabaseConfigured } from "./supabase";
import CrosswordGrid from "./components/CrosswordGrid";
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

function MainPage() {
  const { puzzleName } = useParams();
  const fallbackUrl = puzzleName
    ? `/puzzles/${decodeURIComponent(puzzleName)}`
    : "/default_puzzle.puz";
  const { puzzle, error, loading } = useLatestPuzzle(fallbackUrl);

  const {
    showLoadingAnimation,
    showContent,
    dataLoaded,
    handleLoadingComplete,
    forceVideoPlay,
  } = useLoadingAnimation({
    loading,
  });

  if (loading) {
    return (
      <>
        {showLoadingAnimation && (
          <LoadingAnimation
            onComplete={handleLoadingComplete}
            dataLoaded={dataLoaded}
            forceVideoPlay={forceVideoPlay}
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

function Archive() {
  const [puzzles, setPuzzles] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const {
    showLoadingAnimation,
    showContent,
    dataLoaded,
    handleLoadingComplete,
    forceVideoPlay,
  } = useLoadingAnimation({
    loading,
  });

  React.useEffect(() => {
    async function loadPuzzles() {
      try {
        setLoading(true);
        const puzzleList = await fetchAllSupabasePuzzles();

        // Decode each puzzle to get its metadata
        const puzzlesWithTitles = await Promise.all(
          puzzleList.map(async (puzzleFile) => {
            try {
              const { arrayBuffer } = await fetchSpecificSupabasePuzzle(
                puzzleFile.name
              );
              const { decode } = require("puzjs");
              const decoded = decode(arrayBuffer);
              return {
                ...puzzleFile,
                title:
                  decoded.meta?.title || puzzleFile.name.replace(".puz", ""),
              };
            } catch (e) {
              // If decoding fails, fall back to filename
              return {
                ...puzzleFile,
                title: puzzleFile.name.replace(".puz", ""),
              };
            }
          })
        );

        setPuzzles(puzzlesWithTitles);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    loadPuzzles();
  }, []);

  if (loading) {
    return (
      <>
        {showLoadingAnimation && (
          <LoadingAnimation
            onComplete={handleLoadingComplete}
            dataLoaded={dataLoaded}
            forceVideoPlay={forceVideoPlay}
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
        <div className="archive-layout">
          <div className="archive-left">
            <h1 className="title">
              <img
                src="/logos/blue_yellow_boxy_logo.png"
                alt="Charlie"
                className="archive-logo-inline"
              />
            </h1>
          </div>

          <div className="archive-right">
            <p className="archive-text">
              Crosswords by Charlie aims to infuse the stuffy world of crossword
              solving with topical clues from contemporary fashion, pop culture,
              and art. Check out the{" "}
              <a
                href="https://crosswordsbycharlie.substack.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                weekly newsletter
              </a>{" "}
              to get each puzzle (and solving tips) and chat about the latest
              puzzles with me on{" "}
              <a
                href="https://www.instagram.com/charqkol?igsh=N2g2MWU2eWljdTVu&utm_source=qr"
                target="_blank"
                rel="noopener noreferrer"
              >
                IG
              </a>
              .
            </p>
            <p className="archive-credits">
              Web design and development by{" "}
              <a
                href="https://michaelcahana.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Michael Cahana
              </a>{" "}
              | Logo by{" "}
              <a
                href="https://www.instagram.com/yourboiclem/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Clement Condat
              </a>
            </p>
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
                      {puzzle.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [isLoading, setIsLoading] = React.useState(true);

  const {
    showLoadingAnimation,
    showContent,
    dataLoaded,
    handleLoadingComplete,
    forceVideoPlay,
  } = useLoadingAnimation({
    loading: isLoading,
  });

  const handleAppLoadingComplete = () => {
    setIsLoading(false);
    handleLoadingComplete();
  };

  return (
    <BrowserRouter>
      {showLoadingAnimation && (
        <LoadingAnimation
          onComplete={handleAppLoadingComplete}
          dataLoaded={dataLoaded}
          forceVideoPlay={forceVideoPlay}
        />
      )}
      <div className={`app-content ${showContent ? "fade-in" : "fade-out"}`}>
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/puzzle/:puzzleName" element={<MainPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
        <Analytics />
      </div>
    </BrowserRouter>
  );
}

export default App;

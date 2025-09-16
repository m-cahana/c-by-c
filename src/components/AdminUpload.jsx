import React from "react";
import { supabase, isSupabaseConfigured } from "../supabase";

export default function AdminUpload({ onUploaded }) {
  const [dragOver, setDragOver] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [session, setSession] = React.useState(null);
  const [authMsg, setAuthMsg] = React.useState("");

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

  async function uploadFile(file) {
    try {
      if (!isSupabaseConfigured() || !supabase) {
        setStatus("Supabase not configured");
        return;
      }
      setStatus("Uploading…");
      const fileName = file.name;
      const { error } = await supabase.storage
        .from("puzzles")
        .upload(fileName, file, {
          upsert: true,
          contentType: "application/octet-stream",
        });
      if (error) throw error;
      setStatus("Uploaded.");
      onUploaded && onUploaded();
      setTimeout(() => setStatus(""), 1500);
    } catch (e) {
      setStatus(`Error: ${e.message || e}`);
    }
  }

  function onInputChange(e) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
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
      ) : (
        <div className="admin-actions">
          <label className="admin-label">
            <span className="admin-button admin-button--primary">
              Upload .puz
            </span>
            <input type="file" accept=".puz" onChange={onInputChange} hidden />
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

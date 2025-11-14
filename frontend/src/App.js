import React, { useState, useEffect } from "react";
import "./App.css";

const API = "http://localhost:4000/api";

function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user")) || null);
  const [accessToken, setAccessToken] = useState(localStorage.getItem("accessToken"));
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem("refreshToken"));
  const [items, setItems] = useState([]);

  // Load items when logged in
  useEffect(() => {
    if (accessToken) fetchItems();
  }, [accessToken]);

  // Save tokens and user in localStorage
  function saveAuth(access, refresh, userData) {
    setAccessToken(access);
    setRefreshToken(refresh);
    setUser(userData);
    localStorage.setItem("accessToken", access);
    localStorage.setItem("refreshToken", refresh);
    localStorage.setItem("user", JSON.stringify(userData));
  }

  // Logout
  function logout() {
    localStorage.clear();
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
  }

  // --- Refresh token logic ---
  async function refreshAccessToken() {
    if (!refreshToken) return logout();
    const res = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await res.json();
    if (res.ok && data.accessToken) {
      localStorage.setItem("accessToken", data.accessToken);
      setAccessToken(data.accessToken);
      return data.accessToken;
    } else {
      logout();
    }
  }

  // --- Smart fetch wrapper ---
  async function apiFetch(url, options = {}, retry = true) {
    const token = localStorage.getItem("accessToken");
    const headers = { ...(options.headers || {}) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401 && retry) {
      const newAccessToken = await refreshAccessToken();
      if (!newAccessToken) return res;
      return apiFetch(url, options, false);
    }
    return res;
  }

  // --- Register ---
  async function register(e) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.target));
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) saveAuth(data.accessToken, data.refreshToken, data.user);
  }

  // --- Login ---
  async function login(e) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.target));
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) saveAuth(data.accessToken, data.refreshToken, data.user);
  }

  // --- CRUD ---
  async function fetchItems() {
    const res = await apiFetch(`${API}/items`);
    const data = await res.json();
    if (res.ok) setItems(data);
  }

  async function createItem(e) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.target));
    const res = await apiFetch(`${API}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) fetchItems();
  }

  async function removeItem(id) {
    await apiFetch(`${API}/items/${id}`, { method: "DELETE" });
    fetchItems();
  }

  // --- UI ---
  if (!accessToken)
    return (
      <div style={{ padding: 20 }}>
        <h2>Auth</h2>
        <div style={{ display: "flex", gap: 20 }}>
          <form onSubmit={login}>
            <h3>Login</h3>
            <input name="email" placeholder="email" required /> <br />
            <input name="password" placeholder="password" type="password" required /> <br />
            <button type="submit">Login</button>
          </form>

          <form onSubmit={register}>
            <h3>Register</h3>
            <input name="name" placeholder="name" required /> <br />
            <input name="email" placeholder="email" required /> <br />
            <input name="password" placeholder="password" type="password" required /> <br />
            <button type="submit">Register</button>
          </form>
        </div>
      </div>
    );

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>
          Hi, {user?.name} ({user?.role})
        </h2>
        <button onClick={logout}>Logout</button>
      </div>

      <section>
        <h3>Create Item</h3>
        <form onSubmit={createItem}>
          <input name="title" placeholder="title" required /> <br />
          <input name="content" placeholder="content" /> <br />
          <button type="submit">Create</button>
        </form>
      </section>

      <section>
        <h3>Items</h3>
        <ul>
          {items.map((it) => (
            <li key={it._id} style={{ marginBottom: 8 }}>
              <strong>{it.title}</strong> — {it.content} <br />
              owner: {it.owner?.name} ({it.owner?.email})
              {((it.owner && it.owner._id === user?.id) || user?.role === "admin") && (
                <button onClick={() => removeItem(it._id)} style={{ marginLeft: 8 }}>
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default App;

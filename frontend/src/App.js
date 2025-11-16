import React, { useEffect, useState, useRef } from "react";
import "./App.css";

// IMPORTANT: Your deployed backend URL
const API = "https://todolistapi-fc8p.onrender.com/api";

export default function App() {
  // ------------------------ AUTH STATE ------------------------
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user")) || null);
  const [accessToken, setAccessToken] = useState(localStorage.getItem("accessToken"));
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem("refreshToken"));

  // ------------------------ DATA STATE ------------------------
  const [items, setItems] = useState([]);

  // ------------------------ UI STATE ------------------------
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | pending | completed
  const [sort, setSort] = useState("order");   // order | due | priority
  const [collapseCompleted, setCollapseCompleted] = useState(false);

  // Modal (create/edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const modalForm = useRef();

  // Drag & drop
  const dragItemIndex = useRef(null);

  // ------------------------ AUTH HELPERS ------------------------
  function saveAuth(access, refresh, userObj) {
    setAccessToken(access);
    setRefreshToken(refresh);
    setUser(userObj);

    localStorage.setItem("accessToken", access);
    localStorage.setItem("refreshToken", refresh);
    localStorage.setItem("user", JSON.stringify(userObj));
  }

  function logout() {
    localStorage.clear();
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  }

  async function refreshAccessToken() {
    if (!refreshToken) return logout();

    const res = await fetch(`${API.replace("/api", "")}/api/auth/refresh`, {
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

  async function apiFetch(url, options = {}, retry = true) {
    const headers = { ...(options.headers || {}) };
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401 && retry) {
      const newToken = await refreshAccessToken();
      if (!newToken) return res;
      return apiFetch(url, options, false);
    }

    return res;
  }

  // ------------------------ AUTH ACTIONS ------------------------
  async function register(e) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.target));

    const res = await fetch(`${API.replace("/api", "")}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    if (res.ok) saveAuth(data.accessToken, data.refreshToken, data.user);
    else alert(data.error || data.message);
  }

  async function login(e) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.target));

    const res = await fetch(`${API.replace("/api", "")}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    if (res.ok) saveAuth(data.accessToken, data.refreshToken, data.user);
    else alert(data.error || data.message);
  }

  // ------------------------ CRUD ------------------------
  useEffect(() => {
    if (accessToken) fetchItems();
  }, [accessToken, query, filter, sort]);

  async function fetchItems() {
    setLoading(true);

    const q = encodeURIComponent(query || "");

    const res = await apiFetch(
      `${API}/items?q=${q}&status=${filter === "all" ? "" : filter}&sort=${sort}`
    );

    const data = await res.json();
    if (res.ok) setItems(data);
    setLoading(false);
  }

  async function createItem(body) {
    const res = await apiFetch(`${API}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) fetchItems();
  }

  async function updateItem(id, body) {
    const res = await apiFetch(`${API}/items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) fetchItems();
  }

  async function toggleComplete(id) {
    const res = await apiFetch(`${API}/items/${id}/complete`, { method: "PATCH" });
    if (res.ok) fetchItems();
  }

  async function deleteItem(id) {
    if (!window.confirm("Delete this item?")) return;
    const res = await apiFetch(`${API}/items/${id}`, { method: "DELETE" });
    if (res.ok) fetchItems();
  }

  // ------------------------ SUBTASKS ------------------------
  async function addSubtask(id, title) {
    if (!title.trim()) return;
    const res = await apiFetch(`${API}/items/${id}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) fetchItems();
  }

  async function toggleSubtask(id, subtaskId) {
    const res = await apiFetch(`${API}/items/${id}/subtasks/${subtaskId}`, {
      method: "PATCH",
    });
    if (res.ok) fetchItems();
  }

  // ------------------------ DRAG & DROP ------------------------
  function dragStart(e, index) {
    dragItemIndex.current = index;
  }

  function dragOver(e) {
    e.preventDefault();
  }

  async function drop(e, index) {
    e.preventDefault();

    const from = dragItemIndex.current;
    if (from === null) return;

    const updated = [...items];
    const [moved] = updated.splice(from, 1);
    updated.splice(index, 0, moved);

    // update UI immediately
    const reordered = updated.map((it, idx) => ({ ...it, order: idx }));
    setItems(reordered);

    // persist order
    await apiFetch(`${API}/items/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order: reordered.map((it) => ({ id: it._id, order: it.order })),
      }),
    });

    dragItemIndex.current = null;
  }

  // ------------------------ MODAL ------------------------
  function openCreateModal() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEditModal(it) {
    setEditing(it);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  async function saveModal(e) {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(e.target));
    const payload = {
      title: data.title,
      content: data.content,
      dueDate: data.dueDate || null,
      priority: data.priority,
      tags: data.tags,
    };

    if (editing) await updateItem(editing._id, payload);
    else await createItem(payload);

    closeModal();
  }

  function fmt(d) {
    if (!d) return "-";
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  }

  // ------------------------ AUTH SCREEN ------------------------
  if (!accessToken) {
    return (
      <div className="auth-container">
        <h1>Login/Register</h1>

        <div className="auth-box">
          <form onSubmit={login}>
            <h3>Login</h3>
            <input name="email" placeholder="Email" required />
            <input name="password" type="password" placeholder="Password" required />
            <button>Login</button>
          </form>

          <form onSubmit={register}>
            <h3>Register</h3>
            <input name="name" placeholder="Name" required />
            <input name="email" placeholder="Email" required />
            <input name="password" type="password" placeholder="Password" required />
            <button>Register</button>
          </form>
        </div>
      </div>
    );
  }

  // ------------------------ MAIN APP UI ------------------------
  return (
    <div className="app">
      <header className="top">
        <h2>
          Hi, {user?.name} <small>({user?.role})</small>
        </h2>
        <button onClick={logout}>Logout</button>
      </header>

      {/* Controls */}
      <div className="controls">
        <button onClick={openCreateModal}>+ Add Task</button>
        <button onClick={() => setCollapseCompleted(!collapseCompleted)}>
          Toggle Collapse Completed
        </button>

        <input
          placeholder="Search..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="order">Manual</option>
          <option value="due">Due Date</option>
          <option value="priority">Priority</option>
        </select>
      </div>

      {/* Items List */}
      <ul className="items">
        {items
          .filter((it) => (collapseCompleted ? !it.completed : true))
          .map((it, idx) => (
            <li
              key={it._id}
              draggable
              onDragStart={(e) => dragStart(e, idx)}
              onDragOver={dragOver}
              onDrop={(e) => drop(e, idx)}
              className={`item ${it.completed ? "done" : ""}`}
            >
              <div className="item-header">
                <input
                  type="checkbox"
                  checked={it.completed}
                  onChange={() => toggleComplete(it._id)}
                />

                <div>
                  <strong>{it.title}</strong>
                  <div className="meta">
                    [{it.priority}] — {it.tags?.join(", ") || "no tags"}
                  </div>
                  <div className="dates">
                    Created: {fmt(it.createdAt)} | Updated: {fmt(it.updatedAt)} | Due:{" "}
                    {fmt(it.dueDate)}
                  </div>
                </div>

                <div className="actions">
                  <button onClick={() => openEditModal(it)}>Edit</button>
                  <button onClick={() => deleteItem(it._id)}>Delete</button>
                </div>
              </div>

              {/* Subtasks */}
              <div className="subtasks">
                <ul>
                  {it.subtasks?.map((st) => (
                    <li key={st._id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={st.completed}
                          onChange={() => toggleSubtask(it._id, st._id)}
                        />
                        <span className={st.completed ? "done" : ""}>{st.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = e.target.sub.value;
                    addSubtask(it._id, v);
                    e.target.reset();
                  }}
                >
                  <input name="sub" placeholder="Add subtask..." />
                </form>
              </div>
            </li>
          ))}
      </ul>

      {/* Modal */}
      {modalOpen && (
        <div className="modal">
          <div className="modal-box">
            <h3>{editing ? "Edit Task" : "New Task"}</h3>
            <form onSubmit={saveModal}>
              <label>Title</label>
              <input name="title" defaultValue={editing?.title} required />

              <label>Description</label>
              <textarea
                name="content"
                defaultValue={editing?.content}
                placeholder="Optional description..."
              />

              <label>Due Date</label>
              <input
                type="datetime-local"
                name="dueDate"
                defaultValue={
                  editing?.dueDate
                    ? new Date(editing.dueDate).toISOString().slice(0, 16)
                    : ""
                }
              />

              <label>Priority</label>
              <select name="priority" defaultValue={editing?.priority || "medium"}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>

              <label>Tags (comma-separated)</label>
              <input
                name="tags"
                defaultValue={editing?.tags?.join(", ") || ""}
              />

              <div className="modal-actions">
                <button type="submit">Save</button>
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        body { font-family: system-ui, Arial; }
        .top { display:flex; justify-content:space-between; margin-bottom:20px; }
        .controls { display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap; }
        .items { list-style:none; padding:0; display:flex; flex-direction:column; gap:12px; }
        .item { padding:12px; border-radius:6px; background:#fff; border:1px solid #ddd; }
        .item.done { background:#eef6ee; }
        .item-header { display:flex; gap:12px; justify-content:space-between; }
        .actions button { margin-left:6px; }
        .meta { color:#666; font-size:12px; }
        .dates { color:#888; font-size:12px; margin-top:4px; }
        .subtasks ul { list-style:none; padding-left:0; }
        .auth-container { padding:20px; }
        .auth-box { display:flex; gap:20px; }
        .modal { position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; }
        .modal-box { background:white; padding:20px; border-radius:8px; width:400px; max-width:90%; }
        .modal-actions { margin-top:12px; display:flex; justify-content:flex-end; gap:10px; }
      `}</style>
    </div>
  );
}

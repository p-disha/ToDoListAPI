import React, { useEffect, useState, useRef } from "react";
import "./App.css";

// API base
const API = "https://todolistapi-fc8p.onrender.com/api";

export default function App() {
  // auth
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    try {
      const u = JSON.parse(raw);
      u.id = u._id || u.id || null;
      return u;
    } catch {
      return null;
    }
  });
  const [accessToken, setAccessToken] = useState(localStorage.getItem("accessToken"));
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem("refreshToken"));

  // data + ui
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("order");
  const [collapseCompleted, setCollapseCompleted] = useState(false);

  // modal/editing
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // drag/drop
  const dragItemIndex = useRef(null);

  // ----------------------------- auth helpers -----------------------------
  function saveAuth(access, refresh, userData) {
    // Normalize user id to always use `id`
    userData.id = userData._id || userData.id || null;
    setUser(userData);
    setAccessToken(access);
    setRefreshToken(refresh);

    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("accessToken", access);
    localStorage.setItem("refreshToken", refresh);
  }

  function logout() {
    localStorage.clear();
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setItems([]);
  }

  async function refreshAccessToken() {
    if (!refreshToken) return logout();

    const res = await fetch(`${API.replace("/api", "")}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await res.json().catch(() => null);
    if (res.ok && data?.accessToken) {
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

  // ----------------------------- normalize server item -----------------------------
  function normalizeItem(raw) {
    // raw may already be populated or not
    const owner = raw.owner || {};
    const ownerId = owner._id || owner.id || owner;

    return {
      _id: raw._id || raw.id,
      title: raw.title || "",
      content: raw.content || "",
      owner: {
        _id: ownerId,
        name: owner.name || (ownerId ? "Unknown" : null),
        email: owner.email || null
      },
      completed: raw.completed === true || raw.completed === "true" || false,
      dueDate: raw.dueDate || null,
      priority: raw.priority || "medium",
      tags: Array.isArray(raw.tags) ? raw.tags : (raw.tags ? String(raw.tags).split(",").map(t => t.trim()).filter(Boolean) : []),
      subtasks: Array.isArray(raw.subtasks) ? raw.subtasks : [],
      order: typeof raw.order === "number" ? raw.order : Number(raw.order || 0),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    };
  }

  // ----------------------------- load items -----------------------------
  useEffect(() => {
    if (accessToken) fetchItems();
    // eslint-disable-next-line
  }, [accessToken, query, filter, sort]);

  async function fetchItems() {
    setLoading(true);
    const q = encodeURIComponent(query || "");
    const res = await apiFetch(`${API}/items?q=${q}&status=${filter === "all" ? "" : filter}&sort=${sort}`);
    let data = [];
    try {
      data = await res.json();
    } catch (err) {
      console.error("Invalid JSON from /items", err);
    }
    if (res.ok && Array.isArray(data)) {
      setItems(data.map(normalizeItem));
    } else {
      console.error("Failed to load items", data);
    }
    setLoading(false);
  }

  // ----------------------------- auth actions -----------------------------
  async function register(e) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.target));
    const res = await fetch(`${API.replace("/api", "")}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(()=>null);
    if (res.ok && data) saveAuth(data.accessToken, data.refreshToken, data.user);
    else alert(data?.message || "Register failed");
  }

  async function login(e) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.target));
    const res = await fetch(`${API.replace("/api", "")}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(()=>null);
    if (res.ok && data) saveAuth(data.accessToken, data.refreshToken, data.user);
    else alert(data?.message || "Login failed");
  }

  // ----------------------------- CRUD actions -----------------------------
  async function createItem(body) {
    const res = await apiFetch(`${API}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(()=>null);
    if (res.ok && data) {
      setItems(prev => [...prev, normalizeItem(data)].sort((a,b)=> a.order - b.order));
    } else {
      alert(data?.message || "Create failed");
    }
  }

  async function updateItem(id, body) {
    const res = await apiFetch(`${API}/items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(()=>null);
    if (res.ok && data) {
      setItems(prev => prev.map(it => it._id === (data._id || data.id) ? normalizeItem(data) : it));
    } else {
      alert(data?.message || "Update failed");
    }
  }

  // toggle complete (backend enforces owner/admin)
  async function toggleComplete(id) {
    const res = await apiFetch(`${API}/items/${id}/complete`, { method: "PATCH" });
    const data = await res.json().catch(()=>null);
    if (res.ok && data) {
      setItems(prev => prev.map(it => it._id === (data._id || data.id) ? normalizeItem(data) : it));
    } else {
      // 403 returns message; show it
      alert(data?.message || "Toggle failed");
    }
  }

  async function deleteItem(id) {
    if (!window.confirm("Delete this item?")) return;
    const res = await apiFetch(`${API}/items/${id}`, { method: "DELETE" });
    const data = await res.json().catch(()=>null);
    if (res.ok) {
      setItems(prev => prev.filter(it => it._id !== id));
    } else {
      alert(data?.message || "Delete failed");
    }
  }

  // ----------------------------- subtasks -----------------------------
  async function addSubtask(id, title) {
    if (!title || !title.trim()) return;
    const res = await apiFetch(`${API}/items/${id}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json().catch(()=>null);
    if (res.ok && data) {
      setItems(prev => prev.map(it => it._id === (data._id || data.id) ? normalizeItem(data) : it));
    } else {
      alert(data?.message || "Add subtask failed");
    }
  }

  async function toggleSubtask(itemId, subtaskId) {
    const res = await apiFetch(`${API}/items/${itemId}/subtasks/${subtaskId}`, { method: "PATCH" });
    const data = await res.json().catch(()=>null);
    if (res.ok && data) {
      setItems(prev => prev.map(it => it._id === (data._id || data.id) ? normalizeItem(data) : it));
    } else {
      alert(data?.message || "Toggle subtask failed");
    }
  }

  // ----------------------------- reorder -----------------------------
  function dragStart(e, index) { dragItemIndex.current = index; }
  function dragOver(e) { e.preventDefault(); }

  async function drop(e, index) {
    e.preventDefault();
    const from = dragItemIndex.current;
    if (from === null || from === undefined) return;
    const updated = [...items];
    const [moved] = updated.splice(from, 1);
    updated.splice(index, 0, moved);
    const reordered = updated.map((it, idx) => ({ ...it, order: idx }));
    setItems(reordered);
    const payload = reordered.map(it => ({ id: it._id, order: Number(it.order) }));
    const res = await apiFetch(`${API}/items/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: payload }),
    });
    if (!res.ok) {
      console.error("Reorder failed");
      fetchItems();
    }
    dragItemIndex.current = null;
  }

  // ----------------------------- modal -----------------------------
  function openCreateModal() { setEditing(null); setModalOpen(true); }
  function openEditModal(it) { setEditing(it); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); }

  async function saveModal(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const payload = {
      title: data.title,
      content: data.content,
      // Always convert datetime-local consistently
      dueDate: data.dueDate ? new Date(data.dueDate + ":00").toISOString() : null,
      priority: data.priority || "medium",
      tags: data.tags
    };
    if (editing) await updateItem(editing._id, payload);
    else await createItem(payload);
    closeModal();
  }

  function fmt(d) {
    if (!d) return "-";
    try { return new Date(d).toLocaleString(); } catch { return d; }
  }

  // ----------------------------- ownership helpers -----------------------------
  function isOwner(it) {
    if (!user) return false;
    const ownerId = it?.owner?._id || it?.owner?.id || it?.owner || null;
    return String(ownerId) === String(user.id);
  }
  function canModify(it) {
    return user?.role === "admin" || isOwner(it);
  }

  // ----------------------------- UI -----------------------------
  if (!accessToken) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Auth</h2>
        <div style={{ display: "flex", gap: 20 }}>
          <form onSubmit={login}>
            <h3>Login</h3>
            <input name="email" placeholder="email" required /><br/>
            <input name="password" placeholder="password" type="password" required /><br/>
            <button>Login</button>
          </form>

          <form onSubmit={register}>
            <h3>Register</h3>
            <input name="name" placeholder="name" required /><br/>
            <input name="email" placeholder="email" required /><br/>
            <input name="password" placeholder="password" type="password" required /><br/>
            <button>Register</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Hi, {user?.name} ({user?.role})</h2>
        <button onClick={logout}>Logout</button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <button onClick={openCreateModal}>+ Add Task</button>
        <button onClick={() => setCollapseCompleted(!collapseCompleted)}>Toggle Collapse Completed</button>
        <input placeholder="Search..." value={query} onChange={e=>setQuery(e.target.value)} />
        <select value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
        </select>
        <select value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="order">Manual</option>
          <option value="due">Due Date</option>
          <option value="priority">Priority</option>
        </select>
      </div>

      {loading ? <p>Loading...</p> : (
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {items.filter(it => collapseCompleted ? !it.completed : true).map((it, idx) => (
            <li key={it._id} draggable onDragStart={e=>dragStart(e, idx)} onDragOver={dragOver} onDrop={e=>drop(e, idx)}
                style={{ padding: 12, borderRadius: 6, background: it.completed ? "#eef6ee" : "#fff", border: "1px solid #ddd" }}>
              <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={!!it.completed}
                    disabled={!canModify(it)}
                    onChange={() => canModify(it) ? toggleComplete(it._id) : null}
                    style={{ marginTop: 6 }}
                  />
                  <div>
                    <strong>{it.title}</strong>
                    <div style={{ color: "#666", fontSize: 12 }}>
                      [{it.priority}] — {it.tags?.length ? it.tags.join(", ") : "no tags"}
                    </div>
                    <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>
                      Created: {fmt(it.createdAt)} | Updated: {fmt(it.updatedAt)} | Due: {it.dueDate ? new Date(it.dueDate).toLocaleString() : "-"}
                    </div>
                  </div>
                </div>

                {(canModify(it)) ? (
                  <div>
                    <button onClick={()=>openEditModal(it)}>Edit</button>
                    <button onClick={()=>deleteItem(it._id)}>Delete</button>
                  </div>
                ) : (
                  <div style={{ opacity: 0.6, fontSize: 12, color: "#333" }}>Read-only</div>
                )}
              </div>

              {/* subtasks */}
              <div style={{ marginTop: 8 }}>
                <ul style={{ listStyle: "none", paddingLeft: 0 }}>
                  {(it.subtasks && it.subtasks.length) ? it.subtasks.map(st => (
                    <li key={st._id || st.id || `${it._id}-sub-${st.title}`}>
                      <label>
                        <input type="checkbox" checked={!!st.completed}
                          disabled={!canModify(it)}
                          onChange={() => canModify(it) ? toggleSubtask(it._id, st._id || st.id) : null}
                        />{" "}
                        <span style={{ textDecoration: st.completed ? "line-through" : "none" }}>{st.title}</span>
                      </label>
                    </li>
                  )) : <li style={{ color:"#666" }}><small>No subtasks</small></li>}
                </ul>

                <form onSubmit={(e) => {
                  e.preventDefault();
                  const val = e.target.elements.sub?.value;
                  if (!val) return;
                  if (!canModify(it)) { alert("Only owner or admin can add subtasks"); return; }
                  addSubtask(it._id, val);
                  e.target.reset();
                }}>
                  <input name="sub" placeholder="Add subtask..." disabled={!canModify(it)} />
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* modal */}
      {modalOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", justifyContent:"center", alignItems:"center" }}>
          <div style={{ background:"#fff", padding:20, borderRadius:8, width:400 }}>
            <h3>{editing ? "Edit Task" : "New Task"}</h3>
            <form onSubmit={saveModal}>
              <div>
                <label>Title</label><br/>
                <input name="title" defaultValue={editing?.title || ""} required />
              </div>

              <div>
                <label>Description</label><br/>
                <textarea name="content" defaultValue={editing?.content || ""} />
              </div>

              <div>
                <label>Due Date</label><br/>
                <input type="datetime-local" name="dueDate"
                  defaultValue={editing?.dueDate ? new Date(editing.dueDate).toISOString().slice(0,16) : ""} />
              </div>

              <div>
                <label>Priority</label><br/>
                <select name="priority" defaultValue={editing?.priority || "medium"}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label>Tags (comma-separated)</label><br/>
                <input name="tags" defaultValue={editing?.tags ? editing.tags.join(", ") : ""} />
              </div>

              <div style={{ marginTop: 12, display:"flex", justifyContent:"flex-end", gap:8 }}>
                <button type="submit">Save</button>
                <button type="button" onClick={closeModal}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

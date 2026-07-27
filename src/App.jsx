import PaletteMenu from "./PaletteMenu";
import SwipeToDelete from "./SwipeToDelete";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import {
  Plus, Briefcase, User, Calendar, Check, Trash2,
  GripVertical, Inbox, X, MessageCircleMore, UserPlus, Clock, Pencil, LogOut,
  ChevronDown, Search, Tag, Settings, Repeat, FolderKanban,
  Moon,
} from "lucide-react";
import { auth, googleProvider, db } from "./firebase";
import BrainDumpButton from "./BrainDump";
import orbitIcon from "./assets/orbit-icon.png";
import Budget from "./Budget";
import AccessScreen from "./AccessScreen";
import Workbench from "./Workbench";
import BudgetGate from "./BudgetGate";
import { suggestCategory } from "./gemini";
import { getMyNotifyConfig, saveMyNotifyConfig } from "./notifyConfig";
import { createBudgetAccessRequest, watchMyPendingBudgetRequest } from "./budgetAccessRequests";
import Nightly from "./Nightly";

// Warm editorial palette. Keys stay the same (blue/green/orange/yellow) even
// though the actual colors are now plum/sage/clay/ochre — existing saved
// categories and people reference these keys directly in Firestore, so
// renaming the keys would silently break their colors.
import { PALETTE, theme } from "./theme";
const PALETTE_ORDER = ["blue", "green", "orange", "yellow"];
const UNSORTED = "__unsorted__";
const STALE_DAYS = 7;

function fmtDate(d) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isOverdue(dueDate, done) {
  if (!dueDate || done) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate + "T00:00:00") < today;
}

// Firestore Timestamp -> millis, tolerating pending server timestamps (null while unsynced)
function toMillis(ts) {
  if (!ts) return Date.now();
  if (typeof ts.toMillis === "function") return ts.toMillis();
  return Date.now();
}

function daysSince(ts) {
  return Math.floor((Date.now() - toMillis(ts)) / 86400000);
}

function relativeTime(ts) {
  const mins = Math.floor((Date.now() - toMillis(ts)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---------- Firestore live-collection hook ----------
function useUserCollection(uid, name) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!uid) {
      setItems([]);
      return;
    }
    const q = query(collection(db, "users", uid, name), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error(`${name} snapshot error`, err)
    );
    return () => unsub();
  }, [uid, name]);
  return items;
}

// ---------- Top-level auth gate ----------
const ALLOWED_EMAIL = "javoseabaugh@gmail.com";
function emailToDocId(email) {
  return email.toLowerCase();
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [blocked, setBlocked] = useState(false);
  const [access, setAccess] = useState(undefined); // undefined = loading, null = no access record

  useEffect(() => {
    let unsubAccess = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (unsubAccess) {
        unsubAccess();
        unsubAccess = null;
      }
      if (!u) {
        setBlocked(false);
        setAccess(undefined);
        setUser(null);
        return;
      }
      const accessRef = doc(db, "access", emailToDocId(u.email));
      unsubAccess = onSnapshot(
        accessRef,
        (snap) => {
          if (!snap.exists()) {
            signOut(auth);
            setBlocked(true);
            setAccess(null);
            setUser(null);
            return;
          }
          setBlocked(false);
          const accessData = { id: snap.id, ...snap.data() };
          if (accessData.uid !== u.uid) {
            setDoc(accessRef, { uid: u.uid }, { merge: true }).catch((err) =>
              console.error("uid self-register error", err)
            );
          }
          setAccess(accessData);
          setUser(u);
        },
        (err) => console.error("access snapshot error", err)
      );
    });
    return () => {
      unsubAuth();
      if (unsubAccess) unsubAccess();
    };
  }, []);

  if (user === undefined) return <CenteredScreen>Loading…</CenteredScreen>;
  if (user === null) return <SignInScreen blocked={blocked} />;
  return <TodoApp user={user} access={access} />;
}

function CenteredScreen({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: theme.gradB, color: theme.textMuted, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {children}
    </div>
  );
}

function SignInScreen({ blocked }) {
  const [error, setError] = useState(blocked ? "This app is private — that account isn't authorized." : null);

  async function handleSignIn() {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setError("Sign-in failed. Please try again.");
      console.error(e);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: `radial-gradient(circle at 50% 0%, ${theme.gradA} 0%, ${theme.gradB} 50%, ${theme.gradC} 100%)`,
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{ background: theme.cardBg, borderRadius: 22, padding: "44px 36px 36px", boxShadow: "0 8px 30px rgba(58,44,30,0.08)", border: "1px solid #EFE6D9", textAlign: "center", maxWidth: 360 }}>
        <img src={orbitIcon} alt="Orbit" style={{ width: 68, height: 68, marginBottom: 14, filter: "drop-shadow(0 2px 6px rgba(185,133,43,0.25))" }} />
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 26, fontWeight: 600, color: theme.textPrimary, marginBottom: 6, letterSpacing: "-0.01em" }}>Orbit</h1>
        <p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 26 }}>Management for work, life, and thoughts.</p>
        <button
          onClick={handleSignIn}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%",
            padding: "12px 16px", borderRadius: 12, border: "1px solid #E6DACB", background: theme.cardBg,
            fontSize: 14, fontWeight: 700, color: theme.textPrimary, cursor: "pointer",
          }}
        >
          <GoogleIcon />
          Sign in with Google
        </button>
        {error && <p style={{ color: theme.oldOrangeText, fontSize: 12, marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.95v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.69 9c0-.6.1-1.18.28-1.72V4.95H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.05l3.02-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.95l3.02 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

// ---------- Main app ----------
function TodoApp({ user, access }) {
  const uid = user.uid;
  const [ownerUid, setOwnerUid] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(db, "access"), where("role", "==", "owner")))
      .then((snap) => {
        if (cancelled) return;
        const ownerDoc = snap.docs[0];
        if (ownerDoc && ownerDoc.data().uid) setOwnerUid(ownerDoc.data().uid);
      })
      .catch((err) => console.error("owner lookup error", err));
    return () => { cancelled = true; };
  }, []);
  const sharingWork = access?.sharedWorkAccess === true && !!ownerUid && ownerUid !== uid;
  const workUid = sharingWork ? ownerUid : uid;
  const ownTodos = useUserCollection(uid, "todos");
  const sharedTodos = useUserCollection(sharingWork ? ownerUid : null, "todos");
  const ownCategories = useUserCollection(uid, "categories");
  const sharedCategories = useUserCollection(sharingWork ? ownerUid : null, "categories");
  const thoughts = useUserCollection(uid, "thoughts");
  const people = useUserCollection(uid, "people");

  const [activeList, setActiveList] = useState("work");
  const [categoryFilter, setCategoryFilter] = useState([]); // array of category ids; empty = show all
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [settingTimeFor, setSettingTimeFor] = useState(null);
  const [draftTimeValue, setDraftTimeValue] = useState("");
  const [pendingBudgetRequest, setPendingBudgetRequest] = useState(null);
  useEffect(() => {
    if (access?.role !== "guardian") return;
    const unsub = watchMyPendingBudgetRequest(user.email, setPendingBudgetRequest);
    return () => unsub();
  }, [access?.role, user.email]);
  async function handleRequestBudgetAccess() {
    await createBudgetAccessRequest(user.email);
  }
  const [page, setPage] = useState("main"); // 'main' | 'budget'

  const [draft, setDraft] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const draftDueRef = useRef(null);
  const [draftCategoryId, setDraftCategoryId] = useState(null);
  const [draftRecurrence, setDraftRecurrence] = useState(null);
  const [newCatName, setNewCatName] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [showMoreCats, setShowMoreCats] = useState(false);
  const [showManageCats, setShowManageCats] = useState(false);
  const [showManagePeople, setShowManagePeople] = useState(false);

  const [thoughtDraft, setThoughtDraft] = useState("");
  const [thoughtDue, setThoughtDue] = useState("");
  const thoughtDueRef = useRef(null);
  const [thoughtPersonId, setThoughtPersonId] = useState(null);
  const [newPersonName, setNewPersonName] = useState("");
  const [showNewPerson, setShowNewPerson] = useState(false);

  const [dragOverZone, setDragOverZone] = useState(null);
  const draggedId = useRef(null);
  const draggedKind = useRef(null);

  const listMeta = {
    work: { label: "Work", icon: Briefcase, color: PALETTE.blue },
    personal: { label: "Personal", icon: User, color: PALETTE.green },
    thoughts: { label: "Thoughts", icon: MessageCircleMore, color: PALETTE.yellow },
    workbench: { label: "Workbench", icon: FolderKanban, color: PALETTE.orange },
  };

  // ---------- Work / Personal ----------
  const activeUid = activeList === "work" ? workUid : uid;
  const activeTodosSource = activeList === "work" && sharingWork ? sharedTodos : ownTodos;
  const activeCategoriesSource = activeList === "work" && sharingWork ? sharedCategories : ownCategories;
  // 1. Get the shared items and filter them strictly by the approved category
  const filteredShared = sharedTodos
    .filter((t) => t.list === "work" && t.categoryId === access?.sharedWorkCategoryId)
    .map((t) => ({ ...t, isShared: true }));

  // 2. Get the Assistant's OWN items
  // If we are in the 'work' list, show ALL their work tasks regardless of category
  const filteredOwn = ownTodos.filter((t) => t.list === activeList);

  // 3. Combine them
  const currentTodos = (activeList === "work" && sharingWork)
    ? [...filteredOwn, ...filteredShared]
    : filteredOwn;
  const currentCategories = activeCategoriesSource.filter((c) => c.list === activeList);
  const activeCount = currentTodos.filter((t) => !t.done).length;
  // Suggest an existing category as the user types a new task, debounced
  // so it doesn't fire on every keystroke. Never overrides a category the
  // person already picked themselves.
  useEffect(() => {
    if (draftCategoryId) return;
    if (!draft.trim() || draft.trim().length < 4) return;
    if (activeList === "thoughts") return;
    const names = currentCategories.map((c) => c.name);
    if (!names.length) return;
    const handle = setTimeout(async () => {
      const suggested = await suggestCategory(draft, names);
      if (suggested) {
        const match = currentCategories.find((c) => c.name === suggested);
        if (match) setDraftCategoryId(match.id);
      }
    }, 700);
    return () => clearTimeout(handle);
  }, [draft]);

  async function addCategory() {
    const name = newCatName.trim();
    if (!name) return null;
    
    // We use activeUid so it saves to the OWNER'S list if they are in the shared Work tab
    const ref = await addDoc(collection(db, "users", activeUid, "categories"), { 
      list: activeList, 
      name, 
      color: PALETTE_ORDER[currentCategories.length % 4], 
      createdAt: serverTimestamp() 
    });
    
    setNewCatName("");
    setShowNewCat(false);
    return ref.id;
  }

  async function addCategoryAndSelect() {
    const id = await addCategory();
    if (id) setDraftCategoryId(id);
    setShowMoreCats(false);
  }

  async function deleteCategory(catId) {
    // Delete the category from the Owner's list (activeUid)
    await deleteDoc(doc(db, "users", activeUid, "categories", catId));
    
    // Find all todos (private and shared) that were in this category
    const affected = currentTodos.filter((t) => t.categoryId === catId);
    
    // Update them all to have no category, correctly targeting 'ownerUid' or 'uid'
    await Promise.all(affected.map((t) => {
      const targetUid = t.isShared ? ownerUid : uid;
      return updateDoc(doc(db, "users", targetUid, "todos", t.id), { categoryId: null });
    }));
  }

  function computeNextDue(currentDue, recurrence) {
    const base = currentDue ? new Date(currentDue + "T00:00:00") : new Date();
    if (recurrence.type === "daily") base.setDate(base.getDate() + 1);
    else if (recurrence.type === "weekly") base.setDate(base.getDate() + 7);
    else if (recurrence.type === "monthly") base.setMonth(base.getMonth() + 1);
    else if (recurrence.type === "custom") base.setDate(base.getDate() + (recurrence.intervalDays || 1));
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
  }

  async function addTodo() {
    const text = draft.trim();
    if (!text) return;
    
    // Assistants use the shared Category ID, but save the task to their own private list (uid)
    const finalCategoryId = draftCategoryId; 

    try {
      await addDoc(collection(db, "users", uid, "todos"), {
        list: activeList,
        text,
        categoryId: finalCategoryId,
        due: draftDue || null,
        done: false,
        recurrence: draftRecurrence
  ? draftRecurrence.type === "custom"
    ? { type: "custom", intervalDays: Number(draftRecurrence.intervalDays) || 1 }
    : draftRecurrence
  : null,
        createdAt: serverTimestamp(),
      });
      setDraft("");
      setDraftDue("");
      setDraftCategoryId(null);
      setDraftRecurrence(null);
      setShowAddPanel(false);
    } catch (err) {
      alert("Error saving: " + err.message);
    }
  }

  async function toggleDone(todo) {
    const targetUid = todo.isShared ? ownerUid : uid;
    const nowDone = !todo.done;
    await updateDoc(doc(db, "users", targetUid, "todos", todo.id), { done: nowDone });
    if (nowDone && todo.recurrence) {
      await addDoc(collection(db, "users", targetUid, "todos"), {
        list: todo.list,
        text: todo.text,
        categoryId: todo.categoryId || null,
        due: computeNextDue(todo.due, todo.recurrence),
        done: false,
        recurrence: todo.recurrence,
        createdAt: serverTimestamp(),
      });
    }
    if (todo.workbenchProjectId && todo.workbenchMilestoneId) {
      await updateDoc(doc(db, "users", targetUid, "workbench", todo.workbenchProjectId, "milestones", todo.workbenchMilestoneId), { done: nowDone });
    }
  }

  function removeTodo(todoId) {
    const todo = currentTodos.find(t => t.id === todoId);
    if (!todo) return false;

    if (todo.isShared) {
      alert("Only the Owner can delete shared tasks.");
      return false;
    }

    deleteDoc(doc(db, "users", uid, "todos", todoId)).catch((err) => {
      console.error("Delete failed:", err);
    });
    return true;
  }

  async function editTodo(id, text, due, categoryId) {
    const todo = currentTodos.find(t => t.id === id);
    const targetUid = todo?.isShared ? ownerUid : uid;
    await updateDoc(doc(db, "users", targetUid, "todos", id), { text, due, categoryId: categoryId ?? null });
  }

  async function setTimeSensitive(todo, timeValue) {
    if (!timeValue) return;
    const targetUid = todo.isShared ? ownerUid : uid;
    const now = new Date();
    const baseDate = todo.due || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const notifyAt = `${baseDate}T${timeValue}:00`;
    await updateDoc(doc(db, "users", targetUid, "todos", todo.id), {
      timeSensitive: true,
      notifyAt,
      notified: false,
    });
    setSettingTimeFor(null);
    setDraftTimeValue("");
  }
  async function clearTimeSensitive(todo) {
    const targetUid = todo.isShared ? ownerUid : uid;
    await updateDoc(doc(db, "users", targetUid, "todos", todo.id), {
      timeSensitive: false,
      notifyAt: null,
      notified: false,
    });
    setSettingTimeFor(null);
    setDraftTimeValue("");
  }


  // ---------- Thoughts ----------
  async function addPerson(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = people.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;
    const used = people.map((p) => p.color);
    const color = PALETTE_ORDER.find((c) => !used.includes(c)) || PALETTE_ORDER[people.length % 4];
    const ref = await addDoc(collection(db, "users", uid, "people"), { name: trimmed, color, createdAt: serverTimestamp() });
    return ref.id;
  }

  async function deletePerson(personId) {
    await deleteDoc(doc(db, "users", uid, "people", personId));
    const affected = thoughts.filter((t) => t.personId === personId);
    await Promise.all(affected.map((t) => updateDoc(doc(db, "users", uid, "thoughts", t.id), { personId: null })));
    if (thoughtPersonId === personId) setThoughtPersonId(null);
  }

  async function addThought() {
    const text = thoughtDraft.trim();
    if (!text) return;
    await addDoc(collection(db, "users", uid, "thoughts"), {
      text, personId: thoughtPersonId, due: thoughtDue || null, done: false, createdAt: serverTimestamp(),
    });
    setThoughtDraft("");
    setThoughtDue("");
  }

  async function toggleThoughtDone(thought) {
    await updateDoc(doc(db, "users", uid, "thoughts", thought.id), { done: !thought.done });
  }

  async function removeThought(id) {
    await deleteDoc(doc(db, "users", uid, "thoughts", id));
  }

  async function editThought(id, text, due) {
    await updateDoc(doc(db, "users", uid, "thoughts", id), { text, due });
  }

  async function assignPerson(thoughtId, personId) {
    await updateDoc(doc(db, "users", uid, "thoughts", thoughtId), { personId });
  }

  async function confirmNewPersonForCapture() {
    const id = await addPerson(newPersonName);
    if (id) setThoughtPersonId(id);
    setNewPersonName("");
    setShowNewPerson(false);
  }

  async function handleBrainDumpResult(parsed) {
    if (parsed.itemType === "todo") {
      setActiveList(parsed.list);
      setDraft(parsed.text);
      setDraftDue(parsed.dueDate || "");
    } else {
      setActiveList("thoughts");
      setThoughtDraft(parsed.text);
      setThoughtDue(parsed.dueDate || "");
      if (parsed.personName) {
        const id = await addPerson(parsed.personName);
        setThoughtPersonId(id);
      } else {
        setThoughtPersonId(null);
      }
    }
  }

  // ---------- Drag and drop (shared) ----------
  function handleDragStart(e, id, kind) {
    draggedId.current = id;
    draggedKind.current = kind;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(id)); } catch (err) {}
  }

  function handleDrop(e, zoneKey, targetId, kind) {
    e.preventDefault();
    setDragOverZone(null);
    const id = draggedId.current;
    const draggedFromKind = draggedKind.current;
    draggedId.current = null;
    draggedKind.current = null;
    if (id == null || draggedFromKind !== kind) return;
    if (kind === "thought") assignPerson(id, targetId);
  }

  function sortTodosFlat(items) {
    return [...items].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return toMillis(a.createdAt) - toMillis(b.createdAt);
    });
  }

  const filteredTodos = categoryFilter.length === 0
    ? currentTodos
    : currentTodos.filter((t) => categoryFilter.includes(t.categoryId));
  const sortedTodos = sortTodosFlat(filteredTodos);

  // Recently used = categories whose most recently created todo is newest.
  // Categories never used sink to the end.
  function recentCategories(limit) {
    const lastUsed = {};
    currentTodos.forEach((t) => {
      if (!t.categoryId) return;
      const ms = toMillis(t.createdAt);
      if (!lastUsed[t.categoryId] || ms > lastUsed[t.categoryId]) lastUsed[t.categoryId] = ms;
    });
    return [...currentCategories]
      .sort((a, b) => (lastUsed[b.id] || -1) - (lastUsed[a.id] || -1))
      .slice(0, limit);
  }

  function sortByDue(items) {
    return [...items].sort((a, b) => {
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return toMillis(a.createdAt) - toMillis(b.createdAt);
    });
  }

  function personSortKey(items) {
    if (items.length === 0) return [2, 0];
    const dated = items.filter((t) => t.due).map((t) => t.due);
    if (dated.length > 0) return [0, dated.sort()[0]];
    return [1, 0];
  }

  const thoughtGroups = [
    { key: UNSORTED, name: "Unassigned", color: null, items: sortByDue(thoughts.filter((t) => !t.personId)) },
    ...people
      .map((p) => ({
        key: p.id, name: p.name, color: PALETTE[p.color],
        items: sortByDue(thoughts.filter((t) => t.personId === p.id)), refId: p.id,
      }))
      .filter((group) => group.items.length > 0)
      .sort((a, b) => {
        const [tierA, valA] = personSortKey(a.items);
        const [tierB, valB] = personSortKey(b.items);
        if (tierA !== tierB) return tierA - tierB;
        if (tierA === 0) return valA.localeCompare(valB);
        return 0;
      }),
  ];

  const isThoughts = activeList === "thoughts";
  const isWorkbench = activeList === "workbench";

  if (page === "budget") {
    const budgetDocRef = (access?.role === "guardian" || access?.role === "assistant")
      ? doc(db, "personalBudgets", uid)
      : doc(db, "households", "seabaugh");
    const budgetTitle = (access?.role === "guardian" || access?.role === "assistant") ? "Family Budget" : "Seabaugh Family";
    return (
      <BudgetGate onCancel={() => setPage("main")}>
        <Budget onBack={() => setPage("main")} budgetRef={budgetDocRef} title={budgetTitle} />
      </BudgetGate>
    );
  }
  if (page === "sharedBudget") {
    return (
      <BudgetGate onCancel={() => setPage("main")}>
        <Budget onBack={() => setPage("main")} budgetRef={doc(db, "households", "seabaugh")} title="Seabaugh Family" />
      </BudgetGate>
    );
  }
  if (page === "access") {
    return <AccessScreen db={db} currentRole={access?.role} onClose={() => setPage("main")} />;
  }
if (page === "nightly") {
    return <Nightly uid={uid} onBack={() => setPage("main")} />;
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: `radial-gradient(circle at 15% 0%, ${theme.gradA} 0%, ${theme.gradB} 45%, ${theme.gradC} 100%)`,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <style>{`
        * { box-sizing: border-box; }
        input:focus, textarea:focus, button:focus-visible { outline: 2px solid #2E7BFA; outline-offset: 2px; }
        input::placeholder, textarea::placeholder { color: #A89A8C; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 18px 64px" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: theme.gradB, marginLeft: -18, marginRight: -18, paddingLeft: 18, paddingRight: 18, paddingTop: 24, marginTop: -24, paddingBottom: 8 }}>
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src={orbitIcon} alt="" style={{ width: 28, height: 28 }} />
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 14, fontWeight: 600, letterSpacing: "0.06em", color: theme.accentPlum, textTransform: "uppercase" }}>Orbit</span>
            {true && (
              <button
                onClick={() => setPage("budget")}
                title="Budget"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 24, height: 24, borderRadius: "50%", marginLeft: 4,
                  border: "1px solid #D6DECD", background: theme.oldGreenBg, color: theme.oldGreenText,
                  fontSize: 13, fontWeight: 800, cursor: "pointer", padding: 0,
                }}
              >
                $
              </button>
            )}
            <button
              onClick={() => setPage("nightly")}
              title="Nightly Routine"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 24, height: 24, borderRadius: "50%", marginLeft: 4,
                border: `1px solid ${theme.borderSoft2}`,
                background: theme.paleYellowBg, color: theme.goldText,
                cursor: "pointer", padding: 0,
              }}
            >
              <Moon size={13} />
            </button>
            {access?.role === "guardian" && access?.budgetShared === true && (
              <button
                onClick={() => setPage("sharedBudget")}
                title="Shared Budget"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 24, height: 24, borderRadius: "50%", marginLeft: 4,
                  border: "1px solid #3D3229", background: theme.textPrimary, color: theme.cardBg,
                  fontSize: 13, fontWeight: 800, cursor: "pointer", padding: 0,
                }}
              >
                $
              </button>
            )}
            {(access?.role === "owner" || access?.role === "household") && (
              <button
                onClick={() => setPage("access")}
                title="Access"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 24, height: 24, borderRadius: "50%", marginLeft: 4,
                  border: "1px solid #E8DFD3", background: theme.oldPlumBg, color: theme.accentPlum,
                  cursor: "pointer", padding: 0,
                }}
              >
                <Settings size={13} />
              </button>
            )}
          </div>
          <UserMenu user={user} access={access} pendingBudgetRequest={pendingBudgetRequest} onRequestBudgetAccess={handleRequestBudgetAccess} />
        </div>

        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 600, letterSpacing: "-0.01em", color: theme.textPrimary, margin: 0 }}>
            {isThoughts ? "Clear Your Head" : "Today's Focus"}
          </h1>
          <p style={{ color: theme.textMuted, fontSize: 14, marginTop: 4 }}>
            {isThoughts
              ? `${thoughts.filter((t) => !t.done).length} thing${thoughts.filter((t) => !t.done).length === 1 ? "" : "s"} still on your mind`
              : `${activeCount} ${activeCount === 1 ? "task" : "tasks"} left in ${listMeta[activeList].label.toLowerCase()}`}
          </p>
        </div>

        {/* List switcher */}
        <div style={{ display: "flex", gap: 8, background: theme.borderSoft, padding: 6, borderRadius: 16, marginBottom: 16, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {Object.entries(listMeta).map(([key, meta]) => {
            const Icon = meta.icon;
            const active = activeList === key;
            return (
              <button
                key={key}
                onClick={() => setActiveList(key)}
                style={{
                  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "10px 14px", borderRadius: 12, border: "none", cursor: "pointer",
                  fontWeight: 700, fontSize: 13, transition: "all 0.15s ease", whiteSpace: "nowrap",
                  background: active ? theme.cardBg : "transparent",
                  color: active ? meta.color.text : theme.textMuted,
                  boxShadow: active ? "0 1px 3px rgba(58,44,30,0.08)" : "none",
                }}
              >
                <Icon size={16} />
                {meta.label}
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom: 14 }}>
          <BrainDumpButton
            knownPeopleNames={people.map((p) => p.name)}
            onResult={handleBrainDumpResult}
          />
        </div>
        {!isThoughts && !isWorkbench && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button
              onClick={() => setShowManageCats(true)}
              style={{ border: "none", background: "transparent", color: theme.textFaint, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 4 }}
            >
              Manage categories
            </button>
          </div>
        )}
        {!isThoughts && currentCategories.filter((cat) => currentTodos.some((t) => t.categoryId === cat.id && !t.done)).length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {currentCategories.filter((cat) => currentTodos.some((t) => t.categoryId === cat.id && !t.done)).map((cat) => {
              const active = categoryFilter.includes(cat.id);
              const palette = PALETTE[cat.color] || PALETTE.blue;
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter((prev) =>
                    prev.includes(cat.id) ? prev.filter((id) => id !== cat.id) : [...prev, cat.id]
                  )}
                  style={{
                    padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: active ? `1px solid ${palette.dot}` : "1px solid #E6DACB",
                    background: active ? palette.bg : "transparent",
                    color: active ? palette.text : theme.textFaint,
                  }}
                >
                    {cat.name}
                </button>
              );
            })}
            {categoryFilter.length > 0 && (
              <button
                onClick={() => setCategoryFilter([])}
                style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", background: "transparent", color: theme.oldOrangeText }}
              >
                Clear
              </button>
            )}
          </div>
        )}
        </div>

        {!isThoughts && !isWorkbench && (
          <>
            {!isThoughts && !isWorkbench && (
              <button
                onClick={() => setShowAddPanel(true)}
                style={{
                  position: "fixed", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28,
                  border: "none", background: listMeta[activeList].color.dot, color: theme.cardBg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(58,44,30,0.25)", cursor: "pointer", zIndex: 40,
                }}
              >
                <Plus size={26} />
              </button>
            )}
            {showAddPanel && (
              <div
                onClick={() => setShowAddPanel(false)}
                style={{ position: "fixed", inset: 0, background: "rgba(43,36,32,0.35)", zIndex: 49 }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "fixed", left: 0, right: 0, bottom: 0, background: theme.cardBg,
                    borderRadius: "20px 20px 0 0", padding: 18, boxShadow: "0 -4px 20px rgba(58,44,30,0.15)",
                    zIndex: 50, maxWidth: 680, margin: "0 auto",
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { addTodo(); setShowAddPanel(false); } }}
                      placeholder={`Add a ${listMeta[activeList].label.toLowerCase()} task...`}
                      style={{ flex: 1, border: "none", fontSize: 15, padding: "8px 4px", color: theme.textPrimary, background: "transparent" }}
                      autoFocus
                    />
                    <button
                      onClick={() => { addTodo(); setShowAddPanel(false); }}
                      disabled={!draft.trim()}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 10, border: "none",
                        background: draft.trim() ? listMeta[activeList].color.dot : theme.border, color: theme.cardBg,
                        cursor: draft.trim() ? "pointer" : "default", transition: "background 0.15s ease", flexShrink: 0,
                      }}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${theme.dividerSoft}`, alignItems: "center" }}>
                    <Calendar size={14} color={theme.textFaint} style={{ cursor: "pointer" }} onClick={() => draftDueRef.current?.showPicker?.()} />
                    <input ref={draftDueRef} type="date" value={draftDue} onChange={(e) => setDraftDue(e.target.value)} style={{ border: "none", fontSize: 13, color: theme.textSecondary, background: "transparent" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${theme.dividerSoft}`, alignItems: "center", flexWrap: "wrap" }}>
                    <Repeat size={14} color={theme.textFaint} />
                    {["none", "daily", "weekly", "monthly", "custom"].map((opt) => {
                      const active = opt === "none" ? !draftRecurrence : draftRecurrence?.type === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => setDraftRecurrence(
  opt === "none"
    ? null
    : opt === "custom"
      ? { type: "custom", intervalDays: draftRecurrence?.intervalDays || 2 }
      : { type: opt }
)}
                        style={{
                              padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            border: active ? `1px solid ${theme.accentPlum}` : `1px solid ${theme.border}`,
                            background: active ? theme.oldPlumBg : "transparent",
                            color: active ? theme.accentPlum : theme.textMuted,
                          }}
                        >
                          {opt === "none" ? "No repeat" : opt.charAt(0).toUpperCase() + opt.slice(1)}
                        </button>
                      );
                    })}
                    {draftRecurrence?.type === "custom" && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: theme.textMuted }}>
                        every
                        <input
                          type="number"
                          min="1"
                          value={draftRecurrence.intervalDays ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setDraftRecurrence({ type: "custom", intervalDays: raw === "" ? "" : parseInt(raw, 10) });
                        }}
                          style={{ width: 40, border: `1px solid ${theme.border}`, borderRadius: 6, padding: "2px 4px", fontSize: 12 }}
                        />
                        days
                      </span>
                    )}
                  </div>
                  <div style={{ paddingTop: 10, marginTop: 10, borderTop: `1px solid ${theme.dividerSoft}` }}>
                    <CategoryPicker
                      categories={currentCategories}
                      recent={recentCategories(4)}
                      selectedId={draftCategoryId}
                      onSelect={setDraftCategoryId}
                      showMore={showMoreCats}
                      setShowMore={setShowMoreCats}
                      showNewCat={showNewCat}
                      setShowNewCat={setShowNewCat}
                      newCatName={newCatName}
                      setNewCatName={setNewCatName}
                      onCreateCategory={addCategoryAndSelect}
                    />
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sortedTodos.length === 0 && (
                <div style={{ fontSize: 13, color: theme.textFainter, padding: "24px 12px", border: "1px dashed #E6DACB", borderRadius: 14, textAlign: "center" }}>
                  Nothing here yet — add your first task above.
                </div>
              )}
              {sortedTodos.map((todo) => {
                const overdue = isOverdue(todo.due, todo.done);
                const category = currentCategories.find((c) => c.id === todo.categoryId);
                if (settingTimeFor === todo.id) {
                  return (
                    <div key={todo.id} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
                      <Clock size={16} color={theme.goldDark} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: theme.textPrimary, flex: 1, minWidth: 0 }} className="truncate">{todo.text}</span>
                      <input
                        type="time"
                        autoFocus
                        value={draftTimeValue}
                        onChange={(e) => setDraftTimeValue(e.target.value)}
                        style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 13 }}
                      />
                      <button
                        onClick={() => setTimeSensitive(todo, draftTimeValue)}
                        disabled={!draftTimeValue}
                        style={{ background: theme.goldDark, color: theme.cardBg, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: draftTimeValue ? "pointer" : "default", opacity: draftTimeValue ? 1 : 0.5 }}
                      >
                        Set
                      </button>
                      {todo.timeSensitive && (
                        <button
                          onClick={() => clearTimeSensitive(todo)}
                          style={{ color: theme.accentRed, fontSize: 12, fontWeight: 700, padding: "6px 8px" }}
                        >
                          Remove
                        </button>
                      )}
                      <button onClick={() => { setSettingTimeFor(null); setDraftTimeValue(""); }} style={{ color: theme.textMuted, padding: 4 }}>
                        <X size={16} />
                      </button>
                    </div>
                  );
                }
                return (
                  <SwipeToDelete key={todo.id} onDelete={() => removeTodo(todo.id)} onSwipeRight={() => { setSettingTimeFor(todo.id); setDraftTimeValue(todo.notifyAt ? todo.notifyAt.slice(11, 16) : ""); }}>
                    <TaskCard
                      highlighted={overdue}
                      accentColor={listMeta[activeList].color}
                      done={todo.done}
                      text={todo.text}
                      due={todo.due}
                      categoryId={todo.categoryId || null}
                      categories={currentCategories}
                      hideTrash
                      onToggle={() => toggleDone(todo)}
                      onRemove={() => removeTodo(todo.id)}
                      onEdit={(text, due, categoryId) => editTodo(todo.id, text, due, categoryId)}
                      badge={
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          {todo.due && (
                            <Badge warn={overdue} icon={Calendar}>
                              {overdue ? `Overdue · ${fmtDate(todo.due)}` : fmtDate(todo.due)}
                            </Badge>
                          )}
                          {todo.timeSensitive && todo.notifyAt && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: theme.paleYellowBg2, color: theme.goldText, display: "flex", alignItems: "center", gap: 3 }}>
                              <Clock size={11} />
                              {(() => {
                            const [h, m] = todo.notifyAt.slice(11, 16).split(":").map(Number);
                            const ampm = h >= 12 ? "pm" : "am";
                            const h12 = h % 12 || 12;
                            return `${h12}:${String(m).padStart(2, "0")}${ampm}`;
                          })()}
                            </span>
                          )}
                          {todo.recurrence && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: theme.oldGreenBg, color: theme.oldGreenText, display: "flex", alignItems: "center", gap: 3 }}>
                              <Repeat size={11} />
                              {todo.recurrence.type}
                            </span>
                          )}
                          {category && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: PALETTE[category.color].bg, color: PALETTE[category.color].text }}>
                              {category.name}
                            </span>
                          )}
                        </div>
                      }
                    />
                  </SwipeToDelete>
                );
              })}
            </div>

            {showManageCats && (
              <ManageCategoriesModal
                categories={currentCategories}
                onClose={() => setShowManageCats(false)}
                onDelete={deleteCategory}
              />
            )}
          </>
        )}

        {isThoughts && (
          <>
            {/* Thought capture card */}
            <div style={{ background: theme.cardBg, borderRadius: 18, padding: 14, boxShadow: "0 1px 3px rgba(58,44,30,0.06), 0 1px 2px rgba(58,44,30,0.04)", marginBottom: 16, border: "1px solid #EFE6D9" }}>
              <textarea
                value={thoughtDraft}
                onChange={(e) => setThoughtDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addThought(); }
                }}
                placeholder="What's on your mind? Get it out of your head..."
                rows={2}
                style={{ width: "100%", border: "none", fontSize: 15, padding: "8px 4px", color: theme.textPrimary, background: "transparent", resize: "none", fontFamily: "inherit" }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 10, borderTop: `1px solid ${theme.dividerSoft}`, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 4 }}>
                  <Calendar size={14} color={theme.textFaint} style={{ cursor: "pointer" }} onClick={() => thoughtDueRef.current?.showPicker?.()} />
                  <input
                    ref={thoughtDueRef}
                    type="date"
                    value={thoughtDue}
                    onChange={(e) => setThoughtDue(e.target.value)}
                    style={{ border: "none", fontSize: 13, color: theme.textSecondary, background: "transparent" }}
                  />
                </div>
                <span style={{ fontSize: 12, color: theme.textFaint, marginRight: 2 }}>Talk to:</span>

                <PersonChip label="No one yet" selected={thoughtPersonId === null} onClick={() => setThoughtPersonId(null)} />
                {people.map((p) => (
                  <PersonChip key={p.id} label={p.name} color={PALETTE[p.color]} selected={thoughtPersonId === p.id} onClick={() => setThoughtPersonId(p.id)} />
                ))}

                {showNewPerson ? (
                  <InlineCreate
                    value={newPersonName}
                    onChange={setNewPersonName}
                    onConfirm={confirmNewPersonForCapture}
                    onCancel={() => { setShowNewPerson(false); setNewPersonName(""); }}
                    placeholder="Name"
                    small
                  />
                ) : (
                  <button
                    onClick={() => setShowNewPerson(true)}
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 999, border: "1px dashed #C4B7A9", background: "transparent", color: theme.textMuted, cursor: "pointer" }}
                  >
                    <UserPlus size={12} />
                    New person
                  </button>
                )}

                <button
                  onClick={addThought}
                  disabled={!thoughtDraft.trim()}
                  style={{
                    marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700,
                    padding: "8px 16px", borderRadius: 10, border: "none",
                    background: thoughtDraft.trim() ? PALETTE.yellow.dot : theme.border,
                    color: thoughtDraft.trim() ? theme.oldYellowText : theme.cardBg,
                    cursor: thoughtDraft.trim() ? "pointer" : "default",
                  }}
                >
                  <Plus size={15} />
                  Capture
                </button>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: theme.textFaint }}>Drag a thought onto a name to reassign it</span>
              <button
                onClick={() => setShowManagePeople(true)}
                style={{ border: "none", background: "transparent", color: theme.textFaint, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 4 }}
              >
                Manage people
              </button>
            </div>

            <GroupList
              groups={thoughtGroups}
              kind="thought"
              dragOverZone={dragOverZone}
              setDragOverZone={setDragOverZone}
              onDrop={handleDrop}
              onDeleteGroup={deletePerson}
              emptyUnsortedLabel="Nothing unassigned"
              emptyGroupLabel="Drop thoughts here"
              renderItem={(thought) => {
                const overdue = isOverdue(thought.due, thought.done);
                const stale = !thought.done && !thought.due && daysSince(thought.createdAt) >= STALE_DAYS;
                return (
                  <TaskCard
                    key={thought.id}
                    highlighted={overdue || stale}
                    accentColor={PALETTE.yellow}
                    done={thought.done}
                    text={thought.text}
                    due={thought.due}
                    onToggle={() => toggleThoughtDone(thought)}
                    onRemove={() => removeThought(thought.id)}
                    onEdit={(text, due) => editThought(thought.id, text, due)}
                    onDragStart={(e) => handleDragStart(e, thought.id, "thought")}
                    badge={
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {thought.due ? (
                          <Badge warn={overdue} icon={Calendar}>
                            {overdue ? `Overdue · ${fmtDate(thought.due)}` : fmtDate(thought.due)}
                          </Badge>
                        ) : (
                          <Badge warn={stale} icon={Clock}>
                            {stale ? `Sitting ${daysSince(thought.createdAt)}d · ${relativeTime(thought.createdAt)}` : relativeTime(thought.createdAt)}
                          </Badge>
                        )}
                      </div>
                    }
                  />
                );
              }}
            />

            {showManagePeople && (
              <ManagePeopleModal
                people={people}
                onClose={() => setShowManagePeople(false)}
                onDelete={deletePerson}
              />
            )}
          </>
        )}
        {isWorkbench && (
          <Workbench uid={uid} categories={ownCategories} todos={ownTodos} sharedUid={sharingWork ? ownerUid : null} sharedCategoryId={access?.sharedWorkCategoryId} sharedCategories={sharedCategories} />
        )}
      </div>
    </div>
  );
}

// ---------- Shared subcomponents ----------

function UserMenu({ user, access, pendingBudgetRequest, onRequestBudgetAccess }) {
  const [open, setOpen] = useState(false);
  const [showNotify, setShowNotify] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [notifySaved, setNotifySaved] = useState(false);
  useEffect(() => {
    if (showNotify) {
      const saved = localStorage.getItem("orbitWizardProgress_" + user.email);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setWizardStep(parsed.wizardStep || 1);
          setBotToken((parsed.botToken || "").match(/\d+:[A-Za-z0-9_-]+/) ? parsed.botToken.match(/\d+:[A-Za-z0-9_-]+/)[0] : (parsed.botToken || ""));
          setChatId(parsed.chatId || "");
          return;
        } catch (e) {}
      }
      getMyNotifyConfig(user.email).then((cfg) => {
        setBotToken((cfg.telegramBotToken || "").match(/\d+:[A-Za-z0-9_-]+/) ? cfg.telegramBotToken.match(/\d+:[A-Za-z0-9_-]+/)[0] : (cfg.telegramBotToken || ""));
        setChatId(cfg.telegramChatId || "");
      });
    }
  }, [showNotify]);
  useEffect(() => {
    if (showNotify) {
      localStorage.setItem("orbitWizardProgress_" + user.email, JSON.stringify({ wizardStep, botToken, chatId }));
    }
  }, [showNotify, wizardStep, botToken, chatId]);
  async function handleSaveNotify() {
    await saveMyNotifyConfig(user.email, { telegramBotToken: botToken, telegramChatId: chatId });
    localStorage.removeItem("orbitWizardProgress_" + user.email);
    setNotifySaved(true);
    setTimeout(() => setNotifySaved(false), 2000);
  }
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
        title={user.displayName || user.email}
      >
        {user.photoURL ? (
          <img src={user.photoURL} alt="" style={{ width: 34, height: 34, borderRadius: "50%", border: `2px solid ${theme.cardBg}`, boxShadow: "0 1px 3px rgba(58,44,30,0.15)" }} />
        ) : (
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: PALETTE.blue.dot, color: theme.cardBg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>
            {(user.displayName || user.email || "?")[0].toUpperCase()}
          </div>
        )}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 42, background: theme.cardBg, borderRadius: 12, border: `1px solid ${theme.borderSoft}`, boxShadow: "0 4px 16px rgba(58,44,30,0.1)", padding: 8, minWidth: 180, zIndex: 10 }}>
          <div style={{ padding: "6px 10px 10px", fontSize: 13, color: theme.textSecondary, fontWeight: 700, borderBottom: `1px solid ${theme.dividerSoft}`, marginBottom: 6 }}>
            {user.displayName || user.email}
          </div>
          <button
            onClick={() => signOut(auth)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", color: theme.accentRed, fontSize: 13, fontWeight: 700, padding: "8px 10px", borderRadius: 8, cursor: "pointer" }}
          >
            <LogOut size={14} />
            Sign out
          </button>
          <button
            onClick={() => { setShowNotify(true); setOpen(false); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", color: theme.textSecondary, fontSize: 13, fontWeight: 700, padding: "8px 10px", borderRadius: 8, cursor: "pointer" }}
          >
            Notification settings
          </button>
          <PaletteMenu />
          {access?.role === "guardian" && access?.budgetShared !== true && (
            <button
              onClick={() => { onRequestBudgetAccess(); setOpen(false); }}
              disabled={!!pendingBudgetRequest}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent",
                color: pendingBudgetRequest ? theme.accentPlum : theme.textSecondary,
                fontSize: 13, fontWeight: 700, padding: "8px 10px", borderRadius: 8,
                cursor: pendingBudgetRequest ? "default" : "pointer",
              }}
            >
              {pendingBudgetRequest ? "Budget request pending" : "Request shared budget access"}
            </button>
          )}
        </div>
      )}
      {showNotify && (
        <div onClick={() => { setShowNotify(false); setWizardStep(1); }} style={{ position: "fixed", inset: 0, background: "rgba(43,36,32,0.35)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: theme.cardBg, borderRadius: 16, padding: 20, width: 340, maxWidth: "90vw" }}>
            <h3 style={{ margin: "0 0 4px", fontFamily: "'Fraunces', Georgia, serif", fontSize: 17, color: theme.textPrimary }}>Connect Telegram</h3>
            <p style={{ fontSize: 11, color: theme.textFaint, margin: "0 0 16px" }}>Step {wizardStep} of 3</p>

            {wizardStep === 1 && (
              <>
                <p style={{ fontSize: 13, color: theme.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
                  First, create your own personal bot - this takes about a minute.
                </p>
                <ol style={{ fontSize: 13, color: theme.textSecondary, margin: "0 0 14px", paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>Open Telegram and search for <strong>@BotFather</strong></li>
                  <li>Send the message <strong>/newbot</strong></li>
                  <li>Give it any name and username it asks for</li>
                  <li>BotFather will reply with a long token, copy it</li>
                </ol>
                <input
                  placeholder="Paste your bot token here"
                  value={botToken}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const match = raw.match(/\d+:[A-Za-z0-9_-]+/);
                    setBotToken(match ? match[0] : raw);
                  }}
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E6DACB", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 14 }}
                />
                <button
                  onClick={async () => {
                    const webhookUrl = `https://orbit-telegram-webhook.javoseabaugh.workers.dev/${botToken.trim()}`;
                    try {
                      await fetch(`https://api.telegram.org/bot${botToken.trim()}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
                    } catch (e) {}
                    setWizardStep(2);
                  }}
                  disabled={!botToken.trim()}
                  style={{ width: "100%", border: "none", background: theme.accentPlum, color: theme.cardBg, fontSize: 13, fontWeight: 700, padding: "9px 10px", borderRadius: 8, cursor: botToken.trim() ? "pointer" : "default", opacity: botToken.trim() ? 1 : 0.5 }}
                >
                  Next
                </button>
              </>
            )}

            {wizardStep === 2 && (
              <>
                <p style={{ fontSize: 13, color: theme.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
                  Now let's find your Chat ID - this tells your bot who to message.
                </p>
                <ol style={{ fontSize: 13, color: theme.textSecondary, margin: "0 0 14px", paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>Open a chat with the bot you just created</li>
                  <li>Send it any message, like "hi"</li>
                  <li>It will reply instantly with your Chat ID</li>
                </ol>
                <input
                  placeholder="Paste your Chat ID here"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E6DACB", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 14 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setWizardStep(1)}
                    style={{ flex: 1, border: `1px solid ${theme.border}`, background: "transparent", color: theme.textSecondary, fontSize: 13, fontWeight: 700, padding: "9px 10px", borderRadius: 8, cursor: "pointer" }}
                  >
                    Back
                  </button>
                  <button
                    onClick={async () => { await handleSaveNotify(); setWizardStep(3); }}
                    disabled={!chatId.trim()}
                    style={{ flex: 1, border: "none", background: theme.accentPlum, color: theme.cardBg, fontSize: 13, fontWeight: 700, padding: "9px 10px", borderRadius: 8, cursor: chatId.trim() ? "pointer" : "default", opacity: chatId.trim() ? 1 : 0.5 }}
                  >
                    Save
                  </button>
                </div>
              </>
            )}

            {wizardStep === 3 && (
              <>
                <p style={{ fontSize: 13, color: theme.textSecondary, margin: "0 0 16px", lineHeight: 1.5 }}>
                  All set! You will now get Orbit notifications through your own Telegram bot.
                </p>
                <button
                  onClick={() => { setShowNotify(false); setWizardStep(1); }}
                  style={{ width: "100%", border: "none", background: theme.accentPlum, color: theme.cardBg, fontSize: 13, fontWeight: 700, padding: "9px 10px", borderRadius: 8, cursor: "pointer" }}
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GroupList({ groups, kind, dragOverZone, setDragOverZone, onDrop, onDeleteGroup, renderItem, emptyUnsortedLabel = "All caught up — nothing unsorted", emptyGroupLabel = "Drop tasks here" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {groups.map((group) => {
        const isOver = dragOverZone === group.key;
        const color = group.color;
        const isUnsorted = group.key === UNSORTED;
        return (
          <div
            key={group.key}
            onDragOver={(e) => { e.preventDefault(); if (dragOverZone !== group.key) setDragOverZone(group.key); }}
            onDragLeave={() => setDragOverZone((z) => (z === group.key ? null : z))}
            onDrop={(e) => onDrop(e, group.key, isUnsorted ? null : group.refId, kind)}
            style={{
              borderRadius: 16,
              border: isOver ? `2px dashed ${color ? color.dot : theme.textGray}` : "2px dashed transparent",
              background: isOver ? (color ? color.soft : theme.dividerSoft) : "transparent",
              padding: 8,
              transition: "all 0.12s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {color ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: color.dot }} /> : <Inbox size={13} color={theme.textFaint} />}
                <span style={{ fontSize: 13, fontWeight: 800, color: color ? color.text : theme.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {group.name}
                </span>
                <span style={{ fontSize: 12, color: theme.textFainter }}>{group.items.length}</span>
              </div>
              {!isUnsorted && (
                <button onClick={() => onDeleteGroup(group.refId)} style={{ border: "none", background: "transparent", color: theme.textFainter, cursor: "pointer", padding: 2 }} title="Delete">
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 8 }}>
              {group.items.length === 0 && (
                <div style={{ fontSize: 12, color: theme.textFainter, padding: "10px 12px", border: "1px dashed #E6DACB", borderRadius: 12, textAlign: "center" }}>
                  {isUnsorted ? emptyUnsortedLabel : emptyGroupLabel}
                </div>
              )}
              {group.items.map(renderItem)}
            </div>
          </div>
        );
      })}
    </div>
  );
}


function TaskCard({ text, due, done, categoryId, categories, onToggle, onRemove, onEdit, onDragStart, badge, highlighted, accentColor, hideTrash }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [editDue, setEditDue] = useState(due || "");
  const editDueRef = useRef(null);
  const [editCategoryId, setEditCategoryId] = useState(categoryId || null);

  function startEdit() {
    setEditText(text);
    setEditDue(due || "");
    setEditCategoryId(categoryId || null);
    setEditing(true);
  }

  function save() {
    const trimmed = editText.trim();
    if (!trimmed) { setEditing(false); return; }
    onEdit(trimmed, editDue || null, editCategoryId || null);
    setEditing(false);
  }

  function cancel() {
    setEditText(text);
    setEditDue(due || "");
    setEditCategoryId(categoryId || null);
    setEditing(false);
  }

  return (
    <div
      draggable={!editing && !!onDragStart}
      onDragStart={onDragStart}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        background: highlighted && !editing ? theme.softBg : theme.cardBg,
        border: highlighted && !editing ? "1px solid #F7C99A" : editing ? "1px solid #D9CDBE" : "1px solid #EFE6D9",
        borderRadius: 14, padding: "12px 12px 12px 8px",
        animation: "fadeIn 0.2s ease", boxShadow: "0 1px 2px rgba(58,44,30,0.03)", cursor: editing ? "default" : onDragStart ? "grab" : "default",
      }}
    >
      {onDragStart && <GripVertical size={14} color={theme.borderStrong} style={{ marginTop: 4, flexShrink: 0 }} />}

      {!editing && (
        <button
          onClick={onToggle}
          style={{
            width: 21, height: 21, borderRadius: "50%",
            border: `2px solid ${done ? accentColor.dot : theme.borderStrong}`,
            background: done ? accentColor.dot : theme.cardBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0, marginTop: 1, transition: "all 0.15s ease",
          }}
        >
          {done && <Check size={12} color={theme.cardBg} strokeWidth={3} />}
        </button>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
                if (e.key === "Escape") cancel();
              }}
              rows={2}
              style={{ width: "100%", border: "1px solid #E6DACB", borderRadius: 8, fontSize: 15, padding: "6px 8px", color: theme.textPrimary, background: theme.inputBg, resize: "none", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Calendar size={13} color={theme.textFaint} style={{ cursor: "pointer" }} onClick={() => editDueRef.current?.showPicker?.()} />
                <input ref={editDueRef} type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} style={{ border: "1px solid #E6DACB", borderRadius: 6, fontSize: 12, color: theme.textSecondary, padding: "3px 6px", background: theme.inputBg }} />
              </div>
              <button onClick={save} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, border: "none", background: theme.textPrimary, color: theme.cardBg, borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>
                <Check size={12} /> Save
              </button>
              <button onClick={cancel} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, border: "none", background: "transparent", color: theme.textMuted, borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>
                <X size={12} /> Cancel
              </button>
            </div>
            {categories && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Tag size={13} color={theme.textFaint} />
                <CategoryChip label="None" selected={!editCategoryId} onClick={() => setEditCategoryId(null)} />
                {categories.map((c) => (
                  <CategoryChip key={c.id} label={c.name} color={PALETTE[c.color]} selected={editCategoryId === c.id} onClick={() => setEditCategoryId(c.id)} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 15, color: done ? theme.textFaint : theme.textPrimary, textDecoration: done ? "line-through" : "none", lineHeight: 1.4, wordBreak: "break-word" }}>
              {text}
            </div>
            {badge && <div style={{ marginTop: 6 }}>{badge}</div>}
          </>
        )}
      </div>

      {!editing && (
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <button
            onClick={startEdit}
            style={{ border: "none", background: "transparent", color: theme.textFainter, cursor: "pointer", padding: 4 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = theme.textSecondary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = theme.textFainter)}
          >
            <Pencil size={14} />
          </button>
          {!hideTrash && (
            <button
              onClick={onRemove}
              style={{ border: "none", background: "transparent", color: theme.textFainter, cursor: "pointer", padding: 4 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = theme.accentRed)}
              onMouseLeave={(e) => (e.currentTarget.style.color = theme.textFainter)}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryChip({ label, color, selected, onClick }) {
  const bg = selected ? (color ? color.bg : theme.borderSoft) : theme.cardBg;
  const text = selected ? (color ? color.text : theme.textSecondary) : theme.textMuted;
  const border = selected ? "transparent" : theme.border;
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, padding: "5px 11px", borderRadius: 999, border: `1px solid ${border}`, background: bg, color: text, cursor: "pointer", transition: "all 0.15s ease" }}>
      {color && <span style={{ width: 6, height: 6, borderRadius: "50%", background: color.dot }} />}
      {label}
    </button>
  );
}

function CategoryPicker({ categories, recent, selectedId, onSelect, showMore, setShowMore, showNewCat, setShowNewCat, newCatName, setNewCatName, onCreateCategory }) {
  const [filter, setFilter] = useState("");
  const selected = categories.find((c) => c.id === selectedId);
  const alphabetical = [...categories].sort((a, b) => a.name.localeCompare(b.name));
  const filtered = alphabetical.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Tag size={13} color={theme.textFaint} style={{ marginRight: 2 }} />
        <CategoryChip label="None" selected={!selectedId} onClick={() => onSelect(null)} />
        {recent.map((c) => (
          <CategoryChip key={c.id} label={c.name} color={PALETTE[c.color]} selected={selectedId === c.id} onClick={() => onSelect(c.id)} />
        ))}
        {selected && !recent.some((c) => c.id === selected.id) && (
          <CategoryChip label={selected.name} color={PALETTE[selected.color]} selected onClick={() => onSelect(selected.id)} />
        )}
        <button
          onClick={() => setShowMore((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 999, border: "1px solid #E6DACB", background: theme.cardBg, color: theme.textMuted, cursor: "pointer" }}
        >
          More <ChevronDown size={12} style={{ transform: showMore ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
        </button>
      </div>

      {showMore && (
        <div style={{ marginTop: 10, padding: 10, background: theme.inputBg, border: "1px solid #EFE6D9", borderRadius: 12 }}>
          {categories.length > 5 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "6px 10px", background: theme.cardBg, border: "1px solid #E6DACB", borderRadius: 8 }}>
              <Search size={13} color={theme.textFaint} />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search categories..."
                style={{ flex: 1, border: "none", fontSize: 13, background: "transparent" }}
              />
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {filtered.length === 0 && (
              <span style={{ fontSize: 12, color: theme.textFainter }}>No categories match.</span>
            )}
            {filtered.map((c) => (
              <CategoryChip key={c.id} label={c.name} color={PALETTE[c.color]} selected={selectedId === c.id} onClick={() => onSelect(c.id)} />
            ))}
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #EFE6D9" }}>
            {showNewCat ? (
              <InlineCreate
                value={newCatName}
                onChange={setNewCatName}
                onConfirm={onCreateCategory}
                onCancel={() => { setShowNewCat(false); setNewCatName(""); }}
                placeholder="Category name"
                small
              />
            ) : (
              <button
                onClick={() => setShowNewCat(true)}
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 999, border: "1px dashed #C4B7A9", background: "transparent", color: theme.textMuted, cursor: "pointer" }}
              >
                <Plus size={12} /> New category
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ManagePeopleModal({ people, onClose, onDelete }) {
  const alphabetical = [...people].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(58,44,30,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: theme.cardBg, borderRadius: 18, padding: 20, width: "100%", maxWidth: 380, maxHeight: "70vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, fontWeight: 600, color: theme.textPrimary, margin: 0 }}>Manage people</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: theme.textFaint, cursor: "pointer", padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {alphabetical.length === 0 && (
          <p style={{ fontSize: 13, color: theme.textFaint }}>No one saved yet — add someone from the "New person" chip when capturing a thought.</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {alphabetical.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 10, background: theme.inputBg }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: PALETTE[p.color].text }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: PALETTE[p.color].dot }} />
                {p.name}
              </span>
              <button onClick={() => onDelete(p.id)} style={{ border: "none", background: "transparent", color: theme.textFainter, cursor: "pointer", padding: 4 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ManageCategoriesModal({ categories, onClose, onDelete }) {
  const alphabetical = [...categories].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(58,44,30,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: theme.cardBg, borderRadius: 18, padding: 20, width: "100%", maxWidth: 380, maxHeight: "70vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, fontWeight: 600, color: theme.textPrimary, margin: 0 }}>Manage categories</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: theme.textFaint, cursor: "pointer", padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {alphabetical.length === 0 && (
          <p style={{ fontSize: 13, color: theme.textFaint }}>No categories yet — create one from the "More" menu when adding a task.</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {alphabetical.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 10, background: theme.inputBg }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: PALETTE[c.color].text }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: PALETTE[c.color].dot }} />
                {c.name}
              </span>
              <button onClick={() => onDelete(c.id)} style={{ border: "none", background: "transparent", color: theme.textFainter, cursor: "pointer", padding: 4 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Badge({ children, warn, icon: Icon }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
      display: "inline-flex", alignItems: "center", gap: 4,
      background: warn ? theme.softBg2 : theme.dividerSoft, color: warn ? theme.oldOrangeText : theme.textSecondary,
    }}>
      <Icon size={11} />
      {children}
    </span>
  );
}

function InlineCreate({ value, onChange, onConfirm, onCancel, placeholder, small }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: theme.cardBg, border: "1px solid #E6DACB", borderRadius: 999, padding: "5px 6px 5px 14px" }}>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        style={{ border: "none", fontSize: 13, width: small ? 90 : 130, background: "transparent" }}
      />
      <button onClick={onConfirm} style={{ border: "none", background: theme.textPrimary, color: theme.cardBg, borderRadius: 999, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <Check size={14} />
      </button>
      <button onClick={onCancel} style={{ border: "none", background: "transparent", color: theme.textFaint, borderRadius: 999, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <X size={14} />
      </button>
    </div>
  );
}

function PersonChip({ label, color, selected, onClick }) {
  const bg = selected ? (color ? color.bg : theme.borderSoft) : theme.cardBg;
  const text = selected ? (color ? color.text : theme.textSecondary) : theme.textMuted;
  const border = selected ? "transparent" : theme.border;
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: `1px solid ${border}`, background: bg, color: text, cursor: "pointer", transition: "all 0.15s ease" }}>
      {color && <span style={{ width: 7, height: 7, borderRadius: "50%", background: color.dot }} />}
      {label}
    </button>
  );
}

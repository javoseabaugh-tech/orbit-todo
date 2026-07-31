import PaletteMenu from "./PaletteMenu";
import SwipeToDelete, { HOVER_CAPABLE } from "./SwipeToDelete";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onAuthStateChanged, signInWithRedirect, signOut } from "firebase/auth";
import {
  addDoc, collection, deleteDoc, doc, documentId, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import {
  Plus, Briefcase, User, Calendar, Check, Trash2,
  GripVertical, Inbox, X, MessageCircleMore, UserPlus, Clock, Pencil, LogOut,
  ChevronDown, Search, Tag, Settings, Repeat, FolderKanban,
  Moon, Eye, EyeOff, Wallet, Users,
} from "lucide-react";
import { auth, googleProvider, db } from "./firebase";
import BrainDumpButton from "./BrainDump";
import Budget from "./Budget";
import AccessScreen from "./AccessScreen";
import Workbench from "./Workbench";
import BudgetGate from "./BudgetGate";
import { suggestCategory } from "./gemini";
import { getMyNotifyConfig, saveMyNotifyConfig } from "./notifyConfig";
import { createBudgetAccessRequest, watchMyPendingBudgetRequest } from "./budgetAccessRequests";
import Nightly from "./Nightly";

// Liquid-glass theme layer. The category keys stay blue/green/orange/yellow —
// every saved category and person in Firestore references those keys directly,
// so they now index four hues spread around the active theme instead of the
// old fixed plum/sage/clay/ochre swatches.
import { PALETTE, theme, glass, SPRING, EASE_OUT, BLUR_LIST_LIMIT, applyThemeVars, applyThemeColor } from "./theme";
import {
  DISPLAY, MONO, display, mix, pillStyle, accentButtonStyle, fieldStyle, quietButtonStyle,
  IconAction, GlassBackdrop,
} from "./ui";
const PALETTE_ORDER = ["blue", "green", "orange", "yellow"];
const UNSORTED = "__unsorted__";
const STALE_DAYS = 7;

// Desktop is 1100px and up: three columns, no swipe, explicit row buttons.
// Bottom clearance inside every scroll region: the floating tab bar and FAB
// sit on top of the list, so the last row needs room to come out from under.
const LIST_TAIL = "calc(120px + env(safe-area-inset-bottom))";

const COLS_WIDE_QUERY = "(min-width: 1100px)"; // Work · Personal · Projects
const COLS_MED_QUERY = "(min-width: 760px)";   // Work · Personal
// How many todo columns fit the window: 3 (full desktop), 2 (Work + Personal
// side by side, bottom tab bar still present for the other sections), or 1
// (mobile — a single list plus the tab bar). Driven by width so the layout
// grows smoothly instead of snapping straight from mobile to three columns.
function useColumns() {
  const read = () => {
    if (typeof window === "undefined" || !window.matchMedia) return 1;
    if (window.matchMedia(COLS_WIDE_QUERY).matches) return 3;
    if (window.matchMedia(COLS_MED_QUERY).matches) return 2;
    return 1;
  };
  const [cols, setCols] = useState(read);
  useEffect(() => {
    if (!window.matchMedia) return;
    const wide = window.matchMedia(COLS_WIDE_QUERY);
    const med = window.matchMedia(COLS_MED_QUERY);
    const onChange = () => setCols(read());
    onChange();
    wide.addEventListener("change", onChange);
    med.addEventListener("change", onChange);
    return () => {
      wide.removeEventListener("change", onChange);
      med.removeEventListener("change", onChange);
    };
  }, []);
  return cols;
}

const GLOBAL_CSS = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  /* The app is a fixed-height shell: chrome stays put, only the lists scroll.
     dvh so mobile browser chrome collapsing doesn't clip the tab bar. */
  .orbit-shell { height: 100vh; height: 100dvh; }
  .orbit-scroll {
    overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
  }
  input:focus, textarea:focus, select:focus { outline: none; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
    outline: 2px solid var(--ac); outline-offset: 2px;
  }
  input::placeholder, textarea::placeholder { color: var(--tx4); }
  ::selection { background: var(--acs); color: var(--tx); }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: var(--gb); border-radius: 99px; }
  ::-webkit-scrollbar-track { background: transparent; }
  @keyframes drift1 { 0%,100% { transform: translate3d(0,0,0) scale(1) } 33% { transform: translate3d(9vw,7vh,0) scale(1.18) } 66% { transform: translate3d(-6vw,11vh,0) scale(.9) } }
  @keyframes drift2 { 0%,100% { transform: translate3d(0,0,0) scale(1.05) } 33% { transform: translate3d(-11vw,-6vh,0) scale(.88) } 66% { transform: translate3d(7vw,-10vh,0) scale(1.2) } }
  @keyframes drift3 { 0%,100% { transform: translate3d(0,0,0) scale(.95) } 50% { transform: translate3d(-8vw,-12vh,0) scale(1.25) } }
  @keyframes screenIn { from { opacity: 0; transform: translateY(14px) scale(.985) } to { opacity: 1; transform: none } }
  @keyframes rowIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
  @keyframes sheetIn { from { transform: translateY(102%) } to { transform: translateY(0) } }
  /* Mobile add-sheet drops from the top instead, so the on-screen keyboard
     can't cover the field you're typing into. */
  @keyframes sheetInTop { from { transform: translateY(-102%) } to { transform: translateY(0) } }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes popIn { from { opacity: 0; transform: translateY(-6px) scale(.94) } to { opacity: 1; transform: none } }
  @keyframes burst { 0% { opacity: .9; transform: scale(.4) } 100% { opacity: 0; transform: scale(2.6) } }
  @keyframes tick { 0% { transform: scale(.2) rotate(-25deg); opacity: 0 } 55% { transform: scale(1.3) rotate(6deg); opacity: 1 } 100% { transform: scale(1) rotate(0) } }
  @keyframes shimmer { 0% { transform: translateX(-120%) } 100% { transform: translateX(320%) } }
  @keyframes listen { 0%,100% { transform: scaleY(.35) } 50% { transform: scaleY(1) } }
  @keyframes spin { to { transform: rotate(360deg) } }
  @keyframes glowPulse { 0%,100% { opacity: .35 } 50% { opacity: .85 } }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important; animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
    }
  }
`;

// The Orbit mark. The source art isn't square (1082x991), so it's boxed at
// `size` and contained rather than stretched to fit. Only the mark is used —
// the lockup's "Orbit" wordmark is dark charcoal and would disappear against
// the dark theme, so the wordmark beside this stays CSS text that follows the
// theme. Rendered from the 256px build (scripts/make-icons.mjs), which is
// ample for the 26px bar icon and the 62px sign-in one even at 3x.
function OrbitMark({ size = 26 }) {
  return (
    <img
      src="/logo-mark-256.png?v=4"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{
        flexShrink: 0, width: size, height: size, objectFit: "contain",
        filter: `drop-shadow(0 4px 14px ${mix(theme.accentPlum, 45)})`,
      }}
    />
  );
}

// 34px glass squircle used for every top-bar destination.
function ChromeButton({ title, onClick, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 34, height: 34, borderRadius: 12, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: theme.textSecondary, background: theme.glassFill,
        border: `1px solid ${theme.glassBorder}`,
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        boxShadow: `inset 0 1px 0 ${theme.glassSpec}`,
        cursor: "pointer", transition: `transform .3s ${SPRING}`,
      }}
    >
      {children}
    </button>
  );
}

function fmtDate(d) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// "2026-07-30T14:30:00" -> "2:30pm"
function fmtTime(notifyAt) {
  const [h, m] = notifyAt.slice(11, 16).split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${ampm}`;
}

// Minutes past midnight for a time-sensitive todo, or null if it has no time.
// Used to lead a date group chronologically.
function timeOfDay(todo) {
  if (!todo.timeSensitive || !todo.notifyAt) return null;
  const [h, m] = todo.notifyAt.slice(11, 16).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function isOverdue(dueDate, done) {
  if (!dueDate || done) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate + "T00:00:00") < today;
}

function isFutureDate(dueDate) {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate + "T00:00:00") > today;
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
function useUserCollection(uid, name, filter) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!uid) {
      setItems([]);
      return;
    }
    let q;
    if (filter?.docId) {
      q = query(collection(db, "users", uid, name), where(documentId(), "==", filter.docId));
    } else if (filter?.categoryField) {
      q = query(
        collection(db, "users", uid, name),
        where("categoryId", "==", filter.categoryField),
        orderBy("createdAt", "asc")
      );
    } else {
      q = query(collection(db, "users", uid, name), orderBy("createdAt", "asc"));
    }
    const unsub = onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error(`${name} snapshot error`, err)
    );
    return () => unsub();
  }, [uid, name, filter?.docId, filter?.categoryField]);
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

  // Theme tokens are published as CSS custom properties on <html> so the
  // global stylesheet (placeholders, selection, scrollbars) can reference them
  // without importing `theme`. The body colours match so overscroll doesn't
  // flash white on iOS.
  useEffect(() => {
    applyThemeVars(document.documentElement);
    applyThemeColor();
    document.documentElement.style.setProperty("--gl2", theme.inputBg);
    document.body.style.background = theme.gradB;
    document.body.style.color = theme.textPrimary;
  }, []);

  let screen;
  if (user === undefined) screen = <CenteredScreen>Loading…</CenteredScreen>;
  else if (user === null) screen = <SignInScreen blocked={blocked} />;
  else screen = <TodoApp user={user} access={access} />;

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      {screen}
    </>
  );
}

function CenteredScreen({ children }) {
  return (
    <div style={{ position: "relative", minHeight: "100vh", fontFamily: "'Geist', system-ui, sans-serif" }}>
      <GlassBackdrop />
      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: theme.textMuted, fontSize: 14 }}>
        {children}
      </div>
    </div>
  );
}

function SignInScreen({ blocked }) {
  const [error, setError] = useState(blocked ? "This app is private — that account isn't authorized." : null);

  async function handleSignIn() {
    setError(null);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (e) {
      setError("Sign-in failed. Please try again.");
      console.error(e);
    }
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh", color: theme.textPrimary, fontFamily: "'Geist', system-ui, sans-serif" }}>
      <GlassBackdrop />
      <div style={{
        position: "relative", zIndex: 1, minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 28,
        animation: `screenIn .5s ${EASE_OUT}`,
      }}>
        <div style={{
          ...glass.raised, width: "100%", maxWidth: 380, padding: "38px 30px 30px",
          borderRadius: 32, textAlign: "center",
        }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <OrbitMark size={62} />
          </div>
          <h1 style={{ ...display(34, "-.03em"), margin: "0 0 8px", lineHeight: 1 }}>Orbit</h1>
          <p style={{ margin: "0 0 28px", fontSize: 14.5, color: theme.textMuted, lineHeight: 1.5 }}>
            Everything you're carrying — work, life and the things still on your mind.
          </p>
          <button
            onClick={handleSignIn}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%",
              padding: "14px 18px", borderRadius: 16, fontSize: 14.5, fontWeight: 600,
              color: theme.textPrimary, background: theme.glassHigh,
              border: `1px solid ${theme.glassBorder}`,
              backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
              boxShadow: `inset 0 1px 0 ${theme.glassSpec}`, cursor: "pointer",
            }}
          >
            <GoogleIcon />
            Sign in with Google
          </button>
          {error && <p style={{ color: theme.accentRed, fontSize: 12.5, margin: "14px 0 0" }}>{error}</p>}
          <p style={{ margin: "16px 0 0", fontSize: 11.5, color: theme.textFainter }}>
            Orbit is private. Only invited accounts can sign in.
          </p>
        </div>
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
  const sharedTodos = useUserCollection(sharingWork ? ownerUid : null, "todos", { categoryField: access?.sharedWorkCategoryId });
  const ownCategories = useUserCollection(uid, "categories");
  const sharedCategories = useUserCollection(sharingWork ? ownerUid : null, "categories", { docId: access?.sharedWorkCategoryId });
  const thoughts = useUserCollection(uid, "thoughts");
  const people = useUserCollection(uid, "people");

  const cols = useColumns();
  const isDesktop = cols === 3;  // full three-column desktop layout
  const twoCol = cols === 2;     // Work + Personal side by side
  const panelCols = cols >= 2;   // render each list as a titled column panel
  // Swipe is mobile-only, so anywhere it isn't the interaction — desktop, or a
  // narrow window driven by a mouse — rows show explicit clock/trash buttons.
  const showRowButtons = isDesktop || HOVER_CAPABLE;
  const [activeList, setActiveList] = useState("work");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [sortingList, setSortingList] = useState(null);
  const [captureOpen, setCaptureOpen] = useState(true);
  const [expandedFilters, setExpandedFilters] = useState({});
  const [addTarget, setAddTarget] = useState("work"); // which list the open add panel writes to
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

  // Every screen is now a fixed-height shell with its own internal scrolling,
  // so the document must never scroll behind one (that's what produces the
  // second, rubber-banding scrollbar).
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const [draft, setDraft] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const draftDueRef = useRef(null);
  const [draftCategoryId, setDraftCategoryId] = useState(null);
  const [draftRecurrence, setDraftRecurrence] = useState(null);
  const [newCatName, setNewCatName] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [showMoreCats, setShowMoreCats] = useState(false);
  const [showManagePeople, setShowManagePeople] = useState(false);

  // ---------- Layout (>=1100px = desktop columns) ----------
  // Which column last had a click — used as the target for the shared "+"
  // button. Category filters are per-list on both layouts: filtering Work must
  // never affect Personal. Workbench has no entry since it doesn't use chips.
  const [focusedColumn, setFocusedColumn] = useState("work");
  const [desktopCategoryFilters, setDesktopCategoryFilters] = useState({ work: [], personal: [] });
  const [desktopManageCatsFor, setDesktopManageCatsFor] = useState(null);
  const [showThoughtsPanel, setShowThoughtsPanel] = useState(false);

  const [thoughtDraft, setThoughtDraft] = useState("");
  const [thoughtDue, setThoughtDue] = useState("");
  const thoughtDueRef = useRef(null);
  const [thoughtPersonId, setThoughtPersonId] = useState(null);
  const [newPersonName, setNewPersonName] = useState("");
  const [showNewPerson, setShowNewPerson] = useState(false);

  const [dragOverZone, setDragOverZone] = useState(null);
  const draggedId = useRef(null);
  const draggedKind = useRef(null);
  const draggedTodoRef = useRef(null);
  const [todoDragState, setTodoDragState] = useState(null);

  // Hide/show future-dated todos. Persisted on the user's own access doc so
  // it stays in sync across devices (same doc already used for uid
  // self-registration). Overdue and undated todos always stay visible —
  // only strictly-future due dates get hidden.
  const hideFutureTodos = access?.hideFutureTodos === true;
  async function toggleHideFutureTodos() {
    try {
      await setDoc(doc(db, "access", emailToDocId(user.email)), { hideFutureTodos: !hideFutureTodos }, { merge: true });
    } catch (err) {
      console.error("hideFutureTodos toggle error", err);
    }
  }

  const listMeta = {
    work: { label: "Work", icon: Briefcase, color: PALETTE.blue },
    personal: { label: "Personal", icon: User, color: PALETTE.green },
    thoughts: { label: "Thoughts", icon: MessageCircleMore, color: PALETTE.yellow },
    workbench: { label: "Projects", icon: FolderKanban, color: PALETTE.orange },
  };

  // ---------- Work / Personal ----------
  // Generalized per-list helpers. The mobile view below keeps using
  // activeList-scoped currentTodos/currentCategories (unchanged output —
  // just now sourced from these), while the desktop columns call these
  // directly for "work"/"personal"/"workbench" independently and
  // simultaneously.
  function uidForList(listKey) {
    return listKey === "work" && sharingWork ? ownerUid : uid;
  }
  function todosForList(listKey) {
    if (listKey === "work" && sharingWork) {
      const own = ownTodos.filter((t) => t.list === "work");
      const shared = sharedTodos
        .filter((t) => t.list === "work" && t.categoryId === access?.sharedWorkCategoryId)
        .map((t) => ({ ...t, isShared: true }));
      return [...own, ...shared];
    }
    return ownTodos.filter((t) => t.list === listKey);
  }
  function categoriesForList(listKey) {
    const source = listKey === "work" && sharingWork ? sharedCategories : ownCategories;
    return source.filter((c) => c.list === listKey);
  }
  function dateFilterList(items) {
    return hideFutureTodos ? items.filter((t) => !isFutureDate(t.due)) : items;
  }

  // Both layouts now render lists through renderTodoColumn, so a todo has to
  // be findable regardless of which list is on screen.
  function findTodo(id) {
    const own = ownTodos.find((t) => t.id === id);
    if (own) return own;
    const shared = sharedTodos.find((t) => t.id === id);
    return shared ? { ...shared, isShared: true } : null;
  }

  const currentTodos = todosForList(activeList);
  const currentCategories = categoriesForList(activeList);
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

  async function addCategoryToList(listKey, name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const targetUid = uidForList(listKey);
    const existingCount = categoriesForList(listKey).length;
    const ref = await addDoc(collection(db, "users", targetUid, "categories"), {
      list: listKey,
      name: trimmed,
      color: PALETTE_ORDER[existingCount % 4],
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async function addCategory() {
    const id = await addCategoryToList(activeList, newCatName);
    if (id) {
      setNewCatName("");
      setShowNewCat(false);
    }
    return id;
  }

  async function addCategoryAndSelect() {
    const id = await addCategoryToList(addTarget, newCatName);
    if (id) {
      setNewCatName("");
      setShowNewCat(false);
      setDraftCategoryId(id);
    }
    setShowMoreCats(false);
  }

  async function deleteCategoryFromList(listKey, catId) {
    const targetUid = uidForList(listKey);
    await deleteDoc(doc(db, "users", targetUid, "categories", catId));
    const affected = todosForList(listKey).filter((t) => t.categoryId === catId);
    await Promise.all(affected.map((t) => {
      const tUid = t.isShared ? ownerUid : uid;
      return updateDoc(doc(db, "users", tUid, "todos", t.id), { categoryId: null });
    }));
  }

  async function deleteCategory(catId) {
    await deleteCategoryFromList(activeList, catId);
  }

  function computeNextDue(currentDue, recurrence) {
    const base = currentDue ? new Date(currentDue + "T00:00:00") : new Date();
    if (recurrence.type === "daily") base.setDate(base.getDate() + 1);
    else if (recurrence.type === "weekly") base.setDate(base.getDate() + 7);
    else if (recurrence.type === "monthly") base.setMonth(base.getMonth() + 1);
    else if (recurrence.type === "custom") base.setDate(base.getDate() + (recurrence.intervalDays || 1));
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
  }

  // Generalized add — writes to the caller-specified list. Always saves to
  // the signed-in user's own private list (uid), matching the original:
  // assistants keep their own copy even when adding into a shared category.
  async function addTodoToList(listKey, { text, due, categoryId, recurrence }) {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await addDoc(collection(db, "users", uid, "todos"), {
        list: listKey,
        text: trimmed,
        categoryId: categoryId || null,
        due: due || null,
        done: false,
        recurrence: recurrence
          ? recurrence.type === "custom"
            ? { type: "custom", intervalDays: Number(recurrence.intervalDays) || 1 }
            : recurrence
          : null,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      alert("Error saving: " + err.message);
    }
  }

  async function addTodo() {
    await addTodoToList(addTarget, {
      text: draft, due: draftDue, categoryId: draftCategoryId, recurrence: draftRecurrence,
    });
    setDraft("");
    setDraftDue("");
    setDraftCategoryId(null);
    setDraftRecurrence(null);
    setShowAddPanel(false);
  }

  // Backing out of the add sheet throws the draft away, so an accidental tap on
  // the + leaves nothing behind to clean up next time it opens.
  function closeAddPanel() {
    setDraft("");
    setDraftDue("");
    setDraftCategoryId(null);
    setDraftRecurrence(null);
    setShowNewCat(false);
    setNewCatName("");
    setShowMoreCats(false);
    setShowAddPanel(false);
  }

  // Esc backs out from anywhere in the sheet, not just the title field.
  useEffect(() => {
    if (!showAddPanel) return;
    const onKey = (e) => { if (e.key === "Escape") closeAddPanel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAddPanel]);

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
    const todo = findTodo(todoId);
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
    const todo = findTodo(id);
    const targetUid = todo?.isShared ? ownerUid : uid;
    await updateDoc(doc(db, "users", targetUid, "todos", id), { text, due, categoryId: categoryId ?? null });
  }

  // The "Sort by time" button. Restamps `order` within every date of one list:
  // time-sensitive todos lead, earliest first, then the rest in the order they
  // were created. Dates themselves are already ordered by the `due` comparison
  // in sortTodosFlat, so only the within-date sequence needs writing.
  //
  // This is the only thing that reorders on its own, and only when pressed —
  // drags afterwards overwrite `order` freely, and pressing again re-sorts.
  async function sortListByTime(listKey) {
    if (sortingList) return;
    setSortingList(listKey);
    try {
      const byDate = new Map();
      todosForList(listKey).filter((t) => !t.done).forEach((t) => {
        const key = t.due || "";
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key).push(t);
      });

      const byAge = (a, b) => toMillis(a.createdAt) - toMillis(b.createdAt);
      const writes = [];
      byDate.forEach((group) => {
        const timed = group
          .filter((t) => timeOfDay(t) !== null)
          .sort((a, b) => timeOfDay(a) - timeOfDay(b) || byAge(a, b));
        const untimed = group.filter((t) => timeOfDay(t) === null).sort(byAge);
        [...timed, ...untimed].forEach((t, i) => {
          const targetUid = t.isShared ? ownerUid : uid;
          writes.push(updateDoc(doc(db, "users", targetUid, "todos", t.id), { order: (i + 1) * 10 }));
        });
      });
      await Promise.all(writes);
    } catch (err) {
      alert("Could not sort: " + err.message);
    } finally {
      setSortingList(null);
    }
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

  // Same-due-date drag-to-reorder for todos, implemented with Pointer
  // Events (not native HTML5 drag-and-drop) so it behaves consistently on
  // both mouse and touch/mobile, and so the dragged row visually follows
  // the pointer instead of relying on the browser's native drag ghost
  // (which broke down once dragging only started from the small handle).
  function startTodoReorderDrag(e, todo, sortedList) {
    if (typeof e.button === "number" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const groupKey = todo.due || null;
    const group = sortedList.filter((t) => (t.due || null) === groupKey);
    if (group.length < 2) return;

    const rects = {};
    group.forEach((t) => {
      const el = document.querySelector(`[data-todo-id="${CSS.escape(String(t.id))}"]`);
      if (el) rects[t.id] = el.getBoundingClientRect();
    });
    const startY = e.clientY;
    let overId = todo.id;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    function pickOverId(pointerY) {
      const entries = group.map((t) => ({ id: t.id, rect: rects[t.id] })).filter((x) => x.rect);
      if (!entries.length) return overId;
      const first = entries[0], last = entries[entries.length - 1];
      if (pointerY <= first.rect.top + first.rect.height / 2) return first.id;
      if (pointerY >= last.rect.top + last.rect.height / 2) return last.id;
      for (const en of entries) {
        if (pointerY >= en.rect.top && pointerY < en.rect.top + en.rect.height) return en.id;
      }
      return overId;
    }

    function onMove(ev) {
      const deltaY = ev.clientY - startY;
      overId = pickOverId(ev.clientY);
      setTodoDragState({ id: todo.id, deltaY, overId });
    }

    async function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = prevUserSelect;
      setTodoDragState(null);
      if (overId != null && overId !== todo.id) {
        const ids = group.map((t) => t.id);
        const fromIdx = ids.indexOf(todo.id);
        const toIdx = ids.indexOf(overId);
        if (fromIdx !== -1 && toIdx !== -1) {
          const reordered = [...group];
          const [moved] = reordered.splice(fromIdx, 1);
          reordered.splice(toIdx, 0, moved);
          await Promise.all(reordered.map((t, i) => {
            const targetUid = t.isShared ? ownerUid : uid;
            return updateDoc(doc(db, "users", targetUid, "todos", t.id), { order: (i + 1) * 10 });
          }));
        }
      }
    }

    setTodoDragState({ id: todo.id, deltaY: 0, overId: todo.id });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function sortTodosFlat(items) {
    return [...items].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
      if (a.due && !b.due) return -1;
      if (!a.due && b.due) return 1;
      // Same due date (or both undated) - respect manual drag order within that
      // group, falling back to creation order for todos never manually reordered.
      // `order` is written by drags and by the Sort by time button; nothing
      // reorders on its own.
      const aOrder = typeof a.order === "number" ? a.order : null;
      const bOrder = typeof b.order === "number" ? b.order : null;
      if (aOrder !== null || bOrder !== null) {
        if (aOrder === null) return 1;
        if (bOrder === null) return -1;
        if (aOrder !== bOrder) return aOrder - bOrder;
      }
      return toMillis(a.createdAt) - toMillis(b.createdAt);
    });
  }

  // Recently used = categories whose most recently created todo is newest.
  // Categories never used sink to the end.
  function recentCategoriesForList(listKey, limit) {
    const listTodos = todosForList(listKey);
    const listCats = categoriesForList(listKey);
    const lastUsed = {};
    listTodos.forEach((t) => {
      if (!t.categoryId) return;
      const ms = toMillis(t.createdAt);
      if (!lastUsed[t.categoryId] || ms > lastUsed[t.categoryId]) lastUsed[t.categoryId] = ms;
    });
    return [...listCats]
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

  // Renders one list of todos — a glass column on desktop, the page body on
  // mobile. Category filters, sorting and the empty state are per-list; the
  // per-todo callbacks are shared with every other surface.
  function renderTodoColumn(listKey) {
    const meta = listMeta[listKey];
    const Icon = meta.icon;
    const accent = meta.color.dot;
    const colTodos = todosForList(listKey);
    const colCategories = categoriesForList(listKey);
    const colDateFiltered = dateFilterList(colTodos);
    const colFilter = desktopCategoryFilters[listKey] || [];
    const colFiltered = colFilter.length === 0
      ? colDateFiltered
      : colDateFiltered.filter((t) => colFilter.includes(t.categoryId));
    const colSorted = sortTodosFlat(colFiltered);
    const colActiveCount = colTodos.filter((t) => !t.done).length;
    const focused = isDesktop && focusedColumn === listKey;
    const chipCategories = colCategories.filter((cat) =>
      colDateFiltered.some((t) => t.categoryId === cat.id && !t.done)
    );

    function setColFilter(updater) {
      setDesktopCategoryFilters((prev) => ({ ...prev, [listKey]: updater(prev[listKey] || []) }));
    }

    // Category filters stay hidden per list by default so the chip row never
    // steals height from the tasks until asked for. The active-filter count
    // stays on the toggle so a filtered list never looks unfiltered while the
    // chips are hidden.
    const filtersOpen = expandedFilters[listKey] === true;
    const filtersButton = chipCategories.length > 0 && (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setExpandedFilters((prev) => ({ ...prev, [listKey]: !filtersOpen }));
        }}
        title={filtersOpen ? "Hide category filters" : "Show category filters"}
        style={{
          ...quietButtonStyle,
          display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
          color: colFilter.length ? theme.accentPlum : theme.textFainter,
        }}
      >
        <Tag size={12} />
        {colFilter.length ? `Filters · ${colFilter.length}` : "Filters"}
        <ChevronDown
          size={13}
          style={{ transform: filtersOpen ? "rotate(180deg)" : "none", transition: "transform .25s ease" }}
        />
      </button>
    );

    const sortingThis = sortingList === listKey;
    const sortButton = (
      <button
        onClick={(e) => { e.stopPropagation(); sortListByTime(listKey); }}
        disabled={!!sortingList}
        title="Put time-sensitive todos first within each date, earliest first"
        style={{
          ...quietButtonStyle,
          display: "flex", alignItems: "center", gap: 5,
          cursor: sortingList ? "default" : "pointer",
          opacity: sortingList && !sortingThis ? 0.4 : 1,
          color: sortingThis ? theme.accentPlum : theme.textFainter,
        }}
      >
        <Clock size={12} />
        {sortingThis ? "Sorting…" : "Sort by time"}
      </button>
    );

    return (
      <div
        key={listKey}
        onClick={isDesktop ? () => setFocusedColumn(listKey) : undefined}
        style={panelCols ? {
          ...glass.panel, flex: "1 1 0", minWidth: 0, padding: 16, borderRadius: 26,
          display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden",
          border: `1px solid ${focused ? accent : theme.glassBorder}`,
          boxShadow: focused
            ? `inset 0 1px 0 ${theme.glassSpec}, 0 0 0 3px ${mix(accent, 22)}, 0 18px 44px -26px ${theme.glassShadow}`
            : `inset 0 1px 0 ${theme.glassSpec}, 0 18px 44px -26px ${theme.glassShadow}`,
          transition: "border-color .3s ease, box-shadow .3s ease",
        } : { minWidth: 0, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        {panelCols ? (
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
            <Icon size={15} color={accent} />
            <span style={display(16)}>{meta.label}</span>
            <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11.5, color: theme.textFainter }}>
              {colActiveCount} left
            </span>
            {filtersButton}
            {sortButton}
            <button
              onClick={(e) => { e.stopPropagation(); setDesktopManageCatsFor(listKey); }}
              style={quietButtonStyle}
            >
              Categories
            </button>
          </div>
        ) : (
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, marginBottom: 10 }}>
            {filtersButton}
            {sortButton}
            <button onClick={() => setDesktopManageCatsFor(listKey)} style={quietButtonStyle}>
              Manage categories
            </button>
          </div>
        )}

        {chipCategories.length > 0 && filtersOpen && (
          <div style={{ flexShrink: 0, display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {chipCategories.map((cat) => {
              const on = colFilter.includes(cat.id);
              const palette = PALETTE[cat.color] || PALETTE.blue;
              return (
                <button
                  key={cat.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setColFilter((prev) => prev.includes(cat.id) ? prev.filter((id) => id !== cat.id) : [...prev, cat.id]);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 999,
                    fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                    color: on ? palette.text : theme.textMuted,
                    background: on ? palette.bg : theme.inputBg,
                    border: `1px solid ${on ? palette.dot : theme.glassBorder2}`,
                    backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                    transition: `all .25s ${SPRING}`,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: palette.dot }} />
                  {cat.name}
                </button>
              );
            })}
            {colFilter.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setColFilter(() => []); }}
                style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "none", background: "transparent", color: theme.accentRed }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* The only scrolling region on this screen. */}
        <div
          className="orbit-scroll"
          style={{
            flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 9,
            paddingBottom: panelCols ? 4 : LIST_TAIL,
          }}
        >
          {colSorted.length === 0 && (
            <div style={{ padding: "34px 16px", borderRadius: 20, border: `1px dashed ${theme.glassBorder2}`, textAlign: "center", fontSize: 13, color: theme.textFainter }}>
              {colFilter.length ? "Nothing matches those filters." : "Nothing here yet — tap + to add the first thing."}
            </div>
          )}
          {colSorted.map((todo, idx) => renderTodoRow(todo, colCategories, colSorted, idx))}
        </div>
      </div>
    );
  }

  // Thoughts, rendered identically by the mobile tab and the desktop drawer —
  // one implementation so the two can't drift apart.
  // Capture card and the "Manage people" row are chrome and stay put; only the
  // thoughts below them scroll. `listTail` is the bottom padding the scrolling
  // region needs to clear whatever floats over it (tab bar on mobile).
  function renderThoughts(listTail) {
    const captureReady = !!thoughtDraft.trim();

    // Minimised, the capture card collapses to a single tap-to-open bar so the
    // thought list gets the height back. Any draft is kept, not discarded, and
    // is previewed on the bar so a half-written thought can't be lost from view.
    if (!captureOpen) {
      return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
          <button
            onClick={() => setCaptureOpen(true)}
            title="Expand the capture box"
            style={{
              ...glass.card, flexShrink: 0, borderRadius: 24, padding: "13px 16px", marginBottom: 18,
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              textAlign: "left", cursor: "pointer",
            }}
          >
            <Plus size={16} color={theme.accentPlum} style={{ flexShrink: 0 }} />
            <span style={{
              flex: 1, minWidth: 0, fontSize: 14, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
              color: captureReady ? theme.textPrimary : theme.textMuted,
            }}>
              {captureReady ? thoughtDraft.trim() : "What's on your mind?"}
            </span>
            {captureReady && (
              <span style={{ flexShrink: 0, fontSize: 11, fontFamily: MONO, color: theme.accentPlum }}>draft</span>
            )}
            <ChevronDown size={16} color={theme.textFainter} style={{ flexShrink: 0 }} />
          </button>

          {renderThoughtsList(listTail)}
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
        <div style={{ ...glass.card, flexShrink: 0, borderRadius: 24, padding: 16, marginBottom: 18 }}>
          <textarea
            value={thoughtDraft}
            onChange={(e) => setThoughtDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addThought(); }
            }}
            placeholder="What's on your mind? Get it out of your head…"
            rows={2}
            style={{
              width: "100%", border: "none", background: "transparent", fontFamily: "inherit",
              fontSize: 15.5, lineHeight: 1.5, color: theme.textPrimary, resize: "none", padding: "4px 2px",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10, paddingTop: 12, borderTop: `1px solid ${theme.glassBorder2}` }}>
            <span
              onClick={() => thoughtDueRef.current?.showPicker?.()}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 999,
                fontSize: 12, color: theme.textMuted, background: theme.inputBg,
                border: `1px solid ${theme.glassBorder2}`, cursor: "pointer",
              }}
            >
              <Calendar size={13} />
              <input
                ref={thoughtDueRef}
                type="date"
                value={thoughtDue}
                onChange={(e) => setThoughtDue(e.target.value)}
                style={{ border: "none", background: "transparent", fontFamily: MONO, fontSize: 12, color: theme.textSecondary, padding: 0 }}
              />
            </span>

            <span style={{ fontSize: 12, color: theme.textFainter }}>Talk to</span>

            <PersonChip label="No one" selected={thoughtPersonId === null} onClick={() => setThoughtPersonId(null)} />
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
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, padding: "6px 12px", borderRadius: 999, border: `1px dashed ${theme.glassBorder2}`, background: "transparent", color: theme.textMuted, cursor: "pointer" }}
              >
                <UserPlus size={12} />
                New person
              </button>
            )}

            <button
              onClick={addThought}
              disabled={!captureReady}
              style={{
                ...accentButtonStyle(captureReady), marginLeft: "auto",
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 17px", borderRadius: 13, fontSize: 13, fontWeight: 600,
              }}
            >
              <Plus size={15} />
              Capture
            </button>

            <IconAction
              onClick={() => setCaptureOpen(false)}
              title="Minimize the capture box"
              size={7}
            >
              <ChevronDown size={16} style={{ transform: "rotate(180deg)" }} />
            </IconAction>
          </div>
        </div>

        {renderThoughtsList(listTail)}
      </div>
    );
  }

  // The pinned "Manage people" row plus the scrolling thought list — shared by
  // the expanded and minimised capture states so the two can't drift apart.
  function renderThoughtsList(listTail) {
    // Counted across every group, not per group: the compositing cost is what's
    // on screen, and the groups scroll as one list.
    const flatThoughts =
      thoughtGroups.reduce((n, g) => n + g.items.length, 0) > BLUR_LIST_LIMIT;
    return (
      <>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: theme.textFainter }}>Drag a thought onto a name to reassign it</span>
          <button onClick={() => setShowManagePeople(true)} style={{ ...quietButtonStyle, fontSize: 12 }}>
            Manage people
          </button>
        </div>

        {/* Everything below "Manage people" is the only scrolling region here. */}
        <div className="orbit-scroll" style={{ flex: 1, minHeight: 0, paddingBottom: listTail }}>
          <GroupList
            groups={thoughtGroups}
            kind="thought"
            dragOverZone={dragOverZone}
            setDragOverZone={setDragOverZone}
            onDrop={handleDrop}
            onDeleteGroup={deletePerson}
            emptyUnsortedLabel="Nothing unassigned"
            emptyGroupLabel="Drop thoughts here"
            renderItem={(thought, idx) => {
              const overdue = isOverdue(thought.due, thought.done);
              const stale = !thought.done && !thought.due && daysSince(thought.createdAt) >= STALE_DAYS;
              return (
                <div key={thought.id} style={{ animation: `rowIn .4s ${EASE_OUT} ${Math.min(idx, 12) * 0.035}s both` }}>
                  <TaskCard
                    highlighted={stale}
                    flat={flatThoughts}
                    tone="gold"
                    showRowButtons
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
                          <Badge tone={overdue ? "gold" : "neutral"} icon={Calendar}>
                            {overdue ? `Overdue · ${fmtDate(thought.due)}` : fmtDate(thought.due)}
                          </Badge>
                        ) : (
                          <Badge tone={stale ? "gold" : "neutral"} icon={Clock}>
                            {stale ? `Sitting ${daysSince(thought.createdAt)}d · ${relativeTime(thought.createdAt)}` : relativeTime(thought.createdAt)}
                          </Badge>
                        )}
                      </div>
                    }
                  />
                </div>
              );
            }}
          />
        </div>

        {showManagePeople && (
          <ManagePeopleModal
            people={people}
            onClose={() => setShowManagePeople(false)}
            onDelete={deletePerson}
          />
        )}
      </>
    );
  }

  function openReminder(todo) {
    setSettingTimeFor(todo.id);
    setDraftTimeValue(todo.notifyAt ? todo.notifyAt.slice(11, 16) : "");
  }

  // One row: either the inline reminder-time editor or the task card. Swipe is
  // mobile-only — on desktop the same two actions are explicit row buttons.
  function renderTodoRow(todo, colCategories, colSorted, idx) {
    const overdue = isOverdue(todo.due, todo.done);
    const category = colCategories.find((c) => c.id === todo.categoryId);
    const slotStyle = { animation: `rowIn .4s ${EASE_OUT} ${Math.min(idx, 12) * 0.035}s both` };
    // Whole list goes flat together — a mix of blurred and solid cards would
    // read as two different surfaces sitting side by side.
    const flat = colSorted.length > BLUR_LIST_LIMIT;

    if (settingTimeFor === todo.id) {
      return (
        <div
          key={todo.id}
          style={{ ...(flat ? glass.cardFlat : glass.card), ...slotStyle, borderRadius: 22, padding: "12px 13px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
        >
          <Clock size={16} color={theme.goldDot} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, color: theme.textPrimary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {todo.text}
          </span>
          <input
            type="time"
            autoFocus
            value={draftTimeValue}
            onChange={(e) => setDraftTimeValue(e.target.value)}
            style={{ ...fieldStyle(), width: "auto", fontFamily: MONO }}
          />
          <button
            onClick={() => setTimeSensitive(todo, draftTimeValue)}
            disabled={!draftTimeValue}
            style={{ ...accentButtonStyle(!!draftTimeValue), padding: "8px 15px", borderRadius: 12, fontSize: 12.5, fontWeight: 600 }}
          >
            Set
          </button>
          {todo.timeSensitive && (
            <button
              onClick={() => clearTimeSensitive(todo)}
              style={{ color: theme.accentRed, fontSize: 12, fontWeight: 600, padding: "6px 8px", border: "none", background: "transparent", cursor: "pointer" }}
            >
              Remove
            </button>
          )}
          <button
            onClick={() => { setSettingTimeFor(null); setDraftTimeValue(""); }}
            style={{ color: theme.textFainter, padding: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex" }}
          >
            <X size={16} />
          </button>
        </div>
      );
    }

    const card = (
      <TaskCard
        highlighted={overdue}
        flat={flat}
        done={todo.done}
        text={todo.text}
        due={todo.due}
        categoryId={todo.categoryId || null}
        categories={colCategories}
        todoId={todo.id}
        showHandle={!isDesktop}
        onReorderPointerDown={(e) => startTodoReorderDrag(e, todo, colSorted)}
        isDragging={todoDragState?.id === todo.id}
        dragDeltaY={todoDragState?.id === todo.id ? todoDragState.deltaY : 0}
        isDropTarget={!!todoDragState && todoDragState.overId === todo.id && todoDragState.id !== todo.id}
        showRowButtons={showRowButtons}
        remindActive={!!todo.timeSensitive}
        onRemind={() => openReminder(todo)}
        onToggle={() => toggleDone(todo)}
        onRemove={() => removeTodo(todo.id)}
        onEdit={(text, due, categoryId) => editTodo(todo.id, text, due, categoryId)}
        badge={<TaskBadges todo={todo} overdue={overdue} category={category} />}
      />
    );

    return (
      <div key={todo.id} style={slotStyle}>
        {isDesktop ? card : (
          <SwipeToDelete
            reordering={todoDragState?.id === todo.id}
            onDelete={() => removeTodo(todo.id)}
            onSwipeRight={() => openReminder(todo)}
          >
            {card}
          </SwipeToDelete>
        )}
      </div>
    );
  }

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

  const openThoughts = thoughts.filter((t) => !t.done).length;
  const pageTitle = isThoughts ? "Clear your head" : isWorkbench ? "Projects" : "Today's focus";
  const pageSub = isThoughts
    ? `${openThoughts} thing${openThoughts === 1 ? "" : "s"} still on your mind`
    : isWorkbench && !isDesktop
      ? "Milestones, deadlines and what's next"
      : isDesktop
        ? "Click a column to focus it — that's where + adds"
        : `${activeCount} ${activeCount === 1 ? "task" : "tasks"} left in ${listMeta[activeList].label.toLowerCase()}`;
  const showHideFuture = isDesktop || (!isThoughts && !isWorkbench);
  const showFab = isDesktop
    ? focusedColumn !== "workbench" && !showThoughtsPanel
    : activeList === "work" || activeList === "personal";
  const addAccent = listMeta[addTarget] ? listMeta[addTarget].label : "Work";

  return (
    <div
      className="orbit-shell"
      style={{
        position: "relative", overflow: "hidden", display: "flex", flexDirection: "column",
        color: theme.textPrimary, fontFamily: "'Geist', system-ui, sans-serif",
      }}
    >
      <GlassBackdrop />

      <div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, display: "flex", justifyContent: "center" }}>
        <div style={{
          width: "100%", maxWidth: isDesktop ? 1400 : twoCol ? 900 : 720,
          display: "flex", flexDirection: "column", minHeight: 0,
          animation: `screenIn .45s ${EASE_OUT}`,
        }}>

          {/* Top bar — logo and wordmark left, destinations and account right.
              The glass background bleeds up into the status-bar / notch area via
              safe-area-inset-top, while the row itself stays padded below it so
              the buttons are never covered. */}
          <div style={{
            ...glass.bar,
            position: "relative", zIndex: 30, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            padding: isDesktop ? "16px 28px" : "14px 18px",
            paddingTop: isDesktop ? 16 : "calc(14px + env(safe-area-inset-top))",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <OrbitMark size={26} />
              <span style={display(17)}>Orbit</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
              <ChromeButton title="Budget" onClick={() => setPage("budget")}>
                <Wallet size={16} />
              </ChromeButton>
              <ChromeButton title="Nightly Routine" onClick={() => setPage("nightly")}>
                <Moon size={16} />
              </ChromeButton>
              {access?.role === "guardian" && access?.budgetShared === true && (
                <ChromeButton title="Shared Budget" onClick={() => setPage("sharedBudget")}>
                  <Users size={16} />
                </ChromeButton>
              )}
              {(access?.role === "owner" || access?.role === "household") && (
                <ChromeButton title="Access" onClick={() => setPage("access")}>
                  <Settings size={16} />
                </ChromeButton>
              )}
              <UserMenu
                user={user}
                access={access}
                isDesktop={isDesktop}
                pendingBudgetRequest={pendingBudgetRequest}
                onRequestBudgetAccess={handleRequestBudgetAccess}
              />
            </div>
          </div>

          <div style={{
            flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
            padding: isDesktop ? "26px 28px 0" : "22px 18px 0",
          }}>

            {/* Page title + live subtitle + the All dates / Today only pill */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0, fontFamily: DISPLAY, fontSize: "clamp(30px,6vw,42px)", fontWeight: 600, letterSpacing: "-.035em", lineHeight: 1.02 }}>
                  {pageTitle}
                </h1>
                <p style={{ margin: "7px 0 0", fontSize: 14, color: theme.textMuted, lineHeight: 1.4 }}>{pageSub}</p>
              </div>
              {showHideFuture && (
                <button
                  onClick={toggleHideFutureTodos}
                  title={hideFutureTodos ? "Showing today & overdue only — tap to show all dates" : "Showing all dates — tap to hide future todos"}
                  style={{ ...pillStyle(hideFutureTodos), padding: "8px 14px" }}
                >
                  {hideFutureTodos ? <EyeOff size={13} /> : <Eye size={13} />}
                  {hideFutureTodos ? "Today only" : "All dates"}
                </button>
              )}
            </div>

            {/* Ask Star */}
            <div style={{ flexShrink: 0, marginBottom: 18 }}>
              <BrainDumpButton
                knownPeopleNames={people.map((p) => p.name)}
                onResult={handleBrainDumpResult}
              />
            </div>

            {isDesktop ? (
              <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 16, alignItems: "stretch", paddingBottom: 20 }}>
                {renderTodoColumn("work")}
                {renderTodoColumn("personal")}
                <div
                  onClick={() => setFocusedColumn("workbench")}
                  style={{
                    ...glass.panel, flex: "1 1 0", minWidth: 0, padding: 16, borderRadius: 26,
                    display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden",
                    border: `1px solid ${focusedColumn === "workbench" ? PALETTE.orange.dot : theme.glassBorder}`,
                    boxShadow: focusedColumn === "workbench"
                      ? `inset 0 1px 0 ${theme.glassSpec}, 0 0 0 3px ${mix(PALETTE.orange.dot, 22)}, 0 18px 44px -26px ${theme.glassShadow}`
                      : `inset 0 1px 0 ${theme.glassSpec}, 0 18px 44px -26px ${theme.glassShadow}`,
                    transition: "border-color .3s ease, box-shadow .3s ease",
                  }}
                >
                  <Workbench uid={uid} categories={ownCategories} todos={ownTodos} sharedUid={sharingWork ? ownerUid : null} sharedCategoryId={access?.sharedWorkCategoryId} sharedCategories={sharedCategories} />
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                {(activeList === "work" || activeList === "personal") && (
                  twoCol ? (
                    // Mid-width: Work and Personal share the row as equal columns,
                    // clearing the floating tab bar at the bottom.
                    <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 16, alignItems: "stretch", paddingBottom: LIST_TAIL }}>
                      {renderTodoColumn("work")}
                      {renderTodoColumn("personal")}
                    </div>
                  ) : renderTodoColumn(activeList)
                )}
                {isThoughts && renderThoughts(LIST_TAIL)}
                {isWorkbench && (
                  <Workbench uid={uid} categories={ownCategories} todos={ownTodos} sharedUid={sharingWork ? ownerUid : null} sharedCategoryId={access?.sharedWorkCategoryId} sharedCategories={sharedCategories} listTail={LIST_TAIL} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating glass tab bar — the four lists, mobile only */}
      {!isDesktop && (
        <div style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
          display: "flex", justifyContent: "center", pointerEvents: "none",
          padding: "0 14px 18px", paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}>
          <div style={{ ...glass.raised, display: "flex", alignItems: "center", gap: 3, padding: 6, borderRadius: 26, pointerEvents: "auto" }}>
            {Object.entries(listMeta).map(([key, meta]) => {
              const Icon = meta.icon;
              const on = activeList === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveList(key)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                    minWidth: 74, padding: "9px 8px 8px", borderRadius: 20, border: "none", cursor: "pointer",
                    color: on ? theme.accentInk : theme.textMuted,
                    background: on ? `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})` : "transparent",
                    boxShadow: on ? `0 8px 20px -8px ${theme.accentPlum}` : "none",
                    transition: `all .38s ${SPRING}`,
                  }}
                >
                  <Icon size={18} />
                  <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".01em" }}>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Desktop-only Thoughts drawer toggle */}
      {isDesktop && (
        <button
          onClick={() => setShowThoughtsPanel((v) => !v)}
          title="Thoughts"
          style={{
            position: "fixed", right: 30, bottom: 100, width: 52, height: 52, borderRadius: 20, zIndex: 45,
            display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${theme.glassBorder}`,
            cursor: "pointer",
            color: showThoughtsPanel ? theme.accentInk : theme.textSecondary,
            background: showThoughtsPanel
              ? `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})`
              : `linear-gradient(157deg, ${theme.glassHigh}, ${theme.glassFill})`,
            backdropFilter: "blur(22px) saturate(180%)", WebkitBackdropFilter: "blur(22px) saturate(180%)",
            boxShadow: showThoughtsPanel
              ? `0 12px 30px -10px ${theme.accentPlum}`
              : `inset 0 1px 0 ${theme.glassSpec}, 0 12px 32px -18px ${theme.glassShadow}`,
            transition: `all .38s ${SPRING}`,
          }}
        >
          <MessageCircleMore size={21} />
        </button>
      )}

      {/* + FAB — adds to the active tab (mobile) or the focused column */}
      {showFab && (
        <button
          onClick={() => { setAddTarget(isDesktop ? focusedColumn : activeList); setShowAddPanel(true); }}
          title="Add a task"
          style={{
            position: "fixed", right: isDesktop ? 30 : 20, bottom: isDesktop ? 30 : 100,
            width: 58, height: 58, borderRadius: 22, zIndex: 45, border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            color: theme.accentInk,
            background: `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})`,
            boxShadow: `0 14px 34px -10px ${theme.accentPlum}, inset 0 1px 0 rgba(255,255,255,.4)`,
            transition: `transform .4s ${SPRING}`,
          }}
        >
          <span style={{ position: "absolute", inset: 0, borderRadius: "inherit", background: "linear-gradient(150deg,rgba(255,255,255,.4),transparent 55%)", pointerEvents: "none" }} />
          <Plus size={25} />
        </button>
      )}

      {/* Add-task sheet: shared between the mobile FAB and the desktop
          focused-column FAB. Writes to whichever list `addTarget` names. */}
      {showAddPanel && (
        <div
          onClick={closeAddPanel}
          style={{
            position: "fixed", inset: 0, zIndex: 80, background: theme.scrim,
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            animation: "fadeIn .22s ease", display: "flex", justifyContent: "center",
            // Mobile docks the panel to the top so the keyboard opens beneath it;
            // desktop keeps the bottom sheet, where there's no keyboard to dodge.
            alignItems: isDesktop ? "flex-end" : "flex-start",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...(isDesktop ? glass.sheet : glass.raised),
              width: "100%", maxWidth: 640, padding: 20, borderRadius: 30,
              margin: isDesktop ? "0 10px 10px" : "calc(10px + env(safe-area-inset-top)) 10px 10px",
              animation: isDesktop ? `sheetIn .42s ${EASE_OUT}` : `sheetInTop .42s ${EASE_OUT}`,
              paddingBottom: isDesktop ? "calc(20px + env(safe-area-inset-bottom))" : 20,
            }}
          >
            {isDesktop && <div style={{ width: 38, height: 4, borderRadius: 99, background: theme.glassBorder, margin: "-6px auto 16px" }} />}

            {/* Named header with an explicit way out — the scrim also closes,
                but that isn't discoverable enough to be the only escape. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ ...display(15), color: theme.textSecondary, flex: 1, minWidth: 0 }}>
                New task in {addAccent}
              </span>
              <button
                onClick={closeAddPanel}
                title="Cancel (Esc)"
                aria-label="Cancel new task"
                style={{
                  display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                  padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                  fontSize: 12.5, fontWeight: 500, color: theme.textMuted,
                  background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`,
                  transition: `all .25s ${SPRING}`,
                }}
              >
                <X size={13} />
                Cancel
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTodo(); if (e.key === "Escape") closeAddPanel(); }}
                placeholder={`Add to ${addAccent}…`}
                autoFocus
                style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 17, fontWeight: 500, color: theme.textPrimary, padding: "4px 2px" }}
              />
              <button
                onClick={addTodo}
                disabled={!draft.trim()}
                style={{
                  ...accentButtonStyle(!!draft.trim()),
                  width: 40, height: 40, borderRadius: 14, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Plus size={19} />
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 13, borderTop: `1px solid ${theme.glassBorder2}`, flexWrap: "wrap" }}>
              <span
                onClick={() => draftDueRef.current?.showPicker?.()}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 999, fontSize: 12.5, color: theme.textMuted, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`, cursor: "pointer" }}
              >
                <Calendar size={13} />
                <input
                  ref={draftDueRef}
                  type="date"
                  value={draftDue}
                  onChange={(e) => setDraftDue(e.target.value)}
                  style={{ border: "none", background: "transparent", fontFamily: MONO, fontSize: 12.5, color: theme.textSecondary, padding: 0 }}
                />
              </span>
              <Repeat size={14} color={theme.textFainter} style={{ marginLeft: 4 }} />
              {["none", "daily", "weekly", "monthly", "custom"].map((opt) => {
                const on = opt === "none" ? !draftRecurrence : draftRecurrence?.type === opt;
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
                    style={{ ...pillStyle(on), padding: "6px 13px", fontSize: 12 }}
                  >
                    {opt === "none" ? "No repeat" : opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                );
              })}
              {draftRecurrence?.type === "custom" && (
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: theme.textMuted }}>
                  every
                  <input
                    type="number"
                    min="1"
                    value={draftRecurrence.intervalDays ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setDraftRecurrence({ type: "custom", intervalDays: raw === "" ? "" : parseInt(raw, 10) });
                    }}
                    style={{ ...fieldStyle(), width: 54, padding: "6px 9px", fontFamily: MONO, fontSize: 12 }}
                  />
                  days
                </span>
              )}
            </div>

            <div style={{ marginTop: 14, paddingTop: 13, borderTop: `1px solid ${theme.glassBorder2}` }}>
              <CategoryPicker
                categories={categoriesForList(addTarget)}
                recent={recentCategoriesForList(addTarget, 4)}
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

            {!isDesktop && <div style={{ width: 38, height: 4, borderRadius: 99, background: theme.glassBorder, margin: "16px auto -6px" }} />}
          </div>
        </div>
      )}

      {desktopManageCatsFor && (
        <ManageCategoriesModal
          categories={categoriesForList(desktopManageCatsFor)}
          onClose={() => setDesktopManageCatsFor(null)}
          onDelete={(catId) => deleteCategoryFromList(desktopManageCatsFor, catId)}
        />
      )}

      {isDesktop && showThoughtsPanel && (
        <div
          onClick={() => setShowThoughtsPanel(false)}
          style={{ position: "fixed", inset: 0, background: theme.scrim, zIndex: 59, animation: "fadeIn .2s ease" }}
        >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed", top: 0, right: 0, bottom: 0, width: 460, maxWidth: "92vw",
                zIndex: 60, padding: "26px 22px 0", overflow: "hidden",
                display: "flex", flexDirection: "column",
                background: `linear-gradient(200deg, ${theme.glassHigh}, ${theme.glassFill})`,
                backdropFilter: "blur(34px) saturate(200%)", WebkitBackdropFilter: "blur(34px) saturate(200%)",
                borderLeft: `1px solid ${theme.glassBorder}`,
                boxShadow: `-24px 0 70px -30px ${theme.glassShadow}`,
                animation: `screenIn .4s ${EASE_OUT}`,
              }}
            >
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <h2 style={{ ...display(24, "-.03em"), margin: 0 }}>Clear your head</h2>
                <button onClick={() => setShowThoughtsPanel(false)} style={{ border: "none", background: "transparent", color: theme.textFainter, cursor: "pointer", padding: 4, display: "flex" }}>
                  <X size={20} />
                </button>
              </div>

              {renderThoughts(40)}
            </div>
          </div>
        )}
    </div>
  );
}

// ---------- Shared subcomponents ----------

// One row of the raised-glass user menu.
function MenuRow({ onClick, icon: Icon, color, children }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 9,
        padding: "9px 11px", borderRadius: 12, border: "none", cursor: "pointer",
        fontSize: 13, fontWeight: 500, textAlign: "left",
        color: color || theme.textSecondary,
        background: hover ? theme.inputBg : "transparent",
        transition: "background .2s ease",
      }}
    >
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
}

function UserMenu({ user, access, isDesktop, pendingBudgetRequest, onRequestBudgetAccess }) {
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
          <img
            src={user.photoURL}
            alt=""
            style={{ width: 34, height: 34, borderRadius: "50%", boxShadow: `0 0 0 1.5px ${theme.glassBorder}, 0 4px 14px -6px ${theme.accentPlum}` }}
          />
        ) : (
          <div style={{
            width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 600, color: theme.accentInk,
            background: `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})`,
            boxShadow: `0 0 0 1.5px ${theme.glassBorder}, 0 4px 14px -6px ${theme.accentPlum}`,
          }}>
            {(user.displayName || user.email || "?")[0].toUpperCase()}
          </div>
        )}
      </button>
      {open && (
        <div style={{
          ...glass.raised, position: "absolute", right: 0, top: isDesktop ? 46 : 44,
          width: 246, padding: 8, borderRadius: 22, zIndex: 70, animation: `popIn .3s ${SPRING}`,
        }}>
          <div style={{ padding: "4px 10px 11px", borderBottom: `1px solid ${theme.glassBorder2}`, marginBottom: 7 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: theme.textPrimary, overflow: "hidden", textOverflow: "ellipsis" }}>
              {user.displayName || user.email}
            </div>
            {access?.role && (
              <div style={{ fontSize: 11.5, color: theme.textFainter, marginTop: 2, textTransform: "capitalize" }}>{access.role}</div>
            )}
          </div>
          <PaletteMenu />
          <MenuRow onClick={() => { setShowNotify(true); setOpen(false); }} icon={MessageCircleMore}>
            Notifications
          </MenuRow>
          {access?.role === "guardian" && access?.budgetShared !== true && (
            <MenuRow
              onClick={() => { if (!pendingBudgetRequest) { onRequestBudgetAccess(); setOpen(false); } }}
              icon={Wallet}
              color={pendingBudgetRequest ? theme.accentPlum : undefined}
            >
              {pendingBudgetRequest ? "Budget request pending" : "Request shared budget"}
            </MenuRow>
          )}
          <MenuRow onClick={() => signOut(auth)} icon={LogOut} color={theme.accentRed}>
            Sign out
          </MenuRow>
        </div>
      )}
      {/* Portalled to <body>: this menu lives inside the top bar, whose
          backdrop-filter makes it the containing block for fixed children (so
          `inset: 0` would resolve to the bar, not the viewport) and traps the
          overlay in that bar's z-index-30 stacking context, under the tab bar. */}
      {showNotify && createPortal(
        <div
          onClick={() => { setShowNotify(false); setWizardStep(1); }}
          style={{
            position: "fixed", inset: 0, background: theme.scrim,
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", zIndex: 90,
            display: "flex", justifyContent: "center", padding: 20, animation: "fadeIn .2s ease",
            // `align-items: center` would overflow equally in both directions once
            // the card outgrows the viewport, putting its top off-screen with no
            // way to reach it. Auto margins centre when it fits and collapse to 0
            // when it doesn't, so the overlay's own scroll can always reach the top.
            alignItems: "flex-start", overflowY: "auto",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ ...glass.raised, borderRadius: 28, padding: 22, width: 380, maxWidth: "92vw", margin: "auto 0", animation: `popIn .3s ${SPRING}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 4 }}>
              <span style={{
                width: 36, height: 36, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                color: theme.accentInk, background: `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})`,
                boxShadow: `0 8px 20px -8px ${theme.accentPlum}`,
              }}>
                <MessageCircleMore size={17} />
              </span>
              <h3 style={{ ...display(20), margin: 0, flex: 1, color: theme.textPrimary }}>Connect Telegram</h3>
              <button onClick={() => { setShowNotify(false); setWizardStep(1); }} style={{ border: "none", background: "transparent", color: theme.textFainter, cursor: "pointer", padding: 5, display: "flex" }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: "0 0 18px", fontSize: 11.5, fontFamily: MONO, color: theme.textFainter, letterSpacing: ".04em" }}>
              Step {wizardStep} of 3
            </p>

            {wizardStep === 1 && (
              <>
                <p style={{ fontSize: 13.5, color: theme.textSecondary, margin: "0 0 12px", lineHeight: 1.55 }}>
                  First, create your own personal bot - this takes about a minute.
                </p>
                <ol style={{ fontSize: 13, color: theme.textSecondary, margin: "0 0 16px", paddingLeft: 20, lineHeight: 1.85 }}>
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
                  style={{ ...fieldStyle(), fontFamily: MONO, fontSize: 12.5, marginBottom: 14 }}
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
                  style={{ ...accentButtonStyle(!!botToken.trim()), width: "100%", fontSize: 13, fontWeight: 600, padding: "12px 10px", borderRadius: 14 }}
                >
                  Next
                </button>
              </>
            )}

            {wizardStep === 2 && (
              <>
                <p style={{ fontSize: 13.5, color: theme.textSecondary, margin: "0 0 12px", lineHeight: 1.55 }}>
                  Now let's find your Chat ID - this tells your bot who to message.
                </p>
                <ol style={{ fontSize: 13, color: theme.textSecondary, margin: "0 0 16px", paddingLeft: 20, lineHeight: 1.85 }}>
                  <li>Open a chat with the bot you just created</li>
                  <li>Send it any message, like "hi"</li>
                  <li>It will reply instantly with your Chat ID</li>
                </ol>
                <input
                  placeholder="Paste your Chat ID here"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  style={{ ...fieldStyle(), fontFamily: MONO, fontSize: 12.5, marginBottom: 14 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setWizardStep(1)}
                    style={{ flex: 1, border: `1px solid ${theme.glassBorder2}`, background: theme.inputBg, color: theme.textMuted, fontSize: 13, fontWeight: 500, padding: "12px 10px", borderRadius: 14, cursor: "pointer" }}
                  >
                    Back
                  </button>
                  <button
                    onClick={async () => { await handleSaveNotify(); setWizardStep(3); }}
                    disabled={!chatId.trim()}
                    style={{ ...accentButtonStyle(!!chatId.trim()), flex: 1, fontSize: 13, fontWeight: 600, padding: "12px 10px", borderRadius: 14 }}
                  >
                    Save
                  </button>
                </div>
              </>
            )}

            {wizardStep === 3 && (
              <>
                <p style={{ fontSize: 13.5, color: theme.textSecondary, margin: "0 0 18px", lineHeight: 1.55 }}>
                  All set! You will now get Orbit notifications through your own Telegram bot.
                </p>
                <button
                  onClick={() => { setShowNotify(false); setWizardStep(1); }}
                  style={{ ...accentButtonStyle(true), width: "100%", fontSize: 13, fontWeight: 600, padding: "12px 10px", borderRadius: 14 }}
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function GroupList({ groups, kind, dragOverZone, setDragOverZone, onDrop, onDeleteGroup, renderItem, emptyUnsortedLabel = "All caught up — nothing unsorted", emptyGroupLabel = "Drop tasks here" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
              borderRadius: 22, padding: isOver ? 8 : 0,
              border: `1px dashed ${isOver ? (color ? color.dot : theme.accentPlum) : "transparent"}`,
              background: isOver ? mix(color ? color.dot : theme.accentPlum, 10) : "transparent",
              transition: `all .25s ${SPRING}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 4px 10px" }}>
              {color ? (
                <span style={{ width: 7, height: 7, borderRadius: 99, background: color.dot, boxShadow: `0 0 10px -1px ${color.dot}` }} />
              ) : (
                <Inbox size={13} color={theme.textFainter} />
              )}
              <span style={{
                fontSize: 11.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase",
                color: color ? color.text : theme.textMuted,
              }}>
                {group.name}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: theme.textFainter }}>{group.items.length}</span>
              {!isUnsorted && (
                <IconAction onClick={() => onDeleteGroup(group.refId)} title="Delete" hoverColor={theme.accentRed}>
                  <Trash2 size={13} />
                </IconAction>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 9, minHeight: 8 }}>
              {group.items.length === 0 && (
                <div style={{ padding: 16, borderRadius: 16, border: `1px dashed ${theme.glassBorder2}`, textAlign: "center", fontSize: 12, color: theme.textFainter }}>
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

function TaskCard({
  text, due, done, categoryId, categories, onToggle, onRemove, onEdit, todoId,
  onReorderPointerDown, isDragging, dragDeltaY, isDropTarget, badge, highlighted,
  tone = "red", showHandle, showRowButtons, onRemind, remindActive, onDragStart, flat,
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [editDue, setEditDue] = useState(due || "");
  const editDueRef = useRef(null);
  const [editCategoryId, setEditCategoryId] = useState(categoryId || null);

  // Thoughts are reassigned by dragging the whole card onto a person group
  // (HTML5 drag-and-drop, handled by GroupList). Disabled while editing so the
  // textarea keeps normal text selection.
  const [htmlDragging, setHtmlDragging] = useState(false);
  const canDrag = !!onDragStart && !editing;

  // The accent ring that bursts outward when a task is checked off.
  const [bursting, setBursting] = useState(false);
  const burstTimer = useRef(null);
  useEffect(() => () => clearTimeout(burstTimer.current), []);

  function handleToggle() {
    if (!done) {
      setBursting(true);
      clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(() => setBursting(false), 620);
    }
    onToggle();
  }

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

  // Overdue tasks (and stale thoughts, which pass tone="gold") get a tinted
  // glass fill and border instead of the plain one.
  const flagColor = tone === "gold" ? theme.goldDot : theme.accentRed;
  const flagged = highlighted && !editing;
  const borderColor = flagged
    ? mix(flagColor, 34, theme.glassBorder)
    : isDropTarget
      ? theme.accentPlum
      : theme.glassBorder;

  return (
    <div
      data-todo-id={todoId}
      draggable={canDrag}
      onDragStart={canDrag ? (e) => { setHtmlDragging(true); onDragStart(e); } : undefined}
      onDragEnd={canDrag ? () => setHtmlDragging(false) : undefined}
      style={{
        position: "relative", display: "flex", alignItems: "flex-start", gap: 11,
        cursor: canDrag ? (htmlDragging ? "grabbing" : "grab") : "default",
        padding: showHandle ? "14px 13px 14px 10px" : "14px 13px",
        borderRadius: 22,
        // `flat` drops this card out of the blur — see BLUR_LIST_LIMIT. The
        // solid fills are what the blur averages to, so the tint maths and the
        // rest of the recipe are unchanged either way.
        background: flagged
          ? `linear-gradient(157deg, ${flat ? theme.glassHighSolid : theme.glassHigh}, ${mix(flagColor, 8, flat ? theme.glassFillSolid : theme.glassFill)})`
          : `linear-gradient(157deg, ${flat ? theme.glassHighSolid : theme.glassHigh}, ${flat ? theme.glassFillSolid : theme.glassFill})`,
        ...(flat ? {} : {
          backdropFilter: "blur(22px) saturate(180%)",
          WebkitBackdropFilter: "blur(22px) saturate(180%)",
        }),
        border: `1px solid ${borderColor}`,
        boxShadow: isDragging
          ? `inset 0 1px 0 ${theme.glassSpec}, 0 22px 50px -18px ${theme.glassShadow}`
          : `inset 0 1px 0 ${theme.glassSpec}, 0 10px 28px -20px ${theme.glassShadow}`,
        transform: isDragging ? `translateY(${dragDeltaY}px) scale(1.02)` : "none",
        opacity: done ? 0.62 : htmlDragging ? 0.5 : 1,
        transition: isDragging ? "none" : `transform .42s ${SPRING}, opacity .3s ease, box-shadow .3s ease`,
        zIndex: isDragging ? 30 : 1,
        touchAction: "pan-y",
      }}
    >
      {showHandle && onReorderPointerDown && !editing && (
        <span
          data-drag-handle="true"
          onPointerDown={onReorderPointerDown}
          style={{
            display: "flex", alignItems: "center", padding: 2, margin: "1px -2px 0 -2px",
            flexShrink: 0, color: theme.textFainter, opacity: 0.6,
            cursor: isDragging ? "grabbing" : "grab",
            touchAction: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none",
          }}
        >
          <GripVertical size={15} />
        </span>
      )}

      {!editing && (
        <button
          onClick={handleToggle}
          style={{
            position: "relative", width: 23, height: 23, borderRadius: "50%", flexShrink: 0, marginTop: 1,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer",
            border: `2px solid ${done ? theme.accentPlum : theme.glassBorder2}`,
            background: done ? `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})` : "transparent",
            boxShadow: done ? `0 4px 14px -5px ${theme.accentPlum}` : "none",
            transition: `all .35s ${SPRING}`,
          }}
        >
          {done && (
            <Check size={12} color={theme.accentInk} strokeWidth={3.5} style={{ animation: `tick .45s ${SPRING}` }} />
          )}
          {bursting && (
            <span style={{
              position: "absolute", inset: -6, borderRadius: "50%",
              border: `2px solid ${theme.accentPlum}`,
              animation: `burst .62s ${EASE_OUT} forwards`, pointerEvents: "none",
            }} />
          )}
        </button>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
                if (e.key === "Escape") cancel();
              }}
              rows={2}
              style={{
                width: "100%", padding: "11px 13px", borderRadius: 14, fontFamily: "inherit",
                fontSize: 15, lineHeight: 1.45, resize: "none", color: theme.textPrimary,
                background: theme.inputBg, border: `1px solid ${theme.accentPlum}`,
                boxShadow: `0 0 0 3px ${theme.accentSoft}`,
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                onClick={() => editDueRef.current?.showPicker?.()}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 11, fontSize: 12, color: theme.textMuted, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`, cursor: "pointer" }}
              >
                <Calendar size={13} />
                <input
                  ref={editDueRef}
                  type="date"
                  value={editDue}
                  onChange={(e) => setEditDue(e.target.value)}
                  style={{ border: "none", background: "transparent", fontFamily: MONO, fontSize: 12, color: theme.textSecondary, padding: 0 }}
                />
              </span>
              <span style={{ fontSize: 11.5, color: theme.textFainter, marginRight: "auto" }}>Enter to save · Esc to cancel</span>
              <button
                onClick={cancel}
                style={{ padding: "9px 14px", borderRadius: 12, fontSize: 12.5, fontWeight: 500, color: theme.textMuted, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button onClick={save} style={{ ...accentButtonStyle(true), padding: "9px 18px", borderRadius: 12, fontSize: 12.5, fontWeight: 600 }}>
                Save
              </button>
            </div>
            {categories && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Tag size={13} color={theme.textFainter} />
                <CategoryChip label="None" selected={!editCategoryId} onClick={() => setEditCategoryId(null)} />
                {categories.map((c) => (
                  <CategoryChip key={c.id} label={c.name} color={PALETTE[c.color]} selected={editCategoryId === c.id} onClick={() => setEditCategoryId(c.id)} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{
              fontSize: 15, lineHeight: 1.4, overflowWrap: "anywhere", textWrap: "pretty",
              color: done ? theme.textFainter : theme.textPrimary,
              textDecoration: done ? "line-through" : "none",
              transition: "color .3s ease",
            }}>
              {text}
            </div>
            {badge && <div style={{ marginTop: 7 }}>{badge}</div>}
          </>
        )}
      </div>

      {!editing && (
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <IconAction onClick={startEdit} title="Edit"><Pencil size={14} /></IconAction>
          {showRowButtons && onRemind && (
            <IconAction onClick={onRemind} title="Time sensitive" hoverColor={theme.goldDot} active={remindActive} activeColor={theme.goldDot}>
              <Clock size={14} />
            </IconAction>
          )}
          {showRowButtons && onRemove && (
            <IconAction onClick={onRemove} title="Delete" hoverColor={theme.accentRed}>
              <Trash2 size={14} />
            </IconAction>
          )}
        </div>
      )}
    </div>
  );
}

// The badge row under a task: due date, reminder time, repeat, category.
function TaskBadges({ todo, overdue, category }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {todo.due && (
        <Badge tone={overdue ? "red" : "neutral"} icon={Calendar}>
          {overdue ? `Overdue · ${fmtDate(todo.due)}` : fmtDate(todo.due)}
        </Badge>
      )}
      {todo.timeSensitive && todo.notifyAt && (
        <Badge tone="gold" icon={Clock}>{fmtTime(todo.notifyAt)}</Badge>
      )}
      {todo.recurrence && (
        <Badge icon={Repeat} capitalize>{todo.recurrence.type}</Badge>
      )}
      {category && <CategoryBadge category={category} />}
    </div>
  );
}

function CategoryBadge({ category }) {
  const p = PALETTE[category.color] || PALETTE.blue;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 500,
      padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
      color: p.text, background: p.bg, border: `1px solid ${mix(p.dot, 34)}`,
    }}>
      {category.name}
    </span>
  );
}

function CategoryChip({ label, color, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500,
        padding: "6px 13px", borderRadius: 999, cursor: "pointer",
        color: selected ? (color ? color.text : theme.accentPlum) : theme.textMuted,
        background: selected ? (color ? color.bg : theme.accentSoft) : theme.inputBg,
        border: `1px solid ${selected ? (color ? color.dot : theme.accentPlum) : theme.glassBorder2}`,
        transition: `all .25s ${SPRING}`,
      }}
    >
      {color && <span style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: color.dot }} />}
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
        <Tag size={13} color={theme.textFainter} style={{ marginRight: 2 }} />
        <CategoryChip label="None" selected={!selectedId} onClick={() => onSelect(null)} />
        {recent.map((c) => (
          <CategoryChip key={c.id} label={c.name} color={PALETTE[c.color]} selected={selectedId === c.id} onClick={() => onSelect(c.id)} />
        ))}
        {selected && !recent.some((c) => c.id === selected.id) && (
          <CategoryChip label={selected.name} color={PALETTE[selected.color]} selected onClick={() => onSelect(selected.id)} />
        )}
        <button
          onClick={() => setShowMore((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, padding: "6px 12px", borderRadius: 999, border: `1px solid ${theme.glassBorder2}`, background: theme.inputBg, color: theme.textMuted, cursor: "pointer" }}
        >
          More <ChevronDown size={12} style={{ transform: showMore ? "rotate(180deg)" : "none", transition: `transform .3s ${SPRING}` }} />
        </button>
      </div>

      {showMore && (
        <div style={{ marginTop: 10, padding: 12, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`, borderRadius: 18, animation: `popIn .25s ${SPRING}` }}>
          {categories.length > 5 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "8px 12px", background: theme.glassFill, border: `1px solid ${theme.glassBorder2}`, borderRadius: 12 }}>
              <Search size={13} color={theme.textFainter} />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search categories…"
                style={{ flex: 1, border: "none", fontSize: 13, background: "transparent", color: theme.textPrimary }}
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
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${theme.glassBorder2}` }}>
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
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, padding: "6px 12px", borderRadius: 999, border: `1px dashed ${theme.glassBorder2}`, background: "transparent", color: theme.textMuted, cursor: "pointer" }}
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
      style={{ position: "fixed", inset: 0, background: theme.scrim, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100, animation: "fadeIn .2s ease" }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ ...glass.raised, borderRadius: 28, padding: 20, width: "100%", maxWidth: 380, maxHeight: "70vh", overflowY: "auto", animation: `popIn .3s ${SPRING}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ ...display(20), color: theme.textPrimary, margin: 0 }}>Manage people</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: theme.textFainter, cursor: "pointer", padding: 4, display: "flex" }}>
            <X size={18} />
          </button>
        </div>
        {alphabetical.length === 0 && (
          <p style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>No one saved yet — add someone from the "New person" chip when capturing a thought.</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {alphabetical.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 13px", borderRadius: 14, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}` }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: PALETTE[p.color].text }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: PALETTE[p.color].dot, boxShadow: `0 0 10px -1px ${PALETTE[p.color].dot}` }} />
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
      style={{ position: "fixed", inset: 0, background: theme.scrim, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100, animation: "fadeIn .2s ease" }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ ...glass.raised, borderRadius: 28, padding: 20, width: "100%", maxWidth: 380, maxHeight: "70vh", overflowY: "auto", animation: `popIn .3s ${SPRING}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ ...display(20), color: theme.textPrimary, margin: 0 }}>Manage categories</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: theme.textFainter, cursor: "pointer", padding: 4, display: "flex" }}>
            <X size={18} />
          </button>
        </div>
        {alphabetical.length === 0 && (
          <p style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>No categories yet — create one from the "More" menu when adding a task.</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {alphabetical.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 13px", borderRadius: 14, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}` }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: PALETTE[c.color].text }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: PALETTE[c.color].dot, boxShadow: `0 0 10px -1px ${PALETTE[c.color].dot}` }} />
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

// Monospace pill. `tone` red = overdue, gold = time-sensitive or stale.
function Badge({ children, tone = "neutral", icon: Icon, capitalize }) {
  const tinted = tone !== "neutral";
  const color = tone === "red" ? theme.accentRed : tone === "gold" ? theme.goldDot : theme.textMuted;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
      fontFamily: MONO, fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 999,
      textTransform: capitalize ? "capitalize" : "none",
      color, background: tinted ? mix(color, 14) : theme.inputBg,
      border: `1px solid ${tinted ? mix(color, 30) : theme.glassBorder2}`,
    }}>
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}

function InlineCreate({ value, onChange, onConfirm, onCancel, placeholder, small }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`, borderRadius: 999, padding: "5px 6px 5px 14px" }}>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        style={{ border: "none", fontSize: 13, width: small ? 90 : 130, background: "transparent", color: theme.textPrimary }}
      />
      <button onClick={onConfirm} style={{ ...accentButtonStyle(true), borderRadius: 999, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Check size={14} />
      </button>
      <button onClick={onCancel} style={{ border: "none", background: "transparent", color: theme.textFainter, borderRadius: 999, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <X size={14} />
      </button>
    </div>
  );
}

function PersonChip({ label, color, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500,
        padding: "6px 13px", borderRadius: 999, cursor: "pointer",
        color: selected ? (color ? color.text : theme.accentPlum) : theme.textMuted,
        background: selected ? (color ? color.bg : theme.accentSoft) : theme.inputBg,
        border: `1px solid ${selected ? (color ? color.dot : theme.accentPlum) : theme.glassBorder2}`,
        transition: `all .25s ${SPRING}`,
      }}
    >
      {color && <span style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: color.dot }} />}
      {label}
    </button>
  );
}

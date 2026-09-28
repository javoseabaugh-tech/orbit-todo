import PaletteMenu from "./PaletteMenu";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { onAuthStateChanged, signInWithRedirect, signOut } from "firebase/auth";
import {
  addDoc, collection, deleteDoc, doc, documentId, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { Plus, X, MessageCircleMore, LogOut, Settings, Moon, Wallet, Users } from "lucide-react";
import { auth, googleProvider, db } from "./firebase";
import Budget from "./Budget";
import AccessScreen from "./AccessScreen";
import BudgetGate from "./BudgetGate";
import { getMyNotifyConfig, saveMyNotifyConfig } from "./notifyConfig";
import { createBudgetAccessRequest, watchMyPendingBudgetRequest } from "./budgetAccessRequests";
import Nightly from "./Nightly";
import TodoSection from "./dial/TodoSection";
import QuickAdd from "./dial/QuickAdd";
import Thoughts from "./dial/Thoughts";
import { D, FONT_DISPLAY, FONT_BODY, pageBackground } from "./dial/tokens";
import { dateStr, addDays, nowHM } from "./dial/dates";

// The liquid-glass theme still styles the screens not yet redesigned (sign-in,
// the account menu, Budget, Nightly, Access).
import { theme, glass, SPRING, EASE_OUT, applyThemeVars, applyThemeColor } from "./theme";
import { MONO, display, mix, accentButtonStyle, fieldStyle, GlassBackdrop } from "./ui";

// Bottom clearance inside every scroll region: the floating + button sits on
// top of the list, so the last row needs room to come out from under it.
const LIST_TAIL = "calc(120px + env(safe-area-inset-bottom))";

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
    // The redesign's colours own the page itself: the status bar and iOS
    // overscroll show these, not the old theme's.
    document.querySelectorAll('meta[name="theme-color"]').forEach((el) => { el.content = D.bgTop; });
    document.body.style.background = D.bgBottom;
    document.body.style.color = D.text;
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
  const ownTodos = useUserCollection(uid, "todos");
  const sharedTodos = useUserCollection(sharingWork ? ownerUid : null, "todos", { categoryField: access?.sharedWorkCategoryId });
  const ownCategories = useUserCollection(uid, "categories");
  const thoughts = useUserCollection(uid, "thoughts");
  const people = useUserCollection(uid, "people");

  // People you can assign Work todos to: everyone with shared Work access
  // scoped to one of your categories. Assigning a todo to someone files it
  // in that category, which is exactly what their access rule lets them see,
  // so no data has to move and the Firestore rules stay the boundary.
  const isOwner = access?.role === "owner";
  const [accessList, setAccessList] = useState([]);
  useEffect(() => {
    if (!isOwner) return;
    const unsub = onSnapshot(collection(db, "access"),
      (snap) => setAccessList(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("access list error", err));
    return () => unsub();
  }, [isOwner]);
  const assignable = isOwner
    ? accessList
        .filter((a) => a.sharedWorkAccess === true && a.sharedWorkCategoryId && a.uid !== uid)
        .map((a) => {
          const cat = ownCategories.find((c) => c.id === a.sharedWorkCategoryId);
          return { id: a.id, email: a.email || a.id, categoryId: a.sharedWorkCategoryId, name: cat?.name || (a.email || a.id).split("@")[0] };
        })
    : [];
  const assigneeOf = (todo) => (todo.isShared ? null : assignable.find((p) => p.categoryId === todo.categoryId) || null);
  const sharedFromOf = (todo) => (todo.isShared ? "owner" : null);

  const [section, setSection] = useState("work"); // 'work' | 'personal' | 'thoughts'
  const [sheet, setSheet] = useState(null); // null | { todo } | { todo: null }
  const [pendingBudgetRequest, setPendingBudgetRequest] = useState(null);
  useEffect(() => {
    if (access?.role !== "guardian") return;
    const unsub = watchMyPendingBudgetRequest(user.email, setPendingBudgetRequest);
    return () => unsub();
  }, [access?.role, user.email]);
  async function handleRequestBudgetAccess() {
    await createBudgetAccessRequest(user.email);
  }
  const [page, setPage] = useState("main"); // 'main' | 'budget' | 'sharedBudget' | 'access' | 'nightly'

  // Every screen is a fixed-height shell with its own internal scrolling, so
  // the document must never scroll behind one.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ---------- Work / Personal ----------
  // Categories that aren't someone's shared bucket still show as a small label
  // on the row, so nothing filed under them is lost from view.
  const shareCategoryIds = new Set(assignable.map((p) => p.categoryId));
  function withCategoryName(t) {
    if (!t.categoryId || shareCategoryIds.has(t.categoryId)) return t;
    const cat = ownCategories.find((c) => c.id === t.categoryId);
    return cat ? { ...t, categoryName: cat.name } : t;
  }
  function todosForList(listKey) {
    const own = ownTodos.filter((t) => t.list === listKey).map(withCategoryName);
    if (listKey === "work" && sharingWork) {
      const shared = sharedTodos
        .filter((t) => t.list === "work" && t.categoryId === access?.sharedWorkCategoryId)
        .map((t) => ({ ...t, isShared: true }));
      return [...own, ...shared];
    }
    return own;
  }
  const targetUidOf = (todo) => (todo.isShared ? ownerUid : uid);

  function computeNextDue(currentDue, recurrence) {
    const base = currentDue ? new Date(currentDue + "T00:00:00") : new Date();
    if (recurrence.type === "daily") base.setDate(base.getDate() + 1);
    else if (recurrence.type === "weekly") base.setDate(base.getDate() + 7);
    else if (recurrence.type === "monthly") base.setMonth(base.getMonth() + 1);
    else if (recurrence.type === "custom") base.setDate(base.getDate() + (recurrence.intervalDays || 1));
    return dateStr(base);
  }

  function recurrenceFor(repeat, existing) {
    if (repeat === "none") return null;
    if (repeat === "custom") return existing || { type: "custom", intervalDays: 1 };
    return { type: repeat };
  }

  // A time with no date lands today, or tomorrow once that slot has passed,
  // so a reminder is never born in the past.
  function reminderFields(due, time) {
    if (!time) return { due: due || null, timeSensitive: false, notifyAt: null };
    const today = dateStr();
    const day = due || (time <= nowHM() ? addDays(today, 1) : today);
    return { due: day, timeSensitive: true, notifyAt: `${day}T${time}:00` };
  }

  async function saveTodo(values) {
    const existing = sheet?.todo || null;
    const person = values.who && values.who !== "me" ? assignable.find((p) => p.id === values.who) : null;
    const rem = reminderFields(values.due, values.time);
    try {
      if (!existing) {
        await addDoc(collection(db, "users", uid, "todos"), {
          list: values.list,
          text: values.text,
          categoryId: values.list === "work" && person ? person.categoryId : null,
          due: rem.due,
          done: false,
          recurrence: recurrenceFor(values.repeat, null),
          timeSensitive: rem.timeSensitive,
          notifyAt: rem.notifyAt,
          notified: false,
          createdAt: serverTimestamp(),
        });
      } else {
        const patch = {
          text: values.text,
          list: values.list,
          due: rem.due,
          recurrence: recurrenceFor(values.repeat, existing.recurrence),
          timeSensitive: rem.timeSensitive,
          notifyAt: rem.notifyAt,
        };
        // Only re-arm the Telegram ping when the moment actually moved;
        // editing the text of a delivered reminder mustn't send it again.
        if ((rem.notifyAt || null) !== (existing.notifyAt || null)) patch.notified = false;
        if (values.who !== undefined && !existing.isShared) {
          patch.categoryId = values.list === "work" && person ? person.categoryId : null;
        }
        // Moving a todo to Personal takes it out of anyone's shared bucket.
        if (values.list !== "work" && assigneeOf(existing)) patch.categoryId = null;
        await updateDoc(doc(db, "users", targetUidOf(existing), "todos", existing.id), patch);
      }
      setSheet(null);
    } catch (err) {
      console.error("save todo error", err);
      alert("Couldn't save that: " + err.message);
    }
  }

  async function toggleDone(todo) {
    const targetUid = targetUidOf(todo);
    const nowDone = !todo.done;
    await updateDoc(doc(db, "users", targetUid, "todos", todo.id), { done: nowDone });
    if (nowDone && todo.recurrence) {
      const nextDue = computeNextDue(todo.due, todo.recurrence);
      const time = todo.timeSensitive && todo.notifyAt ? todo.notifyAt.slice(11, 16) : null;
      await addDoc(collection(db, "users", targetUid, "todos"), {
        list: todo.list,
        text: todo.text,
        categoryId: todo.categoryId || null,
        due: nextDue,
        done: false,
        recurrence: todo.recurrence,
        // The next one keeps the same reminder time, on its own day.
        timeSensitive: !!time,
        notifyAt: time ? `${nextDue}T${time}:00` : null,
        notified: false,
        createdAt: serverTimestamp(),
      });
    }
  }

  // Moves a todo to tomorrow, keeping its reminder time if it has one.
  async function pushToTomorrow(todo) {
    const tomorrow = addDays(dateStr(), 1);
    const time = todo.timeSensitive && todo.notifyAt ? todo.notifyAt.slice(11, 16) : null;
    await updateDoc(doc(db, "users", targetUidOf(todo), "todos", todo.id), {
      due: tomorrow,
      ...(time ? { notifyAt: `${tomorrow}T${time}:00`, notified: false } : {}),
    });
  }

  async function deleteTodo() {
    const todo = sheet?.todo;
    if (!todo) return;
    if (todo.isShared) {
      alert("Only the owner can delete shared todos.");
      return;
    }
    try {
      await deleteDoc(doc(db, "users", uid, "todos", todo.id));
      setSheet(null);
    } catch (err) {
      console.error("delete todo error", err);
    }
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
    // "Set up tomorrow": today's unfinished todos (and anything overdue) plus
    // what's already due tomorrow, so the evening routine ends with tomorrow
    // sorted. Edits open the same sheet as the main screen.
    const today = dateStr();
    const tomorrow = addDays(today, 1);
    const allTodos = [...todosForList("work"), ...todosForList("personal")];
    const plan = {
      leftovers: allTodos.filter((t) => !t.done && t.due && t.due <= today),
      tomorrow: allTodos.filter((t) => !t.done && t.due === tomorrow),
      assigneeOf,
      onPush: pushToTomorrow,
      onDone: toggleDone,
      onOpen: (todo) => setSheet({ todo }),
    };
    return (
      <>
        <Nightly
          uid={uid}
          onBack={() => setPage("main")}
          plan={plan}
          household={access?.role === "owner" || access?.role === "household"}
          myName={(user.displayName || user.email || "").split(/[ @]/)[0]}
        />
        {sheet && (
          <QuickAdd
            todo={sheet.todo}
            defaultList="work"
            people={assignable}
            canAssign={isOwner}
            assigneeOf={assigneeOf}
            onSave={saveTodo}
            onDelete={sheet.todo && !sheet.todo.isShared ? deleteTodo : null}
            onClose={() => setSheet(null)}
          />
        )}
      </>
    );
  }

  const isThoughts = section === "thoughts";
  const sections = [
    { id: "work", label: "Work" },
    { id: "personal", label: "Personal" },
    { id: "thoughts", label: "Thoughts" },
  ];
  const iconBtn = {
    width: 36, height: 36, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center",
    border: "none", cursor: "pointer", background: D.surface, color: D.text,
  };

  return (
    <div className="orbit-shell" style={{
      position: "relative", overflow: "hidden", display: "flex", flexDirection: "column",
      background: pageBackground, color: D.text, fontFamily: FONT_BODY,
    }}>
      <div style={{ flex: 1, minHeight: 0, width: "100%", maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        <header style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
          padding: "12px 16px 10px", paddingTop: "calc(12px + env(safe-area-inset-top))",
        }}>
          <OrbitMark size={26} />
          <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 20, marginRight: "auto" }}>Orbit</span>
          <button style={iconBtn} title="Budget" aria-label="Budget" onClick={() => setPage("budget")}><Wallet size={17} /></button>
          <button style={iconBtn} title="Nightly routine" aria-label="Nightly routine" onClick={() => setPage("nightly")}><Moon size={17} /></button>
          {access?.role === "guardian" && access?.budgetShared === true && (
            <button style={iconBtn} title="Shared budget" aria-label="Shared budget" onClick={() => setPage("sharedBudget")}><Users size={17} /></button>
          )}
          {(access?.role === "owner" || access?.role === "household") && (
            <button style={iconBtn} title="Access" aria-label="Access" onClick={() => setPage("access")}><Settings size={17} /></button>
          )}
          <UserMenu user={user} access={access} isDesktop={false}
            pendingBudgetRequest={pendingBudgetRequest} onRequestBudgetAccess={handleRequestBudgetAccess} />
        </header>

        <nav aria-label="Sections" style={{ flexShrink: 0, padding: "0 16px 6px" }}>
          <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 999, background: D.surface }}>
            {sections.map((s) => {
              const on = section === s.id;
              return (
                <button key={s.id} onClick={() => setSection(s.id)} aria-pressed={on} style={{
                  flex: 1, border: "none", cursor: "pointer", borderRadius: 999, padding: "9px 0",
                  fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700,
                  background: on ? D.text : "transparent", color: on ? D.bgBottom : D.muted,
                  transition: "background .25s ease, color .25s ease",
                }}>{s.label}</button>
              );
            })}
          </div>
        </nav>

        {isThoughts ? (
          <Thoughts uid={uid} thoughts={thoughts} people={people} listTail="calc(24px + env(safe-area-inset-bottom))" />
        ) : (
          <TodoSection
            key={section}
            todos={todosForList(section)}
            assigneeOf={assigneeOf}
            sharedFromOf={sharedFromOf}
            onToggle={toggleDone}
            onOpen={(todo) => setSheet({ todo })}
            listTail={LIST_TAIL}
          />
        )}
      </div>

      {!isThoughts && (
        <button onClick={() => setSheet({ todo: null })} aria-label={`Add to ${section}`} style={{
          position: "fixed", right: 20, bottom: "calc(22px + env(safe-area-inset-bottom))", zIndex: 50,
          width: 60, height: 60, borderRadius: "50%", border: "none", cursor: "pointer",
          background: D.amber, color: D.onAmber, display: "grid", placeItems: "center",
          boxShadow: `0 12px 30px -8px ${D.amber}`,
        }}>
          <Plus size={30} strokeWidth={2.6} />
        </button>
      )}

      {sheet && (
        <QuickAdd
          todo={sheet.todo}
          defaultList={section === "personal" ? "personal" : "work"}
          people={assignable}
          canAssign={isOwner}
          assigneeOf={assigneeOf}
          onSave={saveTodo}
          onDelete={sheet.todo && !sheet.todo.isShared ? deleteTodo : null}
          onClose={() => setSheet(null)}
        />
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

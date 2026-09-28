import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, Mic, Plus, Check, Pencil, Trash2, CornerUpRight, X, MoreHorizontal } from "lucide-react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { D, FONT_DISPLAY, FONT_BODY, faceColor, initials } from "./tokens";
import { dateStr, dayLabel } from "./dates";
import useKeyboardInset from "./useKeyboardInset";

// Thoughts as a private Messages inbox: one conversation per person, plus
// "Just me" for thoughts that aren't about anyone. Everything here lives
// under users/{uid}, so it is only ever visible to the person who wrote it.
//
// Data is unchanged from before the redesign: thoughts {text, personId, due,
// done, createdAt} and people {name, color}. A thought with no personId is in
// "Just me".

const JUST_ME = "__me__";

const millis = (ts) => (ts && typeof ts.toMillis === "function" ? ts.toMillis() : Date.now());

function relTime(ms) {
  const d = new Date(ms);
  const today = dateStr();
  const day = dateStr(d);
  if (day === today) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const diff = (new Date(today + "T00:00:00") - new Date(day + "T00:00:00")) / 86400000;
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Avatar({ name, colorKey, size = 44, me }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
      background: me ? D.accent : faceColor(colorKey || name), color: me ? "#fff" : D.onAmber,
      fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: size * 0.36,
    }}>{me ? "Me" : initials(name)}</span>
  );
}

// ---------- speech-to-text ----------
// Plain dictation from the browser, no AI: what you say is typed into the box.
const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

function useDictation(onText) {
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  function toggle() {
    if (!SpeechRecognition) return;
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SpeechRecognition();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(" ").trim();
      if (text) onText(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }
  useEffect(() => () => recRef.current?.abort?.(), []);
  return { supported: !!SpeechRecognition, listening, toggle };
}

// ---------- inbox ----------
function Inbox({ convos, onOpen, onNewPerson, listTail }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  async function create() {
    const id = await onNewPerson(name);
    setName("");
    setAdding(false);
    if (id) onOpen(id);
  }

  return (
    <div className="orbit-scroll" style={{ flex: 1, minHeight: 0, padding: `6px 16px ${listTail}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 4px 12px" }}>
        <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 26 }}>Thoughts</h1>
        <span style={{ fontSize: 12, color: D.muted }}>Private to you</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {convos.map((c) => (
          <button key={c.id} onClick={() => onOpen(c.id)} style={{
            display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 18, border: "none",
            background: D.surface, color: D.text, textAlign: "left", cursor: "pointer", fontFamily: FONT_BODY,
          }}>
            <Avatar name={c.name} colorKey={c.name} me={c.id === JUST_ME} />
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <b style={{ fontSize: 15 }}>{c.name}</b>
                {c.last && <span style={{ fontSize: 12, color: D.faint, flexShrink: 0 }}>{relTime(millis(c.last.createdAt))}</span>}
              </span>
              <span style={{ fontSize: 13, color: D.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.last ? c.last.text : "No thoughts yet"}
              </span>
            </span>
            {c.open > 0 && (
              <span style={{
                minWidth: 22, height: 22, borderRadius: 999, padding: "0 6px", display: "grid", placeItems: "center",
                background: D.accent, color: "#fff", fontSize: 11.5, fontWeight: 800,
              }}>{c.open}</span>
            )}
          </button>
        ))}

        {adding ? (
          <div style={{ display: "flex", gap: 8, padding: 8, borderRadius: 18, background: D.surface }}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name"
              onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAdding(false); }}
              style={{
                flex: 1, minWidth: 0, border: "none", borderRadius: 12, padding: "10px 12px", fontSize: 15,
                background: D.surfaceStrong, color: D.text, fontFamily: FONT_BODY, outline: "none",
              }} />
            <button onClick={create} disabled={!name.trim()} style={{
              border: "none", borderRadius: 12, padding: "0 14px", fontWeight: 700, cursor: "pointer",
              background: D.text, color: D.bgBottom, fontFamily: FONT_BODY, opacity: name.trim() ? 1 : 0.5,
            }}>Start</button>
            <button onClick={() => setAdding(false)} aria-label="Cancel" style={{ border: "none", background: "transparent", color: D.muted, cursor: "pointer", display: "flex", alignItems: "center" }}>
              <X size={18} />
            </button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 18,
            border: `1.5px dashed ${D.line}`, background: "transparent", color: D.muted,
            fontFamily: FONT_BODY, fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>
            <Plus size={18} /> New conversation
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- one conversation ----------
function Bubble({ thought, selected, onSelect }) {
  const today = dateStr();
  const overdue = thought.due && !thought.done && thought.due < today;
  return (
    <div style={{ alignSelf: "flex-end", maxWidth: "82%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
      <button onClick={onSelect} style={{
        border: "none", cursor: "pointer", textAlign: "left", fontFamily: FONT_BODY,
        padding: "9px 13px", borderRadius: "18px 18px 6px 18px", fontSize: 15, lineHeight: 1.4,
        color: thought.done ? D.muted : "#fff",
        background: thought.done ? D.surfaceStrong : `linear-gradient(135deg, ${D.accent}, ${D.accent2})`,
        textDecoration: thought.done ? "line-through" : "none",
        outline: selected ? `2px solid ${D.text}` : "none", outlineOffset: 2,
        whiteSpace: "pre-wrap", overflowWrap: "anywhere",
      }}>
        {thought.text}
      </button>
      {(thought.due || thought.done) && (
        <span style={{ fontSize: 11, color: overdue ? D.red : D.faint, display: "flex", gap: 4, alignItems: "center" }}>
          {thought.done && <Check size={11} />}
          {thought.done ? "Done" : `By ${dayLabel(thought.due, today)}`}
        </span>
      )}
    </div>
  );
}

function Conversation({ convo, thoughts, people, onBack, onSend, onToggle, onEdit, onMove, onDelete, onDeletePerson, onRenamePerson }) {
  const inset = useKeyboardInset();
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null); // thought being edited
  const [moving, setMoving] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'thought' | 'person'
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(convo.name);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const dictation = useDictation((text) => setDraft((d) => (d ? d + " " : "") + text));

  const sorted = useMemo(() => [...thoughts].sort((a, b) => millis(a.createdAt) - millis(b.createdAt)), [thoughts]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [sorted.length, inset]);

  const sel = sorted.find((t) => t.id === selected) || null;
  const isPerson = convo.id !== JUST_ME;

  async function send() {
    const text = draft.trim();
    if (!text) return;
    if (editing) {
      await onEdit(editing.id, text);
      setEditing(null);
    } else {
      await onSend(text);
    }
    setDraft("");
  }

  function startEdit(t) {
    setEditing(t);
    setDraft(t.text);
    setSelected(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // Day stamps between groups, like a messages app.
  let lastDay = null;
  const items = [];
  sorted.forEach((t) => {
    const day = dateStr(new Date(millis(t.createdAt)));
    if (day !== lastDay) {
      items.push(<div key={"d" + day} style={{ alignSelf: "center", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: D.faint, margin: "8px 0 2px" }}>{dayLabel(day)}</div>);
      lastDay = day;
    }
    items.push(<Bubble key={t.id} thought={t} selected={selected === t.id} onSelect={() => setSelected(selected === t.id ? null : t.id)} />);
  });

  const actionBtn = {
    display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 999, padding: "9px 13px",
    background: D.surfaceStrong, color: D.text, fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700, cursor: "pointer",
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "4px 12px 10px", borderBottom: `1px solid ${D.line}` }}>
        <button onClick={onBack} aria-label="Back to all conversations" style={{ border: "none", background: "transparent", color: D.text, padding: 6, cursor: "pointer", display: "flex" }}>
          <ArrowLeft size={22} />
        </button>
        <Avatar name={convo.name} colorKey={convo.name} size={36} me={!isPerson} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {renaming ? (
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && newName.trim()) { await onRenamePerson(newName.trim()); setRenaming(false); }
                if (e.key === "Escape") setRenaming(false);
              }}
              onBlur={() => setRenaming(false)}
              style={{ width: "100%", border: "none", borderRadius: 10, padding: "6px 10px", fontSize: 15, fontWeight: 700, background: D.surfaceStrong, color: D.text, fontFamily: FONT_BODY, outline: "none" }} />
          ) : (
            <div style={{ fontWeight: 800, fontSize: 16 }}>{convo.name}</div>
          )}
          <div style={{ fontSize: 11.5, color: D.muted }}>{thoughts.length} thought{thoughts.length === 1 ? "" : "s"} · private</div>
        </div>
        {isPerson && (
          <button onClick={() => setMenu((m) => !m)} aria-label="Conversation options" style={{ border: "none", background: "transparent", color: D.muted, padding: 6, cursor: "pointer", display: "flex" }}>
            <MoreHorizontal size={22} />
          </button>
        )}
      </div>

      {menu && (
        <div style={{ flexShrink: 0, display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 16px", borderBottom: `1px solid ${D.line}` }}>
          <button style={actionBtn} onClick={() => { setRenaming(true); setMenu(false); }}><Pencil size={14} /> Rename</button>
          {confirm === "person" ? (
            <button style={{ ...actionBtn, background: D.red, color: "#fff" }} onClick={onDeletePerson}>
              Remove {convo.name}? Thoughts move to Just me
            </button>
          ) : (
            <button style={{ ...actionBtn, color: D.red }} onClick={() => setConfirm("person")}><Trash2 size={14} /> Remove conversation</button>
          )}
        </div>
      )}

      <div className="orbit-scroll" style={{ flex: 1, minHeight: 0, padding: "10px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}
        onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
        {sorted.length === 0 && (
          <div style={{ margin: "auto", textAlign: "center", color: D.muted, fontSize: 14, maxWidth: 260 }}>
            {isPerson ? `Anything you want to remember about ${convo.name}. Only you can see this.` : "Notes to yourself. Only you can see this."}
          </div>
        )}
        {items}
        <div ref={endRef} />
      </div>

      {sel && !editing && (
        <div style={{ flexShrink: 0, padding: "8px 16px", display: "flex", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${D.line}` }}>
          {moving ? (
            <>
              <span style={{ alignSelf: "center", fontSize: 12.5, color: D.muted }}>Move to</span>
              {[{ id: JUST_ME, name: "Just me" }, ...people].filter((p) => p.id !== convo.id).map((p) => (
                <button key={p.id} style={actionBtn} onClick={async () => { await onMove(sel.id, p.id === JUST_ME ? null : p.id); setMoving(false); setSelected(null); }}>
                  {p.name}
                </button>
              ))}
              <button style={actionBtn} onClick={() => setMoving(false)}><X size={14} /></button>
            </>
          ) : (
            <>
              <button style={actionBtn} onClick={() => { onToggle(sel); setSelected(null); }}><Check size={14} /> {sel.done ? "Not done" : "Done"}</button>
              <button style={actionBtn} onClick={() => startEdit(sel)}><Pencil size={14} /> Edit</button>
              <button style={actionBtn} onClick={() => setMoving(true)}><CornerUpRight size={14} /> Move</button>
              {confirm === sel.id ? (
                <button style={{ ...actionBtn, background: D.red, color: "#fff" }} onClick={async () => { await onDelete(sel.id); setConfirm(null); setSelected(null); }}>Delete it</button>
              ) : (
                <button style={{ ...actionBtn, color: D.red }} onClick={() => setConfirm(sel.id)}><Trash2 size={14} /></button>
              )}
            </>
          )}
        </div>
      )}

      <div style={{
        flexShrink: 0, display: "flex", alignItems: "flex-end", gap: 8, padding: "8px 12px",
        paddingBottom: inset ? 8 : "calc(10px + env(safe-area-inset-bottom))",
        marginBottom: inset, borderTop: `1px solid ${D.line}`,
      }}>
        {editing && (
          <button onClick={() => { setEditing(null); setDraft(""); }} aria-label="Cancel edit" style={{ border: "none", background: "transparent", color: D.muted, padding: 10, cursor: "pointer", display: "flex" }}>
            <X size={20} />
          </button>
        )}
        <textarea ref={inputRef} value={draft} rows={1} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={editing ? "Edit thought" : isPerson ? `A thought about ${convo.name}…` : "Dump a thought…"}
          style={{
            flex: 1, minWidth: 0, resize: "none", border: "none", borderRadius: 20, padding: "11px 14px",
            fontFamily: FONT_BODY, fontSize: 16, lineHeight: 1.35, background: D.surfaceStrong, color: D.text,
            outline: "none", fieldSizing: "content", maxHeight: 140,
          }} />
        {dictation.supported && !draft.trim() && (
          <button onClick={dictation.toggle} aria-label={dictation.listening ? "Stop dictation" : "Dictate"} style={{
            width: 42, height: 42, flexShrink: 0, borderRadius: "50%", border: "none", cursor: "pointer",
            display: "grid", placeItems: "center",
            background: dictation.listening ? D.red : D.surfaceStrong, color: dictation.listening ? "#fff" : D.text,
            animation: dictation.listening ? "glowPulse 1.4s ease-in-out infinite" : "none",
          }}><Mic size={19} /></button>
        )}
        {draft.trim() && (
          <button onClick={send} aria-label={editing ? "Save" : "Send"} style={{
            width: 42, height: 42, flexShrink: 0, borderRadius: "50%", border: "none", cursor: "pointer",
            display: "grid", placeItems: "center", background: D.accent, color: "#fff",
          }}>{editing ? <Check size={20} /> : <ArrowUp size={20} strokeWidth={2.6} />}</button>
        )}
      </div>
    </div>
  );
}

// ---------- screen ----------
export default function Thoughts({ uid, thoughts, people, listTail }) {
  const [openId, setOpenId] = useState(null);

  const convos = useMemo(() => {
    const summary = (id, name) => {
      const mine = thoughts.filter((t) => (id === JUST_ME ? !t.personId || !people.some((p) => p.id === t.personId) : t.personId === id));
      const last = mine.reduce((a, t) => (!a || millis(t.createdAt) > millis(a.createdAt) ? t : a), null);
      return { id, name, thoughts: mine, last, open: mine.filter((t) => !t.done).length };
    };
    const list = [summary(JUST_ME, "Just me"), ...people.map((p) => summary(p.id, p.name))];
    // Most recent conversation first; empty ones sink, Just me stays findable.
    return list.sort((a, b) => (b.last ? millis(b.last.createdAt) : 0) - (a.last ? millis(a.last.createdAt) : 0));
  }, [thoughts, people]);

  const convo = convos.find((c) => c.id === openId);
  const col = (name) => collection(db, "users", uid, name);

  async function addPerson(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = people.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;
    const ref = await addDoc(col("people"), { name: trimmed, color: "blue", createdAt: serverTimestamp() });
    return ref.id;
  }

  if (convo) {
    const personId = convo.id === JUST_ME ? null : convo.id;
    return (
      <Conversation
        key={convo.id}
        convo={convo}
        thoughts={convo.thoughts}
        people={people}
        onBack={() => setOpenId(null)}
        onSend={(text) => addDoc(col("thoughts"), { text, personId, due: null, done: false, createdAt: serverTimestamp() })}
        onToggle={(t) => updateDoc(doc(db, "users", uid, "thoughts", t.id), { done: !t.done })}
        onEdit={(id, text) => updateDoc(doc(db, "users", uid, "thoughts", id), { text })}
        onMove={(id, pid) => updateDoc(doc(db, "users", uid, "thoughts", id), { personId: pid })}
        onDelete={(id) => deleteDoc(doc(db, "users", uid, "thoughts", id))}
        onRenamePerson={(name) => updateDoc(doc(db, "users", uid, "people", convo.id), { name })}
        onDeletePerson={async () => {
          await Promise.all(convo.thoughts.map((t) => updateDoc(doc(db, "users", uid, "thoughts", t.id), { personId: null })));
          await deleteDoc(doc(db, "users", uid, "people", convo.id));
          setOpenId(null);
        }}
      />
    );
  }

  return <Inbox convos={convos} onOpen={setOpenId} onNewPerson={addPerson} listTail={listTail} />;
}

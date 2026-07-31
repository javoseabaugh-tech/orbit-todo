import { useEffect, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { Plus, Trash2, ChevronDown, X, ArrowUpRight, Users, Calendar, Tag, Check } from "lucide-react";
import { db } from "./firebase";
import { theme, PALETTE, glass, SPRING, BLUR_LIST_LIMIT } from "./theme";
import { MONO, display, mix, pillStyle, accentButtonStyle, fieldStyle, IconAction, fmtDay } from "./ui";

// `listTail` is the bottom clearance the mobile tab bar and FAB need; the
// desktop column passes nothing since it has its own padding.
export default function Workbench({ uid, categories, todos, sharedUid, sharedCategoryId, sharedCategories, listTail }) {
  const [ownProjects, setOwnProjects] = useState([]);
  const [sharedProjects, setSharedProjects] = useState([]);
  const [filterBucket, setFilterBucket] = useState(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategoryId, setDraftCategoryId] = useState(null);
  const [draftDeadline, setDraftDeadline] = useState("");
  // Tracks which uid the expanded project belongs to, so the milestone
  // listener reads from the right account.
  const [expanded, setExpanded] = useState(null);   // { id, uid } | null
  const [milestonesByProject, setMilestonesByProject] = useState({});

  useEffect(() => {
    const q = query(collection(db, "users", uid, "workbench"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setOwnProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [uid]);

  // The owner's projects, only when shared Work access is on. Scoped to the
  // approved category in the client, matching how the shared Work todo list
  // already works.
  useEffect(() => {
    if (!sharedUid || !sharedCategoryId) {
      setSharedProjects([]);
      return;
    }
    const q = query(
      collection(db, "users", sharedUid, "workbench"),
      where("categoryId", "==", sharedCategoryId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(
      q,
      (snap) => {
        setSharedProjects(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((p) => p.categoryId === sharedCategoryId)
        );
      },
      (err) => console.error("shared workbench snapshot error", err)
    );
  }, [sharedUid, sharedCategoryId]);

  useEffect(() => {
    if (!expanded) return;
    const q = query(
      collection(db, "users", expanded.uid, "workbench", expanded.id, "milestones"),
      orderBy("order", "asc")
    );
    return onSnapshot(
      q,
      (snap) => {
        setMilestonesByProject((m) => ({ ...m, [expanded.id]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }));
      },
      (err) => console.error("milestones snapshot error", err)
    );
  }, [expanded]);

  // One list, each entry tagged with whose account it lives in. Every handler
  // below reads project._uid rather than assuming the signed-in user.
  const projects = [
    ...ownProjects.map((p) => ({ ...p, _uid: uid, _shared: false })),
    ...sharedProjects.map((p) => ({ ...p, _uid: sharedUid, _shared: true })),
  ];

  async function addProject() {
    const title = draftTitle.trim();
    if (!title) return;
    await addDoc(collection(db, "users", uid, "workbench"), {
      title,
      categoryId: draftCategoryId,
      deadline: draftDeadline || null,
      createdAt: serverTimestamp(),
    });
    setDraftTitle("");
    setDraftCategoryId(null);
    setDraftDeadline("");
    setShowAddPanel(false);
  }

  // Set or clear a project's deadline. Editable anytime from the expanded
  // view, so existing projects can get one too — not only new ones.
  async function setProjectDeadline(project, value) {
    if (project._shared) return;
    await updateDoc(doc(db, "users", uid, "workbench", project.id), { deadline: value || null });
  }

  async function deleteProject(project) {
    if (project._shared) return;
    if (!window.confirm("Delete this project and all its milestones? This can't be undone.")) return;
    const milestonesSnap = await getDocs(collection(db, "users", uid, "workbench", project.id, "milestones"));
    // Any milestone promoted into the daily list leaves a todo behind unless we
    // clear it here too — that todo would otherwise keep pointing at a
    // milestone that no longer exists.
    await Promise.all(milestonesSnap.docs.map(async (d) => {
      const promotedTodoId = d.data().promotedTodoId;
      if (promotedTodoId) await deleteLinkedTodo_(promotedTodoId);
      await deleteDoc(d.ref);
    }));
    await deleteDoc(doc(db, "users", uid, "workbench", project.id));
  }

  // The todo may already be gone — deleted by hand from the todo list.
  // Swallow that case so it never blocks the milestone-side cleanup.
  async function deleteLinkedTodo_(todoId) {
    try {
      await deleteDoc(doc(db, "users", uid, "todos", todoId));
    } catch (e) {
      console.error("Workbench: linked todo cleanup failed", e);
    }
  }

  async function addMilestone(project, text, due) {
    if (project._shared) return;
    const existing = milestonesByProject[project.id] || [];
    await addDoc(collection(db, "users", uid, "workbench", project.id, "milestones"), {
      text, due: due || null, done: false, order: existing.length,
    });
  }

  // Edit a milestone's text and/or due date. Keeps a promoted todo in sync,
  // the same way toggleMilestone keeps `done` in sync.
  async function editMilestone(project, milestone, text, due) {
    if (project._shared) return;
    await updateDoc(
      doc(db, "users", uid, "workbench", project.id, "milestones", milestone.id),
      { text, due: due || null }
    );
    if (milestone.promotedTodoId) {
      await updateDoc(doc(db, "users", uid, "todos", milestone.promotedTodoId), { text, due: due || null });
    }
  }

  // Allowed on shared projects — rules permit an update touching only `done`.
  async function toggleMilestone(project, milestone) {
    const newDone = !milestone.done;
    await updateDoc(
      doc(db, "users", project._uid, "workbench", project.id, "milestones", milestone.id),
      { done: newDone }
    );
    if (milestone.promotedTodoId) {
      await updateDoc(doc(db, "users", project._uid, "todos", milestone.promotedTodoId), { done: newDone });
    }
  }

  async function promoteMilestone(project, milestone) {
    if (project._shared || milestone.promotedTodoId) return;
    const categoryId = project.categoryId || null;
    // Route by the project's own category rather than always dumping into
    // Personal. An untagged project still goes to Personal — categoryBucket
    // can't classify a null category, and guessing would be worse.
    const list = categoryId ? categoryBucket(categoryId) : "personal";

    const ref = await addDoc(collection(db, "users", uid, "todos"), {
      list,
      text: milestone.text,
      categoryId,
      due: milestone.due || null,
      done: milestone.done || false,
      recurrence: null,
      workbenchProjectId: project.id,
      workbenchMilestoneId: milestone.id,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "users", uid, "workbench", project.id, "milestones", milestone.id), { promotedTodoId: ref.id });
  }

  // Mirror of promote: removes the linked todo and clears the link. The
  // milestone itself stays exactly as it is, including its done state.
  async function unpromoteMilestone(project, milestone) {
    if (project._shared || !milestone.promotedTodoId) return;
    if (!window.confirm("Remove this from your todo list? The milestone stays here — only the todo is deleted.")) return;
    await deleteLinkedTodo_(milestone.promotedTodoId);
    await updateDoc(doc(db, "users", uid, "workbench", project.id, "milestones", milestone.id), { promotedTodoId: null });
  }

  async function deleteMilestone(project, milestone) {
    if (project._shared) return;
    if (milestone.promotedTodoId
      && !window.confirm("This milestone is in your todo list. Delete both?")) return;
    if (milestone.promotedTodoId) await deleteLinkedTodo_(milestone.promotedTodoId);
    await deleteDoc(doc(db, "users", uid, "workbench", project.id, "milestones", milestone.id));
  }

  function categoryBucket(categoryId) {
    const hasWork = todos.some((t) => t.categoryId === categoryId && t.list === "work");
    if (hasWork) return "work";
    const hasPersonal = todos.some((t) => t.categoryId === categoryId && t.list === "personal");
    if (hasPersonal) return "personal";
    return "work";
  }

  // A shared project's category lives in the owner's category list, not ours.
  function categoryFor(project) {
    const list = project._shared ? (sharedCategories || []) : categories;
    return list.find((c) => c.id === project.categoryId);
  }

  const filteredProjects = filterBucket
    ? projects.filter((p) => categoryBucket(p.categoryId) === filterBucket)
    : projects;
  // Soonest deadline first; projects with no deadline sink to the bottom.
  // Sort is stable, so same-deadline projects keep their newest-first order.
  const visibleProjects = [...filteredProjects].sort((a, b) => {
    const ad = a.deadline || "";
    const bd = b.deadline || "";
    if (ad && bd) return ad < bd ? -1 : ad > bd ? 1 : 0;
    if (ad) return -1;
    if (bd) return 1;
    return 0;
  });
  function progressFor(projectId) {
    const ms = milestonesByProject[projectId];
    if (!ms || ms.length === 0) return 0;
    return Math.round((ms.filter((m) => m.done).length / ms.length) * 100);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
        <div style={{ display: "flex", gap: 7 }}>
          {["work", "personal"].map((bucket) => (
            <button
              key={bucket}
              onClick={() => setFilterBucket(filterBucket === bucket ? null : bucket)}
              style={pillStyle(filterBucket === bucket)}
            >
              {bucket === "work" ? "Work" : "Personal"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAddPanel((s) => !s)}
          style={{
            ...accentButtonStyle(true), display: "flex", alignItems: "center", gap: 6,
            padding: "8px 15px", borderRadius: 13, fontSize: 12.5, fontWeight: 600,
            whiteSpace: "nowrap", flexShrink: 0,
          }}
        >
          <Plus size={15} /> New project
        </button>
      </div>

      {showAddPanel && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            ...glass.card, flexShrink: 0, padding: 15, borderRadius: 22, marginBottom: 12,
            border: `1px solid ${theme.accentPlum}`,
            boxShadow: `inset 0 1px 0 ${theme.glassSpec}, 0 0 0 3px ${theme.accentSoft}, 0 14px 36px -22px ${theme.glassShadow}`,
            animation: `popIn .3s ${SPRING}`,
          }}
        >
          <input
            autoFocus
            placeholder="Project title"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addProject()}
            style={{ ...fieldStyle(), fontSize: 15, marginBottom: 11 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 11 }}>
            <Tag size={14} color={theme.textFainter} />
            {categories.map((cat) => {
              const on = draftCategoryId === cat.id;
              const palette = PALETTE[cat.color] || PALETTE.blue;
              return (
                <button
                  key={cat.id}
                  onClick={() => setDraftCategoryId(on ? null : cat.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 999,
                    fontSize: 12, fontWeight: 500, cursor: "pointer",
                    color: on ? palette.text : theme.textMuted,
                    background: on ? palette.bg : theme.inputBg,
                    border: `1px solid ${on ? palette.dot : theme.glassBorder2}`,
                    transition: `all .25s ${SPRING}`,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: palette.dot }} />
                  {cat.name}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 13 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: theme.textFainter }}>
              <Calendar size={13} />
              Deadline (optional)
            </span>
            <input
              type="date"
              value={draftDeadline}
              onChange={(e) => setDraftDeadline(e.target.value)}
              style={{ ...fieldStyle(), width: "auto", padding: "7px 11px", borderRadius: 11, fontFamily: MONO, fontSize: 12.5, color: theme.textSecondary }}
            />
            {draftDeadline && (
              <button onClick={() => setDraftDeadline("")} style={{ border: "none", background: "transparent", color: theme.textFainter, fontSize: 11.5, fontWeight: 500, cursor: "pointer", padding: 2 }}>
                Clear
              </button>
            )}
          </div>
          <button
            onClick={addProject}
            disabled={!draftTitle.trim()}
            style={{ ...accentButtonStyle(!!draftTitle.trim()), width: "100%", padding: "11px 14px", borderRadius: 14, fontSize: 13, fontWeight: 600 }}
          >
            Create project
          </button>
        </div>
      )}

      <div
        className="orbit-scroll"
        style={{
          flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 11,
          paddingBottom: listTail || 4,
        }}
      >
        {projects.length === 0 && (
          <div style={{ padding: "32px 16px", borderRadius: 20, border: `1px dashed ${theme.glassBorder2}`, textAlign: "center", fontSize: 13, color: theme.textFainter }}>
            No projects yet — create your first one above.
          </div>
        )}
        {visibleProjects.map((project) => {
          const category = categoryFor(project);
          const isExpanded = expanded && expanded.id === project.id;
          const progress = progressFor(project.id);
          const milestones = milestonesByProject[project.id] || [];
          const promoteTarget = project.categoryId ? categoryBucket(project.categoryId) : "personal";
          const shared = project._shared;
          return (
            <div
              key={`${project._uid}-${project.id}`}
              style={{
                ...(visibleProjects.length > BLUR_LIST_LIMIT ? glass.cardFlat : glass.card),
                padding: 15, borderRadius: 22,
                border: `1px solid ${shared ? theme.accentPlum : theme.glassBorder}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : { id: project.id, uid: project._uid })}
                  style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
                >
                  <ChevronDown
                    size={15}
                    color={theme.textFainter}
                    style={{ flexShrink: 0, transform: isExpanded ? "none" : "rotate(-90deg)", transition: `transform .35s ${SPRING}` }}
                  />
                  <span style={{ ...display(16), color: theme.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {project.title}
                  </span>
                </button>
                {shared && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
                    fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 999,
                    color: theme.accentPlum, background: theme.accentSoft,
                    border: `1px solid ${mix(theme.accentPlum, 34)}`,
                  }}>
                    <Users size={10} /> Shared
                  </span>
                )}
                {category && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", flexShrink: 0,
                    fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 999,
                    color: PALETTE[category.color].text, background: PALETTE[category.color].bg,
                    border: `1px solid ${mix(PALETTE[category.color].dot, 34)}`,
                  }}>
                    {category.name}
                  </span>
                )}
                {!shared && (
                  <IconAction onClick={() => deleteProject(project)} title="Delete project" hoverColor={theme.accentRed} size={4}>
                    <Trash2 size={14} />
                  </IconAction>
                )}
              </div>

              <div style={{ position: "relative", marginTop: 12, height: 7, borderRadius: 99, background: theme.inputBg, overflow: "hidden" }}>
                <div style={{
                  width: `${progress}%`, height: "100%", borderRadius: 99,
                  background: `linear-gradient(90deg, ${theme.accentPlum}, ${theme.accent2})`,
                  boxShadow: `0 0 14px -2px ${theme.accentPlum}`,
                  transition: `width .7s ${SPRING}`,
                }} />
                <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 99, pointerEvents: "none" }}>
                  <span style={{
                    position: "absolute", top: 0, bottom: 0, width: "34%",
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)",
                    animation: "shimmer 2.6s ease-in-out infinite",
                  }} />
                </div>
              </div>
              <div style={{ marginTop: 7, fontFamily: MONO, fontSize: 11.5, color: theme.textFainter }}>
                {progress}%{milestones.length ? ` · ${milestones.filter((m) => m.done).length}/${milestones.length} milestones` : ""}{project.deadline ? ` · due ${fmtDay(project.deadline)}` : ""}
              </div>

              {isExpanded && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${theme.glassBorder2}` }}>
                  {!shared && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: theme.textFainter }}>
                        <Calendar size={13} />
                        Deadline
                      </span>
                      <input
                        type="date"
                        value={project.deadline || ""}
                        onChange={(e) => setProjectDeadline(project, e.target.value)}
                        style={{ ...fieldStyle(), width: "auto", padding: "7px 11px", borderRadius: 11, fontFamily: MONO, fontSize: 12.5, color: theme.textSecondary }}
                      />
                      {project.deadline && (
                        <button onClick={() => setProjectDeadline(project, "")} style={{ border: "none", background: "transparent", color: theme.textFainter, fontSize: 11.5, fontWeight: 500, cursor: "pointer", padding: 2 }}>
                          Clear
                        </button>
                      )}
                    </div>
                  )}
                  {milestones.map((m) => (
                    <MilestoneRow
                      key={m.id}
                      milestone={m}
                      shared={shared}
                      deadline={project.deadline}
                      promoteTarget={promoteTarget}
                      onToggle={() => toggleMilestone(project, m)}
                      onPromote={() => promoteMilestone(project, m)}
                      onUnpromote={() => unpromoteMilestone(project, m)}
                      onDelete={() => deleteMilestone(project, m)}
                      onEdit={(text, due) => editMilestone(project, m, text, due)}
                    />
                  ))}
                  {!shared && <MilestoneAddRow deadline={project.deadline} onAdd={(text, due) => addMilestone(project, text, due)} />}
                  {shared && milestones.length === 0 && (
                    <div style={{ fontSize: 12, color: theme.textFainter, padding: "8px 0" }}>
                      No milestones yet.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MilestoneRow({ milestone, shared, deadline, promoteTarget, onToggle, onPromote, onUnpromote, onDelete, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(milestone.text);
  const [due, setDue] = useState(milestone.due || "");

  function startEdit() {
    if (shared) return;
    setText(milestone.text);
    setDue(milestone.due || "");
    setEditing(true);
  }
  function save() {
    const t = text.trim();
    if (!t) { setEditing(false); return; }
    onEdit(t, due || null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ display: "flex", gap: 7, padding: "7px 0", alignItems: "center", flexWrap: "wrap" }}>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          style={{ ...fieldStyle(), flex: 1, minWidth: 120, padding: "9px 12px", borderRadius: 12, fontSize: 13 }}
        />
        <input
          type="date"
          value={due}
          max={deadline || undefined}
          onChange={(e) => setDue(e.target.value)}
          style={{ ...fieldStyle(), width: "auto", padding: "8px 11px", borderRadius: 11, fontFamily: MONO, fontSize: 12, color: theme.textSecondary }}
        />
        <button onClick={save} style={{ ...accentButtonStyle(true), padding: "9px 15px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
          Save
        </button>
        <button onClick={() => setEditing(false)} style={{ border: "none", background: "transparent", color: theme.textFainter, fontSize: 12, fontWeight: 500, cursor: "pointer", padding: 4 }}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
      <button
        onClick={onToggle}
        style={{
          width: 19, height: 19, borderRadius: 7, flexShrink: 0, padding: 0, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `1.5px solid ${milestone.done ? theme.accentPlum : theme.glassBorder2}`,
          background: milestone.done ? `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})` : "transparent",
          boxShadow: milestone.done ? `0 3px 10px -4px ${theme.accentPlum}` : "none",
          transition: `all .3s ${SPRING}`,
        }}
      >
        {milestone.done && <Check size={10} color={theme.accentInk} strokeWidth={3.5} style={{ animation: `tick .45s ${SPRING}` }} />}
      </button>
      <span
        onClick={startEdit}
        title={!shared ? "Tap to edit" : undefined}
        style={{
          flex: 1, minWidth: 0, fontSize: 13.5,
          color: milestone.done ? theme.textFainter : theme.textSecondary,
          textDecoration: milestone.done ? "line-through" : "none",
          cursor: shared ? "default" : "pointer",
        }}
      >
        {milestone.text}
      </span>
      {milestone.due && (
        <span style={{ fontFamily: MONO, fontSize: 11, color: theme.textFainter, flexShrink: 0 }}>{fmtDay(milestone.due)}</span>
      )}
      {!shared && (milestone.promotedTodoId ? (
        <button
          onClick={onUnpromote}
          title="Remove from today's list"
          style={{
            display: "flex", alignItems: "center", gap: 3, flexShrink: 0, cursor: "pointer",
            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
            color: theme.accentPlum, background: theme.accentSoft, border: `1px solid ${theme.accentPlum}`,
          }}
        >
          In today <X size={10} />
        </button>
      ) : (
        <IconAction
          onClick={onPromote}
          title={`Add to today's ${promoteTarget === "work" ? "Work" : "Personal"} list`}
          hoverColor={theme.accentPlum}
          size={3}
        >
          <ArrowUpRight size={13} />
        </IconAction>
      ))}
      {!shared && (
        <IconAction onClick={onDelete} title="Delete milestone" hoverColor={theme.accentRed} size={3}>
          <X size={13} />
        </IconAction>
      )}
    </div>
  );
}

function MilestoneAddRow({ deadline, onAdd }) {
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  function submit() {
    if (!text.trim()) return;
    onAdd(text.trim(), due);
    setText("");
    setDue("");
  }
  return (
    <div style={{ display: "flex", gap: 7, marginTop: 8, alignItems: "center" }}>
      <input
        placeholder="Add a milestone"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={{ ...fieldStyle(), flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 12, fontSize: 13 }}
      />
      <input
        type="date"
        value={due}
        max={deadline || undefined}
        onChange={(e) => setDue(e.target.value)}
        style={{ ...fieldStyle(), width: "auto", padding: "8px 11px", borderRadius: 11, fontFamily: MONO, fontSize: 12, color: theme.textSecondary }}
      />
      <button
        onClick={submit}
        style={{ ...accentButtonStyle(true), width: 38, height: 38, flexShrink: 0, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
import { useEffect, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { Plus, Trash2, ChevronDown, X, ArrowUpRight, Users } from "lucide-react";
import { db } from "./firebase";
import { theme, PALETTE } from "./theme";

export default function Workbench({ uid, categories, todos, sharedUid, sharedCategoryId, sharedCategories }) {
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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["work", "personal"].map((bucket) => (
            <button
              key={bucket}
              onClick={() => setFilterBucket(filterBucket === bucket ? null : bucket)}
              style={{
                padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                border: filterBucket === bucket ? `1px solid ${theme.accentPlum}` : `1px solid ${theme.border}`,
                background: filterBucket === bucket ? theme.oldPlumBg : "transparent",
                color: filterBucket === bucket ? theme.accentPlum : theme.textMuted,
              }}
            >
              {bucket === "work" ? "Work" : "Personal"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAddPanel((s) => !s)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: theme.accentPlum, color: theme.cardBg, borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}
        >
          <Plus size={16} /> New Project
        </button>
      </div>

      {showAddPanel && (
        <div style={{ background: theme.cardBg, borderRadius: 14, padding: 14, marginBottom: 14, border: `1px solid ${theme.border}` }}>
          <input
            placeholder="Project title"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addProject()}
            style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${theme.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setDraftCategoryId(draftCategoryId === cat.id ? null : cat.id)}
                style={{
                  padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                  background: draftCategoryId === cat.id ? PALETTE[cat.color].bg : "transparent",
                  color: draftCategoryId === cat.id ? PALETTE[cat.color].text : theme.textMuted,
                  border: `1px solid ${draftCategoryId === cat.id ? PALETTE[cat.color].dot : theme.border}`,
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted }}>Deadline (optional)</span>
            <input
              type="date"
              value={draftDeadline}
              onChange={(e) => setDraftDeadline(e.target.value)}
              style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 12 }}
            />
            {draftDeadline && (
              <button onClick={() => setDraftDeadline("")} style={{ color: theme.textFaint, fontSize: 11, fontWeight: 600, padding: 2 }}>
                Clear
              </button>
            )}
          </div>
          <button
            onClick={addProject}
            disabled={!draftTitle.trim()}
            style={{ width: "100%", background: theme.accentPlum, color: theme.cardBg, borderRadius: 8, padding: "9px 10px", fontSize: 13, fontWeight: 700, opacity: draftTitle.trim() ? 1 : 0.5 }}
          >
            Create
          </button>
        </div>
      )}

      {projects.length === 0 && (
        <div style={{ fontSize: 13, color: theme.textFainter, padding: "24px 12px", border: `1px dashed ${theme.border}`, borderRadius: 14, textAlign: "center" }}>
          No projects yet, create your first one above.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                background: theme.cardBg, borderRadius: 16, padding: 14,
                border: `1px solid ${shared ? theme.accentPlum : theme.borderSoft}`,
                boxShadow: "0 1px 3px rgba(58,44,30,0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : { id: project.id, uid: project._uid })}
                  style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, textAlign: "left" }}
                >
                  <ChevronDown size={16} color={theme.textFaint} style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s ease" }} />
                  <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 16, fontWeight: 600, color: theme.textPrimary }}>{project.title}</span>
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {shared && (
                    <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: theme.oldPlumBg, color: theme.accentPlum }}>
                      <Users size={10} /> Shared
                    </span>
                  )}
                  {category && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: PALETTE[category.color].bg, color: PALETTE[category.color].text }}>
                      {category.name}
                    </span>
                  )}
                  {!shared && (
                    <button onClick={() => deleteProject(project)} style={{ color: theme.budgetBorder, padding: 4 }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 10, background: theme.softBg, borderRadius: 999, height: 6, overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, height: "100%", background: theme.accentPlum, transition: "width 0.2s ease" }} />
              </div>
              <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 4 }}>
                {progress}% complete{milestones.length ? ` - ${milestones.filter((m) => m.done).length}/${milestones.length} milestones` : ""}{project.deadline ? ` · due ${project.deadline}` : ""}
              </div>

              {isExpanded && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${theme.borderSoft}` }}>
                  {!shared && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted }}>Deadline</span>
                      <input
                        type="date"
                        value={project.deadline || ""}
                        onChange={(e) => setProjectDeadline(project, e.target.value)}
                        style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12 }}
                      />
                      {project.deadline && (
                        <button onClick={() => setProjectDeadline(project, "")} style={{ color: theme.textFaint, fontSize: 11, fontWeight: 600, padding: 2 }}>
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
                    <div style={{ fontSize: 12, color: theme.textFainter, padding: "6px 0" }}>
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
      <div style={{ display: "flex", gap: 6, padding: "6px 0", alignItems: "center" }}>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          style={{ flex: 1, minWidth: 0, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 13 }}
        />
        <input
          type="date"
          value={due}
          max={deadline || undefined}
          onChange={(e) => setDue(e.target.value)}
          style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 12 }}
        />
        <button onClick={save} style={{ background: theme.accentPlum, color: theme.cardBg, borderRadius: 8, padding: "6px 9px", fontSize: 11, fontWeight: 700 }}>
          Save
        </button>
        <button onClick={() => setEditing(false)} style={{ color: theme.textFaint, fontSize: 11, fontWeight: 600, padding: 2 }}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
      <button onClick={onToggle} style={{ width: 18, height: 18, borderRadius: 6, border: `1.5px solid ${milestone.done ? theme.accentPlum : theme.border}`, background: milestone.done ? theme.accentPlum : "transparent", flexShrink: 0 }} />
      <span
        onClick={startEdit}
        title={!shared ? "Tap to edit" : undefined}
        style={{ flex: 1, fontSize: 13, color: theme.textSecondary, textDecoration: milestone.done ? "line-through" : "none", cursor: shared ? "default" : "pointer" }}
      >
        {milestone.text}
      </span>
      {milestone.due && <span style={{ fontSize: 11, color: theme.textFaint }}>{milestone.due}</span>}
      {!shared && (milestone.promotedTodoId ? (
        <button
          onClick={onUnpromote}
          title="Remove from todo list"
          style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: theme.accentPlum, fontWeight: 700, padding: 2 }}
        >
          In daily <X size={11} />
        </button>
      ) : (
        <button
          onClick={onPromote}
          title={`Promote to ${promoteTarget === "work" ? "Work" : "Personal"}`}
          style={{ color: theme.textFaint, padding: 2 }}
        >
          <ArrowUpRight size={13} />
        </button>
      ))}
      {!shared && (
        <button onClick={onDelete} style={{ color: theme.budgetBorder, padding: 2 }}>
          <X size={13} />
        </button>
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
    <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
      <input
        placeholder="Add a milestone"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={{ flex: 1, minWidth: 0, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 13 }}
      />
      <input type="date" value={due} max={deadline || undefined} onChange={(e) => setDue(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 12 }} />
      <button onClick={submit} style={{ background: theme.accentPlum, color: theme.cardBg, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}>
        <Plus size={14} />
      </button>
    </div>
  );
}
import { useEffect, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from "firebase/firestore";
import { Plus, Trash2, ChevronDown, X, ArrowUpRight } from "lucide-react";
import { db } from "./firebase";
import { theme, PALETTE } from "./theme";

export default function Workbench({ uid, categories, todos }) {
  const [projects, setProjects] = useState([]);
  const [filterBucket, setFilterBucket] = useState(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategoryId, setDraftCategoryId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [milestonesByProject, setMilestonesByProject] = useState({});

  useEffect(() => {
    const q = query(collection(db, "users", uid, "workbench"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [uid]);

  useEffect(() => {
    if (!expandedId) return;
    const q = query(collection(db, "users", uid, "workbench", expandedId, "milestones"), orderBy("order", "asc"));
    return onSnapshot(q, (snap) => {
      setMilestonesByProject((m) => ({ ...m, [expandedId]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }));
    });
  }, [uid, expandedId]);

  async function addProject() {
    const title = draftTitle.trim();
    if (!title) return;
    await addDoc(collection(db, "users", uid, "workbench"), {
      title,
      categoryId: draftCategoryId,
      createdAt: serverTimestamp(),
    });
    setDraftTitle("");
    setDraftCategoryId(null);
    setShowAddPanel(false);
  }

  async function deleteProject(projectId) {
    if (!window.confirm("Delete this project and all its milestones? This can't be undone.")) return;
    const milestonesSnap = await getDocs(collection(db, "users", uid, "workbench", projectId, "milestones"));
    await Promise.all(milestonesSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "users", uid, "workbench", projectId));
  }

  async function addMilestone(projectId, text, due) {
    const existing = milestonesByProject[projectId] || [];
    await addDoc(collection(db, "users", uid, "workbench", projectId, "milestones"), {
      text, due: due || null, done: false, order: existing.length,
    });
  }

  async function toggleMilestone(projectId, milestone) {
    const newDone = !milestone.done;
    await updateDoc(doc(db, "users", uid, "workbench", projectId, "milestones", milestone.id), { done: newDone });
    if (milestone.promotedTodoId) {
      await updateDoc(doc(db, "users", uid, "todos", milestone.promotedTodoId), { done: newDone });
    }
  }

  async function promoteMilestone(projectId, milestone) {
    if (milestone.promotedTodoId) return;
    const ref = await addDoc(collection(db, "users", uid, "todos"), {
      list: "personal",
      text: milestone.text,
      categoryId: null,
      due: milestone.due || null,
      done: milestone.done || false,
      recurrence: null,
      workbenchProjectId: projectId,
      workbenchMilestoneId: milestone.id,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "users", uid, "workbench", projectId, "milestones", milestone.id), { promotedTodoId: ref.id });
  }

  async function deleteMilestone(projectId, milestoneId) {
    await deleteDoc(doc(db, "users", uid, "workbench", projectId, "milestones", milestoneId));
  }

  function categoryBucket(categoryId) {
    const hasWork = todos.some((t) => t.categoryId === categoryId && t.list === "work");
    if (hasWork) return "work";
    const hasPersonal = todos.some((t) => t.categoryId === categoryId && t.list === "personal");
    if (hasPersonal) return "personal";
    return "work";
  }

  const visibleProjects = filterBucket ? projects.filter((p) => categoryBucket(p.categoryId) === filterBucket) : projects;

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
          const category = categories.find((c) => c.id === project.categoryId);
          const expanded = expandedId === project.id;
          const progress = progressFor(project.id);
          const milestones = milestonesByProject[project.id] || [];
          return (
            <div key={project.id} style={{ background: theme.cardBg, borderRadius: 16, padding: 14, border: `1px solid ${theme.borderSoft}`, boxShadow: "0 1px 3px rgba(58,44,30,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <button onClick={() => setExpandedId(expanded ? null : project.id)} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, textAlign: "left" }}>
                  <ChevronDown size={16} color={theme.textFaint} style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s ease" }} />
                  <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 16, fontWeight: 600, color: theme.textPrimary }}>{project.title}</span>
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {category && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: PALETTE[category.color].bg, color: PALETTE[category.color].text }}>
                      {category.name}
                    </span>
                  )}
                  <button onClick={() => deleteProject(project.id)} style={{ color: theme.budgetBorder, padding: 4 }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 10, background: theme.softBg, borderRadius: 999, height: 6, overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, height: "100%", background: theme.accentPlum, transition: "width 0.2s ease" }} />
              </div>
              <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 4 }}>
                {progress}% complete{milestones.length ? ` - ${milestones.filter((m) => m.done).length}/${milestones.length} milestones` : ""}
              </div>

              {expanded && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${theme.borderSoft}` }}>
                  {milestones.map((m) => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                      <button onClick={() => toggleMilestone(project.id, m)} style={{ width: 18, height: 18, borderRadius: 6, border: `1.5px solid ${m.done ? theme.accentPlum : theme.border}`, background: m.done ? theme.accentPlum : "transparent", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, color: theme.textSecondary, textDecoration: m.done ? "line-through" : "none" }}>{m.text}</span>
                      {m.due && <span style={{ fontSize: 11, color: theme.textFaint }}>{m.due}</span>}
                      {m.promotedTodoId ? (
                        <span style={{ fontSize: 10, color: theme.accentPlum, fontWeight: 700 }}>In daily</span>
                      ) : (
                        <button onClick={() => promoteMilestone(project.id, m)} title="Promote to Personal" style={{ color: theme.textFaint, padding: 2 }}>
                          <ArrowUpRight size={13} />
                        </button>
                      )}
                      <button onClick={() => deleteMilestone(project.id, m.id)} style={{ color: theme.budgetBorder, padding: 2 }}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  <MilestoneAddRow onAdd={(text, due) => addMilestone(project.id, text, due)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MilestoneAddRow({ onAdd }) {
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
        style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 13 }}
      />
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 12 }} />
      <button onClick={submit} style={{ background: theme.accentPlum, color: theme.cardBg, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}>
        <Plus size={14} />
      </button>
    </div>
  );
}

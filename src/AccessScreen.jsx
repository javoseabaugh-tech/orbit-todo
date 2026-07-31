import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { X, Trash2, UserPlus, Shield } from "lucide-react";
import { theme, glass, EASE_OUT, SPRING } from "./theme";
import { display, mix, fieldStyle, accentButtonStyle, IconAction, GlassBackdrop } from "./ui";

function emailToDocId(email) {
  return email.toLowerCase();
}
function useOwnerWorkCategories(db) {
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ownerSnap = await getDocs(query(collection(db, "access"), where("role", "==", "owner")));
        const ownerDoc = ownerSnap.docs[0];
        const ownerUid = ownerDoc?.data()?.uid;
        if (!ownerUid || cancelled) return;
        const catSnap = await getDocs(query(collection(db, "users", ownerUid, "categories")));
        if (cancelled) return;
        setCategories(catSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.list === "work"));
      } catch (e) {
        console.error("owner categories lookup error", e);
      }
    })();
    return () => { cancelled = true; };
  }, [db]);
  return categories;
}

const ROLE_DEFAULTS = {
  household: { budgetShared: true },
  guardian: { budgetShared: false },
  assistant: { budgetShared: false },
};

const ROLE_LABELS = {
  owner: "Owner",
  household: "Household",
  guardian: "Guardian",
  assistant: "Assistant",
};

export default function AccessScreen({ db, currentRole, onClose }) {
  const [people, setPeople] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("household");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isOwner = currentRole === "owner";
  const ownerCategories = useOwnerWorkCategories(db);
  const canManageAccess = currentRole === "owner" || currentRole === "household";
  const canManageBudget = currentRole === "owner" || currentRole === "household";

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "access"),
      (snap) => setPeople(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error("access list snapshot error", err);
        setError("Couldn't load the access list.");
      }
    );
    return () => unsub();
  }, [db]);

  async function handleAddPerson(e) {
    e.preventDefault();
    setError("");
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setSaving(true);
    try {
      const docId = emailToDocId(email);
      await setDoc(doc(db, "access", docId), {
        email,
        role: newRole,
        budgetShared: ROLE_DEFAULTS[newRole].budgetShared,
        sharedWorkAccess: false,
      });
      setNewEmail("");
    } catch (err) {
      console.error("add person error", err);
      setError("Couldn't add that person. Check the console for details.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleBudget(person) {
    try {
      await setDoc(doc(db, "access", person.id), { budgetShared: !person.budgetShared }, { merge: true });
    } catch (err) {
      console.error("toggle budget error", err);
      setError("Couldn't update budget access.");
    }
  }

  async function handleSetSharedWorkCategory(person, categoryId) {
    try {
      await setDoc(doc(db, "access", person.id), { sharedWorkCategoryId: categoryId }, { merge: true });
    } catch (err) {
      console.error("set shared work category error", err);
      setError("Couldn't update that category scope.");
    }
  }
  async function handleToggleSharedWork(person) {
    try {
      await setDoc(doc(db, "access", person.id), { sharedWorkAccess: !person.sharedWorkAccess }, { merge: true });
    } catch (err) {
      console.error("toggle shared work error", err);
      setError("Couldn't update shared work access.");
    }
  }

  async function handleChangeRole(person, newRoleValue) {
    try {
      await setDoc(doc(db, "access", person.id), {
        role: newRoleValue,
        budgetShared: ROLE_DEFAULTS[newRoleValue].budgetShared,
        sharedWorkAccess: false,
      }, { merge: true });
    } catch (err) {
      console.error("change role error", err);
      setError("Couldn't change that person's role.");
    }
  }

  async function handleRemovePerson(person) {
    if (!window.confirm(`Remove ${person.email}'s access? They'll be signed out immediately.`)) return;
    try {
      await deleteDoc(doc(db, "access", person.id));
    } catch (err) {
      console.error("remove person error", err);
      setError("Couldn't remove that person.");
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, overflow: "hidden",
      display: "flex", flexDirection: "column",
      background: theme.gradB, color: theme.textPrimary,
      fontFamily: "'Geist', system-ui, sans-serif",
      animation: `screenIn .45s ${EASE_OUT}`,
    }}>
      <GlassBackdrop />

      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 620, margin: "0 auto",
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        padding: "24px 20px 0",
      }}>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <span style={{
            width: 40, height: 40, borderRadius: 14, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: theme.accentInk,
            background: `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})`,
            boxShadow: `0 10px 26px -10px ${theme.accentPlum}`,
          }}>
            <Shield size={19} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ ...display(26, "-.03em"), margin: 0 }}>Access</h1>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: theme.textMuted }}>Who can see what, and how much.</p>
          </div>
          <IconAction onClick={onClose} title="Close" size={6}>
            <X size={20} />
          </IconAction>
        </div>

        {/* Everything below the Access header is the only scrolling region. */}
        <div className="orbit-scroll" style={{ flex: 1, minHeight: 0, paddingBottom: 60 }}>

        {error && (
          <div style={{
            padding: "11px 14px", borderRadius: 14, marginBottom: 16, fontSize: 13.5,
            color: theme.accentRed, background: mix(theme.accentRed, 12),
            border: `1px solid ${mix(theme.accentRed, 30)}`,
          }}>
            {error}
          </div>
        )}

        {canManageAccess && (
          <form onSubmit={handleAddPerson} style={{ ...glass.card, borderRadius: 24, padding: 16, marginBottom: 20 }}>
            <div style={{ ...display(17), marginBottom: 12 }}>Add someone</div>
            <input
              type="email"
              placeholder="email@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              style={{ ...fieldStyle(), fontSize: 14, marginBottom: 10 }}
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              style={{ ...fieldStyle(), fontSize: 13.5, marginBottom: 12, cursor: "pointer" }}
            >
              <option value="household">Household (shares our budget automatically)</option>
              <option value="guardian">Guardian (own budget by default, approvable)</option>
              <option value="assistant">Assistant (never budget access)</option>
            </select>
            <button
              type="submit"
              disabled={saving}
              style={{
                ...accentButtonStyle(!saving), display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                width: "100%", padding: "12px 14px", borderRadius: 15, fontSize: 14, fontWeight: 600,
              }}
            >
              <UserPlus size={16} /> {saving ? "Adding…" : "Add person"}
            </button>
          </form>
        )}

        <div style={{
          fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase",
          color: theme.textFainter, marginBottom: 10,
        }}>
          People with access
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {people.map((person) => (
            <div key={person.id} style={{ ...glass.card, borderRadius: 22, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: theme.textPrimary, overflowWrap: "anywhere" }}>{person.email}</div>
                  {canManageAccess && person.role !== "owner" ? (
                    <select
                      value={person.role}
                      onChange={(e) => handleChangeRole(person, e.target.value)}
                      style={{
                        marginTop: 6, padding: "5px 10px", borderRadius: 10, fontSize: 12.5, cursor: "pointer",
                        color: theme.textMuted, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`,
                      }}
                    >
                      <option value="household">Household</option>
                      <option value="guardian">Guardian</option>
                      <option value="assistant">Assistant</option>
                    </select>
                  ) : (
                    <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 4 }}>{ROLE_LABELS[person.role] || person.role}</div>
                  )}
                </div>
                {person.role === "owner" ? (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
                    fontSize: 11, fontWeight: 500, padding: "4px 11px", borderRadius: 999,
                    color: theme.accentPlum, background: theme.accentSoft,
                    border: `1px solid ${mix(theme.accentPlum, 34)}`,
                  }}>
                    <Shield size={11} /> Owner
                  </span>
                ) : canManageAccess && (
                  <IconAction onClick={() => handleRemovePerson(person)} title="Remove access" hoverColor={theme.accentRed}>
                    <Trash2 size={16} />
                  </IconAction>
                )}
              </div>

              {person.role === "household" && (
                <div style={{ fontSize: 12.5, color: theme.greenDot }}>Shares the budget automatically</div>
              )}

              {person.role === "guardian" && canManageBudget && (
                <button onClick={() => handleToggleBudget(person)} style={rolePill(person.budgetShared)}>
                  Shared budget: {person.budgetShared ? "Approved" : "Not approved"}
                </button>
              )}

              {person.role === "assistant" && (
                <div style={{ fontSize: 12.5, color: theme.textMuted }}>No budget access</div>
              )}

              {isOwner && person.role === "assistant" && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginTop: 10 }}>
                  <button onClick={() => handleToggleSharedWork(person)} style={rolePill(person.sharedWorkAccess)}>
                    Shared Work + Projects: {person.sharedWorkAccess ? "On" : "Off"}
                  </button>
                  {person.sharedWorkAccess && (
                    <select
                      value={person.sharedWorkCategoryId || ""}
                      onChange={(e) => handleSetSharedWorkCategory(person, e.target.value || null)}
                      style={{
                        padding: "7px 11px", borderRadius: 11, fontSize: 12.5, cursor: "pointer",
                        color: theme.textMuted, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`,
                      }}
                    >
                      <option value="">All Work + Projects items</option>
                      {ownerCategories.map((c) => (
                        <option key={c.id} value={c.id}>Only "{c.name}"</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}

// Role-scoped toggles read as pills: accent when the permission is granted.
function rolePill(on) {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4,
    padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 500, cursor: "pointer",
    color: on ? theme.accentPlum : theme.textMuted,
    background: on ? theme.accentSoft : theme.inputBg,
    border: `1px solid ${on ? theme.accentPlum : theme.glassBorder2}`,
    transition: `all .25s ${SPRING}`,
  };
}

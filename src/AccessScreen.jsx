import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { X, Trash2, UserPlus, Shield } from "lucide-react";
import { theme } from "./theme";

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
    <div style={{ position: "fixed", inset: 0, background: theme.gradB, zIndex: 50, overflowY: "auto", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 12px", borderBottom: `1px solid ${theme.borderSoft2}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={20} color={theme.accentPlum} />
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: theme.textPrimary, margin: 0 }}>Access</h1>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
          <X size={22} color={theme.textMuted} />
        </button>
      </div>

      <div style={{ padding: 20 }}>
        {error && (
          <div style={{ background: theme.softBg2, color: theme.oldOrangeText, padding: "10px 14px", borderRadius: 10, marginBottom: 16, fontSize: 14 }}>
            {error}
          </div>
        )}

        {canManageAccess && (
          <form onSubmit={handleAddPerson} style={{ background: theme.cardBg, borderRadius: 14, padding: 16, marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: 10, fontSize: 15 }}>Add someone</div>
            <input
              type="email"
              placeholder="email@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${theme.borderSoft2}`, marginBottom: 10, fontSize: 15, boxSizing: "border-box" }}
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${theme.borderSoft2}`, marginBottom: 10, fontSize: 15, boxSizing: "border-box" }}
            >
              <option value="household">Household (shares our budget automatically)</option>
              <option value="guardian">Guardian (own budget by default, approvable)</option>
              <option value="assistant">Assistant (never budget access)</option>
            </select>
            <button
              type="submit"
              disabled={saving}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "10px 12px", borderRadius: 10, border: "none", background: theme.accentPlum, color: theme.cardBg, fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
            >
              <UserPlus size={16} /> {saving ? "Adding…" : "Add person"}
            </button>
          </form>
        )}

        <div style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: 10, fontSize: 15 }}>People with access</div>
        {people.map((person) => (
          <div key={person.id} style={{ background: theme.cardBg, borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 600, color: theme.textPrimary, fontSize: 15 }}>{person.email}</div>
                {canManageAccess && person.role !== "owner" ? (
                  <select
                    value={person.role}
                    onChange={(e) => handleChangeRole(person, e.target.value)}
                    style={{ fontSize: 13, color: theme.textMuted, border: `1px solid ${theme.borderSoft2}`, borderRadius: 6, padding: "2px 6px", marginTop: 2 }}
                  >
                    <option value="household">Household</option>
                    <option value="guardian">Guardian</option>
                    <option value="assistant">Assistant</option>
                  </select>
                ) : (
                  <div style={{ fontSize: 13, color: theme.textMuted }}>{ROLE_LABELS[person.role] || person.role}</div>
                )}
              </div>
              {canManageAccess && person.role !== "owner" && (
                <button onClick={() => handleRemovePerson(person)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                  <Trash2 size={18} color={theme.oldOrangeText} />
                </button>
              )}
            </div>

            {person.role === "household" && (
              <div style={{ fontSize: 13, color: theme.greenDot, fontWeight: 600 }}>Shares our budget automatically</div>
            )}

            {person.role === "guardian" && canManageBudget && (
              <button
                onClick={() => handleToggleBudget(person)}
                style={{
                  padding: "6px 12px", borderRadius: 20,
                  border: person.budgetShared ? `1px solid ${theme.accentPlum}` : `1px solid ${theme.borderSoft2}`,
                  background: person.budgetShared ? theme.oldPlumBg : theme.gradB,
                  color: person.budgetShared ? theme.accentPlum : theme.textMuted,
                  fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4,
                }}
              >
                Shared budget: {person.budgetShared ? "Approved" : "Not approved"}
              </button>
            )}

            {person.role === "assistant" && (
              <div style={{ fontSize: 13, color: theme.textMuted }}>No budget access</div>
            )}

            {isOwner && person.role === "assistant" && (
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => handleToggleSharedWork(person)}
                  style={{
                    padding: "6px 12px", borderRadius: 20,
                    border: person.sharedWorkAccess ? `1px solid ${theme.accentPlum}` : `1px solid ${theme.borderSoft2}`,
                    background: person.sharedWorkAccess ? theme.oldPlumBg : theme.gradB,
                    color: person.sharedWorkAccess ? theme.accentPlum : theme.textMuted,
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Shared Work + Workbench: {person.sharedWorkAccess ? "On" : "Off"}
                </button>
                {person.sharedWorkAccess && (
                  <select
                    value={person.sharedWorkCategoryId || ""}
                    onChange={(e) => handleSetSharedWorkCategory(person, e.target.value || null)}
                    style={{ marginLeft: 8, fontSize: 13, color: theme.textMuted, border: `1px solid ${theme.borderSoft2}`, borderRadius: 8, padding: "5px 8px" }}
                  >
                    <option value="">All Work + Workbench items</option>
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
  );
}

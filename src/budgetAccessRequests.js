import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "./firebase";

export async function createBudgetAccessRequest(email) {
  const ref = await addDoc(collection(db, "budgetAccessRequests"), {
    requesterEmail: email,
    status: "pending",
    requestedAt: serverTimestamp(),
  });
  // This call is load-bearing, not an optimization: the Worker's cron only
  // acts on requests that already have a deadlineAt field, and deadlineAt
  // is set exclusively inside the Worker's /notify handler. A request
  // created without this call would sit pending forever with no deadline
  // and nobody would ever be notified.
  const workerUrl = import.meta.env.VITE_WORKER_URL;
  if (workerUrl) {
    try {
      await fetch(`${workerUrl}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: ref.id }),
      });
    } catch (e) {
      console.error("Worker /notify call failed", e);
    }
  } else {
    console.error("VITE_WORKER_URL is not set — notification was not triggered.");
  }
}

// Live-watches for a pending request from this email, calls back with the
// doc (or null) whenever it changes.
export function watchMyPendingBudgetRequest(email, callback) {
  const q = query(
    collection(db, "budgetAccessRequests"),
    where("requesterEmail", "==", email),
    where("status", "==", "pending")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
  });
}

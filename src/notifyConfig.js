import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export async function getMyNotifyConfig(email) {
  const snap = await getDoc(doc(db, "notifyConfig", email));
  return snap.exists() ? snap.data() : { telegramBotToken: "", telegramChatId: "" };
}

export async function saveMyNotifyConfig(email, { telegramBotToken, telegramChatId }) {
  await setDoc(doc(db, "notifyConfig", email), { telegramBotToken, telegramChatId }, { merge: true });
}

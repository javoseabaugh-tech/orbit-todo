// Sends content to the Gemini API (free tier, called directly from the
// browser — no backend needed) and asks it to classify + parse it into a
// structured item: a Work/Personal to-do, or a Thought tagged to a person —
// plus a cleaned-up description and a resolved due date. Accepts plain text
// (from voice or typing) or an image (a photo, screenshot, note, etc).

// Pinned to a named stable model rather than a "-latest" alias — aliases
// point at experimental models with much tighter rate limits.
const MODEL = "gemini-3.5-flash";

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function buildSchema() {
  return {
    type: "OBJECT",
    properties: {
      itemType: { type: "STRING", enum: ["todo", "thought"] },
      list: { type: "STRING", enum: ["work", "personal"], nullable: true },
      text: { type: "STRING" },
      personName: { type: "STRING", nullable: true },
      dueDate: { type: "STRING", nullable: true },
    },
    required: ["itemType", "text"],
  };
}

function buildPrompt(knownPeopleNames, sourceLine) {
  const today = todayISO();
  const weekday = new Date().toLocaleDateString(undefined, { weekday: "long" });
  const peopleList = knownPeopleNames.length ? knownPeopleNames.join(", ") : "(none saved yet)";

  return `You parse input into a structured item for a personal productivity app.
The app has three sections: a Work to-do list, a Personal to-do list, and a Thoughts
section for things the person needs to talk to someone about (asking, telling,
messaging, discussing something with a specific person).

Today's date is ${today} (${weekday}).
Known people already saved in the app: ${peopleList}.

${sourceLine}

Return JSON with:
- "itemType": default to "todo" for any concrete actionable task — including ones that involve asking, telling, or messaging someone (e.g. "ask Dylan if he finished the menu" is a todo, not a thought; capture the person in "personName" for reference). Only use "thought" when the input explicitly signals it's an unstructured thought/mental note being offloaded rather than a task, using phrasing like "I've been thinking about...", "just thinking about...", "I want to offload this thought", "this has been on my mind", "just wanted to say...", or similar reflective framing — not merely because a person's name is mentioned.
- "list": only used when itemType is "todo" — "work" if it sounds job/professional-related based on context, otherwise "personal". Omit or null when itemType is "thought".
- "text": the core task or thought, cleaned up (remove filler like "remind me to", "I need to", "can you add"), written as a short actionable line. If this is an image, describe the actionable item you found in it (e.g. an event, a request, a deadline) — do not just describe the image.
- "personName": if it mentions talking to, asking, telling, or messaging someone, return the best-matching name from the known people list (case-insensitive match), or if it clearly names someone not on the list, return that name as written. Otherwise null.
- "dueDate": if it mentions any date/day (e.g. "next Tuesday", "tomorrow", "Friday", or a visible date/deadline in an image), resolve it to an absolute date relative to today in YYYY-MM-DD format. Otherwise null.`;
}

async function callGemini(extraParts, knownPeopleNames, sourceLine) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VITE_GEMINI_API_KEY — see README for setup.");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(knownPeopleNames, sourceLine) }, ...extraParts] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: buildSchema(),
        },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini request failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Gemini returned no content.");
  const result = JSON.parse(raw);
  console.log("Gemini raw response:", result);
  return result;
}

function normalize(parsed, fallbackText) {
  return {
    itemType: parsed.itemType === "todo" ? "todo" : "thought",
    list: parsed.list === "work" ? "work" : "personal",
    text: parsed.text || fallbackText,
    personName: parsed.personName || null,
    dueDate: parsed.dueDate || null,
  };
}

// Text input — from voice transcription or typing directly.
export async function parseBrainDump(text, knownPeopleNames) {
  const parsed = await callGemini([], knownPeopleNames, `Input (spoken or typed): "${text}"`);
  return normalize(parsed, text);
}

// Image input — a photo, screenshot, note, flyer, etc. base64Data should be
// the raw base64 payload (no "data:image/..;base64," prefix).
export async function parseBrainDumpImage(base64Data, mimeType, knownPeopleNames) {
  const parsed = await callGemini(
    [{ inlineData: { mimeType, data: base64Data } }],
    knownPeopleNames,
    "Input: the attached image."
  );
  return normalize(parsed, "(from image)");
}


// Lightweight category suggestion — given a task's text and the list of
// category names already created for that list (work/personal), asks
// Gemini which existing category fits best, or null if none really do.
// Deliberately its own small call rather than reusing the full parse
// pipeline above, since this only needs one string back, not a whole
// structured item.
export async function suggestCategory(text, categoryNames) {
  if (!categoryNames.length || !text.trim()) return null;
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const prompt = `Given this task: "${text}"\nAnd these existing categories: ${categoryNames.join(", ")}\nWhich single category best fits this task? Reply with just the exact category name from the list, or "none" if none of them genuinely fit. No other text.`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw || raw.toLowerCase() === "none") return null;
    const match = categoryNames.find((c) => c.toLowerCase() === raw.toLowerCase());
    return match || null;
  } catch (e) {
    console.error("suggestCategory error", e);
    return null;
  }
}

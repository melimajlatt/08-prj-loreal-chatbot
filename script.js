/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const sendBtn = document.getElementById("sendBtn");

/*
  Use your Cloudflare Worker endpoint here.
  Option 1: set WORKER_URL directly in this file.
  Option 2: set window.CLOUDFLARE_WORKER_URL in secrets.js.
*/
const WORKER_URL =
  (window.CLOUDFLARE_WORKER_URL && window.CLOUDFLARE_WORKER_URL.trim()) || "";

const OPENAI_API_KEY =
  (window.OPENAI_API_KEY && window.OPENAI_API_KEY.trim()) || "";

// System prompt keeps the assistant focused on beauty + L'Oreal topics.
const SYSTEM_PROMPT = `You are the L'Oreal Beauty Advisor.
You help with L'Oreal products, routines, recommendations, ingredients, shades, and beauty-related topics.
If a question is unrelated to beauty or L'Oreal products, politely refuse and guide the user back to beauty topics.
Keep answers concise, friendly, and practical.`;

// Conversation history for multi-turn context. First item is always the system prompt.
const messages = [{ role: "system", content: SYSTEM_PROMPT }];

// Simple user profile memory for extra-credit context handling.
const userProfile = {
  name: "",
};

addMessage(
  "ai",
  "Hello. I am your L'Oreal Beauty Advisor. Ask me about products, routines, and recommendations.",
);

/* Handle form submit */
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = userInput.value.trim();
  if (!text) {
    return;
  }

  // Save user name if they share it in natural language.
  rememberNameFromText(text);

  addMessage("user", text);
  userInput.value = "";
  toggleInputState(true);

  try {
    const assistantReply = await getAssistantReply(text);
    addMessage("ai", assistantReply);
  } catch (error) {
    console.error("Chat request failed:", error);
    const errorMessage =
      error?.message ||
      "I could not connect right now. Please check your Cloudflare Worker URL and try again.";
    addMessage("ai", errorMessage);
  } finally {
    toggleInputState(false);
    userInput.focus();
  }
});

function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;

  const label = document.createElement("span");
  label.className = "msg-label";
  label.textContent = role === "user" ? "You" : "Advisor";

  const body = document.createElement("div");
  body.textContent = text;

  msg.appendChild(label);
  msg.appendChild(body);
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function rememberNameFromText(text) {
  const nameMatch = text.match(
    /(?:my name is|i am|i'm)\s+([a-zA-Z][a-zA-Z\-']{1,30})/i,
  );
  if (nameMatch && nameMatch[1]) {
    userProfile.name = nameMatch[1];
  }
}

async function getAssistantReply(userText) {
  if (!WORKER_URL) {
    throw new Error("Missing Cloudflare Worker URL.");
  }

  // Add user message to the running history.
  messages.push({ role: "user", content: userText });

  // Add lightweight profile context if available.
  const requestMessages = [...messages];
  if (userProfile.name) {
    requestMessages.splice(1, 0, {
      role: "system",
      content: `User profile context: The user's first name is ${userProfile.name}.`,
    });
  }

  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: requestMessages,
      apiKey: OPENAI_API_KEY,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Cloudflare Worker returned ${response.status}. Please try again.`,
    );
  }

  const data = await response.json();
  const apiError = data?.error?.message;
  if (apiError) {
    throw new Error(`API error: ${apiError}`);
  }

  const assistantText = data?.choices?.[0]?.message?.content?.trim();

  if (!assistantText) {
    throw new Error("OpenAI response was empty.");
  }

  messages.push({ role: "assistant", content: assistantText });

  // Keep the history from growing forever (system prompt + 16 most recent messages).
  if (messages.length > 17) {
    messages.splice(1, messages.length - 17);
  }

  return assistantText;
}

function toggleInputState(isLoading) {
  sendBtn.disabled = isLoading;
  userInput.disabled = isLoading;
}

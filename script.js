const chatbot = document.getElementById("chatbot");
const chatBox = document.getElementById("chat-box");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const closeBtn = document.getElementById("close-btn");
const openBtn = document.getElementById("open-btn");
const chatHistory = [];

function addMessage(text, className) {
  const div = document.createElement("div");
  div.className = className;
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
  return div;
}

async function sendMessage() {
  const message = input.value.trim();
  if (!message) {
    addMessage("Please type something before sending.", "error");
    input.focus();
    return;
  }

  addMessage("You: " + message, "user");
  input.value = "";
  sendBtn.disabled = true;
  const loading = addMessage("Thinking...", "bot");

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: chatHistory }),
    });
    const data = await res.json();
    loading.remove();

    if (res.ok) {
      addMessage("Chatbot: " + data.reply, "bot");
      chatHistory.push(
        { role: "user", text: message },
        { role: "model", text: data.reply }
      );
      if (chatHistory.length > 12) {
        chatHistory.splice(0, chatHistory.length - 12);
      }
    } else {
      addMessage(data.error || "Something went wrong.", "error");
    }
  } catch (err) {
    loading.remove();
    addMessage("Could not reach the server.", "error");
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

function closeChat() {
  chatbot.style.display = "none";
  openBtn.style.display = "inline-block";
}

function openChat() {
  chatbot.style.display = "block";
  openBtn.style.display = "none";
  input.focus();
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") sendMessage();
});
closeBtn.addEventListener("click", closeChat);
openBtn.addEventListener("click", openChat);

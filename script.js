const channelTitle = document.getElementById("channel-title");
const messageFeed = document.getElementById("message-feed");
const messageTemplate = document.getElementById("message-template");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const gifToggle = document.getElementById("gif-toggle");
const gifPanel = document.getElementById("gif-panel");
const channelButtons = document.querySelectorAll(".channel-item[data-channel]");
const gifButtons = document.querySelectorAll(".gif-tile");
const authForm = document.getElementById("auth-form");
const usernameInput = document.getElementById("username-input");
const passwordInput = document.getElementById("password-input");
const loginButton = document.getElementById("login-button");
const authStatus = document.getElementById("auth-status");
const memberList = document.getElementById("member-list");
const profileAvatar = document.getElementById("profile-avatar");
const profileName = document.getElementById("profile-name");
const profileRole = document.getElementById("profile-role");
const logoutButton = document.getElementById("logout-button");

let activeChannel = "general";
let pendingGif = "";
let currentUser = null;
let channels = {
  general: [],
  clips: [],
  memes: [],
  lfg: []
};
let onlineUsers = [];

function avatarClassForName(name) {
  const palette = ["neon-cyan", "neon-orange", "neon-green", "neon-pink"];
  const total = name.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[total % palette.length];
}

function setStatus(text, isError = false) {
  authStatus.textContent = text;
  authStatus.classList.toggle("error", isError);
}

function renderMemberList() {
  memberList.innerHTML = "";

  if (!onlineUsers.length) {
    const empty = document.createElement("div");
    empty.className = "member-row";
    empty.innerHTML = "<div><strong>No one yet</strong><p>Be the first one to jump in.</p></div>";
    memberList.appendChild(empty);
    return;
  }

  [...new Set(onlineUsers)].forEach((name) => {
    const row = document.createElement("div");
    row.className = "member-row";
    row.innerHTML = `
      <span class="avatar sm ${avatarClassForName(name)}">${name.charAt(0).toUpperCase()}</span>
      <div>
        <strong>${name}</strong>
        <p>${name === currentUser ? "You are online" : "Ready to chat"}</p>
      </div>
    `;
    memberList.appendChild(row);
  });
}

function renderMessages(channelKey) {
  messageFeed.innerHTML = "";
  (channels[channelKey] || []).forEach((message) => {
    const fragment = messageTemplate.content.cloneNode(true);
    const avatar = fragment.querySelector(".message-avatar");
    const user = fragment.querySelector(".message-user");
    const time = fragment.querySelector(".message-time");
    const text = fragment.querySelector(".message-text");
    const gif = fragment.querySelector(".message-gif");

    avatar.textContent = message.avatarLetter || message.user.charAt(0).toUpperCase();
    avatar.classList.add(message.avatarClass || avatarClassForName(message.user));
    user.textContent = message.user;
    time.textContent = message.time;
    text.textContent = message.text;

    if (message.gif) {
      gif.src = message.gif;
    } else {
      gif.remove();
    }

    messageFeed.appendChild(fragment);
  });

  messageFeed.scrollTop = messageFeed.scrollHeight;
}

function updateAuthUi() {
  const loggedIn = Boolean(currentUser);
  profileAvatar.textContent = loggedIn ? currentUser.charAt(0).toUpperCase() : "?";
  profileAvatar.className = `avatar ${loggedIn ? avatarClassForName(currentUser) : "neon-cyan"}`;
  profileName.textContent = loggedIn ? currentUser : "Guest Mode";
  profileRole.textContent = loggedIn ? "Logged in and ready to raid" : "Create an account to join chat";
  logoutButton.classList.toggle("hidden", !loggedIn);
  messageInput.disabled = !loggedIn;
  sendButton.disabled = !loggedIn;
  messageInput.placeholder = loggedIn ? `Message ${channelTitle.textContent}` : "Create an account to chat";
}

function applySnapshot(snapshot) {
  currentUser = snapshot.currentUser;
  onlineUsers = snapshot.onlineUsers || [];
  channels = snapshot.channels || channels;
  updateAuthUi();
  renderMemberList();
  renderMessages(activeChannel);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    ...options
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

async function refreshSession() {
  const snapshot = await requestJson("/api/session");
  applySnapshot(snapshot);
}

function activateChannel(button) {
  channelButtons.forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  activeChannel = button.dataset.channel;
  channelTitle.textContent = button.textContent;
  messageInput.placeholder = currentUser ? `Message ${button.textContent}` : "Create an account to chat";
  renderMessages(activeChannel);
}

channelButtons.forEach((button) => {
  button.addEventListener("click", () => activateChannel(button));
});

gifButtons.forEach((button) => {
  button.addEventListener("click", () => {
    pendingGif = button.dataset.gif;
    if (currentUser) {
      messageInput.value = "Dropped a reaction GIF for the squad.";
      messageInput.focus();
    } else {
      setStatus("Create an account first, then your GIFs will post under your name.", true);
    }
  });
});

gifToggle.addEventListener("click", () => {
  gifPanel.classList.toggle("hidden");
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const snapshot = await requestJson("/api/register", {
      method: "POST",
      body: JSON.stringify({
        username: usernameInput.value.trim(),
        password: passwordInput.value.trim()
      })
    });

    setStatus(`Welcome to Lagcord, ${snapshot.username}. Your messages are now public in the room.`);
    await refreshSession();
  } catch (error) {
    setStatus(error.message, true);
  }
});

loginButton.addEventListener("click", async () => {
  try {
    const snapshot = await requestJson("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: usernameInput.value.trim(),
        password: passwordInput.value.trim()
      })
    });

    setStatus(`Logged in as ${snapshot.username}. Squad can see your name in chat now.`);
    await refreshSession();
  } catch (error) {
    setStatus(error.message, true);
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await requestJson("/api/logout", { method: "POST", body: "{}" });
    setStatus("Logged out. You can still read chat, but you need an account to send messages.");
    await refreshSession();
  } catch (error) {
    setStatus(error.message, true);
  }
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();

  if (!text && !pendingGif) {
    return;
  }

  try {
    await requestJson("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        channel: activeChannel,
        text,
        gif: pendingGif
      })
    });

    messageInput.value = "";
    pendingGif = "";
  } catch (error) {
    setStatus(error.message, true);
  }
});

const eventSource = new EventSource("/events");
eventSource.addEventListener("bootstrap", (event) => {
  applySnapshot(JSON.parse(event.data));
});
eventSource.addEventListener("message", (event) => {
  const payload = JSON.parse(event.data);
  channels[payload.channel] = [...(channels[payload.channel] || []), payload.message];
  onlineUsers = payload.onlineUsers || onlineUsers;
  renderMemberList();
  if (payload.channel === activeChannel) {
    renderMessages(activeChannel);
  }
});
eventSource.addEventListener("presence", (event) => {
  const payload = JSON.parse(event.data);
  onlineUsers = payload.onlineUsers || onlineUsers;
  renderMemberList();
});

refreshSession().catch(() => {
  setStatus("Could not load session yet. Refresh the page if the server just restarted.", true);
});

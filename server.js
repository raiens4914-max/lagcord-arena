const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const dataPath = path.join(root, "data.json");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const seededState = {
  users: [],
  channels: {
    general: [
      {
        id: "seed-general-1",
        user: "Jinx.exe",
        time: "Today at 6:13 PM",
        text: "Tournament lobby opens in 20. Someone please make the team intro more dramatic than last time.",
        gif: ""
      },
      {
        id: "seed-general-2",
        user: "Meme Dealer",
        time: "Today at 6:15 PM",
        text: "Already done. Added bass boost, airhorns, and a spinning lootbox transition for emotional damage.",
        gif: "https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif"
      }
    ],
    clips: [
      {
        id: "seed-clips-1",
        user: "BossFightMom",
        time: "Today at 5:52 PM",
        text: "Triple headshot from the worst angle imaginable. I am accepting fan edits immediately.",
        gif: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif"
      }
    ],
    memes: [
      {
        id: "seed-memes-1",
        user: "Meme Dealer",
        time: "Today at 4:20 PM",
        text: "Posting this for morale. If your KDA is low, simply become the comic relief.",
        gif: "https://media.giphy.com/media/Qs1aGsytdmAg854JWN/giphy.gif"
      }
    ],
    lfg: [
      {
        id: "seed-lfg-1",
        user: "RaidBot",
        time: "Today at 6:00 PM",
        text: "Looking for 2 more ranked grinders. Requirements: good vibes, map awareness, and zero backseat coaching.",
        gif: ""
      }
    ]
  }
};

function loadState() {
  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify(seededState, null, 2));
    return JSON.parse(JSON.stringify(seededState));
  }

  try {
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    return {
      users: data.users || [],
      sessions: {},
      channels: data.channels || JSON.parse(JSON.stringify(seededState.channels))
    };
  } catch {
    fs.writeFileSync(dataPath, JSON.stringify(seededState, null, 2));
    return JSON.parse(JSON.stringify(seededState));
  }
}

let state = loadState();
const clients = new Set();

function saveState() {
  fs.writeFileSync(dataPath, JSON.stringify({
    users: state.users,
    channels: state.channels
  }, null, 2));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        request.destroy();
        reject(new Error("Body too large"));
      }
    });
    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function cookieMap(request) {
  return (request.headers.cookie || "").split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) {
      return acc;
    }
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function setSessionCookie(response, token) {
  response.setHeader("Set-Cookie", `lagcord_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`);
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", "lagcord_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
}

function getUserFromRequest(request) {
  const cookies = cookieMap(request);
  const username = state.sessions[cookies.lagcord_session];
  if (!username) {
    return null;
  }
  return state.users.find((user) => user.username === username) || null;
}

function avatarClassForName(name) {
  const palette = ["neon-cyan", "neon-orange", "neon-green", "neon-pink"];
  const code = name.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return palette[code % palette.length];
}

function formatMessage(message) {
  return {
    ...message,
    avatarLetter: message.user.charAt(0).toUpperCase(),
    avatarClass: avatarClassForName(message.user)
  };
}

function publicStateFor(username) {
  return {
    currentUser: username || null,
    onlineUsers: Object.values(state.sessions),
    channels: Object.fromEntries(
      Object.entries(state.channels).map(([channel, messages]) => [
        channel,
        messages.map(formatMessage)
      ])
    )
  };
}

function broadcast(event, payload) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((client) => client.write(message));
}

function sendFile(filePath, response) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream"
    });
    response.end(data);
  });
}

function handleEvents(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  response.write("retry: 2000\n\n");
  clients.add(response);
  response.write(`event: bootstrap\ndata: ${JSON.stringify(publicStateFor(getUserFromRequest(request)?.username))}\n\n`);
  request.on("close", () => clients.delete(response));
}

async function handleRegister(request, response) {
  const body = await parseBody(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();

  if (username.length < 3 || password.length < 3) {
    sendJson(response, 400, { error: "Username and password must be at least 3 characters." });
    return;
  }

  if (state.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    sendJson(response, 409, { error: "That username is already taken." });
    return;
  }

  state.users.push({ username, password });
  const token = crypto.randomBytes(24).toString("hex");
  state.sessions[token] = username;
  saveState();
  setSessionCookie(response, token);
  sendJson(response, 201, { ok: true, username });
  broadcast("presence", { onlineUsers: Object.values(state.sessions) });
}

async function handleLogin(request, response) {
  const body = await parseBody(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();
  const user = state.users.find((entry) => entry.username === username && entry.password === password);

  if (!user) {
    sendJson(response, 401, { error: "Wrong username or password." });
    return;
  }

  const token = crypto.randomBytes(24).toString("hex");
  state.sessions[token] = user.username;
  saveState();
  setSessionCookie(response, token);
  sendJson(response, 200, { ok: true, username: user.username });
  broadcast("presence", { onlineUsers: Object.values(state.sessions) });
}

function handleLogout(request, response) {
  const cookies = cookieMap(request);
  if (cookies.lagcord_session) {
    delete state.sessions[cookies.lagcord_session];
    saveState();
  }
  clearSessionCookie(response);
  sendJson(response, 200, { ok: true });
  broadcast("presence", { onlineUsers: Object.values(state.sessions) });
}

function handleSession(request, response) {
  const user = getUserFromRequest(request);
  sendJson(response, 200, publicStateFor(user?.username));
}

async function handleMessage(request, response) {
  const user = getUserFromRequest(request);
  if (!user) {
    sendJson(response, 401, { error: "Create an account or log in to chat." });
    return;
  }

  const body = await parseBody(request);
  const channel = String(body.channel || "");
  const text = String(body.text || "").trim();
  const gif = String(body.gif || "").trim();

  if (!state.channels[channel]) {
    sendJson(response, 400, { error: "Unknown channel." });
    return;
  }

  if (!text && !gif) {
    sendJson(response, 400, { error: "Message cannot be empty." });
    return;
  }

  const message = {
    id: crypto.randomBytes(8).toString("hex"),
    user: user.username,
    time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    text: text || "Shared a GIF",
    gif
  };

  state.channels[channel].push(message);
  saveState();
  sendJson(response, 201, { ok: true, message: formatMessage(message) });
  broadcast("message", { channel, message: formatMessage(message), onlineUsers: Object.values(state.sessions) });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (request.method === "GET" && requestUrl.pathname === "/events") {
      handleEvents(request, response);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/session") {
      handleSession(request, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/register") {
      await handleRegister(request, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/login") {
      await handleLogin(request, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/logout") {
      handleLogout(request, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/messages") {
      await handleMessage(request, response);
      return;
    }

    const urlPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
    const filePath = path.normalize(path.join(root, decodeURIComponent(urlPath)));

    if (!filePath.startsWith(root)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    sendFile(filePath, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, () => {
  console.log(`Lagcord is live at http://localhost:${port}`);
});

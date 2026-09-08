const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const ROOMS_FILE = path.join(__dirname, "rooms.json");
const USERS_FILE = path.join(__dirname, "users.json");
const MAX_ROOM_SIZE = 2;

app.use(express.static("public"));

// ---------------- PERSISTENCE ----------------

function loadJSON(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf-8").trim();
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFile(file, JSON.stringify(data, null, 2), err => {
    if (err) console.error("Failed to write " + file, err);
  });
}

let rooms = loadJSON(ROOMS_FILE, {});   // { roomId: { createdAt, participants: [socketId, ...] } }
let users = loadJSON(USERS_FILE, {});   // { socketId: { room, joinedAt } }

function persist() {
  saveJSON(ROOMS_FILE, rooms);
  saveJSON(USERS_FILE, users);
}

function roomSize(roomId) {
  const r = io.sockets.adapter.rooms.get(roomId);
  return r ? r.size : 0;
}

// ---------------- ICE CONFIG ----------------
// Serve ICE servers from the server so TURN credentials never live in
// client-side code. Set TURN_URL / TURN_USERNAME / TURN_CREDENTIAL env vars
// to add a TURN server for users behind restrictive NATs/firewalls.
app.get("/ice-config", (req, res) => {
  const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }

  res.json({ iceServers });
});

// ---------------- SOCKET SIGNALING ----------------

io.on("connection", socket => {

  socket.on("join-room", room => {
    if (!room || typeof room !== "string") {
      return socket.emit("join-error", "Invalid room code");
    }

    const size = roomSize(room);

    if (size >= MAX_ROOM_SIZE) {
      return socket.emit("join-error", "Room is full (max 2 people)");
    }

    socket.join(room);
    socket.data.room = room;

    users[socket.id] = { room, joinedAt: Date.now() };

    if (!rooms[room]) {
      rooms[room] = { createdAt: Date.now(), participants: [] };
    }
    if (!rooms[room].participants.includes(socket.id)) {
      rooms[room].participants.push(socket.id);
    }
    persist();

    socket.emit("joined-room", { room, isFirst: size === 0 });
    socket.to(room).emit("user-joined");
  });

  socket.on("offer", data => {
    socket.to(data.room).emit("offer", data.offer);
  });

  socket.on("answer", data => {
    socket.to(data.room).emit("answer", data.answer);
  });

  socket.on("ice-candidate", data => {
    socket.to(data.room).emit("ice-candidate", data.candidate);
  });

  socket.on("chat-message", data => {
    socket.to(data.room).emit("chat-message", data.msg);
  });

  socket.on("leave-room", () => {
    handleLeave(socket);
  });

  socket.on("disconnect", () => {
    handleLeave(socket);
  });

  function handleLeave(socket) {
    const room = socket.data.room;
    if (!room) return;

    socket.to(room).emit("user-left");
    socket.leave(room);
    socket.data.room = null;

    delete users[socket.id];
    if (rooms[room]) {
      rooms[room].participants = rooms[room].participants.filter(id => id !== socket.id);
      if (rooms[room].participants.length === 0) {
        delete rooms[room];
      }
    }
    persist();
  }
});

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

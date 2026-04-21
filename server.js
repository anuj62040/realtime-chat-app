const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7
});

const PORT = process.env.PORT || 3000;

const USERS_FILE = path.join(__dirname, "users.json");
const ROOMS_FILE = path.join(__dirname, "rooms.json");

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

function ensureFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}

ensureFile(USERS_FILE, []);
ensureFile(ROOMS_FILE, {});

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function readRooms() {
  try {
    return JSON.parse(fs.readFileSync(ROOMS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeRooms(rooms) {
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
}

function generateRoomCode(length = 10) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function sanitizeUsername(username) {
  return String(username || "").trim();
}

function sanitizePassword(password) {
  return String(password || "").trim();
}

function getSafeUser(user) {
  return {
    username: user.username,
    createdAt: user.createdAt
  };
}

function createRoomObject(owner) {
  return {
    owner,
    users: [],
    messages: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now()
  };
}

function loadRoom(roomId) {
  const rooms = readRooms();
  return rooms[roomId] || null;
}

function saveRoom(roomId, roomData) {
  const rooms = readRooms();
  rooms[roomId] = roomData;
  writeRooms(rooms);
}

function saveMessage(roomId, message) {
  const room = loadRoom(roomId);
  if (!room) return;
  room.messages.push(message);
  if (room.messages.length > 500) {
    room.messages = room.messages.slice(-500);
  }
  room.lastActiveAt = Date.now();
  saveRoom(roomId, room);
}

function removeUserFromRoomBySocket(socketId) {
  const rooms = readRooms();
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const index = room.users.findIndex((u) => u.socketId === socketId);
    if (index !== -1) {
      const user = room.users[index];
      room.users.splice(index, 1);
      room.lastActiveAt = Date.now();
      writeRooms(rooms);
      return { roomId, room: rooms[roomId], user };
    }
  }
  return null;
}

function cleanupOldRooms() {
  const rooms = readRooms();
  const now = Date.now();
  const ttl = 24 * 60 * 60 * 1000;

  for (const roomId in rooms) {
    const room = rooms[roomId];
    const inactiveTooLong = room.users.length === 0 && now - room.lastActiveAt > ttl;

    if (inactiveTooLong) {
      delete rooms[roomId];
    }
  }

  writeRooms(rooms);
}

setInterval(cleanupOldRooms, 60 * 1000);

app.post("/api/signup", (req, res) => {
  const username = sanitizeUsername(req.body.username);
  const password = sanitizePassword(req.body.password);
  const confirmPassword = sanitizePassword(req.body.confirmPassword);

  if (!username || !password || !confirmPassword) {
    return res.json({ success: false, message: "All fields are required" });
  }

  if (username.length < 3) {
    return res.json({ success: false, message: "Username must be at least 3 characters" });
  }

  if (password.length < 4) {
    return res.json({ success: false, message: "Password must be at least 4 characters" });
  }

  if (password !== confirmPassword) {
    return res.json({ success: false, message: "Password and confirm password do not match" });
  }

  const users = readUsers();
  const existingUser = users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase()
  );

  if (existingUser) {
    return res.json({ success: false, message: "Username already exists" });
  }

  const user = {
    username,
    password,
    createdAt: Date.now()
  };

  users.push(user);
  writeUsers(users);

  return res.json({
    success: true,
    message: "Account created successfully",
    user: getSafeUser(user)
  });
});

app.post("/api/login", (req, res) => {
  const username = sanitizeUsername(req.body.username);
  const password = sanitizePassword(req.body.password);

  if (!username || !password) {
    return res.json({ success: false, message: "Username and password required" });
  }

  const users = readUsers();
  const user = users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase()
  );

  if (!user) {
    return res.json({ success: false, message: "User not found" });
  }

  if (user.password !== password) {
    return res.json({ success: false, message: "Wrong password" });
  }

  return res.json({
    success: true,
    message: "Login successful",
    user: getSafeUser(user)
  });
});

io.on("connection", (socket) => {
  socket.on("create-room", ({ username }, callback) => {
    let roomId = generateRoomCode(10);
    while (loadRoom(roomId)) {
      roomId = generateRoomCode(10);
    }

    const room = createRoomObject(username);
    room.users.push({
      username,
      socketId: socket.id
    });

    saveRoom(roomId, room);

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = username;

    callback({
      success: true,
      roomId,
      users: room.users,
      messages: room.messages
    });
  });

  socket.on("join-room", ({ roomId, username }, callback) => {
    roomId = String(roomId || "").trim();
    username = String(username || "").trim();

    if (!roomId || roomId.length !== 10) {
      return callback({
        success: false,
        message: "Room code must be 10 characters"
      });
    }

    let room = loadRoom(roomId);

    if (!room) {
      return callback({
        success: false,
        message: "Room not found"
      });
    }

    const sameUserIndex = room.users.findIndex((u) => u.username === username);
    if (sameUserIndex !== -1) {
      room.users.splice(sameUserIndex, 1);
    }

    if (room.users.length >= 2) {
      return callback({
        success: false,
        message: "Room full. Only 2 users allowed"
      });
    }

    room.users.push({
      username,
      socketId: socket.id
    });

    room.lastActiveAt = Date.now();
    saveRoom(roomId, room);

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = username;

    const systemMsg = {
      type: "system",
      text: `${username} joined/rejoined the room`,
      time: new Date().toLocaleTimeString()
    };

    saveMessage(roomId, systemMsg);

    room = loadRoom(roomId);

    socket.to(roomId).emit("system-message", systemMsg);
    io.to(roomId).emit("room-users", room.users);

    callback({
      success: true,
      roomId,
      users: room.users,
      messages: room.messages
    });
  });

  socket.on("request-room-data", ({ roomId }, callback) => {
    const room = loadRoom(roomId);
    if (!room) {
      return callback({ success: false, message: "Room not found" });
    }

    callback({
      success: true,
      users: room.users,
      messages: room.messages
    });
  });

  socket.on("chat-message", ({ roomId, text, sender }) => {
    if (!roomId || !text) return;

    const msg = {
      type: "text",
      text,
      sender,
      time: new Date().toLocaleTimeString()
    };

    saveMessage(roomId, msg);
    io.to(roomId).emit("chat-message", msg);
  });

  socket.on("photo-message", ({ roomId, image, sender, fileName }) => {
    if (!roomId || !image) return;

    const msg = {
      type: "photo",
      image,
      sender,
      fileName: fileName || "photo",
      time: new Date().toLocaleTimeString()
    };

    saveMessage(roomId, msg);
    io.to(roomId).emit("photo-message", msg);
  });

  socket.on("typing", ({ roomId, username }) => {
    socket.to(roomId).emit("typing", { username });
  });

  socket.on("stop-typing", ({ roomId }) => {
    socket.to(roomId).emit("stop-typing");
  });

  socket.on("webrtc-offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("webrtc-offer", { offer });
  });

  socket.on("webrtc-answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("webrtc-answer", { answer });
  });

  socket.on("webrtc-ice-candidate", ({ roomId, candidate }) => {
    socket.to(roomId).emit("webrtc-ice-candidate", { candidate });
  });

  socket.on("call-ended", ({ roomId }) => {
    socket.to(roomId).emit("call-ended");
  });

  socket.on("disconnect", () => {
    const result = removeUserFromRoomBySocket(socket.id);
    if (!result) return;

    const { roomId, user } = result;

    const systemMsg = {
      type: "system",
      text: `${user.username} disconnected`,
      time: new Date().toLocaleTimeString()
    };

    saveMessage(roomId, systemMsg);
    socket.to(roomId).emit("system-message", systemMsg);

    const updatedRoom = loadRoom(roomId);
    if (updatedRoom) {
      io.to(roomId).emit("room-users", updatedRoom.users);
    }

    socket.to(roomId).emit("call-ended");
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

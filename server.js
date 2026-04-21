const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let users = [];
let rooms = {};

app.post("/signup", (req, res) => {
  const { username, password } = req.body;

  if (users.find(u => u.username === username)) {
    return res.json({ success: false, message: "User already exists" });
  }

  users.push({ username, password });
  res.json({ success: true });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.json({ success: false, message: "Invalid credentials" });
  }

  res.json({ success: true });
});

function generateCode(length = 10) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

io.on("connection", socket => {

  socket.on("create-room", (username, callback) => {
    const roomId = generateCode();

    rooms[roomId] = {
      users: [username],
      messages: []
    };

    socket.join(roomId);
    socket.roomId = roomId;

    callback(roomId);
  });

  socket.on("join-room", ({ roomId, username }, callback) => {
    const room = rooms[roomId];

    if (!room) {
      return callback({ success: false, message: "Room not found" });
    }

    room.users.push(username);
    socket.join(roomId);
    socket.roomId = roomId;

    callback({ success: true, messages: room.messages });

    io.to(roomId).emit("user-joined", username);
  });

  socket.on("message", ({ roomId, username, text }) => {
    const msg = { username, text };
    rooms[roomId].messages.push(msg);

    io.to(roomId).emit("message", msg);
  });

  socket.on("disconnect", () => {
    // optional cleanup
  });

});

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

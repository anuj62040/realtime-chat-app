const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (room) => {
    socket.join(room);
    socket.to(room).emit("user-joined");
  });

  socket.on("chat-message", (msg) => {
    socket.broadcast.emit("chat-message", msg);
  });

  socket.on("typing", () => {
    socket.broadcast.emit("typing");
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

http.listen(3000, () => console.log("Server running on http://localhost:3000"));

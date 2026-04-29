const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

io.on("connection", socket => {

  socket.on("join-room", room => {
    socket.join(room);
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

});

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

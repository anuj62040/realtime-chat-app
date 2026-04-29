const socket = io();

let localStream;
let micOn = true;
let camOn = true;

// ✅ Start camera & mic safely
async function startMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    document.getElementById("localVideo").srcObject = localStream;

  } catch (err) {
    showError("Camera/Mic permission denied or not working");
    console.error(err);
  }
}

// ✅ Show error
function showError(msg) {
  document.getElementById("errorBox").innerText = msg;
}

// ✅ Join room
function joinRoom() {
  const room = document.getElementById("roomInput").value;

  if (!room) {
    showError("Enter Room ID");
    return;
  }

  socket.emit("join-room", room);

  startMedia();

  document.getElementById("chatBox").style.display = "block";
}

// ✅ Send message
function sendMessage() {
  const input = document.getElementById("msgInput");
  const msg = input.value;

  if (!msg) return;

  socket.emit("chat-message", msg);
  addMessage("You: " + msg);

  input.value = "";
}

// ✅ Receive message
socket.on("chat-message", (msg) => {
  addMessage("Friend: " + msg);
});

// ✅ Typing indicator
document.getElementById("msgInput").addEventListener("input", () => {
  socket.emit("typing");
});

socket.on("typing", () => {
  const t = document.getElementById("typing");
  t.innerText = "Typing...";
  setTimeout(() => (t.innerText = ""), 1000);
});

// ✅ Add message
function addMessage(text) {
  const div = document.createElement("div");
  div.innerText = text;
  document.getElementById("messages").appendChild(div);
}

// ✅ Mic toggle
function toggleMic() {
  if (!localStream) return;

  micOn = !micOn;
  localStream.getAudioTracks()[0].enabled = micOn;
}

// ✅ Camera toggle
function toggleCam() {
  if (!localStream) return;

  camOn = !camOn;
  localStream.getVideoTracks()[0].enabled = camOn;
}

// ✅ End call
function endCall() {
  if (!localStream) return;

  localStream.getTracks().forEach(track => track.stop());
  showError("Call Ended");
}

const socket = io();

let roomId;
let localStream;
let peer;

// ---------------- ROOM ----------------

function createRoom() {
  roomId = Math.random().toString(36).substring(2, 8);

  document.getElementById("roomCodeDisplay").innerText =
    "Room Code: " + roomId;

  socket.emit("join-room", roomId);

  startMedia();
}

function joinRoom() {
  roomId = document.getElementById("roomInput").value;

  if (!roomId) return showError("Enter Room Code");

  socket.emit("join-room", roomId);

  startMedia();
}

// ---------------- MEDIA ----------------

async function startMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    document.getElementById("localVideo").srcObject = localStream;

  } catch (err) {
    showError("Camera/Mic permission denied");
  }
}

// ---------------- PEER CONNECTION ----------------

function createPeer() {
  peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }
    ]
  });

  localStream.getTracks().forEach(track => {
    peer.addTrack(track, localStream);
  });

  peer.ontrack = e => {
    document.getElementById("remoteVideo").srcObject = e.streams[0];
  };

  peer.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("ice-candidate", {
        room: roomId,
        candidate: e.candidate
      });
    }
  };
}

// ---------------- SIGNALING ----------------

socket.on("user-joined", async () => {
  createPeer();

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  socket.emit("offer", { room: roomId, offer });
});

socket.on("offer", async (offer) => {
  createPeer();

  await peer.setRemoteDescription(offer);

  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);

  socket.emit("answer", { room: roomId, answer });
});

socket.on("answer", async (answer) => {
  await peer.setRemoteDescription(answer);
});

socket.on("ice-candidate", async (candidate) => {
  if (peer) await peer.addIceCandidate(candidate);
});

// ---------------- CHAT ----------------

function sendMessage() {
  const msg = document.getElementById("msgInput").value;

  socket.emit("chat-message", { room: roomId, msg });

  addMessage("You: " + msg);
}

socket.on("chat-message", msg => {
  addMessage("Friend: " + msg);
});

function addMessage(text) {
  const div = document.createElement("div");
  div.innerText = text;
  document.getElementById("messages").appendChild(div);
}

// ---------------- CONTROLS ----------------

function toggleMic() {
  localStream.getAudioTracks()[0].enabled =
    !localStream.getAudioTracks()[0].enabled;
}

function toggleCam() {
  localStream.getVideoTracks()[0].enabled =
    !localStream.getVideoTracks()[0].enabled;
}

function endCall() {
  if (peer) peer.close();

  if (localStream)
    localStream.getTracks().forEach(t => t.stop());
}

// ---------------- ERROR ----------------

function showError(msg) {
  document.getElementById("errorBox").innerText = msg;
}

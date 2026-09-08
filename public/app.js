const socket = io();

let roomId;
let localStream;
let peer;
let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

const el = id => document.getElementById(id);

// ---------------- ICE CONFIG ----------------

async function loadIceConfig() {
  try {
    const res = await fetch("/ice-config");
    const data = await res.json();
    if (data.iceServers && data.iceServers.length) {
      iceServers = data.iceServers;
    }
  } catch {
    // Falls back to the default STUN-only config above.
  }
}
loadIceConfig();

// ---------------- ROOM ----------------

function createRoom() {
  roomId = Math.random().toString(36).substring(2, 8);
  joinFlow(roomId, true);
}

function joinRoom() {
  const code = el("roomInput").value.trim();
  if (!code) return showError("Enter a room code");
  joinFlow(code, false);
}

async function joinFlow(code, isCreator) {
  clearError();
  setStage("connecting");
  await startMedia();
  if (!localStream) return; // media permission failed, error already shown
  socket.emit("join-room", code);
}

socket.on("join-error", msg => {
  setStage("landing");
  showError(msg);
  endCall(false);
});

socket.on("joined-room", ({ room }) => {
  roomId = room;
  el("roomCodeValue").innerText = roomId;
  setStage("call");
  setStatus(false, "Waiting for the other person…");
});

// ---------------- MEDIA ----------------

async function startMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    el("localVideo").srcObject = localStream;
  } catch (err) {
    setStage("landing");
    showError("Camera/mic permission denied");
    localStream = null;
  }
}

// ---------------- PEER CONNECTION ----------------

function createPeer() {
  peer = new RTCPeerConnection({ iceServers });

  localStream.getTracks().forEach(track => {
    peer.addTrack(track, localStream);
  });

  peer.ontrack = e => {
    el("remoteVideo").srcObject = e.streams[0];
    el("videoEmpty").classList.add("hidden");
    setStatus(true, "Connected");
  };

  peer.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("ice-candidate", { room: roomId, candidate: e.candidate });
    }
  };

  peer.onconnectionstatechange = () => {
    if (!peer) return;
    if (peer.connectionState === "disconnected" || peer.connectionState === "failed") {
      setStatus(false, "Connection lost");
    }
  };
}

// ---------------- SIGNALING ----------------

socket.on("user-joined", async () => {
  setStatus(false, "Other person joined — connecting…");
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
  if (peer) await peer.setRemoteDescription(answer);
});

socket.on("ice-candidate", async (candidate) => {
  if (peer) {
    try {
      await peer.addIceCandidate(candidate);
    } catch {
      // Candidate arrived after the peer connection was torn down; safe to ignore.
    }
  }
});

socket.on("user-left", () => {
  setStatus(false, "Other person left the call");
  el("remoteVideo").srcObject = null;
  el("videoEmpty").classList.remove("hidden");
  el("videoEmpty").innerText = "The other person left";
  if (peer) {
    peer.close();
    peer = null;
  }
});

// ---------------- CHAT ----------------

function sendMessage() {
  const input = el("msgInput");
  const msg = input.value.trim();
  if (!msg) return;

  socket.emit("chat-message", { room: roomId, msg });
  addMessage(msg, "outgoing");
  input.value = "";
}

socket.on("chat-message", msg => {
  addMessage(msg, "incoming");
});

function addMessage(text, direction) {
  const div = document.createElement("div");
  div.className = "message " + direction;
  div.innerText = text;
  const container = el("messages");
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ---------------- CONTROLS ----------------

function toggleMic() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  el("micBtn").classList.toggle("off", !track.enabled);
}

function toggleCam() {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  el("camBtn").classList.toggle("off", !track.enabled);
}

function endCall(notifyServer = true) {
  if (notifyServer) socket.emit("leave-room");

  if (peer) {
    peer.close();
    peer = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  el("localVideo").srcObject = null;
  el("remoteVideo").srcObject = null;
  el("messages").innerHTML = "";
  el("videoEmpty").classList.remove("hidden");
  el("videoEmpty").innerText = "Waiting for the other person to join…";
  el("chatPanel").classList.remove("open");
  roomId = undefined;
  setStage("landing");
}

function toggleChat() {
  el("chatPanel").classList.toggle("open");
}

function copyRoomCode() {
  if (!roomId) return;
  navigator.clipboard.writeText(roomId).then(() => {
    const btn = el("copyBtn");
    const original = btn.innerText;
    btn.innerText = "Copied";
    setTimeout(() => (btn.innerText = original), 1200);
  });
}

// ---------------- UI STATE ----------------

function setStage(stage) {
  document.body.dataset.stage = stage;
}

function setStatus(connected, text) {
  const dot = el("statusDot");
  const label = el("statusText");
  if (dot) dot.classList.toggle("live", connected === true);
  if (label) label.innerText = text;
}

function showError(msg) {
  const box = el("errorBox");
  box.innerText = msg;
  box.classList.add("visible");
}

function clearError() {
  const box = el("errorBox");
  box.innerText = "";
  box.classList.remove("visible");
}

el("msgInput") && el("msgInput").addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

setStage("landing");

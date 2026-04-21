const socket = io();

const authCard = document.getElementById("authCard");
const joinCard = document.getElementById("joinCard");
const appScreen = document.getElementById("appScreen");

const showLoginBtn = document.getElementById("showLoginBtn");
const showSignupBtn = document.getElementById("showSignupBtn");
const loginBox = document.getElementById("loginBox");
const signupBox = document.getElementById("signupBox");

const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const signupUsername = document.getElementById("signupUsername");
const signupPassword = document.getElementById("signupPassword");
const signupConfirmPassword = document.getElementById("signupConfirmPassword");

const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");

const authStatus = document.getElementById("authStatus");
const currentUserText = document.getElementById("currentUserText");

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomCodeInput = document.getElementById("roomCodeInput");
const roomStatus = document.getElementById("roomStatus");
const recentRooms = document.getElementById("recentRooms");

const activeRoomCode = document.getElementById("activeRoomCode");
const usersList = document.getElementById("usersList");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const backBtn = document.getElementById("backBtn");

const messages = document.getElementById("messages");
const typingText = document.getElementById("typingText");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const photoInput = document.getElementById("photoInput");
const audioCallBtn = document.getElementById("audioCallBtn");
const videoCallBtn = document.getElementById("videoCallBtn");
const endCallBtn = document.getElementById("endCallBtn");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let currentUser = null;
let currentRoom = "";
let localStream = null;
let peerConnection = null;
let typingTimer = null;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function escapeHtml(text) {
  const div = document.createElement("div");
  div.innerText = text;
  return div.innerHTML;
}

function saveCurrentUser(user) {
  localStorage.setItem("chat_current_user", JSON.stringify(user));
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("chat_current_user") || "null");
  } catch {
    return null;
  }
}

function clearCurrentUser() {
  localStorage.removeItem("chat_current_user");
}

function getRecentRooms() {
  if (!currentUser) return [];
  try {
    return JSON.parse(localStorage.getItem(`recent_rooms_${currentUser.username}`) || "[]");
  } catch {
    return [];
  }
}

function saveRecentRoom(roomId) {
  if (!currentUser) return;

  let rooms = getRecentRooms();
  rooms = rooms.filter((r) => r.roomId !== roomId);
  rooms.unshift({
    roomId,
    savedAt: Date.now()
  });
  rooms = rooms.slice(0, 10);

  localStorage.setItem(
    `recent_rooms_${currentUser.username}`,
    JSON.stringify(rooms)
  );
  renderRecentRooms();
}

function renderRecentRooms() {
  const rooms = getRecentRooms();

  if (!rooms.length) {
    recentRooms.innerHTML = `<p style="margin:0;color:#cbd5e1;">No recent rooms</p>`;
    return;
  }

  recentRooms.innerHTML = rooms.map((room) => `
    <div class="recent-item">
      <div>
        <strong>${room.roomId}</strong>
      </div>
      <button onclick="joinRecentRoom('${room.roomId}')">Rejoin</button>
    </div>
  `).join("");
}

window.joinRecentRoom = function(roomId) {
  roomCodeInput.value = roomId;
  joinRoom();
};

function showLogin() {
  loginBox.classList.remove("hidden");
  signupBox.classList.add("hidden");
  showLoginBtn.classList.add("active");
  showSignupBtn.classList.remove("active");
  authStatus.textContent = "";
}

function showSignup() {
  signupBox.classList.remove("hidden");
  loginBox.classList.add("hidden");
  showSignupBtn.classList.add("active");
  showLoginBtn.classList.remove("active");
  authStatus.textContent = "";
}

showLoginBtn.addEventListener("click", showLogin);
showSignupBtn.addEventListener("click", showSignup);

async function signup() {
  const username = signupUsername.value.trim();
  const password = signupPassword.value.trim();
  const confirmPassword = signupConfirmPassword.value.trim();

  if (!username || !password || !confirmPassword) {
    authStatus.textContent = "Sab fields bharna hai";
    return;
  }

  try {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password, confirmPassword })
    });

    const data = await res.json();
    authStatus.textContent = data.message;

    if (data.success) {
      signupUsername.value = "";
      signupPassword.value = "";
      signupConfirmPassword.value = "";
      showLogin();
    }
  } catch (error) {
    console.error(error);
    authStatus.textContent = "Signup error aaya";
  }
}

async function login() {
  const username = loginUsername.value.trim();
  const password = loginPassword.value.trim();

  if (!username || !password) {
    authStatus.textContent = "Username aur password bharo";
    return;
  }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    authStatus.textContent = data.message;

    if (data.success) {
      currentUser = data.user;
      saveCurrentUser(currentUser);
      currentUserText.textContent = currentUser.username;
      authCard.classList.add("hidden");
      joinCard.classList.remove("hidden");
      renderRecentRooms();

      loginUsername.value = "";
      loginPassword.value = "";
    }
  } catch (error) {
    console.error(error);
    authStatus.textContent = "Login error aaya";
  }
}

signupBtn.addEventListener("click", signup);
loginBtn.addEventListener("click", login);

logoutBtn.addEventListener("click", () => {
  clearCurrentUser();
  currentUser = null;
  currentRoom = "";
  joinCard.classList.add("hidden");
  appScreen.classList.add("hidden");
  authCard.classList.remove("hidden");
});

function addMessage(html, className = "") {
  const div = document.createElement("div");
  div.className = `message ${className}`;
  div.innerHTML = html;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function clearMessages() {
  messages.innerHTML = "";
}

function renderSavedMessage(msg) {
  if (msg.type === "text") {
    addMessage(
      `<strong>${escapeHtml(msg.sender || "User")}</strong><br>${escapeHtml(msg.text || "")}<br><small>${msg.time || ""}</small>`
    );
  } else if (msg.type === "photo") {
    addMessage(`
      <strong>${escapeHtml(msg.sender || "User")}</strong><br>
      <small>${escapeHtml(msg.fileName || "photo")} • ${msg.time || ""}</small><br>
      <img src="${msg.image}" alt="photo" />
    `);
  } else if (msg.type === "system") {
    addMessage(`<strong>System:</strong> ${escapeHtml(msg.text || "")}<br><small>${msg.time || ""}</small>`, "system");
  }
}

function renderHistory(history = []) {
  clearMessages();
  history.forEach(renderSavedMessage);
}

function showApp(roomId) {
  currentRoom = roomId;
  joinCard.classList.add("hidden");
  appScreen.classList.remove("hidden");
  activeRoomCode.textContent = `Room: ${roomId}`;
}

function showLobby() {
  currentRoom = "";
  appScreen.classList.add("hidden");
  joinCard.classList.remove("hidden");
  stopTracks();

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
}

function createRoom() {
  if (!currentUser) return;

  socket.emit("create-room", { username: currentUser.username }, (response) => {
    if (!response.success) return;

    showApp(response.roomId);
    saveRecentRoom(response.roomId);
    renderHistory(response.messages || []);
    usersList.textContent =
      "Users: " + ((response.users || []).map((u) => u.username).join(", ") || "-");

    addMessage(
      `<strong>System:</strong> Room created. Share this code: <b>${response.roomId}</b>`,
      "system"
    );
  });
}

function joinRoom() {
  if (!currentUser) return;

  const roomId = roomCodeInput.value.trim();

  if (!roomId) {
    roomStatus.textContent = "Room code dalo";
    return;
  }

  socket.emit("join-room", { roomId, username: currentUser.username }, (response) => {
    if (!response.success) {
      roomStatus.textContent = response.message;
      return;
    }

    roomStatus.textContent = "Joined successfully";
    showApp(response.roomId);
    saveRecentRoom(response.roomId);
    renderHistory(response.messages || []);
    usersList.textContent =
      "Users: " + ((response.users || []).map((u) => u.username).join(", ") || "-");
  });
}

createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
backBtn.addEventListener("click", showLobby);

copyCodeBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentRoom);
    alert("Room code copied");
  } catch {
    alert("Copy failed");
  }
});

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentUser || !currentRoom) return;

  socket.emit("chat-message", {
    roomId: currentRoom,
    text,
    sender: currentUser.username
  });

  messageInput.value = "";
  socket.emit("stop-typing", { roomId: currentRoom });
}

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();

  if (!currentUser || !currentRoom) return;

  socket.emit("typing", {
    roomId: currentRoom,
    username: currentUser.username
  });

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit("stop-typing", { roomId: currentRoom });
  }, 1000);
});

photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (!file || !currentUser || !currentRoom) return;

  const reader = new FileReader();
  reader.onload = () => {
    socket.emit("photo-message", {
      roomId: currentRoom,
      image: reader.result,
      sender: currentUser.username,
      fileName: file.name
    });
  };
  reader.readAsDataURL(file);
});

socket.on("chat-message", ({ text, sender, time }) => {
  addMessage(
    `<strong>${escapeHtml(sender)}</strong><br>${escapeHtml(text)}<br><small>${time}</small>`
  );
});

socket.on("photo-message", ({ image, sender, fileName, time }) => {
  addMessage(`
    <strong>${escapeHtml(sender)}</strong><br>
    <small>${escapeHtml(fileName)} • ${time}</small><br>
    <img src="${image}" alt="photo" />
  `);
});

socket.on("system-message", ({ text, time }) => {
  addMessage(
    `<strong>System:</strong> ${escapeHtml(text)}<br><small>${time || ""}</small>`,
    "system"
  );
});

socket.on("typing", ({ username }) => {
  typingText.textContent = `${username} is typing...`;
});

socket.on("stop-typing", () => {
  typingText.textContent = "";
});

socket.on("room-users", (users) => {
  usersList.textContent = "Users: " + (users.map((u) => u.username).join(", ") || "-");
});

async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("webrtc-ice-candidate", {
        roomId: currentRoom,
        candidate: event.candidate
      });
    }
  };

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }
}

async function startCall(type) {
  try {
    const constraints = {
      audio: true,
      video: type === "video"
    };

    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;

    await createPeerConnection();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("webrtc-offer", {
      roomId: currentRoom,
      offer
    });

    addMessage(`<strong>System:</strong> ${type} call started`, "system");
  } catch (error) {
    console.error(error);
    alert("Camera/mic permission denied ya error aaya.");
  }
}

audioCallBtn.addEventListener("click", () => startCall("audio"));
videoCallBtn.addEventListener("click", () => startCall("video"));

socket.on("webrtc-offer", async ({ offer }) => {
  try {
    const wantsVideo = offer.sdp.includes("m=video");

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: wantsVideo
    });

    localVideo.srcObject = localStream;

    await createPeerConnection();
    await peerConnection.setRemoteDescription(offer);

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit("webrtc-answer", {
      roomId: currentRoom,
      answer
    });

    addMessage(
      `<strong>System:</strong> Incoming ${wantsVideo ? "video" : "audio"} call connected`,
      "system"
    );
  } catch (error) {
    console.error(error);
    alert("Incoming call accept nahi ho paya.");
  }
});

socket.on("webrtc-answer", async ({ answer }) => {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription(answer);
});

socket.on("webrtc-ice-candidate", async ({ candidate }) => {
  try {
    if (peerConnection && candidate) {
      await peerConnection.addIceCandidate(candidate);
    }
  } catch (error) {
    console.error("ICE candidate error:", error);
  }
});

function stopTracks() {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
}

function endCall() {
  stopTracks();

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  if (currentRoom) {
    socket.emit("call-ended", { roomId: currentRoom });
  }

  addMessage("<strong>System:</strong> Call ended", "system");
}

endCallBtn.addEventListener("click", endCall);

socket.on("call-ended", () => {
  stopTracks();

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  addMessage("<strong>System:</strong> Other user ended the call", "system");
});

function autoLoginIfSaved() {
  const savedUser = getCurrentUser();
  if (!savedUser) return;

  currentUser = savedUser;
  currentUserText.textContent = currentUser.username;
  authCard.classList.add("hidden");
  joinCard.classList.remove("hidden");
  renderRecentRooms();
}

autoLoginIfSaved();

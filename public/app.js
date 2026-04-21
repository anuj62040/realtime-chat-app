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

const toggleLoginPassword = document.getElementById("toggleLoginPassword");
const toggleSignupPassword = document.getElementById("toggleSignupPassword");
const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");

const authStatus = document.getElementById("authStatus");
const currentUserText = document.getElementById("currentUserText");
const headerAvatar = document.getElementById("headerAvatar");

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
const muteBtn = document.getElementById("muteBtn");
const speakerBtn = document.getElementById("speakerBtn");

const callOverlay = document.getElementById("callOverlay");
const callTypeText = document.getElementById("callTypeText");
const callUserText = document.getElementById("callUserText");
const callStatusText = document.getElementById("callStatusText");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let currentUser = null;
let currentRoom = "";
let localStream = null;
let peerConnection = null;
let typingTimer = null;
let speakerEnabled = false;
let isMuted = false;
let currentCallMode = "audio";

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function escapeHtml(text) {
  const div = document.createElement("div");
  div.innerText = text;
  return div.innerHTML;
}

function setStatus(el, text, type = "") {
  el.textContent = text;
  el.className = "status";
  if (type) el.classList.add(type);
}

function togglePasswordField(input, btn) {
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "Hide";
  } else {
    input.type = "password";
    btn.textContent = "Show";
  }
}

toggleLoginPassword.addEventListener("click", () => togglePasswordField(loginPassword, toggleLoginPassword));
toggleSignupPassword.addEventListener("click", () => togglePasswordField(signupPassword, toggleSignupPassword));
toggleConfirmPassword.addEventListener("click", () => togglePasswordField(signupConfirmPassword, toggleConfirmPassword));

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
  rooms.unshift({ roomId, savedAt: Date.now() });
  rooms = rooms.slice(0, 10);
  localStorage.setItem(`recent_rooms_${currentUser.username}`, JSON.stringify(rooms));
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
      <div><strong>${room.roomId}</strong></div>
      <button class="rejoin-btn" onclick="joinRecentRoom('${room.roomId}')">Rejoin</button>
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
  setStatus(authStatus, "");
}

function showSignup() {
  signupBox.classList.remove("hidden");
  loginBox.classList.add("hidden");
  showSignupBtn.classList.add("active");
  showLoginBtn.classList.remove("active");
  setStatus(authStatus, "");
}

showLoginBtn.addEventListener("click", showLogin);
showSignupBtn.addEventListener("click", showSignup);

async function signup() {
  const username = signupUsername.value.trim();
  const password = signupPassword.value.trim();
  const confirmPassword = signupConfirmPassword.value.trim();

  if (!username || !password || !confirmPassword) {
    setStatus(authStatus, "All fields are required", "error");
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

    if (!data.success) {
      const msg = data.message === "Username already exists"
        ? "This username is already taken"
        : data.message;
      setStatus(authStatus, msg, "error");
      return;
    }

    setStatus(authStatus, "Account created successfully", "success");
    signupUsername.value = "";
    signupPassword.value = "";
    signupConfirmPassword.value = "";
    showLogin();
  } catch (error) {
    console.error(error);
    setStatus(authStatus, "Signup error", "error");
  }
}

async function login() {
  const username = loginUsername.value.trim();
  const password = loginPassword.value.trim();

  if (!username || !password) {
    setStatus(authStatus, "Username and password are required", "error");
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

    if (!data.success) {
      const msg = data.message === "Wrong password"
        ? "Incorrect password"
        : data.message;
      setStatus(authStatus, msg, "error");
      return;
    }

    currentUser = data.user;
    saveCurrentUser(currentUser);
    currentUserText.textContent = currentUser.username;
    headerAvatar.textContent = currentUser.username.charAt(0).toUpperCase();

    authCard.classList.add("hidden");
    joinCard.classList.remove("hidden");
    renderRecentRooms();

    loginUsername.value = "";
    loginPassword.value = "";
    setStatus(authStatus, "", "");
  } catch (error) {
    console.error(error);
    setStatus(authStatus, "Login error", "error");
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

function addMessage(html, className = "", senderType = "other") {
  const div = document.createElement("div");
  div.className = `message ${className} ${senderType}`;
  div.innerHTML = html;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function clearMessages() {
  messages.innerHTML = "";
}

function renderSavedMessage(msg) {
  if (msg.type === "text") {
    const senderType =
      currentUser && msg.sender === currentUser.username ? "self" : "other";

    addMessage(
      `<strong>${escapeHtml(msg.sender || "User")}</strong><br>${escapeHtml(msg.text || "")}<br><small>${msg.time || ""}</small>`,
      "",
      senderType
    );
  } else if (msg.type === "photo") {
    const senderType =
      currentUser && msg.sender === currentUser.username ? "self" : "other";

    addMessage(
      `<strong>${escapeHtml(msg.sender || "User")}</strong><br>
       <small>${escapeHtml(msg.fileName || "photo")} • ${msg.time || ""}</small><br>
       <img src="${msg.image}" alt="photo" />`,
      "",
      senderType
    );
  } else if (msg.type === "system") {
    addMessage(
      `<strong>System:</strong> ${escapeHtml(msg.text || "")}<br><small>${msg.time || ""}</small>`,
      "system",
      "system"
    );
  }
}

function renderHistory(history = []) {
  clearMessages();
  history.forEach(renderSavedMessage);
}

function enterRoomHistory() {
  history.pushState({ inRoom: true }, "");
}

window.addEventListener("popstate", () => {
  if (!appScreen.classList.contains("hidden")) {
    showLobby();
  }
});

function showApp(roomId) {
  currentRoom = roomId;
  joinCard.classList.add("hidden");
  appScreen.classList.remove("hidden");
  activeRoomCode.textContent = `Room: ${roomId}`;
  enterRoomHistory();
}

function showLobby() {
  currentRoom = "";
  appScreen.classList.add("hidden");
  joinCard.classList.remove("hidden");
  hideCallOverlay();
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
    usersList.textContent = "Users: " + ((response.users || []).map((u) => u.username).join(", ") || "-");
    addMessage(`<strong>System:</strong> Room created. Share this code: <b>${response.roomId}</b>`, "system", "system");
  });
}

function joinRoom() {
  if (!currentUser) return;

  const roomId = roomCodeInput.value.trim();
  if (!roomId) {
    setStatus(roomStatus, "Enter room code", "error");
    return;
  }

  socket.emit("join-room", { roomId, username: currentUser.username }, (response) => {
    if (!response.success) {
      setStatus(roomStatus, response.message, "error");
      return;
    }

    setStatus(roomStatus, "Joined successfully", "success");
    showApp(response.roomId);
    saveRecentRoom(response.roomId);
    renderHistory(response.messages || []);
    usersList.textContent = "Users: " + ((response.users || []).map((u) => u.username).join(", ") || "-");
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
  const senderType =
    currentUser && sender === currentUser.username ? "self" : "other";

  addMessage(
    `<strong>${escapeHtml(sender)}</strong><br>${escapeHtml(text)}<br><small>${time}</small>`,
    "",
    senderType
  );
});

socket.on("photo-message", ({ image, sender, fileName, time }) => {
  const senderType =
    currentUser && sender === currentUser.username ? "self" : "other";

  addMessage(
    `<strong>${escapeHtml(sender)}</strong><br>
     <small>${escapeHtml(fileName)} • ${time}</small><br>
     <img src="${image}" alt="photo" />`,
    "",
    senderType
  );
});

socket.on("system-message", ({ text, time }) => {
  addMessage(
    `<strong>System:</strong> ${escapeHtml(text)}<br><small>${time || ""}</small>`,
    "system",
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

function showCallOverlay(type, status) {
  currentCallMode = type;
  callOverlay.classList.remove("hidden");
  callTypeText.textContent = type === "video" ? "Video Call" : "Audio Call";
  callUserText.textContent = currentRoom ? `Room ${currentRoom}` : "Private Room Call";
  callStatusText.textContent = status;
}

function hideCallOverlay() {
  callOverlay.classList.add("hidden");
}

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
    showCallOverlay(currentCallMode, "Connected");
  };

  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }
}

async function startCall(type) {
  try {
    currentCallMode = type;
    showCallOverlay(type, "Calling...");

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

    addMessage(`<strong>System:</strong> ${type} call started`, "system", "system");
  } catch (error) {
    console.error(error);
    hideCallOverlay();
    alert("Camera/mic permission denied or error occurred.");
  }
}

audioCallBtn.addEventListener("click", () => startCall("audio"));
videoCallBtn.addEventListener("click", () => startCall("video"));

socket.on("webrtc-offer", async ({ offer }) => {
  try {
    const wantsVideo = offer.sdp.includes("m=video");
    currentCallMode = wantsVideo ? "video" : "audio";

    showCallOverlay(currentCallMode, "Incoming call...");

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

    addMessage(`<strong>System:</strong> Incoming ${currentCallMode} call connected`, "system", "system");
  } catch (error) {
    console.error(error);
    hideCallOverlay();
    alert("Incoming call could not connect.");
  }
});

socket.on("webrtc-answer", async ({ answer }) => {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription(answer);
  showCallOverlay(currentCallMode, "Connected");
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
  hideCallOverlay();

  if (currentRoom) {
    socket.emit("call-ended", { roomId: currentRoom });
  }

  addMessage("<strong>System:</strong> Call ended", "system", "system");
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
  hideCallOverlay();
  addMessage("<strong>System:</strong> Other user ended the call", "system", "system");
});

muteBtn.addEventListener("click", () => {
  if (!localStream) return;
  const audioTracks = localStream.getAudioTracks();
  if (!audioTracks.length) return;

  isMuted = !isMuted;
  audioTracks.forEach(track => {
    track.enabled = !isMuted;
  });

  muteBtn.textContent = isMuted ? "Unmute" : "Mute";
});

speakerBtn.addEventListener("click", () => {
  speakerEnabled = !speakerEnabled;

  if (remoteVideo) {
    remoteVideo.muted = !speakerEnabled;
  }

  speakerBtn.textContent = speakerEnabled ? "Speaker On" : "Speaker Off";
});

function autoLoginIfSaved() {
  const savedUser = getCurrentUser();
  if (!savedUser) return;

  currentUser = savedUser;
  currentUserText.textContent = currentUser.username;
  headerAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
  authCard.classList.add("hidden");
  joinCard.classList.remove("hidden");
  renderRecentRooms();
}

autoLoginIfSaved();

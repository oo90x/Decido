// app.js (module style)
// IMPORTANT: replace firebaseConfig with your project's config (see instructions below)

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// ========== CONFIG ==========
const firebaseConfig = {
  apiKey: "AIzaSyC-kNa6suk3gVpAxc5sg1PpxY7nUbDxzjM",
  authDomain: "decido-8525c.firebaseapp.com",
  projectId: "decido-8525c",
  storageBucket: "decido-8525c.firebasestorage.app",
  messagingSenderId: "60769731900",
  appId: "1:60769731900:web:39a75c8f61d835f7638a39"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ========== GAME CONST ==========
const INVENTORY_SIZE = 6;
const PICKS_LIMIT = 24;  // จำนวนการเลือกรวมของห้อง (ปรับเป็น 24 ถ้าต้องการ 12 ต่อคน)
const itemsPool = [
  // ตัวอย่าง item objects: ให้คุณเติมชื่อและรูปภาพจริงภายหลัง (รูปลงเป็น URL หรือ path ใน public/)
  { id: "cat", name: "แมว", img: "https://i.imgur.com/O1kX9Zk.png" },
  { id: "rabbit", name: "กระต่าย", img: "https://i.imgur.com/Z6aW7oF.png" },
  { id: "yarn", name: "ไหมพรม", img: "https://i.imgur.com/2kMZf6K.png" },
  { id: "book", name: "หนังสือ", img: "https://i.imgur.com/0KXQ4Yh.png" },
  { id: "rock", name: "ก้อนหิน", img: "https://i.imgur.com/m9h1k6Y.png" },
  { id: "feather", name: "ขนนก", img: "https://i.imgur.com/9zJmD6W.png" },
  { id: "umbrella", name: "ร่ม", img: "https://i.imgur.com/1uQe7fT.png" },
  { id: "phone", name: "มือถือ", img: "https://i.imgur.com/1Vw6L2i.png" },
  { id: "pizza", name: "พิซซ่า", img: "https://i.imgur.com/8bD0q5R.png" },
  { id: "sword", name: "ดาบ", img: "https://i.imgur.com/3QpW2k1.png" }
];
// ============================

// UI refs
const roomInput = document.getElementById("roomInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const statusEl = document.getElementById("status");
const roomInfo = document.getElementById("roomInfo");

const gameArea = document.getElementById("gameArea");
const playerInfo = document.getElementById("playerInfo");
const picksInfo = document.getElementById("picksInfo");
const itemA = document.getElementById("itemA");
const itemB = document.getElementById("itemB");
const inventoryEl = document.getElementById("inventory");
const logEl = document.getElementById("log");
const replaceHint = document.getElementById("replaceHint");
const nextPairBtn = document.getElementById("nextPairBtn");

let localPlayerId = null;     // "player1" or "player2"
let roomId = null;
let roomRefUnsubscribe = null;

let localInventory = new Array(INVENTORY_SIZE).fill(null);
let picksCount = 0;
let isReplacing = false;      // when inventory full and need to pick a slot to replace
let currentPair = { a: null, b: null };

// Helpers
function randFromPool() {
  const i = Math.floor(Math.random() * itemsPool.length);
  return itemsPool[i];
}
function log(msg) {
  logEl.textContent = msg;
}
function uidShort() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Render functions
function renderItemCard(el, item, onClick) {
  el.innerHTML = "";
  if (!item) {
    el.textContent = "(no item)";
    return;
  }
  const img = document.createElement("img");
  img.src = item.img;
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = item.name;
  el.appendChild(img);
  el.appendChild(name);
  el.onclick = () => onClick && onClick(item);
}

function renderInventory() {
  inventoryEl.innerHTML = "";
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const s = document.createElement("div");
    s.className = "inventory-slot" + (localInventory[i] ? "" : " empty");
    s.dataset.slot = i;
    if (localInventory[i]) {
      const img = document.createElement("img");
      img.src = localInventory[i].img;
      const nm = document.createElement("div");
      nm.textContent = localInventory[i].name;
      s.appendChild(img);
      s.appendChild(nm);
    } else {
      s.textContent = "Empty";
    }
    s.onclick = () => {
      if (!isReplacing) return;
      const idx = Number(s.dataset.slot);
      replaceSlot(idx);
    };
    inventoryEl.appendChild(s);
  }
}

function renderPair() {
  renderItemCard(itemA, currentPair.a, () => pickItem(currentPair.a));
  renderItemCard(itemB, currentPair.b, () => pickItem(currentPair.b));
}

// ========== Firestore functions ==========
async function createRoom() {
  const code = roomInput.value.trim() || uidShort();
  roomId = code;
  localPlayerId = "player1";

  const roomDoc = {
    createdAt: serverTimestamp(),
    picksLimit: PICKS_LIMIT,
    picksTotal: 0,
    gameState: "selecting",
    players: {
      player1: {
        id: localPlayerId,
        picks: 0,
        inventory: []
      },
      player2: null
    }
  };
  await setDoc(doc(db, "rooms", roomId), roomDoc);
  statusEl.textContent = `Room created: ${roomId} (you are player1)`;
  afterJoinRoom();
}

async function joinRoom() {
  const code = roomInput.value.trim();
  if (!code) { alert("ใส่ room code ก่อน"); return; }
  roomId = code;
  const r = await getDoc(doc(db, "rooms", roomId));
  if (!r.exists()) {
    alert("Room not found");
    return;
  }
  const roomData = r.data();
  if (!roomData.players || !roomData.players.player1) {
    alert("Invalid room");
    return;
  }
  if (!roomData.players.player2) {
    localPlayerId = "player2";
    // update player2 slot
    await updateDoc(doc(db, "rooms", roomId), {
      "players.player2": {
        id: "player2",
        picks: 0,
        inventory: []
      }
    });
    statusEl.textContent = `Joined room ${roomId} as player2`;
    afterJoinRoom();
  } else {
    alert("Room already has 2 players (this prototype supports 2 only)");
  }
}

function subscribeRoom() {
  if (!roomId) return;
  const rDoc = doc(db, "rooms", roomId);
  if (roomRefUnsubscribe) roomRefUnsubscribe();
  roomRefUnsubscribe = onSnapshot(rDoc, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    // show room info
    roomInfo.classList.remove("hidden");
    roomInfo.innerText = JSON.stringify({
      picksTotal: data.picksTotal,
      gameState: data.gameState
    }, null, 2);

    // update picks count and gameState
    picksInfo.textContent = `Picks: ${picksCount} / ${PICKS_LIMIT}`;
    if (data.gameState !== "selecting") {
      log("Selection finished — room state: " + data.gameState);
      // here you could auto-transition to battle
    }
  });
}

// Call after create/join
function afterJoinRoom() {
  document.querySelector(".lobby").classList.add("hidden");
  gameArea.classList.remove("hidden");
  playerInfo.textContent = `You: ${localPlayerId}`;
  // initialize local inventory / picks
  localInventory = new Array(INVENTORY_SIZE).fill(null);
  picksCount = 0;
  isReplacing = false;
  currentPair = { a: randFromPool(), b: randFromPool() };
  renderPair();
  renderInventory();
  subscribeRoom();
  // start listening to remote changes (simple)
  log("Waiting for picks. Choose one of the two items to add to your inventory.");
}

// pick logic when clicking on an item
async function pickItem(item) {
  if (!localPlayerId || !roomId) { alert("Not in room"); return; }
  // if inventory has empty slot -> place automatically
  const emptyIndex = localInventory.findIndex(i => !i);
  if (emptyIndex !== -1) {
    localInventory[emptyIndex] = item;
    picksCount++;
    await saveLocalPickToRoom(item);
    log(`Picked ${item.name} -> placed in slot ${emptyIndex+1}`);
    // generate next pair
    currentPair = { a: randFromPool(), b: randFromPool() };
    renderPair();
    renderInventory();
  } else {
    // inventory full -> ask user to select slot to replace
    isReplacing = true;
    replaceHint.classList.remove("hidden");
    log("Inventory full. Click a slot to replace it with " + item.name);
    // temporarily remember new item to replace with
    window.pendingReplaceItem = item;
  }
  picksInfo.textContent = `Picks: ${picksCount} / ${PICKS_LIMIT}`;

  // update room-level picksTotal
  await updateDoc(doc(db, "rooms", roomId), {
    picksTotal: (await getDoc(doc(db, "rooms", roomId))).data().picksTotal + 1
  }).catch(()=>{ /* ignore if race condition in prototype */ });

  // check picks limit
  const roomSnap = await getDoc(doc(db, "rooms", roomId));
  const roomData = roomSnap.data();
  if (roomData && roomData.picksTotal >= PICKS_LIMIT) {
    // mark ready
    await updateDoc(doc(db, "rooms", roomId), { gameState: "ready" });
    log("Picks complete — battle can begin (gameState=ready)");
  }
}

// replacing a slot when inventory full
async function replaceSlot(idx) {
  if (!isReplacing) return;
  const newItem = window.pendingReplaceItem;
  if (!newItem) return;
  const old = localInventory[idx];
  localInventory[idx] = newItem;
  isReplacing = false;
  replaceHint.classList.add("hidden");
  window.pendingReplaceItem = null;
  picksCount++;
  await saveLocalPickToRoom(newItem);
  renderInventory();
  renderPair();
  log(`Replaced slot ${idx+1} (${old ? old.name : 'empty'}) with ${newItem.name}`);
  picksInfo.textContent = `Picks: ${picksCount} / ${PICKS_LIMIT}`;

  // update room picksTotal
  await updateDoc(doc(db, "rooms", roomId), {
    picksTotal: (await getDoc(doc(db, "rooms", roomId))).data().picksTotal + 1
  }).catch(()=>{});
  const roomSnap = await getDoc(doc(db, "rooms", roomId));
  if (roomSnap.exists() && roomSnap.data().picksTotal >= PICKS_LIMIT) {
    await updateDoc(doc(db, "rooms", roomId), { gameState: "ready" });
    log("Picks complete — battle can begin (gameState=ready)");
  }
}

// save local pick state to Firestore under this player's doc
async function saveLocalPickToRoom(item) {
  const playerPath = `players.${localPlayerId}`;
  const rDocRef = doc(db, "rooms", roomId);
  // Fetch current player doc
  const rd = await getDoc(rDocRef);
  if (!rd.exists()) return;
  const data = rd.data();
  const player = data.players && data.players[localPlayerId] ? data.players[localPlayerId] : { picks: 0, inventory: [] };
  // Update picks and inventory in room (not authoritative in this simple prototype)
  const newPicks = (player.picks || 0) + 1;
  const newInventory = (player.inventory || []).slice();
  // We will store minimal info: ids
  newInventory.length = Math.max(newInventory.length, INVENTORY_SIZE);
  for (let i=0;i<newInventory.length;i++){
    if (!newInventory[i]) newInventory[i] = null;
  }
  // Try to sync the local inventory to the first available slot, else replace unknown slot (simple approach)
  const firstNull = newInventory.findIndex(x=> !x);
  if (firstNull !== -1) newInventory[firstNull] = item.id;
  else {
    // if no empty, replace earliest (this is fallback; in UI we handled replace)
    newInventory[0] = item.id;
  }

  const upd = {};
  upd[`players.${localPlayerId}.picks`] = newPicks;
  upd[`players.${localPlayerId}.inventory`] = newInventory;
  try {
    await updateDoc(rDocRef, upd);
  } catch(e){
    console.warn("updateDoc error", e);
  }
}

// ChatGPT
window.createRoom = createRoom;
window.joinRoom = joinRoom;


// UI: wire up create/join
createBtn.onclick = createRoom;
joinBtn.onclick = joinRoom;

// initial inventory render
renderInventory();

// Generate initial pair (will be used when joined)
currentPair = { a: randFromPool(), b: randFromPool() };
renderPair();


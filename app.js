// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

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
const PICKS_LIMIT = 24;
const itemsPool = [
  { id: "cat", name: "แมว", img: "https://i.imgur.com/O1kX9Zk.png", power: 5 },
  { id: "rabbit", name: "กระต่าย", img: "https://i.imgur.com/Z6aW7oF.png", power: 4 },
  { id: "yarn", name: "ไหมพรม", img: "https://i.imgur.com/2kMZf6K.png", power: 3 },
  { id: "book", name: "หนังสือ", img: "https://i.imgur.com/0KXQ4Yh.png", power: 2 },
  { id: "rock", name: "ก้อนหิน", img: "https://i.imgur.com/m9h1k6Y.png", power: 6 },
  { id: "feather", name: "ขนนก", img: "https://i.imgur.com/9zJmD6W.png", power: 1 },
  { id: "umbrella", name: "ร่ม", img: "https://i.imgur.com/1uQe7fT.png", power: 3 },
  { id: "phone", name: "มือถือ", img: "https://i.imgur.com/1Vw6L2i.png", power: 4 },
  { id: "pizza", name: "พิซซ่า", img: "https://i.imgur.com/8bD0q5R.png", power: 2 },
  { id: "sword", name: "ดาบ", img: "https://i.imgur.com/3QpW2k1.png", power: 7 }
];

// UI Refs
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

// Battle phase elements
const battleInfoEl = document.createElement("div");
battleInfoEl.id = "battleInfo";
gameArea.appendChild(battleInfoEl);

let localPlayerId = null;
let roomId = null;
let roomRefUnsubscribe = null;

let localInventory = new Array(INVENTORY_SIZE).fill(null);
let picksCount = 0;
let isReplacing = false;
let currentPair = { a: null, b: null };

// Helpers
function randFromPool() {
  return itemsPool[Math.floor(Math.random() * itemsPool.length)];
}
function log(msg) { logEl.textContent = msg; }
function uidShort() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

// Render
function renderItemCard(el, item, onClick) {
  el.innerHTML = "";
  if (!item) { el.textContent = "(no item)"; return; }
  const img = document.createElement("img"); img.src = item.img;
  const name = document.createElement("div"); name.className = "name"; name.textContent = item.name;
  el.appendChild(img); el.appendChild(name);
  el.onclick = () => onClick && onClick(item);
}
function renderInventory() {
  inventoryEl.innerHTML = "";
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const s = document.createElement("div");
    s.className = "inventory-slot" + (localInventory[i] ? "" : " empty");
    s.dataset.slot = i;
    if (localInventory[i]) {
      const img = document.createElement("img"); img.src = localInventory[i].img;
      const nm = document.createElement("div"); nm.textContent = localInventory[i].name;
      s.appendChild(img); s.appendChild(nm);
    } else { s.textContent = "Empty"; }
    s.onclick = () => { if(isReplacing) replaceSlot(i); };
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
      player1: { id: localPlayerId, picks: 0, inventory: [] },
      player2: null
    },
    battle: []
  };
  await setDoc(doc(db, "rooms", roomId), roomDoc);
  statusEl.textContent = `Room created: ${roomId} (you are player1)`;
  afterJoinRoom();
}

async function joinRoom() {
  const code = roomInput.value.trim(); if(!code) { alert("ใส่ room code"); return; }
  roomId = code;
  const r = await getDoc(doc(db, "rooms", roomId));
  if (!r.exists()) { alert("Room not found"); return; }
  const data = r.data();
  if(!data.players.player2) {
    localPlayerId = "player2";
    await updateDoc(doc(db, "rooms", roomId), { "players.player2": { id: "player2", picks: 0, inventory: [] } });
    statusEl.textContent = `Joined room ${roomId} as player2`;
    afterJoinRoom();
  } else { alert("Room full"); }
}

function subscribeRoom() {
  if(!roomId) return;
  const rDoc = doc(db,"rooms",roomId);
  if(roomRefUnsubscribe) roomRefUnsubscribe();
  roomRefUnsubscribe = onSnapshot(rDoc, snap => {
    if(!snap.exists()) return;
    const data = snap.data();
    roomInfo.classList.remove("hidden");
    roomInfo.innerText = JSON.stringify({
      picksTotal: data.picksTotal,
      gameState: data.gameState
    }, null, 2);

    picksInfo.textContent = `Picks: ${picksCount} / ${PICKS_LIMIT}`;
    
    // Battle phase
    if(data.battle && data.battle.length>0){
      const lastBattle = data.battle[data.battle.length-1];
      battleInfoEl.innerText = `Opponent picked: ${lastBattle.opponentItem || '-'}\nResult: ${lastBattle.result || '-'}`;
    }
  });
}

// After join/create
function afterJoinRoom(){
  document.querySelector(".lobby").classList.add("hidden");
  gameArea.classList.remove("hidden");
  playerInfo.textContent = `You: ${localPlayerId}`;
  localInventory = new Array(INVENTORY_SIZE).fill(null);
  picksCount = 0; isReplacing = false;
  currentPair = {a: randFromPool(), b: randFromPool()};
  renderPair(); renderInventory(); subscribeRoom();
  log("Pick items to fill inventory. Then battle phase begins automatically.");
}

// Pick phase
async function pickItem(item){
  const emptyIndex = localInventory.findIndex(i=>!i);
  if(emptyIndex!==-1){ localInventory[emptyIndex]=item; picksCount++; renderInventory(); }
  else { isReplacing=true; replaceHint.classList.remove("hidden"); window.pendingReplaceItem=item; }
  picksInfo.textContent = `Picks: ${picksCount} / ${PICKS_LIMIT}`;

  await updateDoc(doc(db,"rooms",roomId), {
    picksTotal:(await getDoc(doc(db,"rooms",roomId))).data().picksTotal+1
  }).catch(()=>{});

  const roomSnap = await getDoc(doc(db,"rooms",roomId));
  if(roomSnap.exists() && roomSnap.data().picksTotal>=PICKS_LIMIT){
    await updateDoc(doc(db,"rooms",roomId),{gameState:"battle"});
    log("All picks done — start battle!");
    startBattle();
  }
}

async function replaceSlot(idx){
  const newItem = window.pendingReplaceItem;
  if(!newItem) return;
  const old = localInventory[idx];
  localInventory[idx]=newItem; isReplacing=false; replaceHint.classList.add("hidden"); window.pendingReplaceItem=null;
  picksCount++; renderInventory();
  log(`Replaced slot ${idx+1} (${old?.name || 'empty'}) with ${newItem.name}`);
}

// ========== Battle Phase ==========
async function startBattle(){
  while(localInventory.length>0){
    const opponentItem = prompt("Choose an item to battle with (name exactly):");
    if(!opponentItem) break;
    const myItem = localInventory.shift(); // use first item
    const battleData = await callLLM(myItem.name, opponentItem);
    await updateDoc(doc(db,"rooms",roomId), {
      battle: [...(await getDoc(doc(db,"rooms",roomId))).data().battle, {myItem: myItem.name, opponentItem, result: battleData.result, explanation: battleData.explanation}]
    });
    renderInventory();
    battleInfoEl.innerText = `You used ${myItem.name} vs ${opponentItem}\nResult: ${battleData.result}\n${battleData.explanation}`;
    if(localInventory.length===0) log("Battle over!");
  }
}

// ========== LLM call via Vercel API ==========
async function callLLM(prompt) {
  try {
    const res = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    return data; // คาดว่า data = { result: "...", explanation: "..." }
  } catch (err) {
    console.error("callLLM error:", err);
    return { result: "Error", explanation: "Could not get LLM result" };
  }
}

// ตัวอย่าง startBattle ใช้ฟังก์ชันใหม่
async function startBattle(playerItem, opponentItem) {
  log(`Battle: You used ${playerItem.name}, Opponent used ${opponentItem.name}`);
  
  const prompt = `You are a game referee. Player used ${playerItem.id}, opponent used ${opponentItem.id}. Decide winner, assign points 0-10, and explain result in 1-2 sentences.`;
  const llmResult = await callLLM(prompt);
  
  log(`Result: ${llmResult.result}\nExplanation: ${llmResult.explanation}`);

  // ลบไอเทมที่ใช้แล้ว
  localInventory = localInventory.filter(i => i && i.id !== playerItem.id);
  renderInventory();

  // TODO: update opponent inventory ผ่าน Firestore
}


// ========== Exports / UI ==========
window.createRoom = createRoom;
window.joinRoom = joinRoom;
createBtn.onclick=createRoom;
joinBtn.onclick=joinRoom;
renderInventory();
currentPair={a: randFromPool(), b: randFromPool()}; renderPair();


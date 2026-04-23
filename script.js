console.log("✅ script.js loaded");

// ── IMPORT FIREBASE FROM CONFIG FILE ──
import { auth, db, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, doc, getDoc, setDoc, getDocs, query, collection, where, serverTimestamp, addDoc, deleteDoc, updateDoc } from "./firebase-config.js";

console.log("✅ Firebase imports successful!");

// ── MOCK AUTH FOR TESTING (disable when Firebase is ready) ──
const MOCK_AUTH_ENABLED = true;
const MOCK_USERS = {
  "student1": { username: "student1", password: "123456", role: "student" },
  "student2": { username: "student2", password: "123456", role: "student" },
  "warden": { username: "warden", password: "123456", role: "warden" }
};
const MOCK_STUDENTS = {
  "student1": { username: "student1", name: "John Doe", roll: "101", room: "201", phone: "9876543210", email: "john@example.com", parentPhone: "9999999999", address: "123 Main St" },
  "student2": { username: "student2", name: "Jane Smith", roll: "102", room: "202", phone: "9876543211", email: "jane@example.com", parentPhone: "9999999998", address: "456 Oak Ave" }
};

const MOCK_LEAVES = [];
const MOCK_PAYMENTS = [];

// Helper function for mock getDoc
function mockGetDoc(path) {
  const parts = path.split('/');
  const collection = parts[0];
  const id = parts[1];
  
  if (collection === 'students' && MOCK_STUDENTS[id]) {
    return Promise.resolve({ exists: () => true, data: () => MOCK_STUDENTS[id] });
  }
  return Promise.resolve({ exists: () => false, data: () => null });
}

// ──────────────────────────────────────────────────────────────
//  GLOBALS
// ──────────────────────────────────────────────────────────────
let currentUser   = null;
let editStudentId = null;

// ──────────────────────────────────────────────────────────────
//  PAGE / MODAL UTILITIES
// ──────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

window.showLoginPage = () => {
  showPage("login-page");
  document.getElementById("login-username").value = "";
  document.getElementById("login-password").value = "";
};

window.showRegistrationPage = () => {
  showPage("registration-page");
  document.getElementById("reg-username").value = "";
  document.getElementById("reg-password").value = "";
  document.getElementById("reg-role").value = "student";
};

window.showModal = (id) => document.getElementById(id).classList.add("active");
window.hideModal = (id) => document.getElementById(id).classList.remove("active");

// ──────────────────────────────────────────────────────────────
//  TAB SWITCHING
// ──────────────────────────────────────────────────────────────
document.querySelectorAll(".dashboard-nav .nav-item[data-target]").forEach(btn => {
  btn.addEventListener("click", function () {
    const dash = this.closest(".page");
    dash.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
    this.classList.add("active");
    dash.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.getElementById(this.dataset.target).classList.add("active");
  });
});

// ──────────────────────────────────────────────────────────────
//  ROW / LIST ITEM SELECTION
// ──────────────────────────────────────────────────────────────
document.addEventListener("click", (e) => {
  const row = e.target.closest(".data-table .table-row");
  if (row) {
    row.closest(".data-table").querySelectorAll(".table-row")
       .forEach(r => r.classList.remove("selected"));
    row.classList.add("selected");
  }
  const item = e.target.closest(".list-box .list-item");
  if (item) {
    item.closest(".list-box").querySelectorAll(".list-item")
        .forEach(i => i.classList.remove("selected"));
    item.classList.add("selected");
  }
});

// ──────────────────────────────────────────────────────────────
//  AUTH STATE — auto restore session on page reload
// ──────────────────────────────────────────────────────────────
if (!MOCK_AUTH_ENABLED) {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) { showPage("login-page"); return; }

    const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
    if (!userSnap.exists()) { await signOut(auth); showPage("login-page"); return; }

    const userData = userSnap.data();
    currentUser = { uid: firebaseUser.uid, username: userData.username, role: userData.role };

    if (userData.role === "warden") {
      showWardenDashboard();
    } else {
      const profileSnap = await getDoc(doc(db, "students", firebaseUser.uid));
      if (profileSnap.exists()) {
        showStudentDashboard(profileSnap.data());
      } else {
        showPage("student-profile-setup-page");
      }
    }
  });
} else {
  // MOCK AUTH: Show login page by default
  showPage("login-page");
}

// ──────────────────────────────────────────────────────────────
//  LOGIN  (username → lookup email → signIn)
// ──────────────────────────────────────────────────────────────
window.loginUser = async function () {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!username || !password) { alert("Enter username and password."); return; }

  if (MOCK_AUTH_ENABLED) {
    // MOCK LOGIN
    const user = MOCK_USERS[username];
    if (!user || user.password !== password) {
      alert("Invalid credentials. Try: student1/123456 or warden/123456");
      return;
    }
    currentUser = { uid: username, username, role: user.role };
    if (user.role === "warden") {
      showWardenDashboard();
    } else {
      const profile = MOCK_STUDENTS[username] || {};
      showStudentDashboard(profile);
    }
    return;
  }

  // REAL FIREBASE LOGIN
  try {
    const q    = query(collection(db, "users"), where("username", "==", username));
    const snap = await getDocs(q);
    if (snap.empty) { alert("Username not found."); return; }

    const userData = snap.docs[0].data();
    await signInWithEmailAndPassword(auth, userData.email, password);
  } catch (err) {
    console.error(err);
    alert("Login failed: " + err.message);
  }
};

// ──────────────────────────────────────────────────────────────
//  REGISTER
// ──────────────────────────────────────────────────────────────
window.registerUser = async function () {
  const username = document.getElementById("reg-username").value.trim();
  const password = document.getElementById("reg-password").value.trim();
  const role     = document.getElementById("reg-role").value;

  if (!username || !password) { alert("All fields are required."); return; }
  if (password.length < 6)    { alert("Password must be at least 6 characters."); return; }

  if (MOCK_AUTH_ENABLED) {
    // MOCK REGISTRATION
    if (MOCK_USERS[username]) { alert("Username already taken."); return; }
    MOCK_USERS[username] = { username, password, role };
    currentUser = { uid: username, username, role };
    alert(`Registered as ${role}.`);
    if (role === "student") {
      showPage("student-profile-setup-page");
    } else {
      showWardenDashboard();
    }
    return;
  }

  // REAL FIREBASE REGISTRATION
  const email = `${username}@hostel.app`;
  try {
    const q    = query(collection(db, "users"), where("username", "==", username));
    const snap = await getDocs(q);
    if (!snap.empty) { alert("Username already taken."); return; }

    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid  = cred.user.uid;

    await setDoc(doc(db, "users", uid), { username, email, role });

    currentUser = { uid, username, role };
    alert(`Registered as ${role}.`);

    if (role === "student") {
      showPage("student-profile-setup-page");
    } else {
      showWardenDashboard();
    }
  } catch (err) {
    console.error(err);
    alert("Registration failed: " + err.message);
  }
};

// ──────────────────────────────────────────────────────────────
//  LOGOUT
// ──────────────────────────────────────────────────────────────
window.logoutUser = async function () {
  if (MOCK_AUTH_ENABLED) {
    currentUser = null;
    showPage("login-page");
  } else {
    await signOut(auth);
    currentUser = null;
    showPage("login-page");
  }
};

// ──────────────────────────────────────────────────────────────
//  DASHBOARDS
// ──────────────────────────────────────────────────────────────
function showWardenDashboard() {
  showPage("warden-dashboard");
  document.getElementById("warden-username").textContent = `(${currentUser.username})`;
  activateTab("warden-dashboard", "warden-students");
  loadStudents();
  loadWardenLeaves();
  loadWardenPayments();
}

function showStudentDashboard(profile) {
  showPage("student-dashboard");
  document.getElementById("student-username").textContent = `(${currentUser.username})`;
  activateTab("student-dashboard", "student-profile");

  document.getElementById("profile-username").textContent     = currentUser.username;
  document.getElementById("profile-name").textContent         = profile.name        || "";
  document.getElementById("profile-roll").textContent         = profile.roll        || "";
  document.getElementById("profile-room").textContent         = profile.room        || "";
  document.getElementById("profile-contact").textContent      = profile.phone       || "";
  document.getElementById("profile-email").textContent        = profile.email       || "";
  document.getElementById("profile-parent-phone").textContent = profile.parentPhone || "";
  document.getElementById("profile-address").textContent      = profile.address     || "";

  loadStudentLeaves();
  loadStudentPayments();
}

function activateTab(dashId, tabId) {
  document.querySelectorAll(`#${dashId} .nav-item`).forEach(i => i.classList.remove("active"));
  const btn = document.querySelector(`#${dashId} .nav-item[data-target="${tabId}"]`);
  if (btn) btn.classList.add("active");
  document.querySelectorAll(`#${dashId} .tab-content`).forEach(c => c.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
}

// ──────────────────────────────────────────────────────────────
//  STUDENT PROFILE SETUP
// ──────────────────────────────────────────────────────────────
window.saveProfile = async function () {
  const name        = document.getElementById("setup-name").value.trim();
  const roll        = document.getElementById("setup-roll").value.trim();
  const room        = document.getElementById("setup-room").value.trim();
  const email       = document.getElementById("setup-gmail").value.trim();
  const phone       = document.getElementById("setup-phone").value.trim();
  const parentPhone = document.getElementById("setup-parent-phone").value.trim();
  const address     = document.getElementById("setup-address").value.trim();

  if (!name || !roll || !room || !email || !phone || !parentPhone || !address) {
    alert("Please fill all fields."); return;
  }

  try {
    if (MOCK_AUTH_ENABLED) {
      // MOCK SAVE PROFILE
      MOCK_STUDENTS[currentUser.uid] = {
        username: currentUser.username,
        name, roll, room, email, phone, parentPhone, address
      };
      alert("Profile saved!");
      showStudentDashboard({ name, roll, room, email, phone, parentPhone, address });
    } else {
      // REAL FIREBASE
      await setDoc(doc(db, "students", currentUser.uid), {
        uid: currentUser.uid, username: currentUser.username,
        name, roll, room, email, phone, parentPhone, address,
        createdAt: serverTimestamp()
      });
      alert("Profile saved!");
      showStudentDashboard({ name, roll, room, email, phone, parentPhone, address });
    }
  } catch (err) {
    console.error(err);
    alert("Error saving profile: " + err.message);
  }
};

// ──────────────────────────────────────────────────────────────
//  STUDENTS CRUD (WARDEN)
// ──────────────────────────────────────────────────────────────
async function loadStudents() {
  const table = document.querySelector("#warden-students .data-table");
  table.querySelectorAll(".table-row").forEach(r => r.remove());

  if (MOCK_AUTH_ENABLED) {
    // MOCK LOAD STUDENTS
    const students = Object.entries(MOCK_STUDENTS).map(([id, s]) => ({ id, ...s }));
    if (students.length === 0) {
      table.insertAdjacentHTML("beforeend",
        `<div class="table-row" style="justify-content:center;color:#888">No students found.</div>`);
      return;
    }
    students.forEach(s => {
      const row = document.createElement("div");
      row.className  = "table-row";
      row.dataset.id = s.id;
      row.innerHTML  = `
        <span>${s.username    || ""}</span>
        <span>${s.name        || ""}</span>
        <span>${s.roll        || ""}</span>
        <span>${s.room        || ""}</span>
        <span>${s.phone       || s.contact || ""}</span>
        <span>${s.email       || ""}</span>
        <span>${s.parentPhone || ""}</span>
        <span>${s.address     || ""}</span>`;
      table.appendChild(row);
    });
  } else {
    // REAL FIREBASE
    const snap  = await getDocs(collection(db, "students"));
    if (snap.empty) {
      table.insertAdjacentHTML("beforeend",
        `<div class="table-row" style="justify-content:center;color:#888">No students found.</div>`);
      return;
    }
    snap.forEach(docSnap => {
      const s   = docSnap.data();
      const row = document.createElement("div");
      row.className  = "table-row";
      row.dataset.id = docSnap.id;
      row.innerHTML  = `
        <span>${s.username    || ""}</span>
        <span>${s.name        || ""}</span>
        <span>${s.roll        || ""}</span>
        <span>${s.room        || ""}</span>
        <span>${s.phone       || s.contact || ""}</span>
        <span>${s.email       || ""}</span>
        <span>${s.parentPhone || ""}</span>
        <span>${s.address     || ""}</span>`;
      table.appendChild(row);
    });
  }
}

window.showAddStudentModal = function () {
  editStudentId = null;
  document.getElementById("student-modal-title").textContent    = "Add New Student";
  document.getElementById("student-username-modal").disabled    = false;
  ["student-username-modal","student-name-modal","student-roll-modal",
   "student-room-modal","student-contact-modal","student-email-modal",
   "student-parent-phone-modal","student-address-modal"]
    .forEach(id => document.getElementById(id).value = "");
  window.showModal("student-modal");
};

window.showEditStudentModal = async function (source) {
  let uid, data;
  if (source === "student-profile") {
    uid = currentUser.uid;
  } else {
    const row = document.querySelector("#warden-students .table-row.selected");
    if (!row) { alert("Select a student first."); return; }
    uid = row.dataset.id;
  }

  if (MOCK_AUTH_ENABLED) {
    data = MOCK_STUDENTS[uid];
    if (!data) { alert("Student not found."); return; }
  } else {
    const snap = await getDoc(doc(db, "students", uid));
    if (!snap.exists()) { alert("Student not found."); return; }
    data = snap.data();
  }

  editStudentId = uid;
  document.getElementById("student-modal-title").textContent     = `Edit: ${data.username}`;
  document.getElementById("student-username-modal").value        = data.username    || "";
  document.getElementById("student-username-modal").disabled     = true;
  document.getElementById("student-name-modal").value            = data.name        || "";
  document.getElementById("student-roll-modal").value            = data.roll        || "";
  document.getElementById("student-room-modal").value            = data.room        || "";
  document.getElementById("student-contact-modal").value         = data.phone       || data.contact || "";
  document.getElementById("student-email-modal").value           = data.email       || "";
  document.getElementById("student-parent-phone-modal").value    = data.parentPhone || "";
  document.getElementById("student-address-modal").value         = data.address     || "";
  window.showModal("student-modal");
};

window.saveStudent = async function () {
  const username    = document.getElementById("student-username-modal").value.trim();
  const name        = document.getElementById("student-name-modal").value.trim();
  const roll        = document.getElementById("student-roll-modal").value.trim();
  const room        = document.getElementById("student-room-modal").value.trim();
  const phone       = document.getElementById("student-contact-modal").value.trim();
  const email       = document.getElementById("student-email-modal").value.trim();
  const parentPhone = document.getElementById("student-parent-phone-modal").value.trim();
  const address     = document.getElementById("student-address-modal").value.trim();

  if (!username || !name || !roll || !room || !phone || !email || !parentPhone || !address) {
    alert("All fields are required."); return;
  }

  try {
    if (MOCK_AUTH_ENABLED) {
      // MOCK UPDATE
      if (editStudentId) {
        MOCK_STUDENTS[editStudentId] = { username, name, roll, room, phone, email, parentPhone, address };
        alert("Student updated!");
        if (editStudentId === currentUser?.uid) {
          showStudentDashboard({ name, roll, room, phone, email, parentPhone, address });
        }
      } else {
        const newId = "new_" + Date.now();
        MOCK_STUDENTS[newId] = { username, name, roll, room, phone, email, parentPhone, address };
        alert("Student added!");
      }
      window.hideModal("student-modal");
      editStudentId = null;
      loadStudents();
    } else {
      // REAL FIREBASE
      if (editStudentId) {
        await updateDoc(doc(db, "students", editStudentId),
          { name, roll, room, phone, email, parentPhone, address });
        alert("Student updated!");
        if (editStudentId === currentUser?.uid) {
          showStudentDashboard({ name, roll, room, phone, email, parentPhone, address });
        }
      } else {
        const newRef = doc(collection(db, "students"));
        await setDoc(newRef, {
          uid: newRef.id, username, name, roll, room,
          phone, email, parentPhone, address,
          createdAt: serverTimestamp()
        });
        alert("Student added!");
      }
      window.hideModal("student-modal");
      editStudentId = null;
      loadStudents();
    }
  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
  }
};

window.simulateDeleteStudent = async function () {
  const row = document.querySelector("#warden-students .table-row.selected");
  if (!row) { alert("Select a student first."); return; }
  if (!confirm("Delete this student permanently?")) return;
  try {
    if (MOCK_AUTH_ENABLED) {
      delete MOCK_STUDENTS[row.dataset.id];
      alert("Student deleted.");
      row.remove();
    } else {
      await deleteDoc(doc(db, "students", row.dataset.id));
      alert("Student deleted.");
      row.remove();
    }
  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
  }
};

// ──────────────────────────────────────────────────────────────
//  LEAVES CRUD
// ──────────────────────────────────────────────────────────────
window.showApplyLeaveModal = function () {
  document.getElementById("leave-days").value   = "";
  document.getElementById("leave-reason").value = "";
  window.showModal("apply-leave-modal");
};

window.applyLeave = async function () {
  const days   = document.getElementById("leave-days").value.trim();
  const reason = document.getElementById("leave-reason").value.trim();
  if (!days || !reason) { alert("Fill all fields."); return; }

  try {
    if (MOCK_AUTH_ENABLED) {
      MOCK_LEAVES.push({
        studentUid: currentUser.uid,
        username:   currentUser.username,
        days:       Number(days),
        reason,
        status:     "pending",
        appliedAt:  new Date()
      });
      alert("Leave applied!");
    } else {
      await addDoc(collection(db, "leaves"), {
        studentUid: currentUser.uid,
        username:   currentUser.username,
        days:       Number(days),
        reason,
        status:     "pending",
        appliedAt:  serverTimestamp()
      });
      alert("Leave applied!");
    }
    window.hideModal("apply-leave-modal");
    loadStudentLeaves();
  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
  }
};

async function loadStudentLeaves() {
  const box  = document.querySelector("#student-leaves .list-box");
  box.innerHTML = "";

  if (MOCK_AUTH_ENABLED) {
    // MOCK LEAVES
    const leaves = MOCK_LEAVES.filter(l => l.studentUid === currentUser.uid);
    if (leaves.length === 0) { 
      box.innerHTML = `<div class="list-item">No leaves found.</div>`; 
      return; 
    }
    leaves.forEach(l => {
      const date = new Date().toLocaleDateString();
      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `<span>Days: <b>${l.days}</b> | Reason: ${l.reason} | 
        Status: <span class="status ${l.status}">${l.status}</span> | Applied: ${date}</span>`;
      box.appendChild(item);
    });
  } else {
    // REAL FIREBASE
    const q    = query(collection(db, "leaves"), where("studentUid", "==", currentUser.uid));
    const snap = await getDocs(q);
    if (snap.empty) { box.innerHTML = `<div class="list-item">No leaves found.</div>`; return; }
    snap.forEach(d => {
      const l    = d.data();
      const date = l.appliedAt?.toDate?.()?.toLocaleDateString() || "N/A";
      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `<span>Days: <b>${l.days}</b> | Reason: ${l.reason} | 
        Status: <span class="status ${l.status}">${l.status}</span> | Applied: ${date}</span>`;
      box.appendChild(item);
    });
  }
}

async function loadWardenLeaves() {
  const pendingBox = document.querySelector("#warden-leaves .list-box");
  const histTable  = document.querySelector("#warden-leaves .data-table");

  pendingBox.innerHTML = "";
  histTable.querySelectorAll(".table-row").forEach(r => r.remove());

  if (MOCK_AUTH_ENABLED) {
    // MOCK LEAVES
    MOCK_LEAVES.forEach((l, idx) => {
      const date = new Date().toLocaleDateString();

      if (l.status === "pending") {
        const item = document.createElement("div");
        item.className  = "list-item";
        item.dataset.id = idx;
        item.innerHTML  = `<span>Student: <b>${l.username}</b> | Days: ${l.days} | Reason: ${l.reason} | Applied: ${date}</span>`;
        pendingBox.appendChild(item);
      }

      const row = document.createElement("div");
      row.className  = "table-row";
      row.dataset.id = idx;
      row.innerHTML  = `
        <span>${String(idx).slice(0,6)}</span>
        <span>${l.username}</span>
        <span>${l.days}</span>
        <span>${l.reason}</span>
        <span class="status ${l.status}">${l.status}</span>
        <span>${date}</span>`;
      histTable.appendChild(row);
    });
  } else {
    // REAL FIREBASE
    const snap       = await getDocs(collection(db, "leaves"));
    snap.forEach(d => {
      const l    = d.data();
      const date = l.appliedAt?.toDate?.()?.toLocaleDateString() || "N/A";

      if (l.status === "pending") {
        const item = document.createElement("div");
        item.className  = "list-item";
        item.dataset.id = d.id;
        item.innerHTML  = `<span>Student: <b>${l.username}</b> | Days: ${l.days} | Reason: ${l.reason} | Applied: ${date}</span>`;
        pendingBox.appendChild(item);
      }

      const row = document.createElement("div");
      row.className  = "table-row";
      row.dataset.id = d.id;
      row.innerHTML  = `
        <span>${d.id.slice(0,6)}</span>
        <span>${l.username}</span>
        <span>${l.days}</span>
        <span>${l.reason}</span>
        <span class="status ${l.status}">${l.status}</span>
        <span>${date}</span>`;
      histTable.appendChild(row);
    });
  }
}

window.approveLeave = async function () {
  const item = document.querySelector("#warden-leaves .list-item.selected");
  if (!item) { alert("Select a pending leave."); return; }
  try {
    if (MOCK_AUTH_ENABLED) {
      const idx = Number(item.dataset.id);
      if (MOCK_LEAVES[idx]) MOCK_LEAVES[idx].status = "approved";
    } else {
      await updateDoc(doc(db, "leaves", item.dataset.id), { status: "approved" });
    }
    alert("Leave approved!");
    loadWardenLeaves();
  } catch (err) { alert(err.message); }
};

window.rejectLeave = async function () {
  const item = document.querySelector("#warden-leaves .list-item.selected");
  if (!item) { alert("Select a pending leave."); return; }
  try {
    if (MOCK_AUTH_ENABLED) {
      const idx = Number(item.dataset.id);
      if (MOCK_LEAVES[idx]) MOCK_LEAVES[idx].status = "rejected";
    } else {
      await updateDoc(doc(db, "leaves", item.dataset.id), { status: "rejected" });
    }
    alert("Leave rejected!");
    loadWardenLeaves();
  } catch (err) { alert(err.message); }
};

// ──────────────────────────────────────────────────────────────
//  PAYMENTS CRUD
// ──────────────────────────────────────────────────────────────
window.showAddPaymentModal = function () {
  document.getElementById("payment-student-username").value = "";
  document.getElementById("payment-amount").value           = "";
  document.getElementById("payment-note").value             = "";
  window.showModal("add-payment-modal");
};

window.addPayment = async function () {
  const username = document.getElementById("payment-student-username").value.trim();
  const amount   = parseFloat(document.getElementById("payment-amount").value);
  const note     = document.getElementById("payment-note").value.trim();

  if (!username || isNaN(amount)) { alert("Username and valid amount required."); return; }

  try {
    if (MOCK_AUTH_ENABLED) {
      // Check if student exists in mock data
      if (!MOCK_STUDENTS[username] && !Object.values(MOCK_STUDENTS).find(s => s.username === username)) {
        alert("Student username not found."); return;
      }
      const student = Object.values(MOCK_STUDENTS).find(s => s.username === username) || MOCK_STUDENTS[username];
      MOCK_PAYMENTS.push({
        studentUid: username,
        username: student.username || username,
        amount,
        note,
        paidAt: new Date()
      });
      alert(`Payment of Rs.${amount} recorded for ${username}`);
    } else {
      const q    = query(collection(db, "users"), where("username", "==", username));
      const snap = await getDocs(q);
      if (snap.empty) { alert("Student username not found."); return; }
      const studentUid = snap.docs[0].id;
      await addDoc(collection(db, "payments"), {
        studentUid, username, amount, note,
        paidAt: serverTimestamp()
      });
      alert(`Payment of Rs.${amount} recorded for ${username}`);
    }
    window.hideModal("add-payment-modal");
    loadWardenPayments();
  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
  }
};

async function loadWardenPayments() {
  const body = document.querySelector("#warden-mess .data-table");
  body.querySelectorAll(".table-row").forEach(r => r.remove());

  if (MOCK_AUTH_ENABLED) {
    // MOCK PAYMENTS
    if (MOCK_PAYMENTS.length === 0) {
      body.insertAdjacentHTML("beforeend",
        `<div class="table-row" style="justify-content:center;color:#888">No payments yet.</div>`);
      return;
    }
    MOCK_PAYMENTS.forEach((p, idx) => {
      const date = new Date().toLocaleString();
      const row  = document.createElement("div");
      row.className = "table-row";
      row.innerHTML = `
        <span>${String(idx).slice(0,6)}</span>
        <span>${p.username}</span>
        <span>Rs.${p.amount.toFixed(2)}</span>
        <span>${p.note || ""}</span>
        <span>${date}</span>`;
      body.appendChild(row);
    });
  } else {
    // REAL FIREBASE
    const snap = await getDocs(collection(db, "payments"));
    if (snap.empty) {
      body.insertAdjacentHTML("beforeend",
        `<div class="table-row" style="justify-content:center;color:#888">No payments yet.</div>`);
      return;
    }
    snap.forEach(d => {
      const p    = d.data();
      const date = p.paidAt?.toDate?.()?.toLocaleString() || "N/A";
      const row  = document.createElement("div");
      row.className = "table-row";
      row.innerHTML = `
        <span>${d.id.slice(0,6)}</span>
        <span>${p.username}</span>
        <span>Rs.${p.amount.toFixed(2)}</span>
        <span>${p.note || ""}</span>
        <span>${date}</span>`;
      body.appendChild(row);
    });
  }
}

async function loadStudentPayments() {
  const body = document.querySelector("#student-mess .data-table");
  body.querySelectorAll(".table-row").forEach(r => r.remove());

  if (MOCK_AUTH_ENABLED) {
    // MOCK PAYMENTS
    const payments = MOCK_PAYMENTS.filter(p => p.studentUid === currentUser.uid || p.username === currentUser.username);
    if (payments.length === 0) {
      body.insertAdjacentHTML("beforeend",
        `<div class="table-row" style="justify-content:center;color:#888">No payment records.</div>`);
      return;
    }
    payments.forEach((p, idx) => {
      const date = new Date().toLocaleString();
      const row  = document.createElement("div");
      row.className = "table-row";
      row.innerHTML = `
        <span>${String(idx).slice(0,6)}</span>
        <span>Rs.${p.amount.toFixed(2)}</span>
        <span>${p.note || ""}</span>
        <span>${date}</span>`;
      body.appendChild(row);
    });
  } else {
    // REAL FIREBASE
    const q    = query(collection(db, "payments"), where("studentUid", "==", currentUser.uid));
    const snap = await getDocs(q);
    if (snap.empty) {
      body.insertAdjacentHTML("beforeend",
        `<div class="table-row" style="justify-content:center;color:#888">No payment records.</div>`);
      return;
    }
    snap.forEach(d => {
      const p    = d.data();
      const date = p.paidAt?.toDate?.()?.toLocaleString() || "N/A";
      const row  = document.createElement("div");
      row.className = "table-row";
      row.innerHTML = `
        <span>${d.id.slice(0,6)}</span>
        <span>Rs.${p.amount.toFixed(2)}</span>
        <span>${p.note || ""}</span>
        <span>${date}</span>`;
      body.appendChild(row);
    });
  }
}
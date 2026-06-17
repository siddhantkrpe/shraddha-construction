import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getDatabase,
  ref,
  get,
  set
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBE4x8ZFB1kye0ML1sGHE_efFPXf2Kc-go",
  authDomain: "shraddha-construction.firebaseapp.com",
  databaseURL: "https://shraddha-construction-default-rtdb.firebaseio.com",
  projectId: "shraddha-construction",
  storageBucket: "shraddha-construction.firebasestorage.app",
  messagingSenderId: "42332440501",
  appId: "1:42332440501:web:bf3f260bdad57df5a27bfc",
  measurementId: "G-1ZMN6JXD1T"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

window.storage = {
  async get(key) {
    const snapshot = await get(ref(db, key));

    if (snapshot.exists()) {
      return {
        value: JSON.stringify(snapshot.val())
      };
    }

    return null;
  },

  async set(key, value) {
    await set(ref(db, key), JSON.parse(value));
  }
};

console.log("Firebase Connected");
// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAF2j4VnXOx71CEBxQ2Ao6kCJxGE4-oPIs",
    authDomain: "watchnchat-0818.firebaseapp.com",
    projectId: "watchnchat-0818",
    storageBucket: "watchnchat-0818.appspot.com",
    messagingSenderId: "152150590785",
    appId: "1:152150590785:web:1b6e7857bb39253cfc8dc0"
};

// ✅ First, initialize Firebase
const app = initializeApp(firebaseConfig);

// ✅ Then, initialize services
const auth = getAuth(app);
const db = getFirestore(app);
const database = getDatabase(app);

// ✅ YouTube API Key
const YOUTUBE_API_KEY = "AIzaSyA-UcdokWEAh0MNU63cda2QQ4sAdNEszwQ";

// ✅ Export Firebase modules for use in other files
export { auth, db, database, YOUTUBE_API_KEY};



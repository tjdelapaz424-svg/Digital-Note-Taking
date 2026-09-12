const firebaseConfig = {
  apiKey: "AIzaSyDbRELdDR5e_-I7X9Tp8ekQEjCzGuAyU0",
  authDomain: "notesonline-c3f32.firebaseapp.com",
  projectId: "notesonline-c3f32",
  storageBucket: "notesonline-c3f32.firebasestorage.app",
  messagingSenderId: "1083062612326",
  appId: "1:1083062612326:web:d1ef37eab0bd42307358a7"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Keep recent work available when a device temporarily loses its connection.
// Firestore falls back safely when a browser blocks IndexedDB (for example, private mode).
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  console.warn('Offline cache unavailable:', err.code);
});

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDbREL6DR5e_-_I7X9Tp8ekQEjCzGuAyU0",
  authDomain: "notesonline-c3f32.firebaseapp.com",
  databaseURL: "https://notesonline-c3f32-default-rtdb.firebaseio.com",
  projectId: "notesonline-c3f32",
  storageBucket: "notesonline-c3f32.firebasestorage.app",
  messagingSenderId: "1083062612326",
  appId: "1:1083062612326:web:d1ef37eab0bd42307358a7",
  measurementId: "G-PJ6T1KXSEN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
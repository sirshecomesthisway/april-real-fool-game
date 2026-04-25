// REPLACE WITH YOUR FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyDHE90ifW6PRY8ct9yv601uKMZimOPabjs",
  authDomain: "april-real-fool-game.firebaseapp.com",
  databaseURL: "https://april-real-fool-game-default-rtdb.firebaseio.com",
  projectId: "april-real-fool-game",
  storageBucket: "april-real-fool-game.firebasestorage.app",
  messagingSenderId: "1051881191185",
  appId: "1:1051881191185:web:45de637d3b7072c6cc3eb0",
  measurementId: "G-423197K8DD"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

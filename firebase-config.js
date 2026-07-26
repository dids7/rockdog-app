// firebase-config.js
// Inicialização do Firebase para o Rock Dog
// Usa o SDK modular do Firebase direto via CDN (não precisa de npm install)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  increment,
  getDocs,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBX2VZ78rX7UXBU3tqI752y7eN_LehweH4",
  authDomain: "rock-dog-30041.firebaseapp.com",
  projectId: "rock-dog-30041",
  storageBucket: "rock-dog-30041.firebasestorage.app",
  messagingSenderId: "132105198963",
  appId: "1:132105198963:web:b11e7aef36a682f72e3906"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// ID fixo do negócio por enquanto.
// No futuro, se o app virar multi-cliente, isso passa a vir do login do usuário
// em vez de ser um valor fixo — mas toda a estrutura de dados já usa esse campo
// desde o início, então a migração não vai exigir redesenhar o banco.
export const NEGOCIO_ID = "rockdog";

export { onAuthStateChanged, signInWithEmailAndPassword, signOut };
export {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  increment,
  getDocs,
  writeBatch
};

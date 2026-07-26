// app.js
// Lógica de autenticação e alternância entre tela de login e o app.
// Os módulos (estoque, pedidos, clientes, relatórios) serão adicionados aqui
// nos próximos passos, um de cada vez.

import {
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  NEGOCIO_ID
} from "./firebase-config.js";

const loadingScreen = document.getElementById("loading-screen");
const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const loginForm = document.getElementById("login-form");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const userEmailDisplay = document.getElementById("user-email-display");

// Registra o service worker (permite instalar o app / funcionar offline)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((err) => {
      console.warn("Falha ao registrar service worker:", err);
    });
  });
}

function showLoading() {
  loadingScreen.style.display = "flex";
  loginScreen.style.display = "none";
  appShell.classList.remove("visible");
}

function showLogin() {
  loadingScreen.style.display = "none";
  loginScreen.style.display = "flex";
  appShell.classList.remove("visible");
}

function showApp(user) {
  loadingScreen.style.display = "none";
  loginScreen.style.display = "none";
  appShell.classList.add("visible");
  userEmailDisplay.textContent = `${user.email} · negócio: ${NEGOCIO_ID}`;
}

// Observa o estado de login. Isso roda automaticamente sempre que
// o usuário loga, desloga, ou recarrega a página.
onAuthStateChanged(auth, (user) => {
  if (user) {
    showApp(user);
  } else {
    showLogin();
  }
});

// Envio do formulário de login
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  loginBtn.disabled = true;
  loginBtn.textContent = "Entrando...";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged cuida de mostrar o app
  } catch (err) {
    loginError.textContent = mensagemDeErro(err.code);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Entrar";
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

function mensagemDeErro(code) {
  switch (code) {
    case "auth/invalid-email":
      return "E-mail inválido.";
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return "E-mail ou senha incorretos.";
    case "auth/wrong-password":
      return "E-mail ou senha incorretos.";
    case "auth/too-many-requests":
      return "Muitas tentativas. Tente novamente em instantes.";
    default:
      return "Não foi possível entrar. Tente novamente.";
  }
}

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
import { initEstoqueModule, stopEstoqueModule } from "./estoque.js";
import { initCardapioModule, stopCardapioModule } from "./cardapio.js";
import { initPedidosModule, stopPedidosModule } from "./pedidos.js";
import { initClientesModule, stopClientesModule } from "./clientes.js";
import { initRelatoriosModule, stopRelatoriosModule } from "./relatorios.js";
import { initPerfilModule, stopPerfilModule } from "./perfil.js";
import { initConfiguracoesModule, stopConfiguracoesModule } from "./configuracoes.js";

const loadingScreen = document.getElementById("loading-screen");
const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const loginForm = document.getElementById("login-form");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const logoutBtnDesktop = document.getElementById("logout-btn-desktop");
const userEmailDisplay = document.getElementById("user-email-display");
const pageTitle = document.querySelector(".page-title");
const toast = document.getElementById("toast");

let toastTimeout;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 2200);
}

const AVAILABLE_VIEWS = ["painel", "estoque", "cardapio", "pedidos", "clientes", "relatorios", "perfil"];

const NAV_LABELS = {
  painel: "Painel",
  estoque: "Estoque",
  cardapio: "Cardápio",
  pedidos: "Pedidos",
  clientes: "Clientes",
  relatorios: "Relatórios",
  perfil: "Perfil"
};

function switchView(target) {
  document.querySelectorAll(".view").forEach((el) => {
    el.classList.toggle("active", el.id === `view-${target}`);
  });
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.nav === target);
  });
  if (pageTitle) pageTitle.textContent = NAV_LABELS[target] || "Painel";
  window.scrollTo(0, 0);
}

// Navegação (sidebar + bottom nav + cards do painel). Painel e Estoque têm
// conteúdo real; os outros módulos avisam que ainda estão em construção.
document.querySelectorAll(".nav-item, .module-card").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.nav;

    if (AVAILABLE_VIEWS.includes(target)) {
      switchView(target);
    } else {
      showToast(`${NAV_LABELS[target]} chega em breve`);
    }
  });
});

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

let estoqueIniciado = false;

function showApp(user) {
  loadingScreen.style.display = "none";
  loginScreen.style.display = "none";
  appShell.classList.add("visible");
  userEmailDisplay.textContent = `${user.email} · negócio: ${NEGOCIO_ID}`;

  if (!estoqueIniciado) {
    estoqueIniciado = true;
    initConfiguracoesModule();
    initEstoqueModule();
    initCardapioModule();
    initPedidosModule();
    initClientesModule();
    initRelatoriosModule();
    initPerfilModule();
  }
}

// Observa o estado de login. Isso roda automaticamente sempre que
// o usuário loga, desloga, ou recarrega a página.
onAuthStateChanged(auth, (user) => {
  if (user) {
    showApp(user);
  } else {
    if (estoqueIniciado) {
      stopEstoqueModule();
      stopCardapioModule();
      stopPedidosModule();
      stopClientesModule();
      stopRelatoriosModule();
      stopPerfilModule();
      stopConfiguracoesModule();
      estoqueIniciado = false;
    }
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
logoutBtnDesktop.addEventListener("click", async () => {
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

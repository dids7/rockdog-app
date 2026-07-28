// clientes.js
// Módulo de Clientes: cadastro simples (nome + telefone) e contador de quantos
// pedidos cada um já fez (usado pelo módulo de Pedidos e, no futuro, Relatórios).

import {
  db,
  NEGOCIO_ID,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from "./firebase-config.js";
import { confirmDialog, alertDialog } from "./ui-dialog.js";

let unsubscribe = null;
let clientesCache = [];
let editingId = null;

const listContainer = document.getElementById("clientes-lista");
const btnNovo = document.getElementById("btn-novo-cliente");
const modal = document.getElementById("modal-cliente");
const modalTitle = document.getElementById("modal-cliente-titulo");
const form = document.getElementById("form-cliente");
const btnCancelar = document.getElementById("btn-cancelar-cliente");
const btnFecharModal = document.getElementById("btn-fechar-modal-cliente");

function clientesCollection() {
  return collection(db, "clientes");
}

function renderLista() {
  if (clientesCache.length === 0) {
    listContainer.innerHTML = `<p class="empty-state">Nenhum cliente cadastrado ainda.</p>`;
    return;
  }

  const ordenados = clientesCache.slice().sort((a, b) => a.nome.localeCompare(b.nome));

  listContainer.innerHTML = `
    <div class="ingrediente-lista">
      ${ordenados.map((cliente) => renderLinha(cliente)).join("")}
    </div>
  `;

  attachRowEvents();
}

function renderLinha(cliente) {
  const pedidos = cliente.contadorPedidos || 0;
  const endereco = cliente.endereco ? ` · ${cliente.endereco}` : "";
  return `
    <div class="ingrediente-linha" data-id="${cliente.id}">
      <div class="ingrediente-info">
        <p class="ingrediente-nome">${cliente.nome}</p>
        <p class="ingrediente-qtd">${cliente.telefone || "sem telefone"}${endereco} <span class="status-badge status-ok">${pedidos} pedido${pedidos === 1 ? "" : "s"}</span></p>
        ${cliente.observacoes ? `<p class="receita-resumo">${cliente.observacoes}</p>` : ""}
      </div>
      <div class="ingrediente-acoes">
        <button class="btn-icon" data-action="editar" title="Editar">✎</button>
        <button class="btn-icon btn-icon-danger" data-action="excluir" title="Excluir">🗑</button>
      </div>
    </div>
  `;
}

function attachRowEvents() {
  listContainer.querySelectorAll(".ingrediente-linha").forEach((row) => {
    const id = row.dataset.id;
    const cliente = clientesCache.find((c) => c.id === id);
    if (!cliente) return;

    row.querySelector('[data-action="editar"]').addEventListener("click", () => abrirModalEdicao(cliente));
    row.querySelector('[data-action="excluir"]').addEventListener("click", () => excluirCliente(cliente));
  });
}

async function excluirCliente(cliente) {
  const confirmado = await confirmDialog(
    `Excluir "${cliente.nome}" do cadastro de clientes? Essa ação não pode ser desfeita.`,
    { title: "Excluir cliente", confirmLabel: "Excluir", danger: true }
  );
  if (!confirmado) return;
  await deleteDoc(doc(db, "clientes", cliente.id));
}

function abrirModalNovo() {
  editingId = null;
  modalTitle.textContent = "Novo cliente";
  form.reset();
  modal.classList.add("visible");
}

function abrirModalEdicao(cliente) {
  editingId = cliente.id;
  modalTitle.textContent = "Editar cliente";
  document.getElementById("cliente-nome").value = cliente.nome;
  document.getElementById("cliente-telefone").value = cliente.telefone || "";
  document.getElementById("cliente-endereco").value = cliente.endereco || "";
  document.getElementById("cliente-observacoes").value = cliente.observacoes || "";
  modal.classList.add("visible");
}

function fecharModal() {
  modal.classList.remove("visible");
  editingId = null;
}

async function salvarCliente(event) {
  event.preventDefault();

  const nome = document.getElementById("cliente-nome").value.trim();
  const telefone = document.getElementById("cliente-telefone").value.trim();
  const endereco = document.getElementById("cliente-endereco").value.trim();
  const observacoes = document.getElementById("cliente-observacoes").value.trim();

  if (!nome) {
    await alertDialog("Digite o nome do cliente.");
    return;
  }

  if (editingId) {
    await updateDoc(doc(db, "clientes", editingId), {
      nome,
      telefone,
      endereco,
      observacoes,
      atualizadoEm: serverTimestamp()
    });
  } else {
    await addDoc(clientesCollection(), {
      nome,
      telefone,
      endereco,
      observacoes,
      contadorPedidos: 0,
      ultimoPedidoEm: null,
      negocioId: NEGOCIO_ID,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });
  }

  fecharModal();
}

export function initClientesModule() {
  const q = query(clientesCollection(), where("negocioId", "==", NEGOCIO_ID));
  unsubscribe = onSnapshot(q, (snapshot) => {
    clientesCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderLista();
  });

  btnNovo.addEventListener("click", abrirModalNovo);
  btnCancelar.addEventListener("click", fecharModal);
  btnFecharModal.addEventListener("click", fecharModal);
  form.addEventListener("submit", salvarCliente);
}

export function stopClientesModule() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  clientesCache = [];
}

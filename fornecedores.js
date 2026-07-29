// fornecedores.js
// Módulo de Fornecedores: cadastro de contatos organizados por categoria,
// com o que cada um fornece (texto livre).

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

const CATEGORIAS = ["Pães", "Carnes", "Guarnições", "Molhos", "Bebidas", "Embalagens", "Outros"];
const ORDEM_CATEGORIAS = ["Pães", "Carnes", "Guarnições", "Molhos", "Bebidas", "Embalagens"];

let unsubscribe = null;
let fornecedoresCache = [];
let editingId = null;

const listContainer = document.getElementById("fornecedores-lista");
const btnNovo = document.getElementById("btn-novo-fornecedor");
const modal = document.getElementById("modal-fornecedor");
const modalTitle = document.getElementById("modal-fornecedor-titulo");
const form = document.getElementById("form-fornecedor");
const selectCategoria = document.getElementById("fornecedor-categoria");
const btnCancelar = document.getElementById("btn-cancelar-fornecedor");
const btnFecharModal = document.getElementById("btn-fechar-modal-fornecedor");

function populateSelect(select, options) {
  select.innerHTML = "";
  options.forEach((opt) => {
    const el = document.createElement("option");
    el.value = opt;
    el.textContent = opt;
    select.appendChild(el);
  });
}

function fornecedoresCollection() {
  return collection(db, "fornecedores");
}

function renderLista() {
  const porCategoria = {};
  fornecedoresCache.forEach((f) => {
    const cat = f.categoria || "Outros";
    if (!porCategoria[cat]) porCategoria[cat] = [];
    porCategoria[cat].push(f);
  });

  const categoriasComItens = Object.keys(porCategoria).sort((a, b) => {
    const posA = ORDEM_CATEGORIAS.indexOf(a);
    const posB = ORDEM_CATEGORIAS.indexOf(b);
    if (posA === -1 && posB === -1) return a.localeCompare(b);
    if (posA === -1) return 1;
    if (posB === -1) return -1;
    return posA - posB;
  });

  if (categoriasComItens.length === 0) {
    listContainer.innerHTML = `<p class="empty-state">Nenhum fornecedor cadastrado ainda.</p>`;
  } else {
    listContainer.innerHTML = categoriasComItens
      .map((cat) => {
        const itens = porCategoria[cat].sort((a, b) => a.nome.localeCompare(b.nome));
        const linhas = itens.map((f) => renderLinha(f)).join("");
        return `
          <div class="categoria-bloco">
            <h4 class="categoria-titulo">${cat}</h4>
            <div class="ingrediente-lista">${linhas}</div>
          </div>
        `;
      })
      .join("");
  }

  attachRowEvents();
}

function renderLinha(fornecedor) {
  return `
    <div class="ingrediente-linha" data-id="${fornecedor.id}">
      <div class="ingrediente-info">
        <p class="ingrediente-nome">${fornecedor.nome}</p>
        <p class="ingrediente-qtd">${fornecedor.telefone || "sem telefone"}</p>
        ${fornecedor.fornece ? `<p class="receita-resumo">${fornecedor.fornece}</p>` : ""}
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
    const fornecedor = fornecedoresCache.find((f) => f.id === id);
    if (!fornecedor) return;

    row.querySelector('[data-action="editar"]').addEventListener("click", () => abrirModalEdicao(fornecedor));
    row.querySelector('[data-action="excluir"]').addEventListener("click", () => excluirFornecedor(fornecedor));
  });
}

async function excluirFornecedor(fornecedor) {
  const confirmado = await confirmDialog(
    `Excluir "${fornecedor.nome}" do cadastro de fornecedores? Essa ação não pode ser desfeita.`,
    { title: "Excluir fornecedor", confirmLabel: "Excluir", danger: true }
  );
  if (!confirmado) return;
  await deleteDoc(doc(db, "fornecedores", fornecedor.id));
}

function abrirModalNovo() {
  editingId = null;
  modalTitle.textContent = "Novo fornecedor";
  form.reset();
  modal.classList.add("visible");
}

function abrirModalEdicao(fornecedor) {
  editingId = fornecedor.id;
  modalTitle.textContent = "Editar fornecedor";
  document.getElementById("fornecedor-nome").value = fornecedor.nome;
  selectCategoria.value = fornecedor.categoria || "Outros";
  document.getElementById("fornecedor-telefone").value = fornecedor.telefone || "";
  document.getElementById("fornecedor-fornece").value = fornecedor.fornece || "";
  modal.classList.add("visible");
}

function fecharModal() {
  modal.classList.remove("visible");
  editingId = null;
}

async function salvarFornecedor(event) {
  event.preventDefault();

  const nome = document.getElementById("fornecedor-nome").value.trim();
  const categoria = selectCategoria.value;
  const telefone = document.getElementById("fornecedor-telefone").value.trim();
  const fornece = document.getElementById("fornecedor-fornece").value.trim();

  if (!nome) {
    await alertDialog("Digite o nome do fornecedor.");
    return;
  }

  const dados = { nome, categoria, telefone, fornece };

  if (editingId) {
    await updateDoc(doc(db, "fornecedores", editingId), {
      ...dados,
      atualizadoEm: serverTimestamp()
    });
  } else {
    await addDoc(fornecedoresCollection(), {
      ...dados,
      negocioId: NEGOCIO_ID,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });
  }

  fecharModal();
}

export function initFornecedoresModule() {
  populateSelect(selectCategoria, CATEGORIAS);

  const q = query(fornecedoresCollection(), where("negocioId", "==", NEGOCIO_ID));
  unsubscribe = onSnapshot(q, (snapshot) => {
    fornecedoresCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderLista();
  });

  btnNovo.addEventListener("click", abrirModalNovo);
  btnCancelar.addEventListener("click", fecharModal);
  btnFecharModal.addEventListener("click", fecharModal);
  form.addEventListener("submit", salvarFornecedor);
}

export function stopFornecedoresModule() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  fornecedoresCache = [];
}

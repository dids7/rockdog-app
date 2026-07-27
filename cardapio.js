// cardapio.js
// Módulo de Cardápio: itens vendidos (lanches, adicionais, bebidas), preço
// e a receita (quais ingredientes do estoque cada item usa e quanto).
// Isso é a base pro módulo de Pedidos descontar o estoque automaticamente.

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
  serverTimestamp,
  getDocs,
  writeBatch
} from "./firebase-config.js";
import { confirmDialog, alertDialog } from "./ui-dialog.js";

const TIPOS_ITEM = ["Lanche", "Adicional", "Bebida"];
const ORDEM_TIPOS = ["Lanche", "Adicional", "Bebida"];

// Cardápio inicial do Rock Dog. As quantidades da receita são estimativas
// (a foto do cardápio não especifica "quanto" de cada ingrediente) —
// ajuste pela tela depois que conferir com a cozinha.
const SEED_CARDAPIO = [
  {
    nome: "Classic Rock",
    tipo: "Lanche",
    preco: 20,
    receita: [
      { ingrediente: "Pão de hot dog", quantidade: 1 },
      { ingrediente: "Maionese", quantidade: 0.02 },
      { ingrediente: "Salsicha", quantidade: 1 },
      { ingrediente: "Ketchup", quantidade: 0.02 },
      { ingrediente: "Mostarda", quantidade: 0.015 },
      { ingrediente: "Purê de batata", quantidade: 0.05 },
      { ingrediente: "Batata palha", quantidade: 0.02 }
    ]
  },
  {
    nome: "Rock Dog",
    tipo: "Lanche",
    preco: 25,
    receita: [
      { ingrediente: "Pão de hot dog", quantidade: 1 },
      { ingrediente: "Maionese", quantidade: 0.02 },
      { ingrediente: "Salsicha", quantidade: 1 },
      { ingrediente: "Ketchup", quantidade: 0.02 },
      { ingrediente: "Mostarda", quantidade: 0.015 },
      { ingrediente: "Vinagrete", quantidade: 0.03 },
      { ingrediente: "Milho", quantidade: 0.02 },
      { ingrediente: "Ervilha", quantidade: 0.02 },
      { ingrediente: "Purê de batata", quantidade: 0.05 },
      { ingrediente: "Batata palha", quantidade: 0.02 }
    ]
  },
  {
    nome: "Hard Rock",
    tipo: "Lanche",
    preco: 32,
    receita: [
      { ingrediente: "Pão de hot dog", quantidade: 1 },
      { ingrediente: "Maionese", quantidade: 0.02 },
      { ingrediente: "Salsicha", quantidade: 1 },
      { ingrediente: "Mostarda", quantidade: 0.015 },
      { ingrediente: "Carne moída (apimentada)", quantidade: 0.1 },
      { ingrediente: "Cheddar", quantidade: 0.03 },
      { ingrediente: "Purê de batata", quantidade: 0.05 },
      { ingrediente: "Bacon", quantidade: 0.02 },
      { ingrediente: "Batata palha", quantidade: 0.02 }
    ]
  },
  {
    nome: "J-Rock",
    tipo: "Lanche",
    preco: 32,
    receita: [
      { ingrediente: "Baguete", quantidade: 1 },
      { ingrediente: "Maionese", quantidade: 0.02 },
      { ingrediente: "Alface", quantidade: 0.02 },
      { ingrediente: "Pepino", quantidade: 0.02 },
      { ingrediente: "Vinagrete", quantidade: 0.02 },
      { ingrediente: "Frango", quantidade: 0.1 },
      { ingrediente: "Mostarda", quantidade: 0.015 },
      { ingrediente: "Molho tarê", quantidade: 0.02 },
      { ingrediente: "Batata palha", quantidade: 0.02 }
    ]
  },
  {
    nome: "Salsicha (adicional)",
    tipo: "Adicional",
    preco: 2,
    receita: [{ ingrediente: "Salsicha", quantidade: 1 }]
  },
  {
    nome: "Cheddar (adicional)",
    tipo: "Adicional",
    preco: 3,
    receita: [{ ingrediente: "Cheddar", quantidade: 0.03 }]
  },
  {
    nome: "Farofa de bacon (adicional)",
    tipo: "Adicional",
    preco: 4,
    receita: [{ ingrediente: "Farofa de bacon", quantidade: 0.03 }]
  },
  {
    nome: "Coca-Cola lata 350ml",
    tipo: "Bebida",
    preco: 7,
    receita: [{ ingrediente: "Coca-Cola lata 350ml", quantidade: 1 }]
  },
  {
    nome: "Coca-Cola Zero lata 350ml",
    tipo: "Bebida",
    preco: 7,
    receita: [{ ingrediente: "Coca-Cola Zero lata 350ml", quantidade: 1 }]
  },
  {
    nome: "Coquinha Zero 200ml",
    tipo: "Bebida",
    preco: 4,
    receita: [{ ingrediente: "Coquinha Zero 200ml", quantidade: 1 }]
  }
];

let unsubCardapio = null;
let unsubIngredientes = null;
let ingredientesCache = [];
let cardapioCache = [];
let editingId = null;
let ingredientesReady = false;
let resolveIngredientesReady;
const ingredientesReadyPromise = new Promise((resolve) => {
  resolveIngredientesReady = resolve;
});

// Elementos da tela
const listContainer = document.getElementById("cardapio-lista");
const btnNovo = document.getElementById("btn-novo-item");
const modal = document.getElementById("modal-item-cardapio");
const modalTitle = document.getElementById("modal-item-titulo");
const form = document.getElementById("form-item-cardapio");
const selectTipo = document.getElementById("item-tipo");
const btnCancelar = document.getElementById("btn-cancelar-item");
const btnFecharModal = document.getElementById("btn-fechar-modal-item");
const receitaLinhasContainer = document.getElementById("receita-linhas");
const btnAddReceitaLinha = document.getElementById("btn-add-receita-linha");

function populateSelect(select, options) {
  select.innerHTML = "";
  options.forEach((opt) => {
    const el = document.createElement("option");
    el.value = opt;
    el.textContent = opt;
    select.appendChild(el);
  });
}

function ingredientesCollection() {
  return collection(db, "ingredientes");
}
function cardapioCollection() {
  return collection(db, "cardapio");
}

function watchIngredientes() {
  const q = query(ingredientesCollection(), where("negocioId", "==", NEGOCIO_ID));
  return onSnapshot(q, (snapshot) => {
    ingredientesCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!ingredientesReady) {
      ingredientesReady = true;
      resolveIngredientesReady();
    }
  });
}

async function seedCardapioIfEmpty() {
  const q = query(cardapioCollection(), where("negocioId", "==", NEGOCIO_ID));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) return;

  const batch = writeBatch(db);
  SEED_CARDAPIO.forEach((item) => {
    const receitaResolvida = item.receita
      .map((linha) => {
        const ing = ingredientesCache.find((i) => i.nome === linha.ingrediente);
        if (!ing) return null;
        return {
          ingredienteId: ing.id,
          ingredienteNome: ing.nome,
          unidade: ing.unidade,
          quantidade: linha.quantidade
        };
      })
      .filter(Boolean);

    const ref = doc(cardapioCollection());
    batch.set(ref, {
      nome: item.nome,
      tipo: item.tipo,
      preco: item.preco,
      receita: receitaResolvida,
      negocioId: NEGOCIO_ID,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });
  });
  await batch.commit();
}

function formatPreco(valor) {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

function formatQuantidade(valor) {
  return Number.isInteger(valor) ? String(valor) : String(Math.round(valor * 1000) / 1000);
}

function renderLista() {
  const porTipo = {};
  cardapioCache.forEach((item) => {
    if (!porTipo[item.tipo]) porTipo[item.tipo] = [];
    porTipo[item.tipo].push(item);
  });

  const tipos = Object.keys(porTipo).sort((a, b) => {
    const posA = ORDEM_TIPOS.indexOf(a);
    const posB = ORDEM_TIPOS.indexOf(b);
    if (posA === -1 && posB === -1) return a.localeCompare(b);
    if (posA === -1) return 1;
    if (posB === -1) return -1;
    return posA - posB;
  });

  if (tipos.length === 0) {
    listContainer.innerHTML = `<p class="empty-state">Nenhum item cadastrado ainda.</p>`;
    return;
  }

  listContainer.innerHTML = tipos
    .map((tipo) => {
      const itens = porTipo[tipo].sort((a, b) => a.nome.localeCompare(b.nome));
      const linhas = itens.map((item) => renderLinha(item)).join("");
      return `
        <div class="categoria-bloco">
          <h4 class="categoria-titulo">${tipo}s</h4>
          <div class="ingrediente-lista">${linhas}</div>
        </div>
      `;
    })
    .join("");

  attachRowEvents();
}

function renderLinha(item) {
  const receitaTexto = (item.receita || [])
    .map((r) => `${formatQuantidade(r.quantidade)} ${r.unidade} ${r.ingredienteNome}`)
    .join(" · ");

  return `
    <div class="ingrediente-linha item-cardapio-linha" data-id="${item.id}">
      <div class="ingrediente-info">
        <p class="ingrediente-nome">${item.nome} <span class="preco-tag">${formatPreco(item.preco)}</span></p>
        <p class="receita-resumo">${receitaTexto || "Sem receita definida"}</p>
      </div>
      <div class="ingrediente-acoes">
        <button class="btn-icon" data-action="editar" title="Editar">✎</button>
        <button class="btn-icon btn-icon-danger" data-action="excluir" title="Excluir">🗑</button>
      </div>
    </div>
  `;
}

function attachRowEvents() {
  listContainer.querySelectorAll(".item-cardapio-linha").forEach((row) => {
    const id = row.dataset.id;
    const item = cardapioCache.find((i) => i.id === id);
    if (!item) return;

    row.querySelector('[data-action="editar"]').addEventListener("click", () => abrirModalEdicao(item));
    row.querySelector('[data-action="excluir"]').addEventListener("click", () => excluirItem(item));
  });
}

async function excluirItem(item) {
  const confirmado = await confirmDialog(
    `Excluir "${item.nome}" do cardápio? Essa ação não pode ser desfeita.`,
    { title: "Excluir item", confirmLabel: "Excluir", danger: true }
  );
  if (!confirmado) return;
  await deleteDoc(doc(db, "cardapio", item.id));
}

function ingredienteOptionsHtml(selectedId) {
  return ingredientesCache
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map(
      (ing) =>
        `<option value="${ing.id}" data-unidade="${ing.unidade}" ${ing.id === selectedId ? "selected" : ""}>${ing.nome} (${ing.unidade})</option>`
    )
    .join("");
}

function criarLinhaReceita(linhaExistente) {
  const row = document.createElement("div");
  row.className = "receita-linha";
  row.innerHTML = `
    <select class="receita-select-ingrediente">${ingredienteOptionsHtml(linhaExistente?.ingredienteId)}</select>
    <input type="number" class="receita-input-quantidade" step="0.001" min="0" value="${linhaExistente ? linhaExistente.quantidade : ""}" placeholder="Qtd" />
    <button type="button" class="btn-icon btn-icon-danger receita-remover" title="Remover">✕</button>
  `;
  row.querySelector(".receita-remover").addEventListener("click", () => row.remove());
  return row;
}

function abrirModalNovo() {
  editingId = null;
  modalTitle.textContent = "Novo item";
  form.reset();
  receitaLinhasContainer.innerHTML = "";
  receitaLinhasContainer.appendChild(criarLinhaReceita());
  modal.classList.add("visible");
}

function abrirModalEdicao(item) {
  editingId = item.id;
  modalTitle.textContent = "Editar item";
  document.getElementById("item-nome").value = item.nome;
  selectTipo.value = item.tipo;
  document.getElementById("item-preco").value = item.preco;

  receitaLinhasContainer.innerHTML = "";
  if (item.receita && item.receita.length > 0) {
    item.receita.forEach((linha) => receitaLinhasContainer.appendChild(criarLinhaReceita(linha)));
  } else {
    receitaLinhasContainer.appendChild(criarLinhaReceita());
  }
  modal.classList.add("visible");
}

function fecharModal() {
  modal.classList.remove("visible");
  editingId = null;
}

async function salvarItem(event) {
  event.preventDefault();

  const nome = document.getElementById("item-nome").value.trim();
  const tipo = selectTipo.value;
  const preco = parseFloat(document.getElementById("item-preco").value) || 0;

  if (!nome) {
    await alertDialog("Digite o nome do item.");
    return;
  }

  const receita = [];
  receitaLinhasContainer.querySelectorAll(".receita-linha").forEach((row) => {
    const select = row.querySelector(".receita-select-ingrediente");
    const input = row.querySelector(".receita-input-quantidade");
    const quantidade = parseFloat(input.value);
    if (!select.value || !quantidade || quantidade <= 0) return;

    const ing = ingredientesCache.find((i) => i.id === select.value);
    if (!ing) return;

    receita.push({
      ingredienteId: ing.id,
      ingredienteNome: ing.nome,
      unidade: ing.unidade,
      quantidade
    });
  });

  const dados = { nome, tipo, preco, receita };

  if (editingId) {
    await updateDoc(doc(db, "cardapio", editingId), {
      ...dados,
      atualizadoEm: serverTimestamp()
    });
  } else {
    await addDoc(cardapioCollection(), {
      ...dados,
      negocioId: NEGOCIO_ID,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });
  }

  fecharModal();
}

export async function initCardapioModule() {
  populateSelect(selectTipo, TIPOS_ITEM);

  unsubIngredientes = watchIngredientes();
  await ingredientesReadyPromise;

  await seedCardapioIfEmpty();

  const q = query(cardapioCollection(), where("negocioId", "==", NEGOCIO_ID));
  unsubCardapio = onSnapshot(q, (snapshot) => {
    cardapioCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderLista();
  });

  btnNovo.addEventListener("click", abrirModalNovo);
  btnCancelar.addEventListener("click", fecharModal);
  btnFecharModal.addEventListener("click", fecharModal);
  btnAddReceitaLinha.addEventListener("click", () => {
    receitaLinhasContainer.appendChild(criarLinhaReceita());
  });
  form.addEventListener("submit", salvarItem);
}

export function stopCardapioModule() {
  if (unsubCardapio) {
    unsubCardapio();
    unsubCardapio = null;
  }
  if (unsubIngredientes) {
    unsubIngredientes();
    unsubIngredientes = null;
  }
  cardapioCache = [];
  ingredientesCache = [];
}

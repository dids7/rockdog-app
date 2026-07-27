// estoque.js
// Módulo de Estoque: cadastro de ingredientes, ajuste de quantidade,
// aviso de itens abaixo do mínimo. Tudo em tempo real via Firestore.

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
  increment,
  getDocs,
  writeBatch
} from "./firebase-config.js";
import { confirmDialog, promptDialog, alertDialog } from "./ui-dialog.js";

const CATEGORIAS = ["Pães", "Carnes", "Guarnições", "Molhos", "Bebidas", "Embalagens", "Outros"];
const UNIDADES = ["kg", "g", "L", "ml", "unidade", "pacote", "caixa"];

// Ordem de exibição das categorias na lista (segue a ordem de montagem do lanche).
// Categorias novas que não estejam aqui aparecem no final, na ordem em que forem encontradas.
const ORDEM_CATEGORIAS = ["Pães", "Carnes", "Guarnições", "Molhos", "Bebidas", "Embalagens"];

// Ingredientes iniciais do Rock Dog, baseados no cardápio.
// Ficam com quantidade 0 — é só uma base pronta pra você ajustar os números reais.
const SEED_INGREDIENTES = [
  { nome: "Pão de hot dog", categoria: "Pães", unidade: "unidade", quantidadeMinima: 15 },
  { nome: "Baguete", categoria: "Pães", unidade: "unidade", quantidadeMinima: 5 },
  { nome: "Salsicha", categoria: "Carnes", unidade: "unidade", quantidadeMinima: 15 },
  { nome: "Carne moída (apimentada)", categoria: "Carnes", unidade: "kg", quantidadeMinima: 0.5 },
  { nome: "Bacon", categoria: "Carnes", unidade: "kg", quantidadeMinima: 0.3 },
  { nome: "Frango", categoria: "Carnes", unidade: "kg", quantidadeMinima: 0.5 },
  { nome: "Maionese", categoria: "Molhos", unidade: "kg", quantidadeMinima: 0.3 },
  { nome: "Ketchup", categoria: "Molhos", unidade: "L", quantidadeMinima: 0.3 },
  { nome: "Mostarda", categoria: "Molhos", unidade: "L", quantidadeMinima: 0.3 },
  { nome: "Vinagrete", categoria: "Molhos", unidade: "kg", quantidadeMinima: 0.3 },
  { nome: "Molho tarê", categoria: "Molhos", unidade: "L", quantidadeMinima: 0.2 },
  { nome: "Purê de batata", categoria: "Guarnições", unidade: "kg", quantidadeMinima: 0.5 },
  { nome: "Batata palha", categoria: "Guarnições", unidade: "kg", quantidadeMinima: 0.3 },
  { nome: "Milho", categoria: "Guarnições", unidade: "kg", quantidadeMinima: 0.2 },
  { nome: "Ervilha", categoria: "Guarnições", unidade: "kg", quantidadeMinima: 0.2 },
  { nome: "Cheddar", categoria: "Guarnições", unidade: "kg", quantidadeMinima: 0.2 },
  { nome: "Alface", categoria: "Guarnições", unidade: "kg", quantidadeMinima: 0.1 },
  { nome: "Pepino", categoria: "Guarnições", unidade: "kg", quantidadeMinima: 0.1 },
  { nome: "Farofa de bacon", categoria: "Guarnições", unidade: "kg", quantidadeMinima: 0.3 },
  { nome: "Coca-Cola lata 350ml", categoria: "Bebidas", unidade: "unidade", quantidadeMinima: 24 },
  { nome: "Coca-Cola Zero lata 350ml", categoria: "Bebidas", unidade: "unidade", quantidadeMinima: 24 },
  { nome: "Coquinha Zero 200ml", categoria: "Bebidas", unidade: "unidade", quantidadeMinima: 24 },
  { nome: "Guardanapo", categoria: "Embalagens", unidade: "unidade", quantidadeMinima: 100 },
  { nome: "Saco de entrega", categoria: "Embalagens", unidade: "unidade", quantidadeMinima: 50 },
  { nome: "Copo descartável", categoria: "Embalagens", unidade: "unidade", quantidadeMinima: 50 },
  { nome: "Sacola plástica", categoria: "Embalagens", unidade: "unidade", quantidadeMinima: 50 }
];

let unsubscribe = null;
let ingredientesCache = [];
let editingId = null;

// Elementos da tela (existem em index.html)
const listContainer = document.getElementById("estoque-lista");
const alertBanner = document.getElementById("estoque-alerta");
const alertText = document.getElementById("estoque-alerta-texto");
const btnNovo = document.getElementById("btn-novo-ingrediente");
const modal = document.getElementById("modal-ingrediente");
const modalTitle = document.getElementById("modal-ingrediente-titulo");
const form = document.getElementById("form-ingrediente");
const selectCategoria = document.getElementById("ing-categoria");
const selectUnidade = document.getElementById("ing-unidade");
const btnCancelar = document.getElementById("btn-cancelar-ingrediente");
const btnFecharModal = document.getElementById("btn-fechar-modal");

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

async function seedIfEmpty() {
  const q = query(ingredientesCollection(), where("negocioId", "==", NEGOCIO_ID));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) return;

  const batch = writeBatch(db);
  SEED_INGREDIENTES.forEach((item) => {
    const ref = doc(ingredientesCollection());
    batch.set(ref, {
      ...item,
      quantidade: 0,
      negocioId: NEGOCIO_ID,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });
  });
  await batch.commit();
}

function statusDe(item) {
  return item.quantidade <= item.quantidadeMinima ? "baixo" : "ok";
}

function formatQuantidade(valor) {
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace(/\.?0+$/, "");
}

function renderLista() {
  const porCategoria = {};
  ingredientesCache.forEach((item) => {
    if (!porCategoria[item.categoria]) porCategoria[item.categoria] = [];
    porCategoria[item.categoria].push(item);
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
    listContainer.innerHTML = `<p class="empty-state">Nenhum ingrediente cadastrado ainda.</p>`;
  } else {
    listContainer.innerHTML = categoriasComItens
      .map((cat) => {
        const itens = porCategoria[cat].sort((a, b) => a.nome.localeCompare(b.nome));
        const linhas = itens.map((item) => renderLinha(item)).join("");
        return `
          <div class="categoria-bloco">
            <h4 class="categoria-titulo">${cat}</h4>
            <div class="ingrediente-lista">${linhas}</div>
          </div>
        `;
      })
      .join("");
  }

  const baixos = ingredientesCache.filter((item) => statusDe(item) === "baixo");
  if (baixos.length > 0) {
    alertBanner.classList.add("visible");
    alertText.textContent =
      baixos.length === 1
        ? "1 item precisa de reposição"
        : `${baixos.length} itens precisam de reposição`;
  } else {
    alertBanner.classList.remove("visible");
  }

  attachRowEvents();
}

function renderLinha(item) {
  const status = statusDe(item);
  return `
    <div class="ingrediente-linha" data-id="${item.id}">
      <div class="ingrediente-info">
        <p class="ingrediente-nome">${item.nome}</p>
        <p class="ingrediente-qtd">
          ${formatQuantidade(item.quantidade)} ${item.unidade}
          <span class="status-badge status-${status}">${status === "baixo" ? "Baixo" : "OK"}</span>
        </p>
      </div>
      <div class="ingrediente-acoes">
        <button class="btn-icon" data-action="menos" title="Diminuir">−</button>
        <button class="btn-icon" data-action="mais" title="Adicionar">+</button>
        <button class="btn-icon" data-action="editar" title="Editar">✎</button>
        <button class="btn-icon btn-icon-danger" data-action="excluir" title="Excluir">🗑</button>
      </div>
    </div>
  `;
}

function attachRowEvents() {
  listContainer.querySelectorAll(".ingrediente-linha").forEach((row) => {
    const id = row.dataset.id;
    const item = ingredientesCache.find((i) => i.id === id);
    if (!item) return;

    row.querySelector('[data-action="mais"]').addEventListener("click", () => ajustarQuantidade(item, "mais"));
    row.querySelector('[data-action="menos"]').addEventListener("click", () => ajustarQuantidade(item, "menos"));
    row.querySelector('[data-action="editar"]').addEventListener("click", () => abrirModalEdicao(item));
    row.querySelector('[data-action="excluir"]').addEventListener("click", () => excluirIngrediente(item));
  });
}

async function ajustarQuantidade(item, direcao) {
  const passo = ["kg", "L"].includes(item.unidade) ? 0.1 : 1;
  const valorTexto = await promptDialog(
    `${direcao === "mais" ? "Adicionar" : "Retirar"} quantas ${item.unidade} de "${item.nome}"?`,
    {
      title: direcao === "mais" ? "Adicionar ao estoque" : "Retirar do estoque",
      defaultValue: "1",
      inputType: "number",
      step: passo,
      confirmLabel: "Confirmar"
    }
  );
  if (valorTexto === null) return;
  const valor = parseFloat(String(valorTexto).replace(",", "."));
  if (isNaN(valor) || valor <= 0) {
    await alertDialog("Digite um número válido maior que zero.");
    return;
  }

  const delta = direcao === "mais" ? valor : -valor;
  const novaQuantidade = item.quantidade + delta;
  if (novaQuantidade < 0) {
    await alertDialog("Isso deixaria o estoque negativo. Confere a quantidade.");
    return;
  }

  await updateDoc(doc(db, "ingredientes", item.id), {
    quantidade: increment(delta),
    atualizadoEm: serverTimestamp()
  });
}

async function excluirIngrediente(item) {
  const confirmado = await confirmDialog(
    `Excluir "${item.nome}" do estoque? Essa ação não pode ser desfeita.`,
    { title: "Excluir ingrediente", confirmLabel: "Excluir", danger: true }
  );
  if (!confirmado) return;
  await deleteDoc(doc(db, "ingredientes", item.id));
}

function abrirModalNovo() {
  editingId = null;
  modalTitle.textContent = "Novo ingrediente";
  form.reset();
  document.getElementById("ing-quantidade").value = 0;
  modal.classList.add("visible");
}

function abrirModalEdicao(item) {
  editingId = item.id;
  modalTitle.textContent = "Editar ingrediente";
  document.getElementById("ing-nome").value = item.nome;
  selectCategoria.value = item.categoria;
  selectUnidade.value = item.unidade;
  document.getElementById("ing-quantidade").value = item.quantidade;
  document.getElementById("ing-minimo").value = item.quantidadeMinima;
  modal.classList.add("visible");
}

function fecharModal() {
  modal.classList.remove("visible");
  editingId = null;
}

async function salvarIngrediente(event) {
  event.preventDefault();

  const dados = {
    nome: document.getElementById("ing-nome").value.trim(),
    categoria: selectCategoria.value,
    unidade: selectUnidade.value,
    quantidade: parseFloat(document.getElementById("ing-quantidade").value) || 0,
    quantidadeMinima: parseFloat(document.getElementById("ing-minimo").value) || 0
  };

  if (!dados.nome) {
    await alertDialog("Digite o nome do ingrediente.");
    return;
  }

  if (editingId) {
    await updateDoc(doc(db, "ingredientes", editingId), {
      ...dados,
      atualizadoEm: serverTimestamp()
    });
  } else {
    await addDoc(ingredientesCollection(), {
      ...dados,
      negocioId: NEGOCIO_ID,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });
  }

  fecharModal();
}

export async function initEstoqueModule() {
  populateSelect(selectCategoria, CATEGORIAS);
  populateSelect(selectUnidade, UNIDADES);

  await seedIfEmpty();

  const q = query(ingredientesCollection(), where("negocioId", "==", NEGOCIO_ID));
  unsubscribe = onSnapshot(q, (snapshot) => {
    ingredientesCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderLista();
  });

  btnNovo.addEventListener("click", abrirModalNovo);
  btnCancelar.addEventListener("click", fecharModal);
  btnFecharModal.addEventListener("click", fecharModal);
  form.addEventListener("submit", salvarIngrediente);
}

export function stopEstoqueModule() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  ingredientesCache = [];
}

// Exposto pro painel poder mostrar "X itens precisam de reposição" também no card inicial, se quisermos depois
export function getContagemBaixoEstoque() {
  return ingredientesCache.filter((item) => statusDe(item) === "baixo").length;
}

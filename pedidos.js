// pedidos.js
// Módulo de Pedidos: monta um pedido a partir do Cardápio, calcula o total,
// e desconta automaticamente os ingredientes do Estoque com base na receita
// de cada item vendido. Também mantém o histórico com status.

import {
  db,
  NEGOCIO_ID,
  collection,
  doc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  increment,
  writeBatch
} from "./firebase-config.js";
import { confirmDialog, alertDialog } from "./ui-dialog.js";

const ORDEM_TIPOS = ["Lanche", "Adicional", "Bebida"];
const STATUS_OPCOES = ["Em preparo", "Saiu para entrega", "Entregue", "Concluído", "Cancelado"];
const STATUS_FINALIZADOS = ["Concluído", "Cancelado"];

let unsubPedidos = null;
let unsubCardapio = null;
let unsubIngredientes = null;
let unsubClientes = null;
let cardapioCache = [];
let ingredientesCache = [];
let pedidosCache = [];
let clientesCache = [];
let carrinho = {}; // { itemId: quantidade }
let clienteSelecionadoId = null;

// Elementos da tela
const listContainer = document.getElementById("pedidos-lista");
const btnNovo = document.getElementById("btn-novo-pedido");
const modal = document.getElementById("modal-pedido");
const btnFecharModal = document.getElementById("btn-fechar-modal-pedido");
const btnCancelarModal = document.getElementById("btn-cancelar-pedido");
const btnFinalizar = document.getElementById("btn-finalizar-pedido");
const itensContainer = document.getElementById("pedido-itens-cardapio");
const totalTexto = document.getElementById("pedido-total-texto");
const inputClienteNome = document.getElementById("pedido-cliente-nome");
const inputClienteTelefone = document.getElementById("pedido-cliente-telefone");
const sugestoesContainer = document.getElementById("pedido-cliente-sugestoes");

function ingredientesCollection() { return collection(db, "ingredientes"); }
function cardapioCollection() { return collection(db, "cardapio"); }
function pedidosCollection() { return collection(db, "pedidos"); }
function clientesCollection() { return collection(db, "clientes"); }

function formatPreco(valor) {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

function timestampMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
}

function formatHora(ts) {
  const millis = timestampMillis(ts);
  if (!millis) return "";
  const d = new Date(millis);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/* ---------------- Watchers (cardápio + ingredientes, só leitura aqui) ---------------- */

function watchCardapio() {
  const q = query(cardapioCollection(), where("negocioId", "==", NEGOCIO_ID));
  return onSnapshot(q, (snapshot) => {
    cardapioCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (modal.classList.contains("visible")) renderItensCarrinho();
  });
}

function watchIngredientes() {
  const q = query(ingredientesCollection(), where("negocioId", "==", NEGOCIO_ID));
  return onSnapshot(q, (snapshot) => {
    ingredientesCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

function watchClientes() {
  const q = query(clientesCollection(), where("negocioId", "==", NEGOCIO_ID));
  return onSnapshot(q, (snapshot) => {
    clientesCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

/* ---------------- Modal / carrinho ---------------- */

function abrirModalPedido() {
  carrinho = {};
  clienteSelecionadoId = null;
  inputClienteNome.value = "";
  inputClienteTelefone.value = "";
  sugestoesContainer.classList.remove("visible");
  renderItensCarrinho();
  atualizarTotal();
  modal.classList.add("visible");
}

function fecharModalPedido() {
  modal.classList.remove("visible");
  carrinho = {};
  clienteSelecionadoId = null;
}

function renderSugestoes(termo) {
  const termoLimpo = termo.trim().toLowerCase();
  if (!termoLimpo) {
    sugestoesContainer.classList.remove("visible");
    sugestoesContainer.innerHTML = "";
    return;
  }

  const combinados = clientesCache
    .filter((c) => c.nome.toLowerCase().startsWith(termoLimpo))
    .slice(0, 6);

  if (combinados.length === 0) {
    sugestoesContainer.classList.remove("visible");
    sugestoesContainer.innerHTML = "";
    return;
  }

  sugestoesContainer.innerHTML = combinados
    .map(
      (c) =>
        `<div class="autocomplete-item" data-id="${c.id}">
          <span>${c.nome}</span>
          <span class="autocomplete-item-sub">${c.telefone || ""}</span>
        </div>`
    )
    .join("");
  sugestoesContainer.classList.add("visible");

  sugestoesContainer.querySelectorAll(".autocomplete-item").forEach((el) => {
    el.addEventListener("click", () => {
      const cliente = clientesCache.find((c) => c.id === el.dataset.id);
      if (!cliente) return;
      clienteSelecionadoId = cliente.id;
      inputClienteNome.value = cliente.nome;
      inputClienteTelefone.value = cliente.telefone || "";
      sugestoesContainer.classList.remove("visible");
      sugestoesContainer.innerHTML = "";
    });
  });
}

function renderItensCarrinho() {
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
    itensContainer.innerHTML = `<p class="empty-state">Cadastre itens no Cardápio primeiro.</p>`;
    return;
  }

  itensContainer.innerHTML = tipos
    .map((tipo) => {
      const itens = porTipo[tipo].sort((a, b) => a.nome.localeCompare(b.nome));
      const linhas = itens
        .map((item) => {
          const qtd = carrinho[item.id] || 0;
          return `
            <div class="pedido-item-linha" data-id="${item.id}">
              <div class="ingrediente-info">
                <p class="ingrediente-nome">${item.nome} <span class="preco-tag">${formatPreco(item.preco)}</span></p>
              </div>
              <div class="stepper stepper-sm">
                <button type="button" class="stepper-btn" data-action="menos">−</button>
                <span class="stepper-qty">${qtd}</span>
                <button type="button" class="stepper-btn" data-action="mais">+</button>
              </div>
            </div>
          `;
        })
        .join("");
      return `
        <div class="categoria-bloco">
          <h4 class="categoria-titulo">${tipo}s</h4>
          <div class="ingrediente-lista">${linhas}</div>
        </div>
      `;
    })
    .join("");

  itensContainer.querySelectorAll(".pedido-item-linha").forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-action="mais"]').addEventListener("click", () => {
      carrinho[id] = (carrinho[id] || 0) + 1;
      row.querySelector(".stepper-qty").textContent = carrinho[id];
      atualizarTotal();
    });
    row.querySelector('[data-action="menos"]').addEventListener("click", () => {
      if (!carrinho[id]) return;
      carrinho[id] = Math.max(0, carrinho[id] - 1);
      if (carrinho[id] === 0) delete carrinho[id];
      row.querySelector(".stepper-qty").textContent = carrinho[id] || 0;
      atualizarTotal();
    });
  });
}

function calcularTotal() {
  let total = 0;
  Object.entries(carrinho).forEach(([itemId, qtd]) => {
    const item = cardapioCache.find((i) => i.id === itemId);
    if (item) total += item.preco * qtd;
  });
  return total;
}

function atualizarTotal() {
  totalTexto.textContent = `Total: ${formatPreco(calcularTotal())}`;
}

/* ---------------- Finalizar pedido ---------------- */

let finalizando = false;

async function finalizarPedido() {
  if (finalizando) return;

  const itensCarrinho = Object.entries(carrinho)
    .map(([itemId, qtd]) => {
      const item = cardapioCache.find((i) => i.id === itemId);
      if (!item || qtd <= 0) return null;
      return {
        itemId: item.id,
        itemNome: item.nome,
        tipo: item.tipo,
        precoUnitario: item.preco,
        quantidade: qtd,
        receita: item.receita || []
      };
    })
    .filter(Boolean);

  if (itensCarrinho.length === 0) {
    await alertDialog("Selecione ao menos um item pelo botão + antes de finalizar.");
    return;
  }

  // O total vem sempre somado a partir dos MESMOS itens que serão salvos no pedido,
  // nunca de um recálculo separado — assim os dois números nunca podem divergir.
  const total = itensCarrinho.reduce((acc, item) => acc + item.precoUnitario * item.quantidade, 0);

  // Soma quanto de cada ingrediente será descontado, cruzando receita x quantidade vendida
  const deducoes = {}; // ingredienteId -> { nome, unidade, total }
  itensCarrinho.forEach((item) => {
    item.receita.forEach((linha) => {
      if (!deducoes[linha.ingredienteId]) {
        deducoes[linha.ingredienteId] = { nome: linha.ingredienteNome, unidade: linha.unidade, total: 0 };
      }
      deducoes[linha.ingredienteId].total += linha.quantidade * item.quantidade;
    });
  });

  // Confere se algum ingrediente vai ficar negativo, e avisa antes de confirmar
  const insuficientes = Object.entries(deducoes)
    .map(([ingredienteId, info]) => {
      const estoqueAtual = ingredientesCache.find((i) => i.id === ingredienteId);
      if (!estoqueAtual) return null;
      const restante = estoqueAtual.quantidade - info.total;
      return restante < 0 ? `${info.nome} (faltam ${Math.abs(restante).toFixed(2)} ${info.unidade})` : null;
    })
    .filter(Boolean);

  if (insuficientes.length > 0) {
    const seguir = await confirmDialog(
      `Estoque insuficiente para: ${insuficientes.join(", ")}. Deseja finalizar o pedido mesmo assim?`,
      { title: "Estoque insuficiente", confirmLabel: "Finalizar assim mesmo", danger: true }
    );
    if (!seguir) return;
  }

  finalizando = true;
  btnFinalizar.disabled = true;
  btnFinalizar.textContent = "Finalizando...";

  try {
    const batch = writeBatch(db);

    Object.entries(deducoes).forEach(([ingredienteId, info]) => {
      batch.update(doc(db, "ingredientes", ingredienteId), {
        quantidade: increment(-info.total),
        atualizadoEm: serverTimestamp()
      });
    });

    const novoPedidoRef = doc(pedidosCollection());
    batch.set(novoPedidoRef, {
      clienteId: clienteSelecionadoId,
      clienteNome: inputClienteNome.value.trim() || "Cliente não identificado",
      clienteTelefone: inputClienteTelefone.value.trim(),
      itens: itensCarrinho,
      total,
      status: "Em preparo",
      negocioId: NEGOCIO_ID,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    if (clienteSelecionadoId) {
      batch.update(doc(db, "clientes", clienteSelecionadoId), {
        contadorPedidos: increment(1),
        ultimoPedidoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
      });
    }

    await batch.commit();
    fecharModalPedido();
  } finally {
    finalizando = false;
    btnFinalizar.disabled = false;
    btnFinalizar.textContent = "Finalizar pedido";
  }
}

/* ---------------- Histórico de pedidos ---------------- */

function renderListaPedidos() {
  if (pedidosCache.length === 0) {
    listContainer.innerHTML = `<p class="empty-state">Nenhum pedido registrado ainda.</p>`;
    return;
  }

  const ordenados = pedidosCache
    .slice()
    .sort((a, b) => timestampMillis(b.criadoEm) - timestampMillis(a.criadoEm));

  listContainer.innerHTML = ordenados.map((pedido) => renderLinhaPedido(pedido)).join("");

  listContainer.querySelectorAll(".pedido-status-select").forEach((select) => {
    select.addEventListener("change", (e) => onMudarStatus(e.target.dataset.id, e.target.value));
  });
}

function renderLinhaPedido(pedido) {
  const itensTexto = pedido.itens.map((i) => `${i.quantidade}x ${i.itemNome}`).join(", ");
  const finalizado = STATUS_FINALIZADOS.includes(pedido.status);

  const statusHtml = finalizado
    ? `<span class="status-badge ${pedido.status === "Cancelado" ? "status-baixo" : "status-ok"}">${pedido.status}</span>`
    : `
      <select class="pedido-status-select" data-id="${pedido.id}">
        ${STATUS_OPCOES.map((s) => `<option value="${s}" ${s === pedido.status ? "selected" : ""}>${s}</option>`).join("")}
      </select>
    `;

  return `
    <div class="pedido-linha">
      <div class="ingrediente-info">
        <p class="ingrediente-nome">${pedido.clienteNome} <span class="pedido-hora">${formatHora(pedido.criadoEm)}</span></p>
        <p class="receita-resumo">${itensTexto}</p>
      </div>
      <div class="pedido-linha-direita">
        <span class="preco-tag">${formatPreco(pedido.total)}</span>
        ${statusHtml}
      </div>
    </div>
  `;
}

async function onMudarStatus(pedidoId, novoStatus) {
  const pedido = pedidosCache.find((p) => p.id === pedidoId);
  if (!pedido) return;

  if (novoStatus === "Cancelado") {
    const confirmado = await confirmDialog(
      `Cancelar o pedido de "${pedido.clienteNome}"? O estoque usado nele será devolvido.`,
      { title: "Cancelar pedido", confirmLabel: "Cancelar pedido", danger: true }
    );
    if (!confirmado) {
      renderListaPedidos(); // desfaz a mudança visual do select
      return;
    }

    const batch = writeBatch(db);
    const deducoes = {};
    pedido.itens.forEach((item) => {
      (item.receita || []).forEach((linha) => {
        if (!deducoes[linha.ingredienteId]) deducoes[linha.ingredienteId] = 0;
        deducoes[linha.ingredienteId] += linha.quantidade * item.quantidade;
      });
    });
    Object.entries(deducoes).forEach(([ingredienteId, total]) => {
      batch.update(doc(db, "ingredientes", ingredienteId), {
        quantidade: increment(total),
        atualizadoEm: serverTimestamp()
      });
    });
    batch.update(doc(db, "pedidos", pedidoId), {
      status: "Cancelado",
      atualizadoEm: serverTimestamp()
    });
    await batch.commit();
    return;
  }

  await updateDocStatus(pedidoId, novoStatus);
}

async function updateDocStatus(pedidoId, novoStatus) {
  await updateDoc(doc(db, "pedidos", pedidoId), { status: novoStatus, atualizadoEm: serverTimestamp() });
}

/* ---------------- Ciclo de vida ---------------- */

export function initPedidosModule() {
  unsubCardapio = watchCardapio();
  unsubIngredientes = watchIngredientes();
  unsubClientes = watchClientes();

  const q = query(pedidosCollection(), where("negocioId", "==", NEGOCIO_ID));
  unsubPedidos = onSnapshot(q, (snapshot) => {
    pedidosCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderListaPedidos();
  });

  btnNovo.addEventListener("click", abrirModalPedido);
  btnFecharModal.addEventListener("click", fecharModalPedido);
  btnCancelarModal.addEventListener("click", fecharModalPedido);
  btnFinalizar.addEventListener("click", finalizarPedido);

  inputClienteNome.addEventListener("input", () => {
    clienteSelecionadoId = null;
    renderSugestoes(inputClienteNome.value);
  });
  inputClienteNome.addEventListener("blur", () => {
    setTimeout(() => sugestoesContainer.classList.remove("visible"), 150);
  });
  inputClienteNome.addEventListener("focus", () => {
    if (inputClienteNome.value.trim()) renderSugestoes(inputClienteNome.value);
  });
}

export function stopPedidosModule() {
  if (unsubPedidos) { unsubPedidos(); unsubPedidos = null; }
  if (unsubCardapio) { unsubCardapio(); unsubCardapio = null; }
  if (unsubIngredientes) { unsubIngredientes(); unsubIngredientes = null; }
  if (unsubClientes) { unsubClientes(); unsubClientes = null; }
  cardapioCache = [];
  ingredientesCache = [];
  pedidosCache = [];
  clientesCache = [];
  carrinho = {};
}

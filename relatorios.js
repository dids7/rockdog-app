// relatorios.js
// Módulo de Relatórios: cruza os Pedidos já registrados pra mostrar totais,
// itens mais vendidos, clientes mais frequentes e consumo real de ingredientes.
// Pedidos cancelados ficam de fora de todos os cálculos.

import { db, NEGOCIO_ID, collection, onSnapshot, query, where } from "./firebase-config.js";

let unsubPedidos = null;
let pedidosCache = [];
let periodoAtual = "7dias";

const filtrosContainer = document.getElementById("periodo-filtros");
const statTotalVendido = document.getElementById("stat-total-vendido");
const statNumPedidos = document.getElementById("stat-num-pedidos");
const statTicketMedio = document.getElementById("stat-ticket-medio");
const rankingItens = document.getElementById("ranking-itens");
const rankingClientes = document.getElementById("ranking-clientes");
const rankingIngredientes = document.getElementById("ranking-ingredientes");

function pedidosCollection() {
  return collection(db, "pedidos");
}

function timestampMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
}

function formatPreco(valor) {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

function formatQuantidade(valor) {
  return Number.isInteger(valor) ? String(valor) : String(Math.round(valor * 1000) / 1000);
}

function inicioDoDia(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function filtrarPorPeriodo(pedidos, periodo) {
  const agora = Date.now();
  let limiteInferior = 0;

  if (periodo === "hoje") {
    limiteInferior = inicioDoDia(agora);
  } else if (periodo === "7dias") {
    limiteInferior = agora - 7 * 24 * 60 * 60 * 1000;
  } else if (periodo === "mes") {
    const d = new Date();
    d.setDate(1);
    limiteInferior = inicioDoDia(d);
  } else {
    limiteInferior = 0; // "tudo"
  }

  return pedidos.filter((p) => {
    if (p.status === "Cancelado") return false;
    const millis = timestampMillis(p.criadoEm);
    return millis >= limiteInferior;
  });
}

function calcularEstatisticas(pedidosFiltrados) {
  const totalVendido = pedidosFiltrados.reduce((acc, p) => acc + (p.total || 0), 0);
  const numPedidos = pedidosFiltrados.length;
  const ticketMedio = numPedidos > 0 ? totalVendido / numPedidos : 0;
  return { totalVendido, numPedidos, ticketMedio };
}

function calcularRankingItens(pedidosFiltrados) {
  const mapa = {};
  pedidosFiltrados.forEach((p) => {
    (p.itens || []).forEach((item) => {
      if (!mapa[item.itemNome]) mapa[item.itemNome] = { quantidade: 0, valor: 0 };
      mapa[item.itemNome].quantidade += item.quantidade;
      mapa[item.itemNome].valor += item.quantidade * item.precoUnitario;
    });
  });
  return Object.entries(mapa)
    .map(([nome, dados]) => ({ nome, ...dados }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

function calcularRankingClientes(pedidosFiltrados) {
  const mapa = {};
  pedidosFiltrados.forEach((p) => {
    const chave = p.clienteId || `avulso:${p.clienteNome}`;
    if (!mapa[chave]) mapa[chave] = { nome: p.clienteNome, pedidos: 0, total: 0 };
    mapa[chave].pedidos += 1;
    mapa[chave].total += p.total || 0;
  });
  return Object.values(mapa).sort((a, b) => b.pedidos - a.pedidos);
}

function calcularConsumoIngredientes(pedidosFiltrados) {
  const mapa = {};
  pedidosFiltrados.forEach((p) => {
    (p.itens || []).forEach((item) => {
      (item.receita || []).forEach((linha) => {
        if (!mapa[linha.ingredienteNome]) mapa[linha.ingredienteNome] = { quantidade: 0, unidade: linha.unidade };
        mapa[linha.ingredienteNome].quantidade += linha.quantidade * item.quantidade;
      });
    });
  });
  return Object.entries(mapa)
    .map(([nome, dados]) => ({ nome, ...dados }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

function renderTudo() {
  const filtrados = filtrarPorPeriodo(pedidosCache, periodoAtual);
  const { totalVendido, numPedidos, ticketMedio } = calcularEstatisticas(filtrados);

  statTotalVendido.textContent = formatPreco(totalVendido);
  statNumPedidos.textContent = String(numPedidos);
  statTicketMedio.textContent = formatPreco(ticketMedio);

  const itens = calcularRankingItens(filtrados);
  rankingItens.innerHTML =
    itens.length === 0
      ? `<p class="empty-state">Sem dados no período.</p>`
      : itens
          .slice(0, 10)
          .map(
            (i) => `
        <div class="ingrediente-linha">
          <div class="ingrediente-info">
            <p class="ingrediente-nome">${i.nome}</p>
            <p class="receita-resumo">${formatQuantidade(i.quantidade)} vendidos · ${formatPreco(i.valor)}</p>
          </div>
        </div>
      `
          )
          .join("");

  const clientes = calcularRankingClientes(filtrados);
  rankingClientes.innerHTML =
    clientes.length === 0
      ? `<p class="empty-state">Sem dados no período.</p>`
      : clientes
          .slice(0, 10)
          .map(
            (c) => `
        <div class="ingrediente-linha">
          <div class="ingrediente-info">
            <p class="ingrediente-nome">${c.nome}</p>
            <p class="receita-resumo">${c.pedidos} pedido${c.pedidos === 1 ? "" : "s"} · ${formatPreco(c.total)}</p>
          </div>
        </div>
      `
          )
          .join("");

  const ingredientes = calcularConsumoIngredientes(filtrados);
  rankingIngredientes.innerHTML =
    ingredientes.length === 0
      ? `<p class="empty-state">Sem dados no período.</p>`
      : ingredientes
          .map(
            (i) => `
        <div class="ingrediente-linha">
          <div class="ingrediente-info">
            <p class="ingrediente-nome">${i.nome}</p>
            <p class="receita-resumo">${formatQuantidade(i.quantidade)} ${i.unidade} consumidos</p>
          </div>
        </div>
      `
          )
          .join("");
}

function selecionarPeriodo(periodo) {
  periodoAtual = periodo;
  filtrosContainer.querySelectorAll(".periodo-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.periodo === periodo);
  });
  renderTudo();
}

export function initRelatoriosModule() {
  filtrosContainer.querySelectorAll(".periodo-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.periodo === periodoAtual);
    btn.addEventListener("click", () => selecionarPeriodo(btn.dataset.periodo));
  });

  const q = query(pedidosCollection(), where("negocioId", "==", NEGOCIO_ID));
  unsubPedidos = onSnapshot(q, (snapshot) => {
    pedidosCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTudo();
  });
}

export function stopRelatoriosModule() {
  if (unsubPedidos) {
    unsubPedidos();
    unsubPedidos = null;
  }
  pedidosCache = [];
}

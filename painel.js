// painel.js
// Módulo do Painel: a "visão geral do dia", cruzando Pedidos e Estoque pra
// mostrar números úteis assim que o usuário loga, sem precisar entrar em
// cada aba separadamente.

import { db, NEGOCIO_ID, collection, onSnapshot, query, where } from "./firebase-config.js";

let unsubPedidos = null;
let unsubIngredientes = null;
let pedidosCache = [];
let ingredientesCache = [];

const statsHojeEl = document.getElementById("painel-stats-hoje");
const alertaEstoqueEl = document.getElementById("painel-alerta-estoque");
const alertaEstoqueTextoEl = document.getElementById("painel-alerta-estoque-texto");
const estoqueCriticosEl = document.getElementById("painel-estoque-criticos");
const graficoEl = document.getElementById("painel-grafico-7dias");
const maisVendidoEl = document.getElementById("painel-mais-vendido");
const ultimosPedidosEl = document.getElementById("painel-ultimos-pedidos");
const mediaFdsEl = document.getElementById("painel-media-fds");

function pedidosCollection() {
  return collection(db, "pedidos");
}
function ingredientesCollection() {
  return collection(db, "ingredientes");
}

function formatPreco(valor) {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

function formatQuantidade(valor) {
  return Number.isInteger(valor) ? String(valor) : String(Math.round(valor * 100) / 100);
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
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function inicioDoDia(millisOuData) {
  const d = new Date(millisOuData);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function chaveDia(millis) {
  const d = new Date(millis);
  return d.toISOString().slice(0, 10);
}

function pedidosValidos() {
  return pedidosCache.filter((p) => p.status !== "Cancelado");
}

/* ---------------- Resumo do dia ---------------- */

function renderStatsHoje() {
  const hojeInicio = inicioDoDia(Date.now());
  const ontemInicio = hojeInicio - 24 * 60 * 60 * 1000;

  const validos = pedidosValidos();
  const doHoje = validos.filter((p) => timestampMillis(p.criadoEm) >= hojeInicio);
  const doOntem = validos.filter((p) => {
    const m = timestampMillis(p.criadoEm);
    return m >= ontemInicio && m < hojeInicio;
  });

  const vendidoHoje = doHoje.reduce((acc, p) => acc + (p.total || 0), 0);
  const vendidoOntem = doOntem.reduce((acc, p) => acc + (p.total || 0), 0);
  const pedidosHoje = doHoje.length;
  const pedidosOntem = doOntem.length;

  statsHojeEl.innerHTML = `
    <div class="stat-card">
      <p class="stat-label">Vendido hoje</p>
      <p class="stat-valor">${formatPreco(vendidoHoje)} ${deltaHtml(vendidoHoje, vendidoOntem)}</p>
    </div>
    <div class="stat-card">
      <p class="stat-label">Pedidos hoje</p>
      <p class="stat-valor">${pedidosHoje} ${deltaHtml(pedidosHoje, pedidosOntem)}</p>
    </div>
  `;
}

function deltaHtml(atual, anterior) {
  if (anterior === 0) {
    if (atual === 0) return `<span class="stat-delta neutral">vs ontem</span>`;
    return `<span class="stat-delta up">novo vs ontem</span>`;
  }
  const variacao = ((atual - anterior) / anterior) * 100;
  const arredondado = Math.round(variacao);
  if (arredondado === 0) return `<span class="stat-delta neutral">= ontem</span>`;
  const classe = arredondado > 0 ? "up" : "down";
  const sinal = arredondado > 0 ? "+" : "";
  return `<span class="stat-delta ${classe}">${sinal}${arredondado}% vs ontem</span>`;
}

/* ---------------- Estoque crítico ---------------- */

function renderEstoqueCritico() {
  const baixos = ingredientesCache
    .filter((i) => i.quantidade <= i.quantidadeMinima)
    .sort((a, b) => a.quantidade - a.quantidadeMinima - (b.quantidade - b.quantidadeMinima));

  if (baixos.length > 0) {
    alertaEstoqueEl.classList.add("visible");
    alertaEstoqueTextoEl.textContent =
      baixos.length === 1 ? "1 item precisa de reposição" : `${baixos.length} itens precisam de reposição`;
  } else {
    alertaEstoqueEl.classList.remove("visible");
  }

  if (baixos.length === 0) {
    estoqueCriticosEl.innerHTML = `<p class="empty-state">Tudo certo por aqui — nenhum item abaixo do mínimo.</p>`;
    return;
  }

  estoqueCriticosEl.innerHTML = baixos
    .slice(0, 5)
    .map(
      (i) => `
      <div class="ingrediente-linha">
        <div class="ingrediente-info">
          <p class="ingrediente-nome">${i.nome}</p>
          <p class="receita-resumo">${formatQuantidade(i.quantidade)} ${i.unidade} (mínimo: ${formatQuantidade(i.quantidadeMinima)})</p>
        </div>
        <span class="status-badge status-baixo">Baixo</span>
      </div>
    `
    )
    .join("");
}

/* ---------------- Gráfico últimos 7 dias ---------------- */

function renderGrafico7Dias() {
  const validos = pedidosValidos();
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const data = new Date();
    data.setHours(0, 0, 0, 0);
    data.setDate(data.getDate() - i);
    dias.push({
      chave: chaveDia(data.getTime()),
      label: i === 0 ? "Hoje" : data.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      total: 0
    });
  }

  validos.forEach((p) => {
    const chave = chaveDia(timestampMillis(p.criadoEm));
    const dia = dias.find((d) => d.chave === chave);
    if (dia) dia.total += p.total || 0;
  });

  const maior = Math.max(...dias.map((d) => d.total), 1);

  graficoEl.innerHTML = dias
    .map((d, idx) => {
      const alturaPct = Math.max((d.total / maior) * 100, d.total > 0 ? 4 : 2);
      return `
        <div class="grafico-barra-col">
          <span class="grafico-barra-valor">${d.total > 0 ? formatPreco(d.total) : ""}</span>
          <div class="grafico-barra ${idx === dias.length - 1 ? "hoje" : ""}" style="height:${alturaPct}%;"></div>
          <span class="grafico-barra-label">${d.label}</span>
        </div>
      `;
    })
    .join("");
}

/* ---------------- Mais vendido (7 dias) ---------------- */

function renderMaisVendido() {
  const seteDiasAtras = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentes = pedidosValidos().filter((p) => timestampMillis(p.criadoEm) >= seteDiasAtras);

  const mapa = {};
  recentes.forEach((p) => {
    (p.itens || []).forEach((item) => {
      mapa[item.itemNome] = (mapa[item.itemNome] || 0) + item.quantidade;
    });
  });

  const ranking = Object.entries(mapa).sort((a, b) => b[1] - a[1]);

  if (ranking.length === 0) {
    maisVendidoEl.innerHTML = `<p class="empty-state">Sem vendas nos últimos 7 dias.</p>`;
    return;
  }

  const [nomeTop, qtdTop] = ranking[0];
  maisVendidoEl.innerHTML = `
    <div class="ingrediente-linha">
      <div class="ingrediente-info">
        <p class="ingrediente-nome">🏆 ${nomeTop}</p>
        <p class="receita-resumo">${formatQuantidade(qtdTop)} vendidos nos últimos 7 dias</p>
      </div>
    </div>
  `;
}

/* ---------------- Últimos pedidos ---------------- */

function renderUltimosPedidos() {
  const ordenados = pedidosCache
    .slice()
    .sort((a, b) => timestampMillis(b.criadoEm) - timestampMillis(a.criadoEm))
    .slice(0, 5);

  if (ordenados.length === 0) {
    ultimosPedidosEl.innerHTML = `<p class="empty-state">Sem pedidos ainda.</p>`;
    return;
  }

  ultimosPedidosEl.innerHTML = ordenados
    .map((p) => {
      const itensTexto = (p.itens || []).map((i) => `${i.quantidade}x ${i.itemNome}`).join(", ");
      const statusClasse = p.status === "Cancelado" ? "status-baixo" : "status-ok";
      return `
        <div class="painel-mini-linha">
          <p class="ingrediente-nome">${p.clienteNome} <span class="pedido-hora">${formatHora(p.criadoEm)}</span></p>
          <p class="receita-resumo">${itensTexto}</p>
          <p class="receita-resumo">${formatPreco(p.total)} · <span class="status-badge ${statusClasse}">${p.status}</span></p>
        </div>
      `;
    })
    .join("");
}

/* ---------------- Média histórica de fim de semana ---------------- */

function renderMediaFimDeSemana() {
  const validos = pedidosValidos();
  const porDia = {};

  validos.forEach((p) => {
    const millis = timestampMillis(p.criadoEm);
    const chave = chaveDia(millis);
    if (!porDia[chave]) {
      porDia[chave] = { total: 0, pedidos: 0, weekday: new Date(millis).getDay() };
    }
    porDia[chave].total += p.total || 0;
    porDia[chave].pedidos += 1;
  });

  const dias = Object.values(porDia);
  const sabados = dias.filter((d) => d.weekday === 6);
  const domingos = dias.filter((d) => d.weekday === 0);

  function media(lista, campo) {
    if (lista.length === 0) return null;
    return lista.reduce((acc, d) => acc + d[campo], 0) / lista.length;
  }

  const cards = [];

  if (sabados.length > 0) {
    cards.push(`
      <div class="stat-card">
        <p class="stat-label">Média de sábados (${sabados.length} no histórico)</p>
        <p class="stat-valor">${Math.round(media(sabados, "pedidos"))} pedidos</p>
        <p class="receita-resumo">${formatPreco(media(sabados, "total"))} em média</p>
      </div>
    `);
  }
  if (domingos.length > 0) {
    cards.push(`
      <div class="stat-card">
        <p class="stat-label">Média de domingos (${domingos.length} no histórico)</p>
        <p class="stat-valor">${Math.round(media(domingos, "pedidos"))} pedidos</p>
        <p class="receita-resumo">${formatPreco(media(domingos, "total"))} em média</p>
      </div>
    `);
  }

  mediaFdsEl.innerHTML =
    cards.length > 0
      ? cards.join("")
      : `<p class="empty-state">Ainda não há sábados/domingos suficientes no histórico pra calcular uma média.</p>`;
}

/* ---------------- Render geral ---------------- */

function renderTudo() {
  renderStatsHoje();
  renderEstoqueCritico();
  renderGrafico7Dias();
  renderMaisVendido();
  renderUltimosPedidos();
  renderMediaFimDeSemana();
}

/* ---------------- Ciclo de vida ---------------- */

export function initPainelModule() {
  const qPedidos = query(pedidosCollection(), where("negocioId", "==", NEGOCIO_ID));
  unsubPedidos = onSnapshot(qPedidos, (snapshot) => {
    pedidosCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTudo();
  });

  const qIngredientes = query(ingredientesCollection(), where("negocioId", "==", NEGOCIO_ID));
  unsubIngredientes = onSnapshot(qIngredientes, (snapshot) => {
    ingredientesCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderEstoqueCritico();
  });
}

export function stopPainelModule() {
  if (unsubPedidos) { unsubPedidos(); unsubPedidos = null; }
  if (unsubIngredientes) { unsubIngredientes(); unsubIngredientes = null; }
  pedidosCache = [];
  ingredientesCache = [];
}

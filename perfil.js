// perfil.js
// Módulo de Perfil: mostra a conta logada, permite baixar um backup completo
// em JSON, e exportar os dados escolhidos (Estoque, Cardápio, Clientes,
// Pedidos) para uma planilha Excel (.xlsx), juntos ou separados.

import { db, NEGOCIO_ID, auth, collection, getDocs, query, where } from "./firebase-config.js";

const emailEl = document.getElementById("perfil-email");
const negocioEl = document.getElementById("perfil-negocio");
const btnBackup = document.getElementById("btn-backup-json");
const btnExportar = document.getElementById("btn-exportar-excel");
const checkEstoque = document.getElementById("export-estoque");
const checkCardapio = document.getElementById("export-cardapio");
const checkClientes = document.getElementById("export-clientes");
const checkPedidos = document.getElementById("export-pedidos");
const selectPeriodoPedidos = document.getElementById("export-periodo-pedidos");

function colecao(nome) {
  return collection(db, nome);
}

async function buscarColecao(nome) {
  const q = query(colecao(nome), where("negocioId", "==", NEGOCIO_ID));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function timestampMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
}

function formatDataHora(ts) {
  const millis = timestampMillis(ts);
  if (!millis) return "";
  const d = new Date(millis);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function inicioDoDia(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function filtrarPedidosPorPeriodo(pedidos, periodo) {
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
  }
  return pedidos.filter((p) => timestampMillis(p.criadoEm) >= limiteInferior);
}

/* ---------------- Backup completo (.json) ---------------- */

function serializarParaJson(valor) {
  if (valor === null || valor === undefined) return valor;
  if (typeof valor.toDate === "function") return valor.toDate().toISOString();
  if (Array.isArray(valor)) return valor.map(serializarParaJson);
  if (typeof valor === "object") {
    const saida = {};
    Object.entries(valor).forEach(([chave, v]) => {
      saida[chave] = serializarParaJson(v);
    });
    return saida;
  }
  return valor;
}

function baixarArquivo(conteudo, nomeArquivo, tipoMime) {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function baixarBackupCompleto() {
  btnBackup.disabled = true;
  btnBackup.textContent = "Gerando backup...";
  try {
    const [ingredientes, cardapio, clientes, pedidos] = await Promise.all([
      buscarColecao("ingredientes"),
      buscarColecao("cardapio"),
      buscarColecao("clientes"),
      buscarColecao("pedidos")
    ]);

    const backup = {
      negocioId: NEGOCIO_ID,
      exportadoEm: new Date().toISOString(),
      ingredientes: serializarParaJson(ingredientes),
      cardapio: serializarParaJson(cardapio),
      clientes: serializarParaJson(clientes),
      pedidos: serializarParaJson(pedidos)
    };

    const dataArquivo = new Date().toISOString().slice(0, 10);
    baixarArquivo(JSON.stringify(backup, null, 2), `rockdog-backup-${dataArquivo}.json`, "application/json");
  } finally {
    btnBackup.disabled = false;
    btnBackup.textContent = "Baixar backup (.json)";
  }
}

/* ---------------- Exportar para Excel (.xlsx) ---------------- */

function linhasEstoque(ingredientes) {
  return ingredientes.map((i) => ({
    Nome: i.nome,
    Categoria: i.categoria,
    Unidade: i.unidade,
    Quantidade: i.quantidade,
    "Quantidade mínima": i.quantidadeMinima,
    Status: i.quantidade <= i.quantidadeMinima ? "Baixo" : "OK"
  }));
}

function linhasCardapio(cardapio) {
  return cardapio.map((item) => ({
    Nome: item.nome,
    Tipo: item.tipo,
    "Preço (R$)": item.preco,
    Receita: (item.receita || [])
      .map((r) => `${r.quantidade} ${r.unidade} ${r.ingredienteNome}`)
      .join("; ")
  }));
}

function linhasClientes(clientes) {
  return clientes.map((c) => ({
    Nome: c.nome,
    Telefone: c.telefone || "",
    Endereço: c.endereco || "",
    Observações: c.observacoes || "",
    "Total de pedidos": c.contadorPedidos || 0
  }));
}

function linhasPedidos(pedidos) {
  return pedidos.map((p) => ({
    "Data/Hora": formatDataHora(p.criadoEm),
    Cliente: p.clienteNome,
    Telefone: p.clienteTelefone || "",
    Itens: (p.itens || []).map((i) => `${i.quantidade}x ${i.itemNome}`).join(", "),
    "Total (R$)": p.total,
    Status: p.status
  }));
}

async function exportarExcel() {
  const selecoes = {
    estoque: checkEstoque.checked,
    cardapio: checkCardapio.checked,
    clientes: checkClientes.checked,
    pedidos: checkPedidos.checked
  };

  if (!Object.values(selecoes).some(Boolean)) {
    alert("Selecione ao menos um tipo de dado pra exportar.");
    return;
  }

  btnExportar.disabled = true;
  btnExportar.textContent = "Gerando planilha...";

  try {
    const wb = XLSX.utils.book_new();

    if (selecoes.estoque) {
      const dados = await buscarColecao("ingredientes");
      const ws = XLSX.utils.json_to_sheet(linhasEstoque(dados));
      XLSX.utils.book_append_sheet(wb, ws, "Estoque");
    }

    if (selecoes.cardapio) {
      const dados = await buscarColecao("cardapio");
      const ws = XLSX.utils.json_to_sheet(linhasCardapio(dados));
      XLSX.utils.book_append_sheet(wb, ws, "Cardápio");
    }

    if (selecoes.clientes) {
      const dados = await buscarColecao("clientes");
      const ws = XLSX.utils.json_to_sheet(linhasClientes(dados));
      XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    }

    if (selecoes.pedidos) {
      const dados = await buscarColecao("pedidos");
      const filtrados = filtrarPedidosPorPeriodo(dados, selectPeriodoPedidos.value);
      const ws = XLSX.utils.json_to_sheet(linhasPedidos(filtrados));
      XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    }

    const dataArquivo = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `rockdog-exportacao-${dataArquivo}.xlsx`);
  } finally {
    btnExportar.disabled = false;
    btnExportar.textContent = "Exportar selecionados (.xlsx)";
  }
}

/* ---------------- Ciclo de vida ---------------- */

export function initPerfilModule() {
  const user = auth.currentUser;
  if (user) {
    emailEl.textContent = user.email;
    negocioEl.textContent = `Negócio: ${NEGOCIO_ID}`;
  }

  btnBackup.addEventListener("click", baixarBackupCompleto);
  btnExportar.addEventListener("click", exportarExcel);
}

export function stopPerfilModule() {
  // Este módulo não mantém listeners em tempo real, nada pra desligar.
}

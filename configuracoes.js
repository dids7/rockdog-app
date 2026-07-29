// configuracoes.js
// Guarda configurações gerais do negócio (por enquanto: tamanho do papel do
// recibo de impressão). Fica num único documento no Firestore, compartilhado
// entre todos os módulos que precisarem ler ou alterar essas configurações.

import { db, NEGOCIO_ID, doc, onSnapshot, setDoc } from "./firebase-config.js";

let tamanhoRecibo = "80mm"; // padrão até carregar o valor salvo
let unsubscribe = null;
const ouvintes = [];

function notificarOuvintes() {
  ouvintes.forEach((cb) => cb(tamanhoRecibo));
}

export function onTamanhoReciboChange(callback) {
  ouvintes.push(callback);
}

function configDocRef() {
  return doc(db, "configuracoes", NEGOCIO_ID);
}

export function getTamanhoRecibo() {
  return tamanhoRecibo;
}

export async function salvarTamanhoRecibo(valor) {
  tamanhoRecibo = valor;
  await setDoc(configDocRef(), { tamanhoRecibo: valor, negocioId: NEGOCIO_ID }, { merge: true });
}

export function initConfiguracoesModule() {
  unsubscribe = onSnapshot(configDocRef(), (snap) => {
    if (snap.exists()) {
      const dados = snap.data();
      if (dados.tamanhoRecibo) tamanhoRecibo = dados.tamanhoRecibo;
    }
    notificarOuvintes();
  });
}

export function stopConfiguracoesModule() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

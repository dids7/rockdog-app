// ui-dialog.js
// Substitui os pop-ups nativos do navegador (confirm/prompt/alert) por uma
// janela com a identidade visual do Rock Dog. Reutilizável em qualquer módulo.
//
// Uso:
//   const ok = await confirmDialog("Excluir este item?", { danger: true, confirmLabel: "Excluir" });
//   const valor = await promptDialog("Quantos você quer adicionar?", { defaultValue: "1", inputType: "number" });
//   await alertDialog("Não foi possível salvar.");

const overlay = document.getElementById("dialog-overlay");
const titleEl = document.getElementById("dialog-title");
const messageEl = document.getElementById("dialog-message");
const inputWrap = document.getElementById("dialog-input-wrap");
const inputEl = document.getElementById("dialog-input");
const cancelBtn = document.getElementById("dialog-cancel");
const confirmBtn = document.getElementById("dialog-confirm");

function openDialog({
  title,
  message,
  showInput = false,
  inputValue = "",
  inputType = "text",
  showCancel = true,
  confirmLabel = "Confirmar",
  danger = false
}) {
  return new Promise((resolve) => {
    titleEl.textContent = title || "";
    messageEl.textContent = message || "";

    inputWrap.hidden = !showInput;
    if (showInput) {
      inputEl.type = inputType;
      inputEl.value = inputValue;
    }

    cancelBtn.style.display = showCancel ? "inline-block" : "none";
    confirmBtn.textContent = confirmLabel;
    confirmBtn.classList.toggle("btn-danger", danger);

    overlay.classList.add("visible");
    if (showInput) {
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 50);
    } else {
      setTimeout(() => confirmBtn.focus(), 50);
    }

    function cleanup() {
      overlay.classList.remove("visible");
      confirmBtn.classList.remove("btn-danger");
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKeydown);
    }

    function onConfirm() {
      const result = showInput ? inputEl.value : true;
      cleanup();
      resolve(result);
    }

    function onCancel() {
      cleanup();
      resolve(showInput ? null : false);
    }

    function onKeydown(event) {
      if (event.key === "Escape") onCancel();
      if (event.key === "Enter" && showInput) onConfirm();
    }

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKeydown);
  });
}

export function confirmDialog(message, opts = {}) {
  return openDialog({
    title: opts.title || "Confirmar ação",
    message,
    showCancel: true,
    confirmLabel: opts.confirmLabel || "Confirmar",
    danger: opts.danger || false
  });
}

export function promptDialog(message, opts = {}) {
  return openDialog({
    title: opts.title || "Informe o valor",
    message,
    showInput: true,
    inputValue: opts.defaultValue || "",
    inputType: opts.inputType || "text",
    showCancel: true,
    confirmLabel: opts.confirmLabel || "OK"
  });
}

export function alertDialog(message, opts = {}) {
  return openDialog({
    title: opts.title || "Aviso",
    message,
    showCancel: false,
    confirmLabel: opts.confirmLabel || "OK"
  });
}

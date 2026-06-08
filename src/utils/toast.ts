export function showToast(message: string, durationMs = 5000): void {
  const toast = document.createElement("div");
  toast.className = "toast";

  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.textContent = "×";

  toast.appendChild(text);
  toast.appendChild(closeBtn);
  document.body.appendChild(toast);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 250);
  };

  closeBtn.addEventListener("click", dismiss);

  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(dismiss, durationMs);
}

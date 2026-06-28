import type { KeyboardEvent } from "react";

export function focusModalField(
  refs: Array<HTMLInputElement | HTMLButtonElement | null>,
  index: number
) {
  refs[index]?.focus();
}

function isFocusableField(el: HTMLInputElement | HTMLButtonElement | null) {
  if (!el) return false;
  if ("disabled" in el && el.disabled) return false;
  if (el instanceof HTMLInputElement && el.readOnly) return false;
  return true;
}

export function modalFieldKeyDown(
  e: KeyboardEvent,
  refs: Array<HTMLInputElement | HTMLButtonElement | null>,
  index: number
) {
  if (e.key === "Enter") {
    e.preventDefault();
    for (let i = index + 1; i < refs.length; i++) {
      if (isFocusableField(refs[i])) {
        refs[i]?.focus();
        return;
      }
    }
    return;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    for (let i = index - 1; i >= 0; i--) {
      if (isFocusableField(refs[i])) {
        refs[i]?.focus();
        return;
      }
    }
  }
}

export function setModalFieldRef(
  refs: Array<HTMLInputElement | HTMLButtonElement | null>,
  index: number,
  el: HTMLInputElement | HTMLButtonElement | null
) {
  refs[index] = el;
}

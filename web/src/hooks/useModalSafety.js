import { useEffect, useRef } from 'react';

export function useModalSafety(busy, onClose) {
  const dialogRef = useRef(null);
  const stateRef = useRef({ busy, onClose });
  stateRef.current = { busy, onClose };
  const close = () => { if (!stateRef.current.busy) stateRef.current.onClose(); };
  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = () => [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')];
    (focusable()[0] || dialog).focus();
    const keydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!stateRef.current.busy) stateRef.current.onClose();
      }
      if (event.key === 'Tab') {
        const elements = focusable();
        if (!elements.length) { event.preventDefault(); dialog.focus(); return; }
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previousFocus?.focus?.(); };
  }, []);
  return {
    close,
    overlayProps: { onClick: close },
    dialogProps: { ref: dialogRef, role: 'dialog', 'aria-modal': true, 'aria-busy': busy, tabIndex: -1, onClick: (event) => event.stopPropagation() },
  };
}

import { useEffect, useRef } from 'react';

/**
 * Liga o `<dialog>` nativo ao estado `open`: abre como modal (com foco preso
 * e Esc para fechar) e fecha quando o estado volta a falso.
 */
export function useModalDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return ref;
}

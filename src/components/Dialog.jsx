import { useEffect, useRef } from 'react';

/** Modal built on <dialog>: focus stays inside and Escape closes it. */
export default function Dialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d.open) d.showModal();
    d.querySelector('[data-autofocus]')?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        const r = ref.current.getBoundingClientRect(); // a click on the backdrop lands outside the box
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
      }}
    >
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}

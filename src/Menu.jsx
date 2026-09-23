// Menu.jsx — a dropdown in the top bar. The list scrolls, so a long
// project list never pushes the studio off the page.
import React, { useEffect, useRef, useState } from 'react';

export default function Menu({ label, children, primary }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="menu" ref={box}>
      <button type="button" className={`btn small ${primary ? 'primary' : ''} ${open ? 'menu-open' : ''}`}
        aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label} <span className="caret">▾</span>
      </button>
      {open && (
        <div className="menu-pop" onClick={(e) => { if (e.target.closest('[data-close]')) setOpen(false); }}>
          {children}
        </div>
      )}
    </div>
  );
}

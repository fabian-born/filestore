import { useEffect, useRef, useState } from 'react';

// Small anchored dropdown/popover used by the mobile row-info and row-menu
// buttons in FileList. Positioned with `fixed` (computed from the trigger's
// own rect) rather than relative to the table cell, so it can't get clipped
// by the file list's horizontal scroll container.
export default function Popover({ trigger, triggerClassName = 'icon-btn', triggerProps = {}, children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const anchorRef = useRef(null);
  const panelRef = useRef(null);

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;

    const updatePos = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    };
    updatePos();

    const handleOutside = (e) => {
      if (panelRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      close();
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') close();
    };

    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={triggerClassName}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        {...triggerProps}
      >
        {trigger}
      </button>
      {open && pos && (
        <div
          ref={panelRef}
          className="popover-panel"
          style={{ top: pos.top, right: pos.right }}
          onClick={(e) => e.stopPropagation()}
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </>
  );
}

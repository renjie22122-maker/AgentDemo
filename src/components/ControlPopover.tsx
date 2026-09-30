import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export function ControlPopover({
  label,
  icon,
  disabled,
  children,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 8, bottom: 60, width: 360 });
  const trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    id = useId();
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      (
        (panel.current?.querySelector('[aria-checked=true]') as HTMLElement) ||
        (panel.current?.querySelector('input,button') as HTMLElement)
      )?.focus();
    });
    const closeOutside = (e: PointerEvent) => {
      if (
        !trigger.current?.contains(e.target as Node) &&
        !panel.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', close);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={'control-chip' + (open ? ' active' : '')}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          const r = trigger.current!.getBoundingClientRect(),
            width = Math.min(380, window.innerWidth - 24);
          setPosition({
            left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)),
            bottom: Math.max(12, window.innerHeight - r.top + 10),
            width,
          });
          setOpen(!open);
        }}
      >
        {icon}
        <span>{label}</span>
        <ChevronDown size={13} />
      </button>
      {open &&
        createPortal(
          <section
            ref={panel}
            id={id}
            className="control-popover"
            aria-label={label}
            style={{
              ...position,
              maxHeight: Math.max(160, window.innerHeight - position.bottom - 12),
            }}
          >
            {children}
          </section>,
          document.body,
        )}
    </>
  );
}

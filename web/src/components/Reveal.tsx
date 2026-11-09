import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

/**
 * Scroll reveal — fades + rises once when ~15% of the node is visible.
 * transform/opacity only, expo ease, optional stagger via `delay`.
 * Respects prefers-reduced-motion via CSS (.reveal is forced visible).
 */
export default function Reveal({
  children,
  className = '',
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'article' | 'li' | 'header' | 'footer';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const style = { '--reveal-delay': `${delay}ms` } as CSSProperties;
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={`reveal ${visible ? 'is-visible' : ''} ${className}`} style={style}>
      {children}
    </Tag>
  );
}

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/** Floating button that appears after scrolling and returns to the top. A ring shows how far down the page you are. */
export default function BackToTop() {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setVisible(h.scrollTop > 480);
      setProgress(max > 0 ? Math.min(1, h.scrollTop / max) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <button type="button" className={`to-top ${visible ? 'show' : ''}`} onClick={toTop}
      style={{ '--p': `${Math.round(progress * 360)}deg` }} aria-label="Back to top" tabIndex={visible ? 0 : -1} aria-hidden={!visible}>
      <span><ArrowUp size={20} /></span>
    </button>
  );
}

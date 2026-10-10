import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import Confirm from './Confirm';

const Ctx = createContext({ setDirty() {}, go() {}, isDirty: () => false });

/**
 * Guards in-app navigation (and tab close) while a page has unsaved changes.
 * Pages call useUnsavedGuard(dirty); links built with GuardedLink ask before leaving.
 */
export function UnsavedProvider({ children }) {
  const navigate = useNavigate();
  const dirty = useRef(false);
  const [pending, setPending] = useState(null);

  const setDirty = useCallback((v) => { dirty.current = v; }, []);
  const isDirty = useCallback(() => dirty.current, []);
  const go = useCallback((to) => (dirty.current ? setPending(to) : navigate(to)), [navigate]);

  useEffect(() => {
    const warn = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return (
    <Ctx.Provider value={{ setDirty, go, isDirty }}>
      {children}
      {pending && (
        <Confirm title="Discard unsaved changes?" confirmLabel="Discard changes" danger
          onCancel={() => setPending(null)}
          onConfirm={() => { const to = pending; dirty.current = false; setPending(null); navigate(to); }}>
          You have changes on this page that have not been saved. If you leave now they will be lost.
        </Confirm>
      )}
    </Ctx.Provider>
  );
}

export function useUnsavedGuard(dirty) {
  const { setDirty } = useContext(Ctx);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}

/** NavLink that asks for confirmation when the current page has unsaved changes. */
export function GuardedLink({ to, children, onClick, ...props }) {
  const { isDirty, go } = useContext(Ctx);
  return (
    <NavLink to={to} {...props} onClick={(e) => {
      if (isDirty()) { e.preventDefault(); go(to); }
      onClick?.(e);
    }}>
      {children}
    </NavLink>
  );
}

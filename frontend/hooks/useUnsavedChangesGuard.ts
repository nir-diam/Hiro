import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_NavigationContext as NavigationContext } from 'react-router-dom';
import { LEAVE_WITHOUT_SAVE_MESSAGE } from '../utils/confirmLeaveWithoutSave';

const HISTORY_TRAP_STATE_KEY = '__hiroUnsavedGuard';

function resolveHistoryUrl(url: string | URL | null | undefined): string {
  if (url == null || url === '') {
    return window.location.href;
  }
  return new URL(String(url), window.location.href).href;
}

/**
 * Blocks browser refresh/close (beforeunload), browser back/forward (popstate trap),
 * and in-app navigation (React Router) when `when` is true.
 */
export function useUnsavedChangesGuard(
  when: boolean,
  message: string = LEAVE_WITHOUT_SAVE_MESSAGE,
): void {
  const messageRef = useRef(message);
  messageRef.current = message;

  const skipNextPopStateRef = useRef(false);
  const guardTrapActiveRef = useRef(false);

  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  const navigationContext = useContext(NavigationContext);
  const navigator = navigationContext?.navigator as
    | {
        push: (...args: unknown[]) => void;
        replace: (...args: unknown[]) => void;
        go: (delta: number) => void;
        navigate?: (...args: unknown[]) => void;
      }
    | undefined;

  useEffect(() => {
    if (!when) {
      guardTrapActiveRef.current = false;
      return;
    }

    const pushHistoryTrap = () => {
      try {
        window.history.pushState({ [HISTORY_TRAP_STATE_KEY]: 1 }, '', window.location.href);
      } catch {
        // ignore (e.g. sandboxed iframe)
      }
    };

    if (!guardTrapActiveRef.current) {
      guardTrapActiveRef.current = true;
      pushHistoryTrap();
    }

    const confirmLeave = (): boolean => {
      if (skipNextPopStateRef.current) {
        skipNextPopStateRef.current = false;
        return true;
      }
      const ok = window.confirm(messageRef.current);
      if (ok) skipNextPopStateRef.current = true;
      return ok;
    };

    const shouldBlockHistoryChange = (url: string | URL | null | undefined): boolean => {
      const nextHref = resolveHistoryUrl(url);
      return nextHref !== window.location.href;
    };

    const onPopState = () => {
      if (skipNextPopStateRef.current) {
        skipNextPopStateRef.current = false;
        return;
      }

      const ok = window.confirm(messageRef.current);
      if (ok) {
        skipNextPopStateRef.current = true;
        window.history.back();
      } else {
        pushHistoryTrap();
      }
    };
    window.addEventListener('popstate', onPopState);

    const onDocumentClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      let nextPath = href;
      if (/^https?:\/\//i.test(href)) {
        try {
          const url = new URL(href);
          if (url.origin !== window.location.origin) return;
          nextPath = url.pathname + url.search + url.hash;
        } catch {
          return;
        }
      }
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (nextPath === current) return;
      if (!confirmLeave()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener('click', onDocumentClick, true);

    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);
    history.pushState = (state: unknown, title: string, url?: string | URL | null) => {
      if (!shouldBlockHistoryChange(url) || confirmLeave()) {
        origPushState(state, title, url);
      }
    };
    history.replaceState = (state: unknown, title: string, url?: string | URL | null) => {
      if (!shouldBlockHistoryChange(url) || confirmLeave()) {
        origReplaceState(state, title, url);
      }
    };

    let origPush: typeof navigator.push | undefined;
    let origReplace: typeof navigator.replace | undefined;
    let origNavigate: ((...args: unknown[]) => void) | null = null;

    if (navigator) {
      origPush = navigator.push.bind(navigator);
      origReplace = navigator.replace.bind(navigator);
      origNavigate =
        typeof navigator.navigate === 'function' ? navigator.navigate.bind(navigator) : null;

      navigator.push = (...args: unknown[]) => {
        if (confirmLeave()) origPush!(...args);
      };
      navigator.replace = (...args: unknown[]) => {
        if (confirmLeave()) origReplace!(...args);
      };
      if (origNavigate) {
        navigator.navigate = (...args: unknown[]) => {
          if (confirmLeave()) origNavigate!(...args);
        };
      }
    }

    return () => {
      skipNextPopStateRef.current = false;
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onDocumentClick, true);
      history.pushState = origPushState;
      history.replaceState = origReplaceState;
      if (navigator && origPush && origReplace) {
        navigator.push = origPush;
        navigator.replace = origReplace;
        if (origNavigate) {
          navigator.navigate = origNavigate;
        }
      }
    };
  }, [when, navigator]);
}

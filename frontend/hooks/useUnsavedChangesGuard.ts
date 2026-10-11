import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_NavigationContext as NavigationContext } from 'react-router-dom';
import { LEAVE_WITHOUT_SAVE_MESSAGE } from '../utils/confirmLeaveWithoutSave';

/**
 * Blocks browser refresh/close (beforeunload) and in-app navigation (React Router)
 * when `when` is true. Uses window.confirm — works with BrowserRouter.
 */
export function useUnsavedChangesGuard(
  when: boolean,
  message: string = LEAVE_WITHOUT_SAVE_MESSAGE,
): void {
  const messageRef = useRef(message);
  messageRef.current = message;

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
      }
    | undefined;

  useEffect(() => {
    if (!when || !navigator) return;

    const confirmLeave = () => window.confirm(messageRef.current);

    const origPush = navigator.push.bind(navigator);
    const origReplace = navigator.replace.bind(navigator);
    const origGo = navigator.go.bind(navigator);

    navigator.push = (...args: unknown[]) => {
      if (confirmLeave()) origPush(...args);
    };
    navigator.replace = (...args: unknown[]) => {
      if (confirmLeave()) origReplace(...args);
    };
    navigator.go = (delta: number) => {
      if (confirmLeave()) origGo(delta);
    };

    const onPopState = () => {
      if (!confirmLeave()) {
        window.history.pushState(null, '', window.location.href);
      }
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      navigator.push = origPush;
      navigator.replace = origReplace;
      navigator.go = origGo;
      window.removeEventListener('popstate', onPopState);
    };
  }, [when, navigator]);
}

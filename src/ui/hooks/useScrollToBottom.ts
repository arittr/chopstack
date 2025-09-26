import { type RefObject, useEffect, useRef } from 'react';

export function useScrollToBottom<T>(dependencies: unknown[]): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current !== null) {
      // In Ink, we don't have actual DOM scrolling
      // This hook is a placeholder for future implementation
      // when Ink supports scrollable areas
    }
  }, dependencies);

  return ref;
}

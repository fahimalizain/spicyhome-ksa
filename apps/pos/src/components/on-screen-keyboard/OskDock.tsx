import { createContext, useContext, useId, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/** Standard on-screen keyboard key sizes. */
export type OskSize = 'sm' | 'md' | 'lg';

/**
 * A registered inline host for the on-screen keyboard.
 *
 * When the focused eligible field lives inside `scope`, the keyboard portals
 * INTO `host` (docked) instead of floating fixed at the viewport bottom, so
 * centered modals/cards are not overlapped.
 */
export type OskDockEntry = {
  /** Unique, stable per dock mount (React useId). */
  id: string;
  /** Element the keyboard portals INTO when docked here. */
  host: HTMLElement;
  /** Element containing the fields that claim this dock. */
  scope: HTMLElement;
  /** Key size applied to the keyboard while docked here. */
  size: OskSize;
};

type OskDockContextValue = {
  registerDock: (entry: OskDockEntry) => void;
  unregisterDock: (id: string) => void;
};

/**
 * Internal context consumed by <OskDock />. Deliberately separate from the
 * public useOnScreenKeyboard() context so the dock registry stays an
 * implementation detail of the provider.
 */
export const OskDockInternalContext = createContext<OskDockContextValue | null>(null);

/**
 * Reads the dock registry from the provider. No-op when there is no
 * provider: pages rendered standalone (e.g. in tests) keep working — the
 * dock simply never registers and the keyboard falls back to floating.
 */
function useOskDockInternal(): OskDockContextValue {
  const ctx = useContext(OskDockInternalContext);
  if (!ctx) {
    return { registerDock: () => {}, unregisterDock: () => {} };
  }
  return ctx;
}

type OskDockProps = {
  className?: string;
  /** Key size when this dock hosts the keyboard. Default: 'md'. */
  size?: OskSize;
};

/**
 * Declarative inline keyboard host. Render <OskDock /> inside a modal/card
 * whose root carries `data-osk-scope` (or wrap content in <OskDockScope />);
 * the dock host itself is an empty div with zero footprint — it only takes
 * space while the keyboard portals in.
 */
export function OskDock({ className, size = 'md' }: OskDockProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const { registerDock, unregisterDock } = useOskDockInternal();

  // useLayoutEffect: register before paint so a field focused while (or
  // right after) the dock mounts resolves to this dock from the first frame.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Scope = nearest [data-osk-scope] ancestor set by consumers on the
    // modal card root, else the host's parent element.
    const scopeAncestor = host.closest('[data-osk-scope]');
    const scope = scopeAncestor instanceof HTMLElement ? scopeAncestor : host.parentElement;
    if (!scope) return; // not in the DOM tree yet — nothing to claim
    registerDock({ id, host, scope, size });
    return () => unregisterDock(id);
  }, [id, registerDock, unregisterDock, size]);

  return <div ref={hostRef} data-testid="osk-dock" data-osk-size={size} className={className} />;
}

type OskDockScopeProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Optional scope marker — use when the host's parent element isn't the right
 * scope (e.g. the fields live deeper in the card than the dock itself).
 */
export function OskDockScope({ children, className }: OskDockScopeProps) {
  return (
    <div data-osk-scope className={className}>
      {children}
    </div>
  );
}

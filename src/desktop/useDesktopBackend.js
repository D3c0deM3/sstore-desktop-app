import { useEffect, useState } from "react";
import { initializeDesktopBackend, isDesktopApp } from "./tauriClient";
import { installDesktopApiBridge } from "./localApiBridge";

export function useDesktopBackend() {
  const [desktopBackend, setDesktopBackend] = useState({
    ready: !isDesktopApp(),
    health: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function bootDesktopBackend() {
      try {
        const health = await initializeDesktopBackend();
        installDesktopApiBridge();
        if (health?.scanner_server) {
          localStorage.setItem(
            "scannerServer",
            JSON.stringify(health.scanner_server)
          );
        }
        if (
          health?.default_session?.token &&
          !localStorage.getItem("token") &&
          localStorage.getItem("sstoreLoggedOut") !== "true"
        ) {
          localStorage.setItem("token", health.default_session.token);
          localStorage.setItem(
            "market",
            JSON.stringify(health.default_session.market)
          );
        }
        if (!cancelled) {
          setDesktopBackend({ ready: true, health, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setDesktopBackend({
            ready: false,
            health: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    bootDesktopBackend();

    return () => {
      cancelled = true;
    };
  }, []);

  return desktopBackend;
}

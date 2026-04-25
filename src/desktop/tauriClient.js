const getTauriInvoke = () =>
  window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;

export const isDesktopApp = () => Boolean(getTauriInvoke());

export const desktopInvoke = async (command, args) => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Tauri is not available in this runtime.");
  }

  return invoke(command, args);
};

export const initializeDesktopBackend = async () => {
  if (!isDesktopApp()) {
    return null;
  }

  return desktopInvoke("desktop_health");
};

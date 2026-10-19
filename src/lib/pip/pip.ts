/**
 * Picture-in-Picture helpers.
 *
 * Strategy per media kind:
 *  - Local video  → native `video.requestPictureInPicture()`
 *  - YouTube      → Document Picture-in-Picture API (the player shell is
 *                   re-rendered into a PiP window via a React portal; styles
 *                   are copied across) with an in-page mini player as the
 *                   Safari/Firefox fallback.
 *  - Local audio  → in-page mini player (native PiP needs video frames).
 *
 * Moving an `<iframe>` across documents reloads it. Loopdeck solves this by
 * remounting the engine on every PiP transition and resuming from the last
 * known position/state instead of fighting the reload.
 */

export const PIP_WINDOW_WIDTH = 520;
export const PIP_WINDOW_HEIGHT = 330;

export function isDocumentPiPSupported(): boolean {
  return typeof window !== "undefined" && Boolean(window.documentPictureInPicture);
}

export function isNativePiPSupported(): boolean {
  return (
    typeof document !== "undefined" &&
    "pictureInPictureEnabled" in document &&
    document.pictureInPictureEnabled
  );
}

/** Copies stylesheets and the theme class into a Document-PiP window. */
export function copyStylesToWindow(target: Window): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      if (sheet.href) {
        const link = target.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.document.head.appendChild(link);
      } else {
        const style = target.document.createElement("style");
        style.textContent = Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
        target.document.head.appendChild(style);
      }
    } catch {
      // Cross-origin stylesheets cannot be inspected; skipping is safe.
    }
  }

  if (document.documentElement.classList.contains("dark")) {
    target.document.documentElement.classList.add("dark");
  }
  target.document.documentElement.style.colorScheme = document.documentElement.style.colorScheme;

  const base = target.document.createElement("style");
  base.textContent =
    "html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#000}" +
    "[data-pip-container]{position:fixed;inset:0;}";
  target.document.head.appendChild(base);
}

/** Requests the Document PiP window; returns null when unsupported/denied. */
export async function requestDocumentPiPWindow(): Promise<Window | null> {
  const api = typeof window !== "undefined" ? window.documentPictureInPicture : undefined;
  if (!api) return null;
  try {
    const pipWindow = await api.requestWindow({
      width: PIP_WINDOW_WIDTH,
      height: PIP_WINDOW_HEIGHT,
    });
    copyStylesToWindow(pipWindow);
    const container = pipWindow.document.createElement("div");
    container.setAttribute("data-pip-container", "");
    pipWindow.document.body.appendChild(container);
    return pipWindow;
  } catch {
    return null;
  }
}

/**
 * Loader for the YouTube IFrame Player API.
 *
 * The API script talks to its iframes with postMessage and listens on the
 * window it was loaded into. A player living in a Document Picture-in-Picture
 * window therefore needs the API loaded into *that* window, so loading is
 * memoized per window instead of once globally. Within one window the script
 * is requested at most once (StrictMode double-mounts are safe).
 */

type YTGlobal = typeof YT;

type YouTubeCapableWindow = Window & {
  YT?: YTGlobal;
  onYouTubeIframeAPIReady?: (() => void) | undefined;
};

const SCRIPT_SRC = "https://www.youtube.com/iframe_api";
const LOAD_TIMEOUT_MS = 15000;

const promises = new WeakMap<Window, Promise<YTGlobal>>();

export function loadYouTubeIframeApi(target?: Window): Promise<YTGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The YouTube IFrame API is only available in the browser."));
  }

  const w = (target ?? window) as YouTubeCapableWindow;
  if (w.YT && typeof w.YT.Player === "function") {
    return Promise.resolve(w.YT);
  }
  const existing = promises.get(w);
  if (existing) return existing;

  const promise = new Promise<YTGlobal>((resolve, reject) => {
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      promises.delete(w);
      reject(new Error(message));
    };

    const timeout = window.setTimeout(
      () => fail("Timed out loading the YouTube player. Check your connection or ad/script blockers."),
      LOAD_TIMEOUT_MS,
    );

    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (settled) return;
      if (w.YT && typeof w.YT.Player === "function") {
        settled = true;
        window.clearTimeout(timeout);
        resolve(w.YT);
      } else {
        window.clearTimeout(timeout);
        fail("The YouTube IFrame API initialized without a player constructor.");
      }
    };

    const doc = w.document;
    if (!doc.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)) {
      const script = doc.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        fail("Failed to download the YouTube IFrame API script (blocked by an extension or network?).");
      };
      doc.head.appendChild(script);
    }
  });

  promises.set(w, promise);
  return promise;
}

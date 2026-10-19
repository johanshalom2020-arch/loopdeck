export {};

declare global {
  /** Document Picture-in-Picture API (Chrome/Edge). Not yet in TS lib.dom. */
  interface DocumentPictureInPictureOptions {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
  }

  interface DocumentPictureInPictureApi extends EventTarget {
    requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
    readonly window: Window | null;
  }

  interface Window {
    documentPictureInPicture?: DocumentPictureInPictureApi;
  }

  interface WindowEventMap {
    enterpictureinpicture: Event;
    leavepictureinpicture: Event;
  }
}

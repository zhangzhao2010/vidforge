import type { VidforgeApi } from '../preload/index';

declare global {
  interface Window {
    vidforge: VidforgeApi;
  }
}

export {};

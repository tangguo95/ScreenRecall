/// <reference types="vite/client" />

import type { ScreenRecallApi } from '../../preload';

declare global {
  interface Window {
    screenRecall: ScreenRecallApi;
  }
}

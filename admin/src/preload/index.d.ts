import type { MedfamApi } from './index';

declare global {
  interface Window {
    medfam: MedfamApi;
  }
}

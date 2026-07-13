// Minimal local Vite client type stubs to avoid missing type errors.
// Extend as needed if you rely on more Vite-specific globals.

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}



/// <reference types="svelte" />

declare module '*.svelte' {
  import type { Component } from 'svelte';
  const component: Component;
  export default component;
}

declare module '*.svg?raw' {
  const content: string;
  export default content;
}

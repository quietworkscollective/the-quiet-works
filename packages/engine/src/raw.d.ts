// Vite's `?raw` suffix imports a file's text. The content check reads MemoDialog.tsx this way.
declare module '*?raw' {
  const content: string;
  export default content;
}

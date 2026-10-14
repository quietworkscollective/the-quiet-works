// Vite's `?raw` suffix imports a file's text. The stylesheet tests read styles.css this way.
declare module '*?raw' {
  const content: string;
  export default content;
}

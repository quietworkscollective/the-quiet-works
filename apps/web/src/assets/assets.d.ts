// `?url&inline` makes Vite emit the file's bytes as a data: URL inside a JS chunk, so a model
// reaches the page through the module graph and never through fetch or XHR (connect-src 'none').
// `.glb` is not one of Vite's built-in asset types, which is why the `url` query is needed too.
declare module '*.glb?url&inline' {
  const dataUrl: string;
  export default dataUrl;
}

declare module '*.glb.gz?url&inline' {
  const dataUrl: string;
  export default dataUrl;
}

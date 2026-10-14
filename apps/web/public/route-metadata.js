(() => {
  const data = document.getElementById('route-metadata-map');
  if (!data) return;

  let routes;
  try {
    routes = new Map(JSON.parse(data.textContent || '[]'));
  } catch {
    return;
  }

  const normalizedPath = () => window.location.pathname.replace(/\/+$/, '') || '/';
  const setMeta = (selector, attribute, key, value) => {
    let element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, key);
      document.head.append(element);
    }
    element.content = value;
  };
  const setLink = (rel, href, type) => {
    const selector = `link[rel="${rel}"]${type ? `[type="${type}"]` : ''}`;
    let element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement('link');
      element.rel = rel;
      if (type) element.type = type;
      document.head.append(element);
    }
    element.href = href;
  };

  const update = () => {
    const route = routes.get(normalizedPath());
    if (!route) return;
    const { metadata, jsonLd } = route;
    document.title = metadata.title;
    setMeta('meta[name="description"]', 'name', 'description', metadata.description);
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', 'UNHELD');
    setMeta('meta[property="og:title"]', 'property', 'og:title', metadata.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', metadata.description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', metadata.canonical);
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
    setMeta('meta[property="og:image"]', 'property', 'og:image', metadata.image);
    setMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', metadata.imageAlt);
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', metadata.title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', metadata.description);
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', metadata.image);
    setMeta('meta[name="twitter:image:alt"]', 'name', 'twitter:image:alt', metadata.imageAlt);
    setLink('canonical', metadata.canonical);
    setLink('alternate', metadata.markdown, 'text/markdown');

    let structured = document.getElementById('route-structured-data');
    if (!structured) {
      structured = document.createElement('script');
      structured.id = 'route-structured-data';
      structured.type = 'application/ld+json';
      document.head.append(structured);
    }
    structured.textContent = JSON.stringify(jsonLd);
  };

  window.addEventListener('popstate', update);
  update();

  const root = document.getElementById('root');
  if (root) {
    const markMounted = () => {
      if (root.childNodes.length === 0) return;
      document.documentElement.classList.add('tqw-app-mounted');
      observer.disconnect();
    };
    const observer = new MutationObserver(markMounted);
    observer.observe(root, { childList: true, subtree: true });
    markMounted();

    const routeObserver = new MutationObserver((records) => {
      if (records.some((record) => record.type === 'attributes')) update();
    });
    routeObserver.observe(root, {
      attributes: true,
      attributeFilter: ['data-chamber', 'data-page'],
      subtree: true,
    });
  }
})();

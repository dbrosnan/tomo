// Pure helpers for rendering index.html against a content-hashed bundle.
const PLACEHOLDER = '{{BUNDLE}}';

// 'web/public/assets/bundle-ABC.js' + 'web/public' -> '/assets/bundle-ABC.js'
export const bundleHref = (outputPath, publicDir) => {
  const normalizedRoot = publicDir.replace(/\/+$/, '');
  if (!outputPath.startsWith(`${normalizedRoot}/`)) {
    throw new Error(`bundle ${outputPath} is not inside ${normalizedRoot}`);
  }
  return outputPath.slice(normalizedRoot.length);
};

export const renderIndex = (template, href) => {
  if (!template.includes(PLACEHOLDER)) {
    throw new Error(`index template has no ${PLACEHOLDER} placeholder`);
  }
  return template.split(PLACEHOLDER).join(href);
};

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderIndex, bundleHref } from '../scripts/buildHtml.js';

test('bundleHref maps an esbuild output path to a root-relative URL', () => {
  assert.equal(bundleHref('web/public/assets/bundle-ABC123.js', 'web/public'), '/assets/bundle-ABC123.js');
  assert.equal(bundleHref('web/public/bundle.js', 'web/public'), '/bundle.js');
});

test('renderIndex substitutes the bundle placeholder without touching the template', () => {
  const template = '<script src="{{BUNDLE}}"></script>';
  const out = renderIndex(template, '/assets/bundle-ABC123.js');
  assert.equal(out, '<script src="/assets/bundle-ABC123.js"></script>');
  assert.equal(template, '<script src="{{BUNDLE}}"></script>');
});

test('renderIndex refuses a template with no placeholder', () => {
  assert.throws(() => renderIndex('<script src="/bundle.js"></script>', '/assets/x.js'), /BUNDLE/);
});

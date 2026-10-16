const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function loadDefinition(relative, kind = 'Page') {
  let definition;
  const routes = [];
  const script = path.join(root, relative);
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    [kind]: (value) => { definition = value; },
    require: (name) => require(path.resolve(path.dirname(script), name)),
    wx: { reLaunch: ({ url }) => routes.push(url) }
  });
  return { definition, routes };
}

test('homepage tabs reuse original relaxation and record pages', () => {
  const { definition, routes } = loadDefinition('components/night-tabbar/index.js', 'Component');
  const context = { data: { active: 'home' } };
  for (const key of ['relax', 'records', 'home']) {
    definition.methods.onTap.call(context, { currentTarget: { dataset: { key } } });
  }
  assert.deepEqual(routes, ['/pages/breathe/index', '/pages/record/index']);
});

test('original relaxation and record navigation return to the new homepage', () => {
  for (const [file, handler] of [['pages/breathe/index.js', 'goAgent'], ['pages/record/index.js', 'goNight']]) {
    const { definition, routes } = loadDefinition(file);
    definition[handler]();
    assert.deepEqual(routes, ['/pages/home/index']);
  }
});

test('manifest preserves original pages and adds only homepage subpages', () => {
  const pages = require('../app.json').pages;
  assert.equal(pages[0], 'pages/home/index');
  assert.equal(pages.includes('pages/relax/index'), false);
  for (const name of ['agent', 'record', 'night-settings', 'breathe', 'body', 'settings', 'focus', 'sound', 'journal', 'sleep']) {
    assert.ok(pages.includes('pages/' + name + '/index'), name);
  }
  assert.ok(pages.includes('pages/body/part'));
  for (const name of ['home', 'counselors', 'skills', 'skill-detail', 'topic']) {
    assert.ok(pages.includes('pages/' + name + '/index'));
    assert.ok(fs.readFileSync(path.join(root, 'pages', name, 'index.wxss'), 'utf8').includes('@import "../../styles/nightcat.wxss";'));
  }
  for (const page of pages) {
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      assert.ok(fs.existsSync(path.join(root, page + '.' + ext)), page + '.' + ext);
    }
  }
});

test('Nightcat styles are not injected into original pages globally', () => {
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'app.wxss'), 'utf8'), /--cat-|\.cat-page/);
  const css = fs.readFileSync(path.join(root, 'styles/nightcat.wxss'), 'utf8');
  assert.doesNotMatch(css, /(?:^|\n)page\s*\{/);
  assert.match(css, /\.home-page,\s*\.cat-page\s*\{/);
});

test('all homepage content assets are present', () => {
  const content = require('../data/nightcat-content');
  const check = (value) => {
    if (typeof value === 'string' && value.startsWith('/assets/')) {
      assert.ok(fs.existsSync(path.join(root, value.slice(1))), value);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(check);
    }
  };
  check(content);
});

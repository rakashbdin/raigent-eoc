const { createInstallTargetAdapter } = require('./helpers');

module.exports = createInstallTargetAdapter({
  id: 'hermes-home',
  target: 'hermes',
  kind: 'home',
  rootSegments: ['.hermes'],
  installStatePathSegments: ['eoc-install-state.json'],
  nativeRootRelativePath: '.hermes',
});

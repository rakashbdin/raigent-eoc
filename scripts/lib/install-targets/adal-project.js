const { createInstallTargetAdapter } = require('./helpers');

module.exports = createInstallTargetAdapter({
  id: 'adal-project',
  target: 'adal',
  kind: 'project',
  rootSegments: ['.adal'],
  installStatePathSegments: ['eoc-install-state.json'],
  nativeRootRelativePath: '.adal',
});

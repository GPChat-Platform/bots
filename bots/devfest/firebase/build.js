'use strict';
// Copie le code métier du bot (src/, data/, SDK) dans functions/lib avant un déploiement ou un test :
//   node build.js
// functions/lib est généré (ignoré par git) : la source de vérité reste bots/devfest/src.
const fs = require('node:fs');
const path = require('node:path');

function build() {
  const root = path.resolve(__dirname, '..');
  const lib = path.join(__dirname, 'functions', 'lib');
  fs.mkdirSync(lib, { recursive: true });
  const copy = (from, to) => fs.copyFileSync(path.join(root, from), path.join(lib, to));
  copy('src/handlers.js', 'handlers.js');
  copy('src/program.js', 'program.js');
  copy('data/program.json', 'program.json');
  fs.copyFileSync(path.resolve(root, '../../packages/sdk/index.js'), path.join(lib, 'gpchat-bot.js'));
  return lib;
}

if (require.main === module) console.log('code copié dans', build());
module.exports = { build };

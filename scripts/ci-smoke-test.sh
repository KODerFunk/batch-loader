#!/bin/sh
# Verifies the real published artifact: packs the tarball, installs it into a clean
# directory and exercises both module formats (require + import)
set -e

npm run build
npm pack --pack-destination /tmp
SMOKE_DIR=$(mktemp -d)
cd "$SMOKE_DIR"
npm init -y > /dev/null
npm install /tmp/koderfunk-batch-loader-*.tgz

node -e "const { BatchLoader } = require('@koderfunk/batch-loader'); if (typeof BatchLoader !== 'function') { throw new Error('CJS require() smoke failed') }"
node --input-type=module -e "import { BatchLoader } from '@koderfunk/batch-loader'; if (typeof BatchLoader !== 'function') { throw new Error('ESM import smoke failed') }"

echo 'Dual ESM/CJS smoke test passed'

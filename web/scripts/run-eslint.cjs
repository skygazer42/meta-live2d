#!/usr/bin/env node

process.env.ESLINT_USE_FLAT_CONFIG = 'false';

require('../node_modules/eslint/bin/eslint.js');

#!/usr/bin/env node

import { transformFileSync } from '@babel/core';
import { readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join, extname } from 'path';

// Clean and create dist directory
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/tui', { recursive: true });

// Build TUI files with Babel
try {
  const processDirectory = (dir, baseDir = '') => {
    const items = readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = join(dir, item.name);
      const relativePath = join(baseDir, item.name);
      
      if (item.isDirectory()) {
        mkdirSync(join('dist/tui', relativePath), { recursive: true });
        processDirectory(fullPath, relativePath);
      } else if (item.isFile() && extname(item.name) === '.js') {
        const outputPath = join('dist/tui', relativePath);
        
        const result = transformFileSync(fullPath, {
          presets: ['@babel/preset-react']
        });
        
        if (result && result.code) {
          writeFileSync(outputPath, result.code);
        }
      }
    }
  };
  
  processDirectory('src/tui');
  
  // Copy non-JS files is handled in the directory processing
  
  // Copy the main CLI file
  const cliContent = readFileSync('src/cli/tui.js');
  mkdirSync('dist/cli', { recursive: true });
  writeFileSync('dist/cli/tui.cjs', cliContent);
  
  console.log('✅ TUI build completed successfully');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
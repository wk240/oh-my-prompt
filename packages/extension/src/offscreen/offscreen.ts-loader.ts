/**
 * Offscreen Document Loader for Dev Mode
 *
 * In dev mode, this loader imports the actual offscreen.ts from Vite dev server.
 * This file is copied to dist/src/offscreen/offscreen.ts-loader.js
 */

import 'http://localhost:5173/@vite/env';
import 'http://localhost:5173/src/offscreen/offscreen.ts';
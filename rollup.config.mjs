import fs from 'node:fs';
import path from 'node:path';

import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import {
    certificatePEM,
    keyPEM,
    transformCodeToESMPlugin,
} from '@windycom/plugin-devtools';
import cleanup from 'rollup-plugin-cleanup';
import serve from 'rollup-plugin-serve';
import svelte from 'rollup-plugin-svelte';

const production = !process.env.ROLLUP_WATCH;
const distPath = path.resolve('dist');
const staticPath = path.resolve('static');
const indexPath = path.resolve('index.html');

const copyDir = (sourceDir, targetDir) => {
    if (!fs.existsSync(sourceDir)) {
        return;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        const sourceFile = path.join(sourceDir, entry.name);
        const targetFile = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDir(sourceFile, targetFile);
        } else {
            fs.copyFileSync(sourceFile, targetFile);
        }
    }
};

const copyStaticAssets = () => ({
    name: 'copy-static-assets',
    buildStart() {
        fs.mkdirSync(distPath, { recursive: true });
        if (fs.existsSync(indexPath)) {
            fs.copyFileSync(indexPath, path.join(distPath, 'index.html'));
        }
        copyDir(staticPath, distPath);
    },
    writeBundle() {
        if (fs.existsSync(indexPath)) {
            fs.copyFileSync(indexPath, path.join(distPath, 'index.html'));
        }
        copyDir(staticPath, distPath);
    },
});

export default {
    input: 'src/plugin.svelte',
    external: id => id.startsWith('@windy/'),
    output: {
        file: 'dist/plugin.js',
        format: 'es',
        sourcemap: true,
    },
    plugins: [
        svelte({
            compilerOptions: {
                dev: !production,
            },
            emitCss: false,
        }),
        resolve({
            browser: true,
            dedupe: ['svelte'],
        }),
        commonjs(),
        cleanup({
            comments: 'none',
        }),
        transformCodeToESMPlugin(),
        copyStaticAssets(),
        !production &&
            serve({
                host: '0.0.0.0',
                port: 9999,
                contentBase: 'dist',
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                https: {
                    key: keyPEM,
                    cert: certificatePEM,
                },
            }),
        production && terser(),
    ],
    watch: {
        clearScreen: false,
    },
};

import { createServer, build } from 'vite';

async function main() {
  if (process.argv.includes('dev')) {
    const server = await createServer({
      configFile: 'vite.config.ts',
      mode: 'development',
    });
    await server.listen();
    server.printUrls();
    server.bindCLIShortcuts({ print: true });
  } else {
    await build({ configFile: 'vite.config.ts' });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

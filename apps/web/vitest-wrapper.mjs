import { startVitest } from 'vitest/node';

async function main() {
  const vitest = await startVitest('test', [], {
    watch: false,
  });
  await vitest?.close();
  if (vitest?.state?.errors?.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

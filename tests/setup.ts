export default async function globalSetup(): Promise<void> {
  const dbUrl = process.env['DATABASE_URL_TEST'];
  if (!dbUrl) {
    console.warn(
      'DATABASE_URL_TEST not set — integration tests will be skipped.',
    );
    return;
  }

  // Run migrations on the test database
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(
    'node',
    ['--import', 'tsx/esm', 'backend/src/db/migrate.ts'],
    {
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'inherit',
      cwd: process.cwd(),
    },
  );

  if (result.status !== 0) {
    throw new Error('Test database migration failed');
  }
}

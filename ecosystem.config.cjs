module.exports = {
  apps: [
    {
      name: 'next-app',
      script: 'pnpm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'websocket-server',
      script: 'pnpm',
      args: 'start:ws',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
module.exports = {
  apps: [
    {
      name: 'brinto-scraper',
      script: './dist/index.js',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 5000,
      time: true
    }
  ]
};

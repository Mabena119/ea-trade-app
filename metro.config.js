const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude API routes from mobile builds (they're only for web/server)
config.resolver.blacklistRE = /app\/api\/.*/;

module.exports = config;


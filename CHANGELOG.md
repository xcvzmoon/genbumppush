# Changelog

## v0.0.4

[compare changes](https://github.com/xcvzmoon/genbumppush/compare/v0.0.3...v0.0.4)

### 🚀 Enhancements

- **env:** Add GENBUMPPUSH_* preference helpers with legacy fallbacks ([968315a](https://github.com/xcvzmoon/genbumppush/commit/968315a))
- **config:** Load .env via c12 setupDotenv before release config ([8070104](https://github.com/xcvzmoon/genbumppush/commit/8070104))
- **github:** Prefer GENBUMPPUSH_* tokens, host, and repository ([333d79a](https://github.com/xcvzmoon/genbumppush/commit/333d79a))
- **gitlab:** Prefer GENBUMPPUSH_* tokens, host, and project ([36827d4](https://github.com/xcvzmoon/genbumppush/commit/36827d4))
- **skill:** Add project skill for genbumppush ([92d0ac4](https://github.com/xcvzmoon/genbumppush/commit/92d0ac4))

### 📖 Documentation

- Document .env loading and GENBUMPPUSH_* env fallbacks ([712ff1d](https://github.com/xcvzmoon/genbumppush/commit/712ff1d))
- Document package.json config key and secret boundaries ([eddbe95](https://github.com/xcvzmoon/genbumppush/commit/eddbe95))
- **api:** Add JSDoc for public exports with examples ([c78ebd0](https://github.com/xcvzmoon/genbumppush/commit/c78ebd0))

### 🏡 Chore

- **test:** Unset vitest reporters ([0e14e21](https://github.com/xcvzmoon/genbumppush/commit/0e14e21))

### ✅ Tests

- Cover .env loading and GENBUMPPUSH_* precedence over legacy vars ([e9d2158](https://github.com/xcvzmoon/genbumppush/commit/e9d2158))

### ❤️ Contributors

- Mon Albert Gamil ([@xcvzmoon](https://github.com/xcvzmoon))

## v0.0.3

[compare changes](https://github.com/xcvzmoon/genbumppush/compare/v0.0.2...v0.0.3)

### 🚀 Enhancements

- **github:** Create GitHub releases after atomic push with retry support ([08bce03](https://github.com/xcvzmoon/genbumppush/commit/08bce03))

### 🩹 Fixes

- **version-files:** Rewrite only top-level JSON and lockfile versions ([1dd1236](https://github.com/xcvzmoon/genbumppush/commit/1dd1236))
- **git:** Guard missing git binary and add provider fetch timeouts ([c94a214](https://github.com/xcvzmoon/genbumppush/commit/c94a214))

### 📖 Documentation

- Update npm badges ([8a780f6](https://github.com/xcvzmoon/genbumppush/commit/8a780f6))
- Update for clarity and consistency in installation and usage instructions ([a28d753](https://github.com/xcvzmoon/genbumppush/commit/a28d753))
- Document GitHub releases and provenance guidance ([914a5e5](https://github.com/xcvzmoon/genbumppush/commit/914a5e5))

### 🏡 Chore

- **test:** Enable verbose vitest reporters ([4e8fb26](https://github.com/xcvzmoon/genbumppush/commit/4e8fb26))

### 🤖 CI

- **publish:** Enable npm provenance for public releases ([f5d4a06](https://github.com/xcvzmoon/genbumppush/commit/f5d4a06))

### ❤️ Contributors

- Mon Albert Gamil ([@xcvzmoon](https://github.com/xcvzmoon))

## v0.0.2

[compare changes](https://github.com/xcvzmoon/genbumppush/compare/v0.0.1...v0.0.2)

### 🚀 Enhancements

- Add release configuration and versioning ([ce9fb20](https://github.com/xcvzmoon/genbumppush/commit/ce9fb20))
- Add version file adapters ([f312740](https://github.com/xcvzmoon/genbumppush/commit/f312740))
- Add Git and GitLab integrations ([a5c0aca](https://github.com/xcvzmoon/genbumppush/commit/a5c0aca))
- Add release command ([701bed3](https://github.com/xcvzmoon/genbumppush/commit/701bed3))

### 📖 Documentation

- Document release workflows ([490369a](https://github.com/xcvzmoon/genbumppush/commit/490369a))
- Add badges ([7d7fa42](https://github.com/xcvzmoon/genbumppush/commit/7d7fa42))

### 📦 Build

- Configure package metadata ([de5656a](https://github.com/xcvzmoon/genbumppush/commit/de5656a))

### 🏡 Chore

- Configure Vite tooling ([1bf5984](https://github.com/xcvzmoon/genbumppush/commit/1bf5984))

### ❤️ Contributors

- Mon Albert Gamil ([@xcvzmoon](https://github.com/xcvzmoon))

## v0.0.1

### 🏡 Chore

- Initialize repository ([b45fd1e](https://github.com/xcvzmoon/genbumppush/commit/b45fd1e))
- **github:** Add templates, actions, and workflows ([8b5714a](https://github.com/xcvzmoon/genbumppush/commit/8b5714a))

### ❤️ Contributors

- Mon Albert Gamil ([@xcvzmoon](https://github.com/xcvzmoon))

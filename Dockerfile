
# Use a specific supported Node.js major release.
#
# WHY: Developers/servers should run a consistent
# Node.js runtime, not an arbitrary machine-installed version.
#
# Debian-based image is chosen because this project uses
# native modules such as Argon2.
FROM node:24-bookworm-slim

# Application directory inside the container.
WORKDIR /app

# Copy dependency manifests first.
#
# WHY: Docker can reuse dependency installation layer
# if application source changes but package files do not.
COPY package.json package-lock.json ./

# npm ci installs exactly the lockfile versions.
#
# --omit=dev: install only runtime dependencies.
# WITHOUT LOCKFILE: Builds may resolve different versions.
RUN npm ci --omit=dev \
    && npm cache clean --force

# Copy application and supporting scripts.
#
# .dockerignore excludes secrets and local artifacts.
COPY . .

# Use the image's unprivileged Node.js user.
#
# WHY: Running app as root increases impact if
# the Node.js process gets compromised.
USER node

# Document the HTTP application port.
EXPOSE 5000

# API is the default process.
# Compose overrides this for migrations and worker.
CMD ["node", "src/server.js"]

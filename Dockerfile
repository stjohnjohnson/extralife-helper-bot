FROM node:24-alpine

WORKDIR /usr/src/app

# Change ownership of the work directory to the node user
RUN chown -R node:node /usr/src/app

# Switch to the node user
USER node

# Copy package files
COPY --chown=node:node package*.json ./

# Set NODE_ENV for the production runtime
ENV NODE_ENV=production

# Install exactly the locked production dependencies
RUN npm ci --omit=dev

# Copy application code
COPY --chown=node:node *.js .
COPY --chown=node:node src ./src
COPY --chown=node:node scripts/sa-rehearse.js ./scripts/sa-rehearse.js

# Writable persistent state, owned by the unprivileged runtime user
RUN mkdir -p data/stream-avatars

# Independent voice-overlay and optional Stream Avatars LAN ports
EXPOSE 3000 3001

# Start the application
CMD [ "npm", "start" ]

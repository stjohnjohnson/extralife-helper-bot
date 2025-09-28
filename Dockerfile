FROM node:24-alpine

WORKDIR /usr/src/app

# Change ownership of the work directory to the node user
RUN chown -R node:node /usr/src/app

# Switch to the node user
USER node

# Copy package files
COPY --chown=node:node package*.json ./

# Set NODE_ENV to production to skip devDependencies
ENV NODE_ENV=production

# Install dependencies
RUN npm install

# Copy application code
COPY --chown=node:node *.js .
COPY --chown=node:node src ./src

# Expose port for health checks if needed
EXPOSE 3000

# Start the application
CMD [ "npm", "start" ]

# Use modern Node.js base
FROM node:20-bookworm-slim

# Install system dependencies: python3, ffmpeg, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install the latest standalone yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Verify yt-dlp and ffmpeg
RUN yt-dlp --version && ffmpeg -version

# Set working directory
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Ensure downloads directory exists
RUN mkdir -p downloads && chmod 777 downloads

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]

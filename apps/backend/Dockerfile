FROM node:20-slim

# Install build tools for native sqlite3 package compilation
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./

RUN npm install --only=production

COPY . .

# Create the data directory for the SQLite database volume mount
RUN mkdir -p /data

EXPOSE 80

CMD ["npm", "start"]

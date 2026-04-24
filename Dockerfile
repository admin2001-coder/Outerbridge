FROM node:22

WORKDIR /usr/src/packages

COPY package.json ./
COPY packages/components/package.json ./packages/components/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/server/package.json ./packages/server/package.json

# Install deps but don't fail
RUN yarn --ignore-engines --ignore-optional || true

# Copy everything
COPY . .

# Ignore build errors
RUN yarn build || true

EXPOSE 3000

CMD [ "yarn", "start" ]

FROM node:22

WORKDIR /usr/src/packages

COPY package.json ./
COPY packages/components/package.json ./packages/components/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/server/package.json ./packages/server/package.json

# 🚨 DO NOT skip optional deps
RUN yarn install --ignore-engines || true

COPY . .

# still ignore build failures
RUN yarn build || true

EXPOSE 3000

CMD ["yarn", "dev"]

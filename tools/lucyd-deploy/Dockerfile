FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY app ./app
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["node", "app/main.cjs"]
CMD ["api"]

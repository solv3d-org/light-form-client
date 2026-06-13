SHELL := /bin/zsh

.PHONY: install dev dev-web dev-backend build preview check test shopify-audit-sample

install:
	npm install

dev:
	npm run dev

dev-web:
	npm run dev:web

dev-backend:
	npm run dev:backend

build:
	npm run build

preview:
	npm run preview

check:
	npm run check

test:
	npm test

shopify-audit-sample:
	npm run shopify:audit-sample

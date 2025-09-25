# ExtraLife Helper Bot Makefile

.PHONY: help install test test-watch test-coverage lint build run clean

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  %-15s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## Install dependencies
	npm install

test: ## Run tests
	npm test

test-watch: ## Run tests in watch mode
	npm run test:watch

test-coverage: ## Run tests with coverage
	npm run test:coverage

lint: ## Run linter
	npm run lint

build: ## Build Docker image
	docker build -t extralife-helper-bot .

run: ## Run the application in Docker
	docker run --rm -it --env-file .env extralife-helper-bot

clean: ## Remove node_modules
	rm -rf node_modules
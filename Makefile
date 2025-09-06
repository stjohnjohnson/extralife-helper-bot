# ExtraLife Helper Bot Makefile

.PHONY: install test lint build run clean

install: ## Install dependencies
	npm install

test: ## Run tests
	npm test

lint: ## Run linter
	npm run lint

build: ## Build Docker image
	docker build -t extralife-helper-bot .

run: ## Run the application in Docker
	docker run --rm -it --env-file .env extralife-helper-bot

clean: ## Remove node_modules
	rm -rf node_modules
COMPOSE := docker compose -f docker/compose.yaml

.PHONY: up down logs ps build build-images push-images clean reset-admin

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

build:
	$(COMPOSE) build

build-images:
	docker buildx bake -f docker/bake.hcl --load

push-images:
	docker buildx bake -f docker/bake.hcl --push

reset-admin:
	$(COMPOSE) exec backend npm run admin:reset

clean:
	$(COMPOSE) down -v

COMPOSE := docker compose -f docker/compose.yaml

.PHONY: up down logs ps build build-images push-images clean reset-admin \
        aio-build aio-push aio-run aio-stop

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

# ---- single-image (all-in-one) variant ----
# `aio-build` builds locally for the host arch only. For multi-arch + push,
# tag and use `aio-push` (set IMAGE=youruser/rag-kb:tag).
IMAGE ?= rag-kb:latest

# Reuse docker/.env (compose's env file) for aio-run when present, so the
# secrets that the compose stack already uses (POSTGRES_PASSWORD, JWT_SECRET)
# are pinned across both deployment shapes. When the file is missing, fall
# back to letting the container's init-env generate random secrets on first
# boot.
AIO_ENV_FILE ?= docker/.env
AIO_ENV_FLAG := $(if $(wildcard $(AIO_ENV_FILE)),--env-file $(AIO_ENV_FILE),)

aio-build:
	docker buildx build -f docker/all-in-one/Dockerfile -t $(IMAGE) --load .

aio-push:
	docker buildx build -f docker/all-in-one/Dockerfile -t $(IMAGE) \
	  --platform linux/amd64,linux/arm64 --push .

aio-run:
	docker run -d --name rag-kb -p 3000:3000 -v rag-data:/data $(AIO_ENV_FLAG) $(IMAGE)

aio-stop:
	-docker rm -f rag-kb

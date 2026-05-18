// docker buildx bake -f docker/bake.hcl                 # local single-arch
// docker buildx bake -f docker/bake.hcl --set *.platform=linux/amd64,linux/arm64 --push
// docker buildx bake -f docker/bake.hcl all-in-one      # only the single-image variant

group "default" {
  targets = ["backend", "frontend", "postgres"]
}

target "backend" {
  context    = "../backend"
  dockerfile = "Dockerfile"
  tags       = ["rag-backend:latest"]
  platforms  = ["linux/amd64", "linux/arm64"]
}

target "frontend" {
  context    = "../frontend"
  dockerfile = "Dockerfile"
  tags       = ["rag-frontend:latest"]
  platforms  = ["linux/amd64", "linux/arm64"]
}

target "postgres" {
  context    = "./postgres"
  dockerfile = "Dockerfile"
  tags       = ["rag-postgres-zhparser:latest"]
  platforms  = ["linux/amd64", "linux/arm64"]
}

// One-shot deployment image: PG + Qdrant + backend + frontend in a single
// container, orchestrated by s6-overlay. Build context is the repo root so
// it can pull in backend/, frontend/, and docker/postgres/init.sql.
target "all-in-one" {
  context    = ".."
  dockerfile = "docker/all-in-one/Dockerfile"
  tags       = ["rag-kb:latest"]
  platforms  = ["linux/amd64", "linux/arm64"]
}


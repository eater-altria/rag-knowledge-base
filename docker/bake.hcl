// docker buildx bake -f docker/bake.hcl                 # local single-arch
// docker buildx bake -f docker/bake.hcl --set *.platform=linux/amd64,linux/arm64 --push

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

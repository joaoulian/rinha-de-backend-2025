#!/bin/bash

# Script para fazer push das imagens Docker para o Docker Hub
# Uso: ./scripts/push-to-dockerhub.sh [DOCKER_USERNAME] [VERSION]

set -e

# Configurações
DOCKER_USERNAME=${1:-"joaoulian"}
VERSION=${2:-"latest"}
API_IMAGE_NAME="rinha-backend-2025-api"
MIGRATION_IMAGE_NAME="rinha-backend-2025-migration"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Iniciando push das imagens Docker para o Docker Hub${NC}"
echo -e "${YELLOW}Username: ${DOCKER_USERNAME}${NC}"
echo -e "${YELLOW}Version: ${VERSION}${NC}"
echo ""

# Verificar se o Docker está rodando
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker não está rodando. Inicie o Docker e tente novamente.${NC}"
    exit 1
fi

# Verificar se está logado no Docker Hub
if ! docker info | grep -q "Username"; then
    echo -e "${YELLOW}⚠️  Você não está logado no Docker Hub. Fazendo login...${NC}"
    docker login
fi

echo -e "${BLUE}📦 Construindo imagem da API...${NC}"
cd api
docker build -t ${DOCKER_USERNAME}/${API_IMAGE_NAME}:${VERSION} -f Dockerfile .
docker tag ${DOCKER_USERNAME}/${API_IMAGE_NAME}:${VERSION} ${DOCKER_USERNAME}/${API_IMAGE_NAME}:latest

echo -e "${BLUE}📦 Construindo imagem de migração...${NC}"
docker build -t ${DOCKER_USERNAME}/${MIGRATION_IMAGE_NAME}:${VERSION} -f Dockerfile.migration .
docker tag ${DOCKER_USERNAME}/${MIGRATION_IMAGE_NAME}:${VERSION} ${DOCKER_USERNAME}/${MIGRATION_IMAGE_NAME}:latest

echo -e "${BLUE}🚀 Fazendo push da imagem da API...${NC}"
docker push ${DOCKER_USERNAME}/${API_IMAGE_NAME}:${VERSION}
docker push ${DOCKER_USERNAME}/${API_IMAGE_NAME}:latest

echo -e "${BLUE}🚀 Fazendo push da imagem de migração...${NC}"
docker push ${DOCKER_USERNAME}/${MIGRATION_IMAGE_NAME}:${VERSION}
docker push ${DOCKER_USERNAME}/${MIGRATION_IMAGE_NAME}:latest

echo ""
echo -e "${GREEN}✅ Push concluído com sucesso!${NC}"
echo ""
echo -e "${YELLOW}📋 Imagens disponíveis no Docker Hub:${NC}"
echo -e "   • ${DOCKER_USERNAME}/${API_IMAGE_NAME}:${VERSION}"
echo -e "   • ${DOCKER_USERNAME}/${API_IMAGE_NAME}:latest"
echo -e "   • ${DOCKER_USERNAME}/${MIGRATION_IMAGE_NAME}:${VERSION}"
echo -e "   • ${DOCKER_USERNAME}/${MIGRATION_IMAGE_NAME}:latest"
echo ""
echo -e "${BLUE}🔗 Links do Docker Hub:${NC}"
echo -e "   • https://hub.docker.com/r/${DOCKER_USERNAME}/${API_IMAGE_NAME}"
echo -e "   • https://hub.docker.com/r/${DOCKER_USERNAME}/${MIGRATION_IMAGE_NAME}"
echo ""
echo -e "${YELLOW}💡 Para usar as imagens em produção, atualize o docker-compose.yml:${NC}"
echo -e "   image: ${DOCKER_USERNAME}/${API_IMAGE_NAME}:${VERSION}"
echo -e "   image: ${DOCKER_USERNAME}/${MIGRATION_IMAGE_NAME}:${VERSION}"

cd ..

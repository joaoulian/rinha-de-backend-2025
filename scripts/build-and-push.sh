#!/bin/bash

# Script avançado para build e push das imagens Docker
# Suporta multi-platform builds (AMD64 e ARM64)
# Uso: ./scripts/build-and-push.sh [OPTIONS]

set -e

# Configurações padrão
DOCKER_USERNAME="joaoulian"
VERSION="latest"
PLATFORMS="linux/amd64,linux/arm64"
PUSH=false
BUILD_CACHE=true
VERBOSE=false

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Função de ajuda
show_help() {
    echo "Script para build e push das imagens Docker da Rinha de Backend 2025"
    echo ""
    echo "Uso: $0 [OPTIONS]"
    echo ""
    echo "Opções:"
    echo "  -u, --username USERNAME    Username do Docker Hub (padrão: joaoulian)"
    echo "  -v, --version VERSION      Versão da imagem (padrão: latest)"
    echo "  -p, --platforms PLATFORMS  Plataformas para build (padrão: linux/amd64,linux/arm64)"
    echo "  --push                     Fazer push para Docker Hub"
    echo "  --no-cache                 Desabilitar cache do Docker"
    echo "  --verbose                  Output verboso"
    echo "  -h, --help                 Mostrar esta ajuda"
    echo ""
    echo "Exemplos:"
    echo "  $0 --push                                    # Build local e push"
    echo "  $0 -u myuser -v v1.0.0 --push              # Build com usuário e versão específicos"
    echo "  $0 -p linux/amd64 --push                   # Build apenas para AMD64"
    echo "  $0 --no-cache --verbose --push             # Build sem cache com output verboso"
}

# Parse dos argumentos
while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--username)
            DOCKER_USERNAME="$2"
            shift 2
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -p|--platforms)
            PLATFORMS="$2"
            shift 2
            ;;
        --push)
            PUSH=true
            shift
            ;;
        --no-cache)
            BUILD_CACHE=false
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Opção desconhecida: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Função de log
log() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${PURPLE}[DEBUG]${NC} $1"
    fi
}

# Verificações iniciais
echo -e "${BLUE}🔍 Verificando pré-requisitos...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker não está instalado${NC}"
    exit 1
fi

if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker não está rodando${NC}"
    exit 1
fi

# Verificar se buildx está disponível para multi-platform
if [[ "$PLATFORMS" == *","* ]]; then
    if ! docker buildx version > /dev/null 2>&1; then
        echo -e "${RED}❌ Docker Buildx não está disponível para multi-platform builds${NC}"
        exit 1
    fi
    
    # Criar builder se não existir
    if ! docker buildx inspect multiarch > /dev/null 2>&1; then
        echo -e "${YELLOW}⚙️  Criando builder multi-platform...${NC}"
        docker buildx create --name multiarch --use
    else
        docker buildx use multiarch
    fi
fi

# Verificar login se push estiver habilitado
if [[ "$PUSH" == "true" ]]; then
    if ! docker info | grep -q "Username"; then
        echo -e "${YELLOW}🔐 Fazendo login no Docker Hub...${NC}"
        docker login
    fi
fi

# Configurações das imagens
API_IMAGE="${DOCKER_USERNAME}/rinha-backend-2025-api"

# Opções de build
BUILD_OPTS=""
if [[ "$BUILD_CACHE" == "false" ]]; then
    BUILD_OPTS="$BUILD_OPTS --no-cache"
fi

if [[ "$PUSH" == "true" ]]; then
    BUILD_OPTS="$BUILD_OPTS --push"
else
    BUILD_OPTS="$BUILD_OPTS --load"
fi

echo -e "${BLUE}📋 Configurações do build:${NC}"
echo -e "   Username: ${YELLOW}${DOCKER_USERNAME}${NC}"
echo -e "   Version: ${YELLOW}${VERSION}${NC}"
echo -e "   Platforms: ${YELLOW}${PLATFORMS}${NC}"
echo -e "   Push: ${YELLOW}${PUSH}${NC}"
echo -e "   Cache: ${YELLOW}${BUILD_CACHE}${NC}"
echo ""

cd api

# Build da imagem da API
echo -e "${BLUE}🏗️  Construindo imagem da API...${NC}"
log "Comando: docker buildx build --platform ${PLATFORMS} -t ${API_IMAGE}:${VERSION} -t ${API_IMAGE}:latest ${BUILD_OPTS} -f Dockerfile ."

if [[ "$PLATFORMS" == *","* ]]; then
    docker buildx build \
        --platform "${PLATFORMS}" \
        -t "${API_IMAGE}:${VERSION}" \
        -t "${API_IMAGE}:latest" \
        ${BUILD_OPTS} \
        -f Dockerfile .
else
    docker build \
        -t "${API_IMAGE}:${VERSION}" \
        -t "${API_IMAGE}:latest" \
        ${BUILD_OPTS} \
        -f Dockerfile .
fi

cd ..

echo ""
if [[ "$PUSH" == "true" ]]; then
    echo -e "${GREEN}✅ Build e push concluídos com sucesso!${NC}"
    echo ""
    echo -e "${YELLOW}📋 Imagens disponíveis no Docker Hub:${NC}"
    echo -e "   • ${API_IMAGE}:${VERSION}"
    echo -e "   • ${API_IMAGE}:latest"
    echo ""
    echo -e "${BLUE}🔗 Links do Docker Hub:${NC}"
    echo -e "   • https://hub.docker.com/r/${DOCKER_USERNAME}/rinha-backend-2025-api"
else
    echo -e "${GREEN}✅ Build local concluído com sucesso!${NC}"
    echo ""
    echo -e "${YELLOW}📋 Imagens locais criadas:${NC}"
    echo -e "   • ${API_IMAGE}:${VERSION}"
    echo -e "   • ${API_IMAGE}:latest"
    echo ""
    echo -e "${BLUE}💡 Para fazer push, execute novamente com --push${NC}"
fi

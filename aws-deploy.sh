#!/bin/bash
# ============================================================
# Campus Reclaimed — AWS Deploy Script
# Builds Docker image, pushes to ECR, deploys to App Runner
# ============================================================
# Usage:
#   ./aws-deploy.sh                  # Full deploy (build + push + deploy)
#   ./aws-deploy.sh build            # Build only
#   ./aws-deploy.sh push             # Build + push to ECR
#   ./aws-deploy.sh setup            # First-time setup (create ECR repo + App Runner)
# ============================================================

set -e  # Exit on any error

# ── Configuration (edit these) ──
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID="842675982987"          # Your 12-digit AWS account ID
ECR_REPO="campus-reclaimed"
APP_NAME="campus-reclaimed"
IMAGE_TAG="latest"

# Supabase credentials (used at build time, baked into the static bundle)
VITE_SUPABASE_URL="https://vkfzeojkxfuehgtwysrn.supabase.co"       # e.g. https://abcdefg.supabase.co
VITE_SUPABASE_ANON_KEY="sb_publishable_ZoARqee3HYppzqjsUsycmg_7vWA03BC"  # Your anon/public key

# ── Derived values ──
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
FULL_IMAGE="${ECR_URI}/${ECR_REPO}:${IMAGE_TAG}"

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }
info() { echo -e "${BLUE}→${NC} $1"; }

# ── Validate config ──
validate_config() {
  if [ -z "$AWS_ACCOUNT_ID" ]; then
    # Try to auto-detect
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)
    if [ -z "$AWS_ACCOUNT_ID" ]; then
      err "AWS_ACCOUNT_ID is not set and could not be auto-detected.\n  Run: aws sts get-caller-identity\n  Then set AWS_ACCOUNT_ID in this script."
    fi
    ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    FULL_IMAGE="${ECR_URI}/${ECR_REPO}:${IMAGE_TAG}"
    log "Auto-detected AWS Account ID: ${AWS_ACCOUNT_ID}"
  fi

  if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
    # Try to read from .env file
    if [ -f .env ]; then
      source <(grep -v '^#' .env | sed 's/^/export /')
      log "Loaded Supabase credentials from .env"
    else
      err "Supabase credentials not set. Either:\n  1. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in this script\n  2. Create a .env file with these values"
    fi
  fi
}

# ── ECR Login ──
ecr_login() {
  info "Logging into ECR..."
  aws ecr get-login-password --region ${AWS_REGION} | \
    docker login --username AWS --password-stdin ${ECR_URI}
  log "ECR login successful"
}

# ── Build ──
build() {
  info "Building Docker image..."
  docker build --no-cache \
    --build-arg VITE_SUPABASE_URL="${VITE_SUPABASE_URL}" \
    --build-arg VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY}" \
    --platform linux/amd64 \
    -t ${ECR_REPO}:${IMAGE_TAG} \
    .
  log "Docker image built: ${ECR_REPO}:${IMAGE_TAG}"
}

# ── Push ──
push() {
  ecr_login
  info "Tagging image for ECR..."
  docker tag ${ECR_REPO}:${IMAGE_TAG} ${FULL_IMAGE}
  info "Pushing to ECR..."
  docker push ${FULL_IMAGE}
  log "Image pushed: ${FULL_IMAGE}"
}

# ── First-time setup ──
setup() {
  validate_config

  echo ""
  echo "═══════════════════════════════════════════"
  echo "  Campus Reclaimed — AWS First-Time Setup"
  echo "═══════════════════════════════════════════"
  echo ""

  # 1. Create ECR repository
  info "Creating ECR repository: ${ECR_REPO}..."
  aws ecr create-repository \
    --repository-name ${ECR_REPO} \
    --region ${AWS_REGION} \
    --image-scanning-configuration scanOnPush=true \
    2>/dev/null && log "ECR repository created" || warn "ECR repository already exists"

  # 2. Build and push the image
  build
  push

  # 3. Create App Runner service
  info "Creating App Runner service: ${APP_NAME}..."

  # Create the App Runner access role for ECR (if it doesn't exist)
  ROLE_ARN=$(aws iam get-role --role-name AppRunnerECRAccessRole --query 'Role.Arn' --output text 2>/dev/null || true)

  if [ -z "$ROLE_ARN" ]; then
    info "Creating AppRunnerECRAccessRole..."

    aws iam create-role \
      --role-name AppRunnerECRAccessRole \
      --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [{
          "Effect": "Allow",
          "Principal": {"Service": "build.apprunner.amazonaws.com"},
          "Action": "sts:AssumeRole"
        }]
      }'

    aws iam attach-role-policy \
      --role-name AppRunnerECRAccessRole \
      --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess

    ROLE_ARN=$(aws iam get-role --role-name AppRunnerECRAccessRole --query 'Role.Arn' --output text)

    # Wait for role propagation
    info "Waiting for IAM role to propagate..."
    sleep 10
  fi

  log "Using role: ${ROLE_ARN}"

  # Create the App Runner service
  aws apprunner create-service \
    --service-name ${APP_NAME} \
    --region ${AWS_REGION} \
    --source-configuration "{
      \"AuthenticationConfiguration\": {
        \"AccessRoleArn\": \"${ROLE_ARN}\"
      },
      \"AutoDeploymentsEnabled\": true,
      \"ImageRepository\": {
        \"ImageIdentifier\": \"${FULL_IMAGE}\",
        \"ImageRepositoryType\": \"ECR\",
        \"ImageConfiguration\": {
          \"Port\": \"8080\"
        }
      }
    }" \
    --instance-configuration "{
      \"Cpu\": \"0.25 vCPU\",
      \"Memory\": \"0.5 GB\"
    }" \
    --health-check-configuration "{
      \"Protocol\": \"HTTP\",
      \"Path\": \"/health\",
      \"Interval\": 10,
      \"Timeout\": 5,
      \"HealthyThreshold\": 1,
      \"UnhealthyThreshold\": 5
    }"

  echo ""
  log "App Runner service created!"
  echo ""
  info "It takes 2-3 minutes for the service to start."
  info "Check status with:"
  echo "  aws apprunner list-services --region ${AWS_REGION}"
  echo ""
  info "Get your URL with:"
  echo "  aws apprunner describe-service --service-arn \$(aws apprunner list-services --region ${AWS_REGION} --query 'ServiceSummaryList[?ServiceName==\`${APP_NAME}\`].ServiceArn' --output text) --query 'Service.ServiceUrl' --output text"
  echo ""
}

# ── Deploy (update existing service) ──
deploy() {
  validate_config
  build
  push

  echo ""
  info "Image pushed. App Runner auto-deploy is enabled."
  info "The service will pick up the new image automatically within 1-2 minutes."
  echo ""

  # Get the service URL
  SERVICE_ARN=$(aws apprunner list-services \
    --region ${AWS_REGION} \
    --query "ServiceSummaryList[?ServiceName==\`${APP_NAME}\`].ServiceArn" \
    --output text 2>/dev/null)

  if [ -n "$SERVICE_ARN" ]; then
    SERVICE_URL=$(aws apprunner describe-service \
      --service-arn ${SERVICE_ARN} \
      --query 'Service.ServiceUrl' \
      --output text)
    log "Your app: https://${SERVICE_URL}"
  fi
}

# ── Main ──
case "${1:-deploy}" in
  setup)
    setup
    ;;
  build)
    validate_config
    build
    ;;
  push)
    validate_config
    build
    push
    ;;
  deploy|"")
    deploy
    ;;
  *)
    echo "Usage: $0 {setup|build|push|deploy}"
    echo ""
    echo "  setup   First-time: create ECR repo + App Runner service"
    echo "  build   Build Docker image only"
    echo "  push    Build + push to ECR"
    echo "  deploy  Build + push + trigger App Runner update (default)"
    exit 1
    ;;
esac

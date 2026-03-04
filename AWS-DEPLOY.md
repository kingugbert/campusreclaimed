# Campus Reclaimed — AWS Deployment Guide

Deploy the app as a Docker container on AWS using ECR (container registry) and App Runner (managed hosting).

---

## Architecture

```
┌──────────────┐     docker push     ┌──────────────┐     auto-deploy    ┌──────────────────┐
│  Your Mac    │ ──────────────────▶ │  Amazon ECR  │ ──────────────────▶│  AWS App Runner   │
│  (build)     │                     │  (registry)  │                    │  (hosting)        │
└──────────────┘                     └──────────────┘                    │  campus-reclaimed │
                                                                        │  .awsapprunner.com│
                                                                        └──────────────────┘
```

The Docker image uses a multi-stage build:
1. **Build stage** — Node 20 compiles the React app with Vite
2. **Serve stage** — Nginx Alpine serves the static files (~25MB final image)

---

## Prerequisites

### Install Docker Desktop
Download from https://www.docker.com/products/docker-desktop/ and install. Make sure Docker is running (whale icon in your menu bar).

### Install AWS CLI
```bash
brew install awscli
```

### Configure AWS credentials
```bash
aws configure
```
Enter your Access Key ID, Secret Access Key, and region (`us-east-1`).

If you don't have AWS credentials yet:
1. Go to AWS Console → IAM → Users → Create User
2. Attach the `AdministratorAccess` policy (or more restrictive — see Security section)
3. Create an access key under Security Credentials

Verify it works:
```bash
aws sts get-caller-identity
```

---

## Quick Start (First-Time Deploy)

### 1. Edit the deploy script

Open `aws-deploy.sh` and fill in your Supabase credentials:

```bash
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key-here"
```

The script auto-detects your AWS Account ID, but you can hardcode it too if you prefer.

### 2. Make it executable

```bash
chmod +x aws-deploy.sh
```

### 3. Run first-time setup

```bash
./aws-deploy.sh setup
```

This single command does everything:
- Creates an ECR repository for your Docker images
- Builds the Docker image (React build + nginx)
- Pushes it to ECR
- Creates an IAM role for App Runner to pull from ECR
- Creates an App Runner service with health checks
- Enables auto-deploy (future pushes are picked up automatically)

### 4. Wait ~2 minutes

App Runner provisions the service. Check status:

```bash
aws apprunner list-services --region us-east-1
```

Get your live URL:

```bash
aws apprunner describe-service \
  --service-arn $(aws apprunner list-services --region us-east-1 \
    --query 'ServiceSummaryList[?ServiceName==`campus-reclaimed`].ServiceArn' \
    --output text) \
  --query 'Service.ServiceUrl' --output text
```

Your app will be live at `https://xxxxxxxx.us-east-1.awsapprunner.com`

---

## Subsequent Deploys

After the first-time setup, deploying updates is one command:

```bash
./aws-deploy.sh
```

This builds a fresh Docker image, pushes it to ECR, and App Runner automatically picks up the new image within 1-2 minutes. No downtime.

---

## What Each Command Does

| Command | What it does |
|---------|-------------|
| `./aws-deploy.sh setup` | First-time: creates ECR repo + App Runner service |
| `./aws-deploy.sh` | Default: build + push + auto-deploy |
| `./aws-deploy.sh build` | Build the Docker image locally only |
| `./aws-deploy.sh push` | Build + push to ECR (no App Runner update) |

---

## Testing Locally with Docker

Before pushing to AWS, test the container on your Mac:

```bash
# Build
docker build \
  --build-arg VITE_SUPABASE_URL="https://your-project.supabase.co" \
  --build-arg VITE_SUPABASE_ANON_KEY="your-key" \
  -t campus-reclaimed .

# Run
docker run -p 8080:8080 campus-reclaimed
```

Open http://localhost:8080 — should look identical to `npm run dev`.

---

## Custom Domain (Optional)

App Runner supports custom domains:

```bash
aws apprunner associate-custom-domain \
  --service-arn YOUR_SERVICE_ARN \
  --domain-name campusreclaimed.yourdomain.com \
  --region us-east-1
```

App Runner provides the DNS records you need to add to your domain registrar. It also provisions a free SSL certificate automatically.

---

## Cost Estimate

App Runner charges for active instances and pauses when idle:

| Resource | Cost |
|----------|------|
| **App Runner** (0.25 vCPU, 0.5 GB) | ~$5/month when active, auto-pauses when idle |
| **ECR** (image storage) | ~$0.10/month for a few images |
| **Data transfer** | First 1 GB/month free |

**Total: roughly $5-7/month** for a low-traffic app. Much less if traffic is sporadic since App Runner pauses inactive services.

---

## File Summary

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: Node 20 → nginx Alpine |
| `nginx.conf` | Serves SPA with gzip, caching, health check endpoint |
| `.dockerignore` | Keeps node_modules, .git, .env out of the image |
| `aws-deploy.sh` | One-command build/push/deploy automation |

---

## Troubleshooting

**"Unable to locate credentials"**
```bash
aws configure
# Enter your access key, secret key, and region
```

**"no basic auth credentials" on docker push**
```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
```

**App Runner shows FAILED status**
Check the service logs:
```bash
aws apprunner describe-service \
  --service-arn YOUR_SERVICE_ARN \
  --query 'Service.Status'
```

Common causes: port mismatch (must be 8080), health check failing, image not found in ECR.

**Docker build fails on M1/M2 Mac**
The deploy script includes `--platform linux/amd64` to ensure the image works on App Runner. If you get build errors, make sure Docker Desktop has Rosetta emulation enabled (Settings → General → Use Rosetta).

**"repository does not exist" on push**
Run `./aws-deploy.sh setup` first to create the ECR repository.

---

## Minimal IAM Policy

If you don't want to use `AdministratorAccess`, here are the specific permissions needed:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:CreateRepository",
        "ecr:DescribeRepositories",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:BatchGetImage"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "apprunner:CreateService",
        "apprunner:DescribeService",
        "apprunner:ListServices",
        "apprunner:UpdateService",
        "apprunner:DeleteService",
        "apprunner:AssociateCustomDomain"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:GetRole",
        "iam:AttachRolePolicy",
        "iam:PassRole"
      ],
      "Resource": "arn:aws:iam::*:role/AppRunnerECRAccessRole"
    }
  ]
}
```

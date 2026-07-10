# Devops Homelab Playground

## Description

This repo aims to provide a self-hosted environment provided by Virt-Manager. It includes a Docker Swarm cluster where the Manager node has access to the world and receives all external traffic via Traefik as a Reverse Proxy.

Our application stack runs on the private Worker node (`.130`), which is isolated from external access and can only receive traffic routed through Traefik on the Manager (`.138`) via a secure overlay network.

---

## Tech Stack

### Infrastructure (Virt-Manager)
- **Manager Node:** Ubuntu 24.04 Server (`192.168.122.138`)
- **Worker Node:** Ubuntu 24.04 Server (`192.168.122.130`)

### Core & Orchestration
- **Docker & Docker Swarm** (Containerization & Clustering)
- **Traefik v3** (Reverse Proxy & HTTPS Redirection)
- **Portainer CE** (GitOps engine and cluster dashboard)

### Observability Stack
- **Prometheus** (Metrics scraper)
- **Grafana** (Dashboards UI)
- **Loki** (Log aggregator)
- **Tempo** (Distributed tracing timeline)
- **OpenTelemetry** (Auto-instrumented Node.js backend)

### Provisioning
- **Ansible** (Configuration Management)

---

## Playbook Structure & Tags

The main playbook [ansible/playbooks/site.yml](file:///home/bryan-galaxy-zos/Programming/devops-homelab-playground/ansible/playbooks/site.yml) is structured semantically into separate play blocks. You can run individual components using tags:

```bash
# Run the entire provisioning pipeline
ansible-playbook playbooks/site.yml

# Or run specific layers using tags:
ansible-playbook playbooks/site.yml --tags "common"      # Initial upgrades
ansible-playbook playbooks/site.yml --tags "docker"      # Docker installation
ansible-playbook playbooks/site.yml --tags "swarm"       # Clustering managers & workers
ansible-playbook playbooks/site.yml --tags "traefik"     # Traefik stack deployment
ansible-playbook playbooks/site.yml --tags "portainer"   # Portainer stack deployment
```

---

## Portainer - GitOps Engine

Portainer CE is automatically deployed on the Manager node to act as our GitOps engine.

### Accessing Portainer
* **URL (Direct HTTPS):** `https://192.168.122.138:9443`
* **URL (Direct HTTP):** `http://192.168.122.138:9000`
* **Username:** `admin`
* **Password:** `admin123456789`

### Creating Stacks via GitOps
To deploy and automatically track your applications:
1. In Portainer, go to **Stacks** -> **Add Stack**.
2. Select **Repository** as the build method.
3. Git Repository URL: `https://github.com/EoBryanDev/devops-homelab-playground.git`
4. Compose path: `server/applications/frontend/docker-compose.yml` (for Frontend) or `server/applications/backend/docker-compose.yml` (for Backend).
5. Enable **Automatic updates** (Git polling) to make Portainer pull and update the services automatically on changes.

> [!IMPORTANT]
> **GitOps Polling Tip (Unique Tags vs Latest):** 
> If your compose file targets `image: ...:latest`, the file content in Git never changes when you update the image. Therefore, Portainer's Git polling will see no changes and **will not trigger a rollout**. 
> Always use **unique tags** (like version `v1.0.1` or the git commit SHA) in your compose files, commit and push to Git. Portainer will detect the modified tag and deploy the updated container.

---

## Observability Stack

The monitoring tools are located in the [server/observability/](file:///home/bryan-galaxy-zos/Programming/devops-homelab-playground/server/observability) directory and run strictly on the Manager node.

### Deploying the Observability Stack
Deploy it directly on the Manager node:
```bash
docker stack deploy -c server/observability/docker-compose.yml monitoring
```

### Accessing Grafana
* **URL (Secure HTTPS):** `https://192.168.122.138/grafana/`
* **Authentication:** Anonymous login is pre-enabled. You will enter directly as **Admin**.
* **Querying Telemetry:** 
  * Open the **Explore** tab.
  * Select **Prometheus** to view metrics (e.g. searching for `http_requests_total`).
  * Select **Loki** to view aggregated container logs.
  * Select **Tempo** to inspect end-to-end tracing timelines showing Express request flows and SQLite query timings instrumented via **OpenTelemetry**.

---

## Applications Stack

The applications reside in the [apps/](file:///home/bryan-galaxy-zos/Programming/devops-homelab-playground/apps) folder and execute on the Worker node:

### 1. Build and Publish Images (on your host machine)
Build and push the images containing your code changes to DockerHub:
```bash
# Build & Push Frontend (Nginx static serving container ID in headers)
docker build -t eobryandev/homelab-frontend:latest ./apps/frontend
docker push eobryandev/homelab-frontend:latest

# Build & Push Backend (Node.js with OpenTelemetry auto-instrumentation)
docker build -t eobryandev/homelab-backend:latest ./apps/backend
docker push eobryandev/homelab-backend:latest
```

### 2. Live URLs
Once running, Traefik routes them securely:
* **Frontend UI:** `https://192.168.122.138/`
* **Backend API:** `https://192.168.122.138/api/users`

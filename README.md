# Devops Homelab Playground

## Description

This repo aims to provide a self-hosted enviroment provided by Virt-Manager. It'll includes a cluster docker swarm where the master node has access to world and will receive all the external traffic via Traefik as a Reverse Proxy.

My applications will be deployed on worker nodes. This nodes only will be able to be accessed by master node and from inside the node to network will be open.

All the OS settings and boilerplate app settins will be provided by Ansible from the host machine via SSH.

## Tech Stack

### Infrastructure (Virt-Manager)
- Ubuntu 24.04 Server (1x Manager Node)
- Ubuntu 24.04 Server (1x Worker Node)

### Core Software
- Docker (Containerization)
- Docker Swarm (Container Orchestration)
- Traefik (Reverse Proxy)

### Provisioning
- Ansible (Configuration Management)

## Step-By-Step

### 1. SSH Key Generation
Generate a dedicated SSH key pair on your host machine to connect to the homelab VMs without mixing them with your main credentials:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_homelab -C "homelab-key"
```

### 2. Configure Variables and Inventory
Define your virtual machine IPs in [ansible/inventory.ini](file:///home/bryan-galaxy-zos/Programming/devops-homelab-playground/ansible/inventory.ini). The connection details and final service users are configured cleanly in the [ansible/group_vars/](file:///home/bryan-galaxy-zos/Programming/devops-homelab-playground/ansible/group_vars/) directory.

### 3. Bootstrap Service Users
Run the bootstrap playbook to create the service users, set up passwordless `sudo` escalation, and deploy the authorized SSH keys.

This step runs using your initial/temporary VM credentials (using `-k` and `-K` to prompt for SSH and sudo passwords):
```bash
cd ansible
ansible-playbook bootstrap.yml -k -K
```

### 4. Run Provisioning Playbook
Once the bootstrap is complete, you can provision the VMs (update package lists, upgrade system packages, and install Docker) using the service accounts silently, without passwords:
```bash
ansible-playbook playbooks/site.yml
```

## Accessing the Traefik Dashboard
The Traefik dashboard is exposed securely over HTTPS (port `443`) on the Manager node and is routed via Traefik itself. 

There is a global redirection in place, so typing an `http://` URL will automatically redirect you to `https://`. Since it uses a self-signed certificate, your browser will show a security warning—you can safely bypass it to access the dashboard.

Visit:
```text
https://<MANAGER_IP>/dashboard/
```
*(For example: `https://192.168.122.138/dashboard/`. Don't forget the trailing slash `/`!)*

## Deploying the Applications Stack

This repository contains two custom applications located in the [apps/](file:///home/bryan-galaxy-zos/Programming/devops-homelab-playground/apps) directory:
* **Frontend:** A Vanilla JS frontend UI served via Nginx.
* **Backend:** A Node.js Express REST API storing persistent data in an SQLite database.

### 1. Build and Publish Images to DockerHub
Build and push the Docker images to your public DockerHub registry (replace `eobryandev` with your actual username if different):
```bash
# Build & Push Frontend
docker build -t eobryandev/homelab-frontend:latest ./apps/frontend
docker push eobryandev/homelab-frontend:latest

# Build & Push Backend
docker build -t eobryandev/homelab-backend:latest ./apps/backend
docker push eobryandev/homelab-backend:latest
```

### 2. Deploy the Applications Stack (GitOps Flow)
Since your Manager VM has access to this Git repository, you can deploy the applications directly from the repository directory on the Manager VM:
```bash
# Deploy Frontend Stack
docker stack deploy -c server/applications/frontend/docker-compose.yml frontend

# Deploy Backend Stack
docker stack deploy -c server/applications/backend/docker-compose.yml backend
```

Once the stacks are successfully deployed:
* **Frontend UI (Secure HTTPS):** Access `https://<MANAGER_IP>/` to see the dashboard and manage users.
* **Backend API:** Direct API calls can be made to `https://<MANAGER_IP>/api/users`.
* **Database Persistence:** The SQLite database is securely saved on a named Swarm volume (`sqlite-data`) on the worker node.






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
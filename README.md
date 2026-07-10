# DevOps Homelab Playground

Self-hosted Docker Swarm cluster com observabilidade completa (métricas, logs, tracing), GitOps via Portainer e proxy reverso Traefik — tudo rodando em VMs Virt-Manager/Proxmox.

---

## Sumário

1. [Arquitetura](#1-arquitetura)
2. [Stack Tecnológica](#2-stack-tecnológica)
3. [Provisionamento da Infraestrutura (Proxmox/Virt-Manager)](#3-provisionamento-da-infraestrutura)
4. [Provisionamento via Ansible](#4-provisionamento-via-ansible)
5. [Docker Swarm — Cluster Multi-Node](#5-docker-swarm)
6. [Traefik — Proxy Reverso](#6-traefik)
7. [Portainer — GitOps Engine](#7-portainer)
8. [Observability Stack](#8-observability-stack)
9. [Application Stack](#9-application-stack)
10. [Como Adicionar um Novo Nó](#10-como-adicionar-um-novo-nó)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Arquitetura

```
Internet
    │
    ▼
┌──────────────────────────────────────┐
│  Manager Node (.138)                 │
│  ┌──────────┐  ┌──────────────────┐  │
│  │ Traefik  │  │  Monitoring      │  │
│  │ (HTTPS)  │  │  Grafana         │  │
│  │          │  │  Prometheus      │  │
│  │          │  │  Loki            │  │
│  │          │  │  Tempo           │  │
│  └────┬─────┘  └──────────────────┘  │
│       │ overlay network              │
└───────┼──────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│  Worker Node (.130)                  │
│  ┌──────────────┐  ┌──────────────┐  │
│  │  Frontend    │  │  Backend     │  │
│  │  (Nginx)     │  │  (Node.js)   │  │
│  │  2 réplicas  │  │  1 réplica   │  │
│  └──────────────┘  └──────────────┘  │
│  ┌──────────────────────────────────┐ │
│  │  Portainer Agent  │  Promtail    │ │
│  │  Node Exporter                    │ │
│  └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

- **Manager (`192.168.122.138`):** Exposto pra internet, executa Traefik + todo o monitoring stack
- **Worker (`192.168.122.130`):** Isolado, executa as aplicações (frontend/backend)
- Todo tráfego entre nós passa pela rede overlay `public-overlay`
- Aplicações nunca expõem porta direta — só Traefik tem porta publicada (80/443)

### URLs Públicas

| URL | Serviço | Acesso |
|-----|---------|--------|
| `https://192.168.122.138/` | Traefik Dashboard | |
| `https://192.168.122.138/grafana/` | Grafana | Admin (anon) |
| `https://192.168.122.138/portainer/` | Portainer | admin/admin123456789 |
| `https://192.168.122.138/frontend/` | Frontend UI | |
| `https://192.168.122.138/backend/api/users` | Backend API | |

---

## 2. Stack Tecnológica

| Categoria | Tecnologia | Função |
|-----------|-----------|--------|
| Infra | Ubuntu 24.04 Server + Proxmox/Virt-Manager | VMs |
| Orquestração | Docker Swarm (Engine 29+) | Cluster multi-nó |
| Proxy | Traefik v3 | Reverse proxy, TLS, roteamento por subpath |
| GitOps | Portainer CE 2.21 | Stacks com Git polling |
| Metrics | Prometheus + Node Exporter | Coleta de métricas do sistema e da aplicação |
| Logs | Promtail → Loki | Coleta e agregação de logs dos containers |
| Tracing | OpenTelemetry → Tempo | Tracing distribuído (backend Node.js) |
| Dashboard | Grafana | Painéis de observabilidade |
| Frontend | Nginx (estático) | 2 réplicas |
| Backend | Node.js + Express + SQLite | 1 réplica, auto-instrumentado com OTel |
| Provisioning | Ansible | Setup automatizado dos nós |

---

## 3. Provisionamento da Infraestrutura

### 3.1 Criar as VMs (Proxmox ou Virt-Manager)

```bash
# Manager (192.168.122.138)
os: ubuntu-24.04-server
cpu: 2 cores
ram: 4GB
disk: 8GB+

# Worker (192.168.122.130)
os: ubuntu-24.04-server
cpu: 2 cores
ram: 4GB
disk: 8GB+
```

### 3.2 Configuração de Rede

Manager precisa de IP fixo e acesso à internet. Worker precisa de IP fixo na mesma rede.

Ambos precisam de um usuário sudo (ex: `ansible-ubuntu-manager`) com chave SSH para o Ansible.

### 3.3 Expandir Disco (se necessário)

Pelo console do Proxmox/Virt-Manager, aumentar o disco da VM, depois dentro do sistema:

```bash
sudo lvextend -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
sudo resize2fs /dev/mapper/ubuntu--vg-ubuntu--lv
```

---

## 4. Provisionamento via Ansible

### 4.1 Pré-requisitos

```bash
# No host de controle (sua máquina)
ansible-galaxy collection install ansible.posix community.general
```

### 4.2 Inventário

```ini
# ansible/inventory/hosts.ini
[managers]
192.168.122.138

[workers]
192.168.122.130
```

### 4.3 Executar

```bash
# Provisionamento completo
ansible-playbook ansible/playbooks/site.yml

# Ou por camadas
ansible-playbook ansible/playbooks/site.yml --tags "common"      # System updates, pacotes base
ansible-playbook ansible/playbooks/site.yml --tags "docker"      # Instala Docker Engine
ansible-playbook ansible/playbooks/site.yml --tags "swarm"       # Inicializa Swarm, join workers
ansible-playbook ansible/playbooks/site.yml --tags "traefik"     # Deploy Traefik + certificado TLS
ansible-playbook ansible/playbooks/site.yml --tags "portainer"   # Deploy Portainer + Agent
```

### 4.4 O que cada role faz

| Role | O que instala/configura |
|------|------------------------|
| `common` | `apt update/upgrade`, pacotes básicos (`curl`, `git`, `python3`, `openssl`) |
| `docker` | Docker Engine via script oficial, usuário no grupo `docker` |
| `swarm` | `docker swarm init` no manager, `docker swarm join` nos workers |
| `traefik` | Cria rede `public-overlay`, gera certificado TLS auto-assinado, deploy do Traefik |
| `portainer` | Deploy do Portainer + Portainer Agent (global em todos os nós) |

---

## 5. Docker Swarm

### 5.1 Estrutura do Cluster

```bash
docker node ls
ID                            HOSTNAME                 STATUS    AVAILABILITY   MANAGER STATUS
gyeu55i679ofioqbitix49u77 *   bryan-ubuntu-manager     Ready     Active         Leader
pp5w8vpr9zqjfuo5sxuimyhg6     bryan-ubuntu-worker1     Ready     Active
```

### 5.2 Rede Overlay

```bash
docker network create -d overlay --attachable public-overlay
```

Essa rede é usada por TODOS os stacks (Traefik, Portainer, Monitoring, Aplicações).

### 5.3 Convenção de Nomes

Docker Swarm prefixa serviços com o nome do stack: `stackname_servicename`. Para evitar redundância (`frontend_frontend`, `backend_backend`), os serviços nos compose files usam nomes curtos:

| Stack | Compose service | Nome final no Swarm |
|-------|----------------|---------------------|
| `frontend` | `web` | `frontend_web` |
| `backend` | `api` | `backend_api` |

### 5.4 Constraints

- **Manager:** Monitoring stack, Traefik, Portainer (serviços de infraestrutura)
- **Worker:** Aplicações (frontend, backend)

```yaml
deploy:
  placement:
    constraints:
      - node.role == worker   # ou manager
```

---

## 6. Traefik

### 6.1 Deploy

```bash
docker stack deploy -c ~/applications/webserver/docker-compose.yml webserver
```

### 6.2 Roteamento por Subpath

Todas as rotas usam o padrão `PathPrefix` + `StripPrefix` para servir diferentes aplicações no mesmo domínio:

```yaml
labels:
  - "traefik.http.routers.api.rule=PathPrefix(`/backend`)"
  - "traefik.http.middlewares.api-strip.stripprefix.prefixes=/backend"
  - "traefik.http.routers.api.middlewares=api-strip"
  - "traefik.http.services.api.loadbalancer.server.port=80"
```

Isso faz com que:
1. Traefik recebe `/backend/api/users`
2. StripPrefix remove `/backend`
3. Container recebe `/api/users` na porta 80

### 6.3 Entrypoints

| Entrypoint | Porta | TLS |
|-----------|-------|-----|
| `web` | 80 | Redirect to HTTPS |
| `websecure` | 443 | Self-signed cert |

### 6.4 Rotas Registradas

| Rota | Serviço | Porta alvo |
|------|---------|-----------|
| `/dashboard` | `api@internal` (Traefik) | - |
| `/api` | `api@internal` (Traefik) | - |
| `/frontend` | `web` (Nginx) | 80 |
| `/backend` | `api` (Node.js) | 80 |
| `/grafana` | `grafana` | 3000 |
| `/portainer` | `portainer` | 9000 |

---

## 7. Portainer

### 7.1 Deploy

Feito pelo Ansible, template em `ansible/roles/portainer/templates/docker-compose.yml.j2`.

### 7.2 Acesso

```bash
# Via Traefik (HTTPS)
https://192.168.122.138/portainer/

# Direto (Portainer nativo)
https://192.168.122.138:9443

# Credenciais
User: admin
Pass: admin123456789
```

### 7.3 GitOps com Polling

Para usar Portainer como GitOps engine:

1. **Stacks → Add Stack → Repository**
2. URL: `https://github.com/EoBryanDev/devops-homelab-playground.git`
3. Compose path: `server/applications/frontend/docker-compose.yml` (ou `backend/docker-compose.yml`)
4. **Enable "Automatic updates"** com Git polling

> ⚠️ **IMPORTANTE — Unique Tags vs `:latest`:**
> O Portainer compara o conteúdo do arquivo YAML no Git. Se sua imagem usa `:latest`, o arquivo YAML nunca muda (o texto `:latest` continua o mesmo) — então o Portainer **não dispara rollout** quando você sobe uma imagem nova.
>
> **Solução:** Sempre use tags únicas (SHA do commit ou version number):
> ```yaml
> image: eobryandev/homelab-backend:ee4f228   # commit SHA
> ```

### 7.4 Portainer Agent

O agent roda em **modo global** (`mode: global`) em todos os nós do Swarm. Ele permite que o Portainer gerencie containers em qualquer nó.

---

## 8. Observability Stack

O stack de monitoramento roda no **Manager** (constraint `node.role == manager`), exceto Promtail e Node Exporter que rodam em **modo global** em todos os nós.

### 8.1 Deploy

```bash
docker stack deploy -c server/observability/docker-compose.yml monitoring
```

### 8.2 Componentes

| Serviço | Réplicas | Função |
|---------|----------|--------|
| `monitoring_prometheus` | 1 | Métricas e alertas |
| `monitoring_grafana` | 1 | Dashboard |
| `monitoring_loki` | 1 | Logs |
| `monitoring_tempo` | 1 | Tracing |
| `monitoring_promtail` | 2 (global) | Coleta logs dos containers |
| `monitoring_node_exporter` | 2 (global) | Métricas do sistema (CPU, memória, disco) |

### 8.3 Prometheus — Targets

```yaml
# server/observability/prometheus.yml
scrape_configs:
  - job_name: 'homelab-backend'
    static_configs:
      - targets: ['backend_api:9464']     # OpenTelemetry metrics exporter
  - job_name: 'node'
    dns_sd_configs:
      - names: ['tasks.node_exporter']    # Node Exporter (global, todos os nós)
        type: A
        port: 9100
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

**Targets UP (saudáveis):**
- `homelab-backend` → `backend_api:9464` (métricas OTel: `http_server_duration_count`, `http_server_duration_sum`)
- `node` → `tasks.node_exporter:9100` (1 por nó: CPU, memória, disco)
- `prometheus` → `localhost:9090`

### 8.4 Promtail — Coleta de Logs

```yaml
# server/observability/promtail-config.yml
scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container_name'
      - source_labels: ['__meta_docker_container_log_stream']
        target_label: 'log_stream'
```

Promtail descobre automaticamente todos os containers via Docker socket e envia os logs para Loki. Labels disponíveis no Grafana: `container_name`, `service_name`, `log_stream`.

### 8.5 OpenTelemetry — Backend

O backend Node.js é auto-instrumentado via `@opentelemetry/sdk-node`:

```js
// apps/backend/instrumentation.js
const sdk = new opentelemetry.NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://tempo:4318/v1/traces',   // Envio para Tempo
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: 'http://tempo:4318/v1/metrics', // Métricas via OTLP -> Tempo
    }),
    exportIntervalMillis: 5000,
  }),
});
```

O Prometheus coleta as métricas do backend em `backend_api:9464` (OpenTelemetry Prometheus exporter na porta 9464).

### 8.6 Node Exporter — Métricas do Sistema

Roda em **modo global** em todos os nós (manager e worker). Coleta métricas de CPU, memória, disco, rede. Prometheus descobre automaticamente via DNS (`tasks.node_exporter`).

### 8.7 Grafana — Dashboard

Acessar: `https://192.168.122.138/grafana/` (login anônimo como Admin)

**Datasources pré-configurados:**
- Prometheus (`http://prometheus:9090`)
- Loki (`http://loki:3100`)
- Tempo (`http://tempo:3200`)

**Dashboard "Homelab — Full Observability":**
- Request Rate (req/s) — threshold amarelo >5, vermelho >20
- Error Rate (5xx) — threshold amarelo >1%, vermelho >5%
- Latency (p50, p90, p99)
- Logs (Loki, filtrado por container_name)
- Traces (Tempo, buscando por `http_method`)
- System Resources (CPU, Memory, Disk via Node Exporter)

---

## 9. Application Stack

### 9.1 Frontend (Nginx)

- 2 réplicas no worker
- Servindo HTML estático via Nginx
- Endpoint: `https://192.168.122.138/frontend/`

```yaml
# server/applications/frontend/docker-compose.yml
services:
  web:                             # "web" em vez de "frontend"
    image: eobryandev/homelab-frontend:ee4f228
    deploy:
      replicas: 2
      placement:
        constraints:
          - node.role == worker
```

### 9.2 Backend (Node.js + Express + SQLite)

- 1 réplica no worker
- Auto-instrumentado com OpenTelemetry
- Endpoint: `https://192.168.122.138/backend/api/users`

```yaml
# server/applications/backend/docker-compose.yml
services:
  api:                             # "api" em vez de "backend"
    image: eobryandev/homelab-backend:ee4f228
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == worker
```

### 9.3 Multi-Stage Dockerfile

```dockerfile
# apps/backend/Dockerfile
FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --only=production

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /data
EXPOSE 80 9464
CMD ["npm", "start"]
```

Isso reduz a imagem final de ~1GB para ~90MB de conteúdo (450MB com camadas), removendo ferramentas de build da imagem final.

### 9.4 Build e Push

```bash
# Construir e subir as imagens (executar na sua máquina)
docker buildx build --push \
  -t eobryandev/homelab-backend:$(git rev-parse --short HEAD) \
  -t eobryandev/homelab-backend:latest \
  ./apps/backend

docker buildx build --push \
  -t eobryandev/homelab-frontend:$(git rev-parse --short HEAD) \
  -t eobryandev/homelab-frontend:latest \
  ./apps/frontend
```

> 💡 Use `$(git rev-parse --short HEAD)` como tag única. Atualize o compose file com a nova tag, commite e push. O Portainer detecta a mudança via Git polling e faz o rollout.

---

## 10. Como Adicionar um Novo Nó

### 10.1 Provisionar a VM

1. Criar VM no Proxmox/Virt-Manager (Ubuntu 24.04 Server)
2. Configurar IP fixo na mesma rede (ex: `192.168.122.131`)
3. Criar usuário sudo (ex: `ansible-ubuntu-manager`)
4. Adicionar chave SSH pública do host de controle no `~/.ssh/authorized_keys`

### 10.2 Adicionar ao Ansible Inventory

```ini
# ansible/inventory/hosts.ini
[managers]
192.168.122.138

[workers]
192.168.122.130
192.168.122.131   # <-- novo nó
```

### 10.3 Provisionar

```bash
# Só precisa do básico + swarm join
ansible-playbook ansible/playbooks/site.yml --tags "common,docker,swarm" -l 192.168.122.131
```

### 10.4 Verificar

```bash
docker node ls
# Novo nó deve aparecer como Ready/Active
```

### 10.5 Aplicações no Novo Nó

Para que as aplicações rodem no novo nó, ajuste o compose file:

```yaml
deploy:
  placement:
    constraints:
      - node.role == worker    # Já funciona — qualquer worker serve
```

Se quiser restrições mais específicas:

```yaml
deploy:
  placement:
    constraints:
      - node.labels.zone == dmz
      - node.hostname == bryan-ubuntu-worker2
```

Para adicionar label a um nó:

```bash
docker node update --label-add zone=dmz bryan-ubuntu-worker2
```

> ⚠️ Com `node.role == worker`, qualquer nó worker novo automaticamente receberá aplicações quando você der `docker service update --force backend_api` ou quando o Portainer detectar mudanças via Git polling.

---

## 11. Troubleshooting

### 11.1 Docker Hub Rate Limit (429)

```bash
# Sintoma
Error response from daemon: 429 Too Many Requests

# Causa
Anonymous users: 100 pulls/6h por IP
Authenticated users: 200 pulls/6h

# Solução
docker login   # autenticar aumenta o limite
```

### 11.2 Serviço Não Sobe (No such image)

```bash
# Verificar onde o task foi agendado e qual imagem ele tentou
docker service ps backend_api --no-trunc

# Se a imagem existe localmente mas o nó não consegue puxar:
#   1. Autenticar no Docker Hub (rate limit)
#   2. Ou forçar o serviço a rodar em outro nó
docker service update --constraint-rm node.role==worker backend_api
docker service update --constraint-add node.role==worker backend_api
```

### 11.3 Disco Cheio

```bash
df -h /
docker system prune -af   # Remove imagens/containers não utilizados
```

Para expandir o disco (após redimensionar no Proxmox):

```bash
sudo lvextend -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
sudo resize2fs /dev/mapper/ubuntu--vg-ubuntu--lv
```

### 11.4 Portainer SPA Não Carrega no Subpath

Se a interface do Portainer não carregar em `https://192.168.122.138/portainer/`:

1. Verificar se o container tem `--base-url /portainer`:

```bash
docker inspect $(docker ps -q --filter name=portainer_portainer) --format '{{.Args}}'
```

2. Verificar as labels do Traefik:

```bash
docker service inspect portainer_portainer --format '{{json .Spec.Labels}}'
```

3. Caso necessário, atualizar:

```bash
docker service update \
  --args "-H tcp://tasks.agent:9001 --tlsskipverify --base-url /portainer" \
  portainer_portainer
```

4. Se persistir, usar acesso direto: `https://192.168.122.138:9443`

### 11.5 Service Naming — Por que `web` e `api`?

Docker Swarm nomeia serviços como `stackname_servicename`. Se o compose service se chama `frontend` no stack `frontend`, o nome final é `frontend_frontend`.

Para evitar essa redundância:
- Stack `frontend` → service `web` → nome: `frontend_web`
- Stack `backend` → service `api` → nome: `backend_api`

Isso mantém os nomes limpos e consistentes, especialmente importante em:
- **Prometheus targets:** `backend_api:9464` (melhor que `backend_backend:9464`)
- **Logs:** `container_name: "frontend_web"` (mais legível)
- **Traefik routers:** `api` em vez de `backend` (sem conflito com o nome do stack)

### 11.6 Verificação Rápida de Saúde

```bash
# Todos os serviços
docker service ls

# Targets do Prometheus
curl -sk https://localhost/prometheus/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'

# Backend
curl -sk https://192.168.122.138/backend/api/users/info

# Frontend
curl -sk https://192.168.122.138/frontend/ | head -5

# Grafana
curl -sk https://192.168.122.138/grafana/api/health
```

---

## Referências

- [Docker Swarm](https://docs.docker.com/engine/swarm/)
- [Traefik v3](https://doc.traefik.io/traefik/)
- [Portainer CE](https://docs.portainer.io/)
- [OpenTelemetry Node.js](https://opentelemetry.io/docs/instrumentation/js/)
- [Grafana](https://grafana.com/docs/grafana/latest/)
- [Prometheus](https://prometheus.io/docs/introduction/overview/)
- [Loki](https://grafana.com/docs/loki/latest/)
- [Tempo](https://grafana.com/docs/tempo/latest/)

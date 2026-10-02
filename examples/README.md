# ⚽ Dream XI AI — Formations & Examples

This directory contains pre-configured tactical formations and sample bridges for orchestrating multi-agent squads in real matches.

---

## 📋 Available Formations

| Formation | Philosophy | Key Positions | Best For |
|---|---|---|---|
| **[4-3-3 Full-Stack](./formations/4-3-3-full-stack.json)** | Fast attacking & peer review | Leo (#10), André (#8), Flash (#9), Wall (#4) | Feature delivery, end-to-end prototyping |
| **[4-2-3-1 Code Review](./formations/4-2-3-1-code-review.json)** | Double-pivot defensive audit | André (#8), Wall (#4), Leo (#10), Keeper (#1) | PR audit, security gate, refactoring |

---

## ⚡ Quickstart with Docker Compose

Run the complete Dream XI stack with episodic memory in one command:

```bash
# 1. Start server and Redis memory store
docker-compose up -d

# 2. Check healthcheck
curl http://localhost:3000/health

# 3. View live logs
docker-compose logs -f dream-xi
```

---

## 🎮 Interoperability with Agent Control Plane

Dream XI formations can be natively registered and scheduled within **[Agent Control](https://github.com/loulanyue/agent-control)**:

```bash
# Dispatch a formation execution into agent-control queue
curl -X POST http://localhost:8000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Run 4-3-3 Full-Stack Sprint",
    "objective": "Execute tactical handoffs between Leo, Flash, and André",
    "priority": "high",
    "source_type": "dream-xi"
  }'
```

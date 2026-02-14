# takopi

A personal AI assistant (_early preview_)

## Features

- Memory: Long-term and daily notes, searchable index
- Agent Skills: Modular capabilities with progressive loading
- Agent Workspaces: Separate contexts with identity, soul, and memory

## Install

### Docker

```bash
docker run -d \
 --name takopi \
 -e "TAKOPI_ROOT=/home/node/.takopi" \
 -v "$HOME/.takopi:/home/node/.takopi" \
 -p 3000:3000 \
 --rm ghcr.io/egoist/takopi:latest
```

## Prior art

- OpenClaw and Claude Code
- My two other projects: ChatWise & Lorca

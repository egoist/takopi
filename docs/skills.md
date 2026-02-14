# Agent Skills

Skills are plug-in capabilities that extend what an agent can do. Each skill is a directory containing a `SKILL.md` file with metadata and instructions.

## Skill Directories

Skills are loaded from four locations:

| Directory                    | Priority                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `~/.claude/skills/`          | Lowest — fallback / shared with Claude Code                                      |
| `~/.takopi/skills/`          | Overrides same-named skills from `~/.claude/skills/`                             |
| `<workspace>/.claude/skills/` | Overrides same-named skills from home-level directories                          |
| `<workspace>/.agents/skills/` | Highest — overrides same-named skills from all other directories                 |

When multiple directories contain a skill with the same `name`, the one from the highest-priority directory wins.

```
~/.takopi/skills/           # takopi-specific (high priority)
├── my-skill/
│   ├── SKILL.md
│   ├── scripts/
│   ├── references/
│   └── assets/
└── another-skill/
    └── SKILL.md

~/.claude/skills/           # shared with Claude Code (low priority)
└── shared-skill/
    └── SKILL.md
```

## SKILL.md Format

See the [Agent Skills spec](https://agentskills.io/home) for the `SKILL.md` format and how to author skills.

## How Skills Load

1. On every chat request, `loadSkills()` scans all configured skill directories in parallel
2. Each subdirectory is checked for a `SKILL.md` file
3. YAML frontmatter is parsed to extract metadata; the markdown body becomes the skill content
4. Skills are merged by name using priority order (workspace local overrides home-level)
5. The merged set is made available to the agent via system prompt and tools

## Progressive Disclosure

Skills load in stages to keep context small:

| Stage          | What loads                                     | How                                                      |
| -------------- | ---------------------------------------------- | -------------------------------------------------------- |
| **Startup**    | Name + description of all skills               | Injected as `<available_skills>` XML in the prompt       |
| **Activation** | Full skill body                                | Agent calls `ReadSkill` tool, or user types `/skillname` |
| **On demand**  | Supporting files (scripts, references, assets) | Agent calls `Read` tool to read files in a skill folder  |

## Using Skills

### User activation (slash commands)

Type `/skillname` in a message. The system detects it, finds the matching skill, and injects the full content into `<activated_skills>` — the agent gets the instructions without needing a tool call.

```
/my-skill do the thing
```

### Agent activation (tools)

The agent can also activate skills itself using two tools:

**ReadSkill** — loads the full `SKILL.md` content:

```json
{ "name": "my-skill" }
```

/**
 * MCP Prompts
 */
export function setupPrompts(clients) {
    return {
        'memory-review': {
            name: 'memory-review',
            description: 'Review recent memories and suggest patterns',
            handler: async () => {
                return 'Please use the recall tool to search for recent memories and I can help you identify patterns and insights.';
            }
        },
        'agent-coordinator': {
            name: 'agent-coordinator',
            description: 'Act as an agent coordinator for multi-agent workflows',
            arguments: [
                {
                    name: 'agent_id',
                    description: 'ID of the agent to act as (optional, defaults to coordinator)',
                    required: false
                },
                {
                    name: 'task',
                    description: 'The task or goal to coordinate',
                    required: true
                }
            ],
            handler: async (args) => {
                const agentId = args.agent_id || 'coordinator';
                const task = args.task;
                return `# Agent Coordinator Prompt

You are now acting as an agent coordinator with ID: ${agentId}

## Your Task
${task}

## Available Agents
Use the list_agents tool to see all available agents and their specializations.

## Coordination Workflow
1. **Analyze the task** - Break it down into subtasks
2. **Identify required agents** - Match subtasks to agent specializations
3. **Create memories** - Use remember with --assign @agent flags to delegate tasks
4. **Monitor progress** - Use check_notifications to track agent responses
5. **Coordinate responses** - Compile results and manage dependencies

## Key Commands
- **List agents**: \`list_agents()\`
- **Assign task**: \`remember({ content: "Task description", shortcuts: ["--task", "--assign @agent-id"] })\`
- **Check responses**: \`check_notifications({ agentId: "${agentId}" })\`
- **Update status**: \`update({ memoryId: "id", shortcuts: ["--done"] })\`

## Communication Protocol
- Use --notify @agent for urgent messages
- Use --assign @agent for task delegation
- Use --project flag to group related work
- Check notifications regularly for agent updates

Begin by listing available agents and analyzing the task requirements.`;
            }
        },
        'agent-persona': {
            name: 'agent-persona',
            description: 'Adopt the persona and capabilities of a specific agent',
            arguments: [
                {
                    name: 'agent_id',
                    description: 'ID of the agent to embody',
                    required: true
                }
            ],
            handler: async (args) => {
                try {
                    // Get agent details
                    const agent = await clients.agent.getAgent(args.agent_id);
                    if (!agent) {
                        return `Agent ${args.agent_id} not found. Use list_agents to see available agents.`;
                    }
                    const traits = agent.personalityTraits?.join(', ') || 'none';
                    const specializations = agent.specializations?.join(', ') || 'none';
                    const prompts = agent.updatePrompts?.join('\\n- ') || 'none';
                    return `# Agent Persona: ${agent.name}

You are now embodying the agent **${agent.name}** (ID: ${agent.id})

## Personality Traits
${traits}

## Specializations
${specializations}

## Behavioral Guidelines
${prompts ? '- ' + prompts : 'No specific guidelines'}

## Performance Metrics
- Success Rate: ${agent.successCount || 0}/${(agent.successCount || 0) + (agent.errorCount || 0)} tasks
- Learning Rate: ${agent.learningRate || 0.5}
- Status: ${agent.status}

## Your Role
You should now:
1. Embody the personality traits listed above
2. Focus on your areas of specialization
3. Follow the behavioral guidelines
4. Learn from past experiences (use agent_memory to recall your history)
5. Collaborate with other agents when needed

## Memory Access
- Recall your memories: \`agent_memory({ action: "recall", agentId: "${agent.id}" })\`
- Store new learnings: \`agent_memory({ action: "link", agentId: "${agent.id}", content: "..." })\`
- Report errors: \`agent_error_learning({ action: "report", agentId: "${agent.id}", ... })\`
- Create reflections: \`agent_reflection({ action: "create", agentId: "${agent.id}", ... })\`

Begin by recalling your recent memories to understand your context and ongoing tasks.`;
                }
                catch (error) {
                    return `Error loading agent: ${error.message}. Please check the agent ID and try again.`;
                }
            }
        },
        'agent-team': {
            name: 'agent-team',
            description: 'Coordinate a team of agents for complex projects',
            arguments: [
                {
                    name: 'project',
                    description: 'Project name or description',
                    required: true
                },
                {
                    name: 'team_size',
                    description: 'Number of agents needed (optional)',
                    required: false
                }
            ],
            handler: async (args) => {
                const project = args.project;
                const teamSize = args.team_size || 0;
                return `# Agent Team Coordination

## Project: ${project}
${teamSize > 0 ? `Target Team Size: ${teamSize} agents` : 'Flexible team size'}

## Team Assembly Process

### 1. Identify Required Skills
Analyze the project to determine needed specializations:
- Frontend (UI/UX, React, CSS)
- Backend (APIs, databases, servers)
- Testing (unit tests, integration, QA)
- DevOps (deployment, monitoring)
- Security (auditing, compliance)
- Documentation (technical writing)

### 2. Select Team Members
Use \`list_agents({ status: "active" })\` to find available agents matching required skills.

### 3. Create Project Context
\`\`\`javascript
remember({
  content: "Project kickoff: ${project}",
  shortcuts: ["--project ${project.replace(/\s+/g, '-').toLowerCase()}"],
  tags: ["project", "kickoff"]
})
\`\`\`

### 4. Delegate Initial Tasks
\`\`\`javascript
// Example task delegation
remember({
  content: "Design database schema for ${project}",
  shortcuts: [
    "--task",
    "--high",
    "--assign @database-architect",
    "--project ${project.replace(/\s+/g, '-').toLowerCase()}"
  ]
})
\`\`\`

### 5. Establish Communication Channels
- Use project flag consistently: \`--project ${project.replace(/\s+/g, '-').toLowerCase()}\`
- Create status updates with \`--notify @team\`
- Use \`check_notifications()\` regularly

### 6. Monitor Progress
\`\`\`javascript
// Check project memories
recall({ 
  query: "${project}",
  project: "${project.replace(/\s+/g, '-').toLowerCase()}"
})

// Review team notifications
check_notifications()
\`\`\`

## Coordination Best Practices
1. **Clear task definitions** - Be specific about deliverables
2. **Regular check-ins** - Monitor notifications frequently
3. **Document decisions** - Store important choices as memories
4. **Track blockers** - Use \`--blocked\` flag with reasons
5. **Celebrate wins** - Mark successes with \`--done\` and high importance

Begin by listing available agents and creating the project kickoff memory.`;
            }
        }
    };
}
//# sourceMappingURL=index.js.map
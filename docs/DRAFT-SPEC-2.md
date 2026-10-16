Building **Funnel** as a self-hosted, open-source (FOSS) alternative to Linear backed by GitHub Issues is a compelling concept. It bridges Linear's fast, modern UX with the open ecosystem and single source-of-truth of GitHub Repositories.

---

### 1. Architectural Strategy & Data Mapping

To make GitHub Issues function effectively as your data backend without hitting GitHub API limits or suffering latency, Funnel can adopt a **cache-backed state model**:

- **Storage Mapping**:
  - **Linear Issues** \\(\rightarrow\\) **GitHub Issues**.
  - **Linear Cycles / Sprints** \\(\rightarrow\\) **GitHub Milestones**.
  - **Linear Projects / Initiatives** \\(\rightarrow\\) **GitHub Projects / Labels**.
  - **Custom Fields & Metadata** (e.g., priority, estimate, custom state) \\(\rightarrow\\) Structured YAML frontmatter stored inside the GitHub Issue description body, or synchronized via GitHub Projects custom fields.
  - **Linear Triage Inbox** \\(\rightarrow\\) Issues with an `intake` or `needs-triage` label.
- **Bi-directional Sync Engine**:
  - **Write-through API**: Writes made in Funnel update the local cache instantly (optimistic UI updates) and dispatch GraphQL/REST calls to GitHub.
  - **Real-time Ingestion**: Incoming GitHub Webhooks process external changes (e.g., issue created on GitHub, PR merged, comment added) to keep the local workspace synced.

---

### 2. Core Functional Modules for Funnel

Drawing from key features in Linear and Plane:

1. **Ultra-Fast Views**:
   - Multi-layout support (Kanban Board, List, Spreadsheet views) with instant view switching.
   - Full keyboard navigation (command menu `⌘K`, shortcut keys for assigning, moving, and labeling).
2. **Automated Triage & Intake**:
   - An inbox for unplanned work, bug reports, and customer requests.
   - Auto-labeling or triage rules to route issues to specific milestones or assignees.
3. **Cycle & Roadmap Tracking**:
   - Time-boxed cycles with velocity tracking and burndown analytics.
   - Milestones and dependency mapping across repositories.
4. **Git & PR Automation**:
   - Automatic status updates when pull requests are opened, linked, or merged.

---

### 3. Self-Hosting & Deployment Architecture

Following **Twelve-Factor App** principles for cloud and on-premise deployments:

- **Stateless Application Processes**: Run the API/web layer as stateless processes, allowing easy horizontal scaling and containerization.
- **Environment-Driven Configuration**: Configure GitHub OAuth App credentials, webhook secrets, and database URIs purely through environment variables.
- **Attached Backing Services**: Treat local caching databases (e.g., PostgreSQL / Redis) as attached resources.
- **Deployment Options**: Provide a simple `docker-compose.yml` setup for small teams, along with Helm charts for Kubernetes deployments.

---

### Key Engineering Considerations

- **GitHub API Rate Limits**: GitHub limits REST/GraphQL calls per hour per token/app. Using GraphQL batching and leveraging Webhooks for incoming updates is essential to minimize polling.
- **Conflict Resolution**: If an issue is edited simultaneously on GitHub's native UI and in Funnel, use timestamp checks (or `updated_at` headers) to resolve or merge edits safely.

---

💡 **Next Step**: Would you like to map out the detailed database schema and API sync strategy for Funnel, or outline an initial MVP roadmap?

# Recovery Playbooks

## Overview
Standardized procedures for recovering from common ecosystem failures and health degradation events.

## Playbook Index

### 1. Repository Health Degradation (>5 points)
**Trigger**: Ecosystem score drops by 5+ points in snapshot comparison

**Symptoms**:
- Repository health score decrease
- Increased uncommitted changes
- Test failures or build issues

**Recovery Steps**:
1. **Immediate Assessment**
   ```bash
   mcp14_ecosystem_scan --saveSnapshot=true
   mcp14_ecosystem_trend --limit=5
   ```

2. **Identify Affected Repositories**
   ```bash
   mcp14_repo_detail --repoName=<affected-repo>
   ```

3. **Common Remediations**
   - Commit uncommitted changes: `git add . && git commit -m "chore: cleanup working directory"`
   - Resolve test failures: Run project-specific test suite
   - Update dependencies: Check for outdated packages
   - Clear build artifacts: Remove `node_modules`, `dist`, `__pycache__`

4. **Verification**
   ```bash
   mcp14_ecosystem_scan
   ```

### 2. MCP Server Health Issues
**Trigger**: MCP server becomes unresponsive or returns errors

**Symptoms**:
- Server health check failures
- Timeout errors in workflows
- Missing telemetry data

**Recovery Steps**:
1. **Server Status Check**
   ```bash
   mcpX_health_check  # Replace X with server number
   ```

2. **Restart Server**
   - Identify server process: `ps aux | grep <server-name>`
   - Graceful shutdown: `kill -TERM <pid>`
   - Restart: Navigate to server directory and run `npm run dev`

3. **Dependency Issues**
   ```bash
   cd <server-directory>
   npm install
   npm run build
   ```

4. **Configuration Validation**
   - Check MCP config: `cat mcp_config.json`
   - Verify environment variables
   - Validate port availability

### 3. Audit Pipeline Failures
**Trigger**: Audit log shows failures or parsing errors

**Symptoms**:
- Increased audit parse errors
- Missing audit entries
- Incomplete telemetry

**Recovery Steps**:
1. **Audit System Check**
   ```bash
   mcp2_health_check
   mcp2_audit_stats
   ```

2. **Clear Corrupted Data**
   ```bash
   # Backup current audit log
   cp audit.ndjson audit.ndjson.backup
   # Rebuild index if needed
   ```

3. **Validate Data Format**
   - Check JSON format in audit entries
   - Ensure required fields are present
   - Verify timestamp format (ISO 8601)

4. **Test Audit Pipeline**
   ```bash
   mcp2_record_audit --source=test --tool=validation --status=success
   ```

### 4. Workflow Execution Failures
**Trigger**: Workflow steps fail or timeout

**Symptoms**:
- Workflow execution stops midway
- Timeout errors
- Step validation failures

**Recovery Steps**:
1. **Workflow Status Check**
   ```bash
   mcp0_workflow_get --workflowId=<workflow-id>
   mcp0_workflow_history --limit=10
   ```

2. **Step-by-Step Debug**
   - Run individual steps manually
   - Check command syntax and paths
   - Verify permissions and dependencies

3. **Common Fixes**
   - Update command paths to absolute paths
   - Increase timeout values
   - Add error handling and rollback commands

4. **Workflow Validation**
   ```bash
   mcp0_workflow_execute --workflowId=<workflow-id> --dryRun=true
   ```

### 5. Ecosystem Scan Failures
**Trigger**: Ecosystem scan returns errors or incomplete data

**Symptoms**:
- Missing repositories in scan results
- Incorrect health scores
- Scan timeouts

**Recovery Steps**:
1. **Scan System Check**
   ```bash
   mcp14_health_check
   ```

2. **Repository Access Validation**
   - Verify Git repository status
   - Check file permissions
   - Validate repository paths

3. **Dependency Resolution**
   - Update shared-types: `cd shared-types && npm run build`
   - Resolve Git submodules: `git submodule update --init --recursive`

4. **Full System Refresh**
   ```bash
   mcp14_ecosystem_scan --saveSnapshot=true
   ```

## Emergency Procedures

### Critical System Failure
**When multiple systems fail simultaneously**:

1. **Stop All Automated Processes**
   - Pause scheduled workflows
   - Stop MCP servers
   - Prevent cascade failures

2. **Core System Assessment**
   ```bash
   mcp10_full_diagnostic
   ```

3. **Sequential Recovery**
   - Start with core infrastructure (seeds-server)
   - Restore dependent systems
   - Validate inter-system communication

4. **Service Restoration**
   - Restart MCP servers in dependency order
   - Run health checks on each system
   - Monitor for stability

### Data Corruption Events
**When audit logs or snapshots become corrupted**:

1. **Isolate Corrupted Data**
   - Move corrupted files to quarantine
   - Preserve for forensic analysis

2. **Restore from Backup**
   - Identify last known-good snapshot
   - Restore audit logs from backup

3. **Rebuild Missing Data**
   - Run full ecosystem scan
   - Regenerate trend analysis
   - Validate data consistency

## Monitoring and Prevention

### Daily Health Checks
```bash
# Morning ecosystem assessment
mcp13_morning_briefing

# Trend analysis
mcp14_ecosystem_trend --limit=7

# Alert status
mcp13_check_alerts --healthThreshold=85
```

### Weekly Maintenance
- Review and rotate audit logs
- Update dependencies across all projects
- Validate backup integrity
- Performance tuning of MCP servers

### Monthly Review
- Analyze long-term trends
- Update recovery procedures based on incidents
- Review and update alert thresholds
- Capacity planning for ecosystem growth

## Contact and Escalation

### Primary Response
- Automated workflows handle 90% of common issues
- Recovery playbooks cover standard scenarios

### Escalation Criteria
- Multiple simultaneous system failures
- Data corruption events
- Security incidents
- Performance degradation >20%

### Manual Intervention Points
- When automated recovery fails 3+ times
- During security events
- For infrastructure changes
- When user impact is significant

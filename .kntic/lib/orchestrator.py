import os
import json
import time
import sys
import subprocess
from datetime import datetime, timezone

# Ensure .kntic/lib is on the path so agent_runner is importable when this
# module is executed directly (e.g. python3 .kntic/lib/orchestrator.py).
_LIB_DIR = os.path.dirname(os.path.abspath(__file__))
if _LIB_DIR not in sys.path:
    sys.path.insert(0, _LIB_DIR)

from agent_runner import PiAgentRunner
from skills.validator import KineticValidator

def log(message):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {message}")
    sys.stdout.flush()

class Orchestrator:
    def __init__(self, manifest_dir=".kntic/manifests"):
        self.manifest_dir = manifest_dir
        self.runner = PiAgentRunner()
        self.validator = KineticValidator()
        self.idle_pulse_count = 0
        
        # Environment Config
        self.token = os.environ.get('GITLAB_TOKEN')
        self.host = os.environ.get('GIT_HOST')
        self.repo_path = os.environ.get('GIT_REPO_PATH')
        
        if not os.path.exists(self.manifest_dir):
            os.makedirs(self.manifest_dir)
            
        self._prepare_repo()

    def _prepare_repo(self):
        """Standardizes the git environment for autonomous HTTPS/Token operations."""
        log(f"🛠️ Preparing repository for host: {self.host}")
        try:
            # 1. Mark directory as safe (critical for Docker volumes)
            subprocess.run(["git", "config", "--global", "--add", "safe.directory", "/app"], check=True)
            
            # 2. Configure Git Identity if not set
            subprocess.run(["git", "config", "--global", "user.email", "agent-zero@kntic.ai"], check=True)
            subprocess.run(["git", "config", "--global", "user.name", "Kinetic Agent Zero"], check=True)

            # 3. Construct and set Authenticated Remote URL
            if all([self.token, self.host, self.repo_path]):
                auth_url = f"https://oauth2:{self.token}@{self.host}/{self.repo_path}"
                subprocess.run(["git", "remote", "set-url", "origin", auth_url], check=True)
                log("✅ Remote URL authenticated via Token.")
            else:
                log("⚠️ Missing Git environment variables. Push may fail.")
                
        except Exception as e:
            log(f"🛑 Repo Prep Error: {e}")

    def pulse(self):
        """The main loop: checks manifests and triggers the state machine."""
        if not os.path.exists(self.manifest_dir):
            self._check_idle_and_pull()
            return

        # Get all manifest files and build a status map for dependency resolution
        files = [f for f in os.listdir(self.manifest_dir) if f.endswith('.json')]
        
        tasks = []
        status_map = {}  # task_id → status (for O(n) dependency checks)
        for task_file in files:
            path = os.path.join(self.manifest_dir, task_file)
            try:
                with open(path, 'r') as f:
                    task = json.load(f)
            except json.JSONDecodeError:
                log(f"⚠️ Syntax Error in {task_file}. Skipping.")
                continue
            tasks.append((task, path))
            task_id = task.get('task_id', task_file.replace('.json', ''))
            status_map[task_id] = task.get('status')

        # Detect circular dependencies across all tasks
        circular_ids = self._detect_circular_dependencies(tasks)
        for task, path in tasks:
            task_id = task.get('task_id', '')
            if task_id in circular_ids and task.get('status') not in ('needs_review', 'merged'):
                log(f"🔄 CIRCULAR DEPENDENCY: {task_id} is part of a dependency cycle. Setting → needs_review.")
                self._update_status(path, 'needs_review')
                task['status'] = 'needs_review'
                task['notes'] = f"Blocked: circular dependency detected involving {task_id}."
                # Write the notes to the manifest
                try:
                    with open(path, 'r') as f:
                        data = json.load(f)
                    data['notes'] = task['notes']
                    temp_path = f"{path}.tmp"
                    with open(temp_path, 'w') as f:
                        json.dump(data, f, indent=2)
                    os.replace(temp_path, path)
                except Exception as e:
                    log(f"⚠️ Could not write notes for {task_id}: {e}")

        found_work = False
        for task, path in tasks:
            status = task.get('status')

            # --- STATE MACHINE LOGIC ---
            
            # 1. ACTIVE: Trigger Agent Execution
            if status in ['todo', 'refactoring']:
                # Check dependency resolution before executing
                if not self._dependencies_met(task, status_map):
                    continue
                log(f"🚀 TASK ACTIVE: {task['task_id']} ({status})")
                self._execute_sprint(task, path)
                found_work = True
            
            # 2. VALIDATION: Trigger GIA and Merge
            elif status == 'ready_for_merge':
                log(f"⚖️ VALIDATING: {task['task_id']}")
                self._validate_and_merge(task, path)
                found_work = True

            # 3. STORAGE/PAUSE: Ignore
            elif status in ['backlog', 'needs_review', 'merged']:
                continue 

        if found_work:
            self.idle_pulse_count = 0
        else:
            self._check_idle_and_pull()

    def _dependencies_met(self, task, status_map):
        """Check if all depends_on tasks are in 'merged' status.
        
        Returns True if the task has no dependencies or all dependencies are met.
        Logs a clear message for each unmet dependency.
        """
        depends_on = task.get('depends_on')
        if not depends_on or not isinstance(depends_on, list):
            return True
        
        task_id = task.get('task_id', '?')
        all_met = True
        for dep_id in depends_on:
            dep_status = status_map.get(dep_id)
            if dep_status != 'merged':
                status_display = dep_status if dep_status else 'not found'
                log(f"⏳ {task_id} blocked: waiting for {dep_id} ({status_display})")
                all_met = False
        
        return all_met

    def _detect_circular_dependencies(self, tasks):
        """Detect circular dependencies using DFS cycle detection.
        
        Args:
            tasks: list of (task_dict, path) tuples
            
        Returns:
            set of task_ids that are part of circular dependency chains.
        """
        # Build adjacency list from depends_on
        graph = {}
        for task, _ in tasks:
            task_id = task.get('task_id', '')
            depends_on = task.get('depends_on', [])
            if isinstance(depends_on, list) and depends_on:
                graph[task_id] = depends_on
            else:
                graph[task_id] = []
        
        # DFS-based cycle detection
        WHITE, GRAY, BLACK = 0, 1, 2
        color = {tid: WHITE for tid in graph}
        circular_ids = set()
        
        def dfs(node, path):
            if node not in color:
                return  # dependency references unknown task — not a cycle
            if color[node] == GRAY:
                # Found a cycle — mark all nodes in the cycle path
                cycle_start = path.index(node)
                for cid in path[cycle_start:]:
                    circular_ids.add(cid)
                return
            if color[node] == BLACK:
                return
            
            color[node] = GRAY
            path.append(node)
            for neighbor in graph.get(node, []):
                dfs(neighbor, path)
            path.pop()
            color[node] = BLACK
        
        for tid in graph:
            if color.get(tid) == WHITE:
                dfs(tid, [])
        
        return circular_ids

    def _check_idle_and_pull(self):
        """Increments idle pulse counter and triggers git pull after 12 idle pulses (~1 minute)."""
        self.idle_pulse_count += 1
        if self.idle_pulse_count >= 12:
            log("💤 No tasks for 12 pulses (~1 minute). Pulling latest changes...")
            self._git_pull()
            self.idle_pulse_count = 0

    def _git_pull(self):
        """Pulls the latest changes from the remote repository."""
        try:
            result = subprocess.run(
                ["git", "pull", "--ff-only"],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                output = result.stdout.strip()
                if "Already up to date" in output:
                    log("ℹ️ Git pull: Already up to date.")
                else:
                    log(f"📥 Git pull: Updated.\n{output}")
            else:
                log(f"⚠️ Git pull failed: {result.stderr.strip()}")
        except subprocess.TimeoutExpired:
            log("🛑 Git pull timed out.")
        except Exception as e:
            log(f"🛑 Git pull error: {e}")

    def _execute_sprint(self, task, path):
        """Initializes the Agent Runner for a task sprint."""
        log(f"🛠️ Handing {task['task_id']} to Agent...")
        self._update_status(path, 'in_progress')
        
        # runner.execute_task handles terminal state detection (needs_review/ready_for_merge)
        success = self.runner.execute_task(path)
        
        if not success:
            log(f"❌ {task['task_id']} session ended with an error.")
        else:
            log(f"✅ {task['task_id']} agent session completed.")

    def _validate_and_merge(self, task, path):
        """Runs the Global Impact Analysis (GIA) and commits on success."""
        report = self.validator.execute_gia()
        
        if report['status'] == 'pass':
            log(f"🎊 GIA PASSED for {task['task_id']}. Setting status → merged.")
            self._update_status(path, 'merged')
            self._clear_gia_failure(path)
            log(f"📦 Committing and pushing {task['task_id']}...")
            # Finalize manifest with committed files BEFORE commit/push
            staged_files = self._stage_and_collect_files(task)
            if staged_files:
                self._add_committed_files_to_action(path, staged_files)
                # Re-stage so the updated manifest (with files list) is included in the commit
                subprocess.run(["git", "add", path], check=True)
            push_ok = self._git_commit_and_push(task)
            if push_ok:
                log(f"✅ Push successful for {task['task_id']}.")
            else:
                log(f"⚠️ Push failed for {task['task_id']}. Status remains merged (changes are committed locally).")
        else:
            log(f"⚠️ GIA REJECTED: {report.get('reason')}")
            self._update_status(path, 'refactoring')
            self._write_gia_failure_to_manifest(path, report)

    def _stage_and_collect_files(self, task):
        """Stages all changes and returns the list of files to be committed.
        
        Returns a list of file paths that are staged for commit (empty if no changes).
        """
        try:
            # Stage all changes
            subprocess.run(["git", "add", "."], check=True)
            
            # Verify if there is actually a diff
            diff_check = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
            if not diff_check.stdout.strip():
                log("ℹ️ No changes detected by Git. Skipping push.")
                return []

            # Display files to be committed and collect the list
            committed_files = []
            log(f"📋 Files to commit for {task['task_id']}:")
            for line in diff_check.stdout.strip().splitlines():
                status_code = line[:2].strip()
                file_path = line[3:]
                if status_code in ('A', '??'):
                    label = '🆕 added'
                elif status_code == 'M':
                    label = '✏️  modified'
                elif status_code == 'D':
                    label = '🗑️  deleted'
                elif status_code == 'R':
                    label = '🔄 renamed'
                else:
                    label = f'({status_code})'
                log(f"   {label}: {file_path}")
                committed_files.append(file_path)

            return committed_files
            
        except subprocess.CalledProcessError as e:
            log(f"🛑 Git Stage Failed: {e}")
            return []
        except Exception as e:
            log(f"🛑 Unexpected Git Error during staging: {e}")
            return []

    def _git_commit_and_push(self, task):
        """Commits staged changes and pushes to the remote repository.
        
        Returns True on success, False on failure.
        Assumes files are already staged via _stage_and_collect_files().
        """
        try:
            # Verify there are staged changes
            diff_check = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
            if not diff_check.stdout.strip():
                log("ℹ️ No changes detected by Git. Skipping push.")
                return True

            # Commit
            msg = f"feat({task['task_id']}): {task['title']}\n\nAutomated by KNTIC Engine."
            subprocess.run(["git", "commit", "-m", msg], check=True)
            
            # Push to current branch
            branch_res = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True)
            branch = branch_res.stdout.strip()
            
            log(f"☁️ Pushing to origin/{branch}...")
            subprocess.run(["git", "push", "origin", branch], check=True, timeout=30)
            log(f"🚀 Push Successful!")
            return True
            
        except subprocess.TimeoutExpired:
            log("🛑 Git Push Timed Out.")
            return False
        except subprocess.CalledProcessError as e:
            log(f"🛑 Git Command Failed: {e}")
            return False
        except Exception as e:
            log(f"🛑 Unexpected Git Error: {e}")
            return False

    def _add_committed_files_to_action(self, path, committed_files):
        """Adds the list of committed files to the last action entry in the manifest."""
        try:
            with open(path, 'r') as f:
                data = json.load(f)

            actions = data.get('actions', [])
            if actions:
                actions[-1]['files'] = committed_files
                temp_path = f"{path}.tmp"
                with open(temp_path, 'w') as f:
                    json.dump(data, f, indent=2)
                os.replace(temp_path, path)
                log(f"📎 Added {len(committed_files)} file(s) to last action entry.")
            else:
                log("⚠️ No actions found in manifest to attach files to.")
        except Exception as e:
            log(f"⚠️ Could not add files to action: {e}")

    def _write_gia_failure_to_manifest(self, path, report):
        """Write GIA failure context back to the manifest for agent consumption.

        Writes three pieces of information atomically:
          1. ``notes`` — human-readable failure summary prefixed with [GIA REJECTED].
          2. ``actions`` — appends an audit log entry for the rejection.
          3. ``gia_failure`` — structured failure detail (reason, alignment_score,
             dimensions, logs truncated to 4000 chars from the tail).

        This enables agents resuming a ``refactoring`` task to read the exact
        failure context from the manifest without re-running GIA.
        """
        try:
            with open(path, 'r') as f:
                data = json.load(f)

            reason = report.get('reason', 'GIA validation failed')

            # 1. notes — prepend GIA rejection summary
            gia_note = f"[GIA REJECTED] {reason}"
            existing_notes = data.get('notes', '')
            if existing_notes:
                data['notes'] = f"{gia_note}\n{existing_notes}"
            else:
                data['notes'] = gia_note

            # 2. actions — append rejection audit entry
            actions = data.get('actions', [])
            summary = f"GIA rejected: {reason}"
            if len(summary) > 200:
                summary = summary[:197] + "..."
            actions.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": "refactoring",
                "summary": summary,
            })
            data['actions'] = actions

            # 3. gia_failure — structured failure detail
            logs = report.get('logs', '')
            max_log_len = 4000
            if len(logs) > max_log_len:
                logs = "…" + logs[-(max_log_len - 1):]

            gia_failure = {
                "reason": reason,
                "alignment_score": report.get('alignment_score', 0.0),
                "dimensions": report.get('dimensions', {}),
            }
            if logs:
                gia_failure["logs"] = logs
            data['gia_failure'] = gia_failure

            # Atomic write
            temp_path = f"{path}.tmp"
            with open(temp_path, 'w') as f:
                json.dump(data, f, indent=2)
            os.replace(temp_path, path)
            log(f"📝 GIA failure context written to manifest for {data.get('task_id', '?')}.")
        except Exception as e:
            log(f"⚠️ Could not write GIA failure to manifest: {e}")

    def _clear_gia_failure(self, path):
        """Remove the ``gia_failure`` field from the manifest on successful merge.

        Per ADR-003 omission rule, the field must be entirely absent when there
        is no failure data — it is never set to ``null`` or ``{}``.
        """
        try:
            with open(path, 'r') as f:
                data = json.load(f)

            if 'gia_failure' not in data:
                return  # nothing to clear

            del data['gia_failure']

            temp_path = f"{path}.tmp"
            with open(temp_path, 'w') as f:
                json.dump(data, f, indent=2)
            os.replace(temp_path, path)
            log(f"🧹 Cleared gia_failure from manifest for {data.get('task_id', '?')}.")
        except Exception as e:
            log(f"⚠️ Could not clear gia_failure from manifest: {e}")

    def _update_status(self, path, status):
        """Atomically updates the status field in a manifest file."""
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            
            data['status'] = status
            data['updated_at'] = datetime.now().isoformat()
            
            # Write to temp file then move to avoid corruption
            temp_path = f"{path}.tmp"
            with open(temp_path, 'w') as f:
                json.dump(data, f, indent=2)
            os.replace(temp_path, path)
        except Exception as e:
            log(f"Error updating status: {e}")

if __name__ == "__main__":
    log("🤖 KNTIC Orchestrator Online. Monitoring pulses...")
    orch = Orchestrator()
    while True:
        try:
            orch.pulse()
        except KeyboardInterrupt:
            log("🛑 Shutting down Orchestrator...")
            break
        except Exception as e:
            log(f"💥 Critical Loop Error: {e}")
        
        time.sleep(5)

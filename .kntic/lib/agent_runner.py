import subprocess
import os
import sys
import time
import json

class PiAgentRunner:
    def __init__(self):
        self.cmd_base = "pi" 

    def execute_task(self, manifest_path):
        try:
            with open(manifest_path, 'r') as f:
                task = json.load(f)
        except Exception as e:
            print(f"Error reading manifest: {e}")
            return False

        # Generic but authoritative prompt
        prompt = (
            f"Context: {task.get('title')}\n"
            f"Objective: {task.get('description')}\n\n"
            "Guidelines:\n"
            "1. Read .kntic/MEMORY.MD for current project context and memory.\n"
            "2. Reference the project ADRs in .kntic/adrs/ for architectural standards.\n"
            "3. Execute the task in the manifest.\n"
            "4. Update the manifest status to 'ready_for_merge' once the task is complete.\n"
            "5. Adhere to security best practices (Least Privilege) for any infrastructure changes.\n"
            "6. Update .kntic/MEMORY.MD if you learned something new or changed the architecture.\n\n"
            f"Please proceed with the task defined in: {manifest_path}"
        )
        
        terminal_statuses = ['ready_for_merge', 'needs_review']
        
        try:
            process = subprocess.Popen(
                [self.cmd_base, prompt],
                stdout=sys.stdout, 
                stderr=sys.stderr,
                text=True
            )
            
            # Supervisor Loop: Watch for the status change to terminate the session
            while process.poll() is None:
                try:
                    if os.path.exists(manifest_path):
                        with open(manifest_path, 'r') as f:
                            data = json.load(f)
                        
                        current_status = data.get('status')
                        
                        if current_status in terminal_statuses:
                            print(f"\n[🏁] Lifecycle: Task reached '{current_status}'. Closing session.")
                            process.terminate()
                            try:
                                process.wait(timeout=5)
                            except subprocess.TimeoutExpired:
                                process.kill()
                            return True
                except (json.JSONDecodeError, Exception):
                    pass 
                
                time.sleep(2)
            
            return process.returncode == 0
            
        except Exception as e:
            print(f"[!] Runner Error: {e}")
            return False

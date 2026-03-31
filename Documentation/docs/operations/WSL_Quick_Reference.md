# WSL Quick Reference - One-Liners

## 🚀 FASTEST CLEANUP (30 seconds)
```bash
sudo bash -c 'apt update && apt upgrade -y && apt autoremove -y && apt clean && rm -rf /tmp/* && sync && echo 3 > /proc/sys/vm/drop_caches'
```

## 📊 CHECK STATUS
```bash
# Full system report
echo "DISK:" && df -h / && echo "MEMORY:" && free -h && echo "CACHE:" && du -sh /var/cache && echo "TEMP:" && du -sh /tmp

# One-liner dashboard
watch -n 1 'echo "=== DISK ===" && df -h / && echo "=== MEMORY ===" && free -h && echo "=== TOP PROCESSES ===" && ps aux --sort=-%mem | head -5'

# Simple memory check
free -h

# Simple disk check  
df -h /
```

---

## 🧹 CORE CLEANUP COMMANDS

### Package Management
```bash
# Update & upgrade everything
sudo apt update && sudo apt upgrade -y

# Remove ALL unused packages & dependencies
sudo apt autoremove -y && sudo apt autopurge -y

# Clean package cache
sudo apt clean && sudo apt autoclean

# Clean apt lists (aggressive)
sudo rm -rf /var/lib/apt/lists/* && sudo mkdir -p /var/lib/apt/lists/partial

# Show what's taking up space
dpkg-query -W -f='${Installed-Size}\t${Package}\n' | sort -rn | awk '{print int($1/1024) "MB\t" $2}' | head -20
```

### Clear Temporary Files
```bash
# Remove all temp files
sudo rm -rf /tmp/* /var/tmp/* /var/cache/apt/archives/*

# Just clear /tmp
sudo rm -rf /tmp/*

# Just clear /var/tmp
sudo rm -rf /var/tmp/*
```

### Clean Logs
```bash
# Vacuum journal (keep 50MB)
sudo journalctl --vacuum=size:50M

# Vacuum by age (keep 7 days)
sudo journalctl --vacuum-time=7d

# Truncate all .log files to 0 size
sudo find /var/log -type f -name "*.log" -exec truncate -s 0 {} \;

# Delete compressed logs
sudo find /var/log -name "*.gz" -delete

# Delete all old logs
sudo find /var/log -type f -name "*.log" -mtime +30 -delete
```

### Clear Caches
```bash
# Clear pip cache
rm -rf ~/.cache/pip

# Clear npm cache
npm cache clean --force

# Clear yarn cache
yarn cache clean

# Clear Docker (if installed)
docker system prune -a --volumes -f

# Clear all user caches
rm -rf ~/.cache/pip ~/.cache/npm ~/.npm ~/.yarn/cache
```

---

## 💾 MEMORY OPTIMIZATION

### Release Memory (Free up RAM)
```bash
# Drop ALL caches (page cache, dentries, inodes)
sync && echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null

# Drop only page cache
sync && echo 1 | sudo tee /proc/sys/vm/drop_caches > /dev/null
```

### Check Memory Usage
```bash
# Simple view
free -h

# Detailed view with percentages
free -h | awk 'NR==2 {printf "Used: %s / %s (%.1f%%)\n", $3, $2, ($3/$2)*100}'

# Per-process memory
ps aux --sort=-%mem | head -10

# More accurate (install: sudo apt install smem)
sudo smem -s rss -n 20
```

### Optimize Swappiness
```bash
# Check current swappiness
cat /proc/sys/vm/swappiness

# Reduce swappiness to 10 (prefer RAM)
echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Temporarily reduce to 10
sudo sysctl -w vm.swappiness=10
```

---

## 🔍 DIAGNOSTIC COMMANDS

### Find What's Taking Space
```bash
# Largest directories in root
du -sh /* 2>/dev/null | sort -rh | head -10

# Largest files on system
find / -type f -size +100M -exec ls -lh {} \; 2>/dev/null | awk '{print $5, $9}' | sort -rh | head -20

# Largest directories anywhere
find / -type d -exec du -sh {} \; 2>/dev/null | sort -rh | head -10

# Size of specific dirs
du -sh /home /var /opt /tmp /root 2>/dev/null
```

### System Information
```bash
# Full overview
cat << 'EOF' | bash
echo "=== SYSTEM ===" && uname -a
echo "=== DISK ===" && df -h /
echo "=== MEMORY ===" && free -h
echo "=== UPTIME ===" && uptime
echo "=== CPU ===" && nproc
echo "=== PROCESSES ===" && ps aux --sort=-%mem | head -6
echo "=== LARGEST DIRS ===" && du -sh /* 2>/dev/null | sort -rh | head -5
EOF

# Boot time analysis
systemd-analyze

# Slowest services
systemd-analyze critical-chain
```

---

## 🎯 ATOMIC OPERATIONS (Pick & Use)

### Just Updated System
```bash
sudo apt update && sudo apt upgrade -y
```

### Just Remove Unused Packages
```bash
sudo apt autoremove -y && sudo apt autopurge -y
```

### Just Clear Caches
```bash
sudo apt clean && sudo apt autoclean && sudo rm -rf /var/cache/apt/archives/*
```

### Just Clean Logs
```bash
sudo journalctl --vacuum=size:50M && sudo find /var/log -type f -name "*.log" -exec truncate -s 0 {} \;
```

### Just Free Memory
```bash
sync && echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null
```

### Just Clean Temp Files
```bash
sudo rm -rf /tmp/* /var/tmp/*
```

---

## ⚡ ALIASED COMMANDS (Add to ~/.bashrc)

```bash
# Add these to ~/.bashrc
alias clean-light='sudo apt autoremove -y && sudo apt clean'
alias clean-full='sudo bash -c "apt update && apt upgrade -y && apt autoremove -y && apt clean && journalctl --vacuum=50M && rm -rf /tmp/*"'
alias free-ram='sync && echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null'
alias disk-usage='du -sh /* 2>/dev/null | sort -rh'
alias mem-usage='free -h && echo && ps aux --sort=-%mem | head -10'
alias show-large='find / -type f -size +100M -exec ls -lh {} \; 2>/dev/null | awk "{print \$5, \$9}" | sort -rh | head -15'

# Usage after adding to ~/.bashrc and running 'source ~/.bashrc':
# clean-light      # Quick cleanup
# clean-full       # Complete cleanup
# free-ram         # Release memory caches
# disk-usage       # Check disk space
# mem-usage        # Check memory usage
# show-large       # Find large files
```

---

## 🔄 SCHEDULED CLEANUP (Weekly)

```bash
# Edit crontab
crontab -e

# Add this line for weekly cleanup every Sunday at 2 AM
0 2 * * 0 sudo bash -c 'apt update && apt upgrade -y && apt autoremove -y && apt clean && journalctl --vacuum=50M && rm -rf /tmp/* && sync && echo 3 > /proc/sys/vm/drop_caches' >> /var/log/wsl-auto-cleanup.log 2>&1
```

---

## 🛡️ BEFORE & AFTER COMPARISON

Run before cleanup:
```bash
echo "=== BEFORE ===" && df -h / && free -h
```

Run after cleanup:
```bash
echo "=== AFTER ===" && df -h / && free -h
```

Full comparison:
```bash
(echo "=== BEFORE ===" && df -h / && free -h) > /tmp/before.txt
# Run cleanup commands here
(echo "=== AFTER ===" && df -h / && free -h) > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt
```

---

## 🚀 FASTEST SCRIPTS

### Ultra-Quick (5 seconds)
```bash
sudo bash -c 'apt clean && rm -rf /tmp/* && sync && echo 3 > /proc/sys/vm/drop_caches'
```

### Quick (15 seconds)
```bash
sudo bash -c 'apt autoremove -y && apt clean && rm -rf /tmp/* /var/tmp/* && journalctl --vacuum=size:50M'
```

### Thorough (45 seconds)
```bash
sudo bash -c 'apt update && apt upgrade -y && apt autoremove -y && apt autoclean && apt clean && rm -rf /tmp/* /var/tmp/* && journalctl --vacuum=size:50M && find /var/log -type f -name "*.log" -exec truncate -s 0 {} \; && sync && echo 3 > /proc/sys/vm/drop_caches'
```

---

## 🔐 SAFETY NOTES

✅ **Safe to run:**
- `apt update/upgrade/autoremove`
- Clearing `/tmp`, `/var/tmp`
- Truncating logs (not deleting directory)
- Dropping caches
- Package cache cleanup

⚠️ **Be careful with:**
- Don't delete `/var/log` directory itself
- Don't modify critical services
- Don't use `rm -rf` on important directories
- Test on non-critical systems first

❌ **NEVER do:**
- `rm -rf /` or `rm -rf /*`
- Delete core system directories
- Run untested scripts with `-r` flags
- Disable essential services

---

## 📝 CHEAT SHEET SUMMARY

| Goal | Command |
|------|---------|
| Update system | `sudo apt update && sudo apt upgrade -y` |
| Remove unused | `sudo apt autoremove -y` |
| Clear caches | `sudo apt clean` |
| Clean logs | `sudo journalctl --vacuum=50M` |
| Free memory | `sync && echo 3 \| sudo tee /proc/sys/vm/drop_caches` |
| Check disk | `df -h /` |
| Check memory | `free -h` |
| Find large files | `find / -size +100M 2>/dev/null` |
| Check status | `df -h / && free -h` |
| Full cleanup | See "FASTEST CLEANUP" section above |


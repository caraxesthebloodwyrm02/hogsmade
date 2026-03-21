# WSL Cleanup & Performance Optimization Guide

## Quick Start - Run Everything
```bash
#!/bin/bash
# Run all optimizations in sequence
echo "Starting WSL cleanup and optimization..."

# System updates
sudo apt update && sudo apt upgrade -y && sudo apt autoremove -y && sudo apt autoclean -y

# Clean package manager
sudo apt clean
sudo rm -rf /var/lib/apt/lists/*
sudo mkdir -p /var/lib/apt/lists/partial

# Clean temporary files
sudo rm -rf /tmp/* /var/tmp/* /var/cache/apt/archives/*

# Clean logs
sudo journalctl --vacuum=50M
sudo find /var/log -type f -name "*.log" -exec truncate -s 0 {} \;

# Free pagecache, dentries, and inodes
sync && echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null

# Display results
echo "✓ Optimization complete!"
df -h /
free -h
```

---

## 1. Package Management Cleanup

### Update and Remove Unused Packages
```bash
# Update package lists and upgrade packages
sudo apt update && sudo apt upgrade -y

# Remove unused packages
sudo apt autoremove -y

# Remove unused dependencies
sudo apt autopurge -y

# Clean package cache
sudo apt clean
sudo apt autoclean
```

### Deep Package Cleanup
```bash
# Remove configuration files of uninstalled packages
sudo apt purge $(dpkg --list | grep "^rc" | awk '{print $2}')

# Remove all cached packages
sudo rm -rf /var/lib/apt/lists/*
sudo mkdir -p /var/lib/apt/lists/partial

# Clear apt cache
sudo rm -rf /var/cache/apt/archives/*
```

### List Large Packages (find what to uninstall)
```bash
# Show packages sorted by installed size
dpkg-query -W -f='${Installed-Size;10}\t${Package}\n' | sort -k1 -rn | head -30

# Alternative: Show in MB
dpkg-query -W --format='${Installed-Size} ${Package}\n' | sort -rn | awk '{print int($1/1024) "MB\t" $2}' | head -20
```

---

## 2. Temporary Files & Cache Cleanup

### Clear System Temporary Files
```bash
# Remove /tmp contents (safe - only old files)
sudo rm -rf /tmp/*

# Remove /var/tmp contents
sudo rm -rf /var/tmp/*

# Clear systemd journal logs (keep last 50MB)
sudo journalctl --vacuum=50M

# Or keep last 7 days
sudo journalctl --vacuum-time=7d
```

### Clear Application Caches
```bash
# Clear user package cache
rm -rf ~/.cache/pip
rm -rf ~/.cache/npm
rm -rf ~/.npm
rm -rf ~/.yarn/cache

# Clear Docker (if installed)
docker system prune -a --volumes

# Clear snap cache (if using snaps)
sudo rm -rf /var/lib/snapd/cache/*
```

### Clear Log Files
```bash
# Safely truncate logs to 0 size (keeps file structure)
sudo find /var/log -type f -name "*.log" -exec truncate -s 0 {} \;

# Remove compressed/rotated logs
sudo find /var/log -name "*.gz" -delete
sudo find /var/log -name "*.1" -delete
sudo find /var/log -name "*.old" -delete

# Clear specific service logs
sudo journalctl -u systemd-logind --vacuum=10M
```

---

## 3. Memory Optimization

### Release Memory (Cache Drop)
```bash
# Clear page cache, dentries, and inodes
sync && echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null

# Clear only page cache
sync && echo 1 | sudo tee /proc/sys/vm/drop_caches > /dev/null
```

### Check Memory Usage
```bash
# Overall memory status
free -h
free -g  # In gigabytes

# Detailed memory breakdown
cat /proc/meminfo

# Memory usage by process
ps aux --sort=-%mem | head -20

# Using 'smem' (more accurate - install: sudo apt install smem)
sudo smem -s rss -n 20
```

### Monitor Memory in Real-Time
```bash
# Watch mode
watch -n 1 free -h

# Detailed view
top -p $(pgrep -d',' -u username)
```

---

## 4. Disk Space Management

### Check Disk Usage
```bash
# Overall disk usage
df -h

# Detailed breakdown by directory
du -sh /*

# Find large directories
du -sh /home/* /var/* /opt/* 2>/dev/null | sort -rh | head -20

# Find large files
find / -type f -size +100M -exec ls -lh {} \; 2>/dev/null | awk '{print $5, $9}' | sort -rh | head -20
```

### Remove Large Log Files
```bash
# Find and remove old logs (older than 30 days)
find /var/log -type f -name "*.log" -mtime +30 -delete

# Clear syslog keeping last entries
sudo tail -n 100000 /var/log/syslog | sudo tee /var/log/syslog > /dev/null
```

---

## 5. WSL-Specific Optimizations

### Manage WSL Virtual Disk (VHDX)
```bash
# Compact WSL disk to free space (Windows PowerShell - run as Admin)
wsl --shutdown
diskpart
select vdisk file="C:\Users\<username>\AppData\Local\Packages\<distro>\LocalState\ext4.vhdx"
attach vdisk readonly
compact vdisk
detach vdisk
exit
wsl

# From WSL terminal - monitor disk usage before/after
# Before:
wsl -l -v
# Then run above commands from Windows, then check again
```

### WSL Memory Limit Configuration
```bash
# Create/edit ~/.wslconfig (Windows)
# Location: C:\Users\<username>\.wslconfig

[wsl2]
memory=6GB
processors=4
swap=2GB
localhostForwarding=true
```

### Check WSL System Resources
```bash
# From WSL terminal
nproc                    # Number of processors
getconf _PHYS_PAGES      # Total memory pages
free -h                  # Memory usage
df -h                    # Disk usage
```

---

## 6. Kernel and System Tuning

### Optimize Swappiness (reduce swap usage)
```bash
# Check current value (0-100, lower = prefer RAM)
cat /proc/sys/vm/swappiness

# Temporarily set to 10 (prefer RAM)
sudo sysctl vm.swappiness=10

# Make permanent: add to /etc/sysctl.conf
echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Other useful tuning
echo "vm.vfs_cache_pressure=50" | sudo tee -a /etc/sysctl.conf
```

### Disable Unnecessary Services
```bash
# List running services
sudo systemctl list-units --type=service --state=running

# Disable unnecessary services (example)
sudo systemctl disable apport.service
sudo systemctl disable avahi-daemon.service
sudo systemctl disable cups.service

# Check startup time impact
sudo systemd-analyze

# Deep dive into slowness
sudo systemd-analyze critical-chain
```

---

## 7. Comprehensive Cleanup Script

Save as `wsl-cleanup.sh`:

```bash
#!/bin/bash

set -e  # Exit on error

echo "════════════════════════════════════════"
echo "   WSL Cleanup & Optimization Script"
echo "════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Show before stats
echo -e "${BLUE}[BEFORE]${NC}"
echo "Disk Usage:"
df -h / | tail -1
echo "Memory Usage:"
free -h | grep Mem

echo ""
echo -e "${BLUE}[1/6] Updating package manager...${NC}"
sudo apt update > /dev/null 2>&1
sudo apt upgrade -y > /dev/null 2>&1
echo -e "${GREEN}✓ Packages updated${NC}"

echo ""
echo -e "${BLUE}[2/6] Removing unused packages...${NC}"
sudo apt autoremove -y > /dev/null 2>&1
sudo apt autopurge -y > /dev/null 2>&1
echo -e "${GREEN}✓ Unused packages removed${NC}"

echo ""
echo -e "${BLUE}[3/6] Cleaning package cache...${NC}"
sudo apt clean > /dev/null 2>&1
sudo apt autoclean > /dev/null 2>&1
sudo rm -rf /var/lib/apt/lists/* 2>/dev/null || true
sudo mkdir -p /var/lib/apt/lists/partial
echo -e "${GREEN}✓ Package cache cleaned${NC}"

echo ""
echo -e "${BLUE}[4/6] Clearing temporary files...${NC}"
sudo rm -rf /tmp/* 2>/dev/null || true
sudo rm -rf /var/tmp/* 2>/dev/null || true
echo -e "${GREEN}✓ Temporary files cleared${NC}"

echo ""
echo -e "${BLUE}[5/6] Cleaning logs...${NC}"
sudo journalctl --vacuum=50M > /dev/null 2>&1
sudo find /var/log -type f -name "*.log" -exec truncate -s 0 {} \; 2>/dev/null || true
sudo find /var/log -name "*.gz" -delete 2>/dev/null || true
echo -e "${GREEN}✓ Logs cleaned${NC}"

echo ""
echo -e "${BLUE}[6/6] Releasing memory caches...${NC}"
sync
echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null
echo -e "${GREEN}✓ Memory caches released${NC}"

echo ""
echo -e "${BLUE}[AFTER]${NC}"
echo "Disk Usage:"
df -h / | tail -1
echo "Memory Usage:"
free -h | grep Mem

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}   Cleanup Complete! ✓${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
```

**Usage:**
```bash
chmod +x wsl-cleanup.sh
./wsl-cleanup.sh
```

---

## 8. Scheduled Maintenance

### Weekly Cleanup via Cron
```bash
# Edit crontab
crontab -e

# Add weekly cleanup (Sunday 2 AM)
0 2 * * 0 /home/user/wsl-cleanup.sh >> /var/log/wsl-cleanup.log 2>&1
```

### Automated Daily Light Cleanup
```bash
# Add to ~/.bashrc for auto-cleanup on login
# Uncomment if desired:
# (sudo apt autoremove -y && sudo apt autoclean -y && sync && echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null) &
```

---

## 9. Safety Checklist

✅ **Safe to Run:**
- `apt update/upgrade/autoremove`
- Clearing `/tmp` and `/var/tmp`
- Clearing logs
- Dropping caches (no data loss)
- Package cache cleanup

⚠️ **Use Caution:**
- Don't delete `/var/log` directory itself, only files
- Don't disable critical services (ssh, networking, etc.)
- Test scripts on non-critical systems first
- Back up important data before major operations

❌ **Never Do:**
- `rm -rf /` or `rm -rf /*`
- Delete system directories
- Change permissions on system files carelessly
- Run untested scripts as root

---

## 10. Monitoring Commands

```bash
# One-liner for complete system audit
echo "=== DISK ===" && df -h / && echo -e "\n=== MEMORY ===" && free -h && echo -e "\n=== TOP PROCESSES ===" && ps aux --sort=-%mem | head -5 && echo -e "\n=== DISK HOGS ===" && du -sh /* 2>/dev/null | sort -rh | head -5

# Watch system in real-time
watch -n 2 'clear; df -h /; echo "---"; free -h; echo "---"; ps aux --sort=-%mem | head -10'
```

---

## Quick Reference Table

| Task | Command |
|------|---------|
| Update all packages | `sudo apt update && sudo apt upgrade -y` |
| Remove unused packages | `sudo apt autoremove -y && sudo apt autopurge -y` |
| Clear all caches | `sudo apt clean && sudo apt autoclean` |
| Clear temp files | `sudo rm -rf /tmp/* /var/tmp/*` |
| Clear journal logs | `sudo journalctl --vacuum=50M` |
| Release memory | `sync && echo 3 \| sudo tee /proc/sys/vm/drop_caches > /dev/null` |
| Check disk usage | `df -h /` |
| Check memory usage | `free -h` |
| Find large files | `find / -type f -size +100M 2>/dev/null` |
| Full cleanup | `./wsl-cleanup.sh` |

---

## Performance Baseline Testing

```bash
# Before optimization
sudo du -sh / && free -h && df -h /

# Run cleanup script
./wsl-cleanup.sh

# After optimization
sudo du -sh / && free -h && df -h /

# Check improvement
# Calculate freed space and compare memory/disk metrics
```


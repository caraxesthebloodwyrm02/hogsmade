#!/bin/bash

#############################################################################
#                     WSL CLEANUP & OPTIMIZATION                           #
#                              v2.0                                        #
#                                                                          #
# Comprehensive system cleanup with performance optimization for WSL      #
# Requires --confirm flag for destructive operations                     #
#############################################################################

set -euo pipefail

# ============================================================================
# COLOR CODES & FORMATTING
# ============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ============================================================================
# CONFIGURATION
# ============================================================================
JOURNAL_SIZE="50M"              # Keep last 50MB of journal
LOG_CLEANUP_DAYS=30             # Delete logs older than 30 days
MEMORY_RELEASE=true             # Release memory caches
SCRIPT_LOG="/tmp/wsl-cleanup-$(date +%Y%m%d_%H%M%S).log"

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*" | tee -a "$SCRIPT_LOG"
}

success() {
    echo -e "${GREEN}✓${NC} $*" | tee -a "$SCRIPT_LOG"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $*" | tee -a "$SCRIPT_LOG"
}

error() {
    echo -e "${RED}✗${NC} $*" | tee -a "$SCRIPT_LOG"
}

section() {
    echo ""
    echo -e "${BOLD}${CYAN}════════════════════════════════════════${NC}"
    echo -e "${BOLD}${CYAN}  $*${NC}"
    echo -e "${BOLD}${CYAN}════════════════════════════════════════${NC}"
    echo ""
}

# ============================================================================
# PRE-FLIGHT CHECKS
# ============================================================================

check_sudo() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run with sudo"
        exit 1
    fi
}

check_wsl() {
    if ! grep -qi microsoft /proc/version 2>/dev/null; then
        warning "This does not appear to be a WSL environment"
        read -rp "Continue anyway? [y/N] " reply
        [[ "$reply" =~ ^[Yy]$ ]] || exit 1
    fi
}

confirm_destructive() {
    if [[ "${CONFIRMED:-false}" != "true" ]]; then
        echo ""
        warning "This script will:"
        echo "  - rm -rf /tmp/* and /var/tmp/*"
        echo "  - Truncate all files in /var/log/"
        echo "  - Drop kernel page/dentry/inode caches"
        echo "  - Run apt upgrade -y and apt autopurge -y"
        echo ""
        read -rp "Proceed? Pass --confirm to skip this prompt. [y/N] " reply
        [[ "$reply" =~ ^[Yy]$ ]] || { log "Aborted by user."; exit 0; }
    fi
}

check_distro() {
    if [[ ! -f /etc/os-release ]]; then
        warning "Could not determine distro, proceeding anyway..."
        return
    fi

    . /etc/os-release
    log "Running on: $NAME ($VERSION_ID)"
}

# ============================================================================
# STAT COLLECTION
# ============================================================================

get_disk_usage() {
    df -h / | awk 'NR==2 {print $3 " / " $2 " (Used: " $5 ")"}'
}

get_memory_usage() {
    free -h | awk 'NR==2 {print $3 " / " $2}'
}

get_cache_size() {
    du -sh /var/cache 2>/dev/null || echo "N/A"
}

show_before_stats() {
    section "BEFORE OPTIMIZATION"
    log "Root Partition:"
    echo "  $(get_disk_usage)"
    log "Memory Usage:"
    echo "  $(get_memory_usage)"
    log "Cache Directory Size:"
    echo "  $(get_cache_size)"
}

show_after_stats() {
    section "AFTER OPTIMIZATION"
    log "Root Partition:"
    echo "  $(get_disk_usage)"
    log "Memory Usage:"
    echo "  $(get_memory_usage)"
    log "Cache Directory Size:"
    echo "  $(get_cache_size)"
}

# ============================================================================
# MAIN CLEANUP OPERATIONS
# ============================================================================

update_packages() {
    log "Updating package lists..."
    apt update -qq || warning "Package list update had issues"
    success "Package lists updated"
    
    log "Upgrading packages..."
    apt upgrade -y -qq || warning "Some packages failed to upgrade"
    success "Packages upgraded"
}

remove_unused_packages() {
    log "Removing unused packages..."
    apt autoremove -y -qq || true
    apt autopurge -y -qq || true
    success "Unused packages removed"
    
    log "Removing configuration files from uninstalled packages..."
    dpkg --list | grep "^rc" | awk '{print $2}' | xargs apt purge -y -qq 2>/dev/null || true
    success "Configuration files cleaned"
}

clean_package_cache() {
    log "Cleaning apt package cache..."
    apt clean || warning "apt clean had issues"
    apt autoclean || warning "apt autoclean had issues"
    
    log "Removing apt lists..."
    rm -rf /var/lib/apt/lists/* 2>/dev/null || true
    mkdir -p /var/lib/apt/lists/partial
    success "Package cache cleaned"
    
    log "Clearing apt cache directory..."
    rm -rf /var/cache/apt/archives/* 2>/dev/null || true
    success "Apt archive cache cleared"
}

clean_temp_files() {
    log "Clearing /tmp directory..."
    rm -rf /tmp/* 2>/dev/null || warning "Could not fully clear /tmp"
    success "/tmp cleared"
    
    log "Clearing /var/tmp directory..."
    rm -rf /var/tmp/* 2>/dev/null || warning "Could not fully clear /var/tmp"
    success "/var/tmp cleared"
}

clean_logs() {
    log "Vacuuming systemd journal (keeping ${JOURNAL_SIZE})..."
    journalctl --vacuum=size:${JOURNAL_SIZE} 2>/dev/null || warning "Journal vacuum had issues"
    success "Journal vacuumed"
    
    log "Truncating log files..."
    find /var/log -type f -name "*.log" -exec truncate -s 0 {} \; 2>/dev/null || true
    success "Log files truncated"
    
    log "Removing compressed/rotated logs..."
    find /var/log -name "*.gz" -delete 2>/dev/null || true
    find /var/log -name "*.1" -delete 2>/dev/null || true
    find /var/log -name "*.old" -delete 2>/dev/null || true
    success "Compressed logs removed"
}

clean_user_caches() {
    log "Cleaning user package manager caches..."
    
    if [[ -d ~/.cache/pip ]]; then
        rm -rf ~/.cache/pip
        success "pip cache cleared"
    fi
    
    if [[ -d ~/.cache/npm ]]; then
        rm -rf ~/.cache/npm
        success "npm cache cleared"
    fi
    
    if [[ -d ~/.npm ]]; then
        rm -rf ~/.npm
        success "npm local cache cleared"
    fi
    
    if [[ -d ~/.yarn/cache ]]; then
        rm -rf ~/.yarn/cache
        success "yarn cache cleared"
    fi
}

release_memory() {
    if [[ "$MEMORY_RELEASE" != "true" ]]; then
        log "Skipping memory release (disabled)"
        return
    fi
    
    log "Syncing filesystem..."
    sync
    
    # WARNING: drop_caches=3 frees pagecache+dentries+inodes; may cause I/O
    # stalls or OOM-killer activity if the system is under memory pressure.
    log "Releasing page cache, dentries, and inodes..."
    echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || warning "Could not drop caches"
    
    success "Memory caches released"
}

# ============================================================================
# DIAGNOSTIC FUNCTIONS
# ============================================================================

show_large_files() {
    section "LARGEST FILES (Top 10)"
    log "Scanning for files larger than 100MB..."
    find / -type f -size +100M -exec ls -lh {} \; 2>/dev/null | \
        awk '{print $5, $9}' | sort -rh | head -10 | while read size file; do
        echo "  $size  $file"
    done || warning "Could not scan all files (permission issues expected)"
}

show_large_directories() {
    section "LARGEST DIRECTORIES"
    du -sh /* 2>/dev/null | sort -rh | head -10 | while read size dir; do
        echo "  $size  $dir"
    done
}

show_process_memory() {
    section "TOP MEMORY-CONSUMING PROCESSES"
    ps aux --sort=-%mem | head -11 | tail -10 | awk '{printf "  %-8s %5s  %s\n", $1, $6"MB", $11}'
}

# ============================================================================
# ADDITIONAL OPTIMIZATION OPTIONS
# ============================================================================

optimize_swappiness() {
    section "OPTIMIZING SWAPPINESS"
    local current=$(cat /proc/sys/vm/swappiness)
    log "Current swappiness: $current"
    
    if [[ $current -gt 10 ]]; then
        log "Reducing swappiness to 10 (prefers RAM)..."
        sysctl -w vm.swappiness=10 -q || warning "Could not set swappiness"
        
        # Make permanent
        if ! grep -q "vm.swappiness=10" /etc/sysctl.conf; then
            echo "vm.swappiness=10" >> /etc/sysctl.conf
            success "Swappiness set to 10 permanently"
        fi
    else
        log "Swappiness already optimized ($current)"
    fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    section "WSL CLEANUP & OPTIMIZATION"
    log "Started at: $(date)"
    log "Log file: $SCRIPT_LOG"
    
    # Pre-flight checks
    check_sudo
    check_wsl
    check_distro
    confirm_destructive
    
    show_before_stats
    
    # Core cleanup operations
    section "PHASE 1: PACKAGE MANAGEMENT"
    update_packages
    remove_unused_packages
    clean_package_cache
    
    section "PHASE 2: TEMPORARY FILES & LOGS"
    clean_temp_files
    clean_logs
    clean_user_caches
    
    section "PHASE 3: MEMORY OPTIMIZATION"
    release_memory
    optimize_swappiness
    
    show_after_stats
    
    # Diagnostic output
    if [[ "${SHOW_DIAGNOSTICS:-true}" == "true" ]]; then
        show_large_directories
        show_large_files
        show_process_memory
    fi
    
    section "CLEANUP COMPLETE ✓"
    log "Completed at: $(date)"
    log "Total duration: $(( $(date +%s) - START_TIME )) seconds"
    success "All operations finished successfully!"
    success "Log saved to: $SCRIPT_LOG"
}

# ============================================================================
# ERROR HANDLING
# ============================================================================

trap 'error "Script interrupted"; exit 130' INT TERM
trap 'error "Script encountered an error"; tail -20 "$SCRIPT_LOG"' ERR

# ============================================================================
# ENTRY POINT
# ============================================================================

START_TIME=$(date +%s)

# Parse arguments
case "${1:-}" in
    --help|-h)
        cat << EOF
Usage: wsl-cleanup.sh [OPTION]

WSL Cleanup & Optimization Script

OPTIONS:
    --help, -h          Show this help message
    --confirm           Skip interactive confirmation prompt
    --no-memory         Skip memory cache release
    --no-diagnostics    Skip diagnostic output
    --optimize-only     Only optimize, skip cleanup
    --log-only          Only clean logs, skip other operations
    --quick             Quick cleanup (skip some checks)

EXAMPLES:
    sudo ./wsl-cleanup.sh                    # Full cleanup
    sudo ./wsl-cleanup.sh --no-memory        # Skip memory release
    sudo ./wsl-cleanup.sh --quick            # Fast mode

EOF
        exit 0
        ;;
    --confirm)
        CONFIRMED=true
        main
        ;;
    --no-memory)
        MEMORY_RELEASE=false
        main
        ;;
    --no-diagnostics)
        SHOW_DIAGNOSTICS=false
        main
        ;;
    --quick)
        # Skip updates for faster run
        check_sudo
        check_distro
        show_before_stats
        clean_temp_files
        clean_logs
        release_memory
        show_after_stats
        success "Quick cleanup completed!"
        ;;
    *)
        main
        ;;
esac

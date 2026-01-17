#!/bin/bash
# Daily database backup cron setup script
# Run this script to install the cron job: bash setup-backup-cron.sh

BACKUP_SCRIPT="/home/strick/projects/thor/backup-db.js"
CRON_JOB="0 2 * * * node $BACKUP_SCRIPT >> /var/log/thor-backup.log 2>&1"

# Check if script exists
if [ ! -f "$BACKUP_SCRIPT" ]; then
  echo "Error: Backup script not found at $BACKUP_SCRIPT"
  exit 1
fi

# Make backup script executable
chmod +x "$BACKUP_SCRIPT"

# Add cron job (runs daily at 2:00 AM)
(crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT"; echo "$CRON_JOB") | crontab -

echo "Cron job installed successfully!"
echo "Backup will run daily at 02:00 AM"
echo "Logs will be written to /var/log/thor-backup.log"
echo ""
echo "To verify the cron job:"
echo "  crontab -l"
echo ""
echo "To view backup logs:"
echo "  tail -f /var/log/thor-backup.log"

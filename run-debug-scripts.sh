#!/usr/bin/env bash
set -e   # exit on any failure

# Record overall start
overall_start=$SECONDS

declare -a SCRIPTS=(
  "likes/likes-auth1.ts"
  "reposts/repost-test2.ts"
  "quoted-tweets/debug-quoted-tweets.ts"
  "mentions/debug-mentions.ts"
  "hashtags/debug-hashtags.ts"
  "replies/debug-replies.ts"
)

# Arrays to hold names and elapsed seconds
declare -a NAMES=()
declare -a DURS=()

for s in "${SCRIPTS[@]}"; do
  echo "▶ Starting script: $s at $(date +"%Y-%m-%d %H:%M:%S")"
  step_start=$SECONDS

  # copy env and run
  bun run cp src/env/.env.prod .env
  bun run "src/scripts/$s"

  # capture duration
  step_elapsed=$(( SECONDS - step_start ))
  NAMES+=("$s")
  DURS+=("$step_elapsed")
done

# Print per-script summary
echo
echo "── Script runtimes ─────────────────────────────────────────"
for i in "${!NAMES[@]}"; do
  name=${NAMES[i]}
  sec=${DURS[i]}
  h=$(( sec / 3600 ))
  m=$(( (sec % 3600) / 60 ))
  s=$(( sec % 60 ))
  printf "%-30s %02d:%02d:%02d\n" "$name" "$h" "$m" "$s"
done

# Overall summary
overall_elapsed=$(( SECONDS - overall_start ))
H=$(( overall_elapsed / 3600 ))
M=$(( (overall_elapsed % 3600) / 60 ))
S=$(( overall_elapsed % 60 ))

echo "──────────────────────────────────────────────────────────────"
printf "Total elapsed time: %02d:%02d:%02d (hh:mm:ss)\n" "$H" "$M" "$S"
